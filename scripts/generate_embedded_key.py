#!/usr/bin/env python3
"""Génération et lecture des clés API embarquées de Sylloge.

Les deux fournisseurs à clé (TMDB pour Films et Séries, RAWG pour Jeux)
embarquent leur clé dans un fichier Rust ignoré par Git :

  - src-tauri/src/tmdb/embedded_key.rs
  - src-tauri/src/rawg/embedded_key.rs

Chaque fichier contient une graine (SEED), les octets de la clé XORés avec le
keystream `mask_byte` et le décodeur. C'est de l'OBFUSCATION, pas du chiffrement :
le modèle suppose un binaire diffusé gratuitement à des personnes de confiance.

Usage :

  # Produire un embedded_key.rs depuis la clé en clair
  python3 scripts/generate_embedded_key.py encode \
      --key-file ~/.sylloge-secrets/rawg-api-key.txt \
      --provider rawg \
      --out src-tauri/src/rawg/embedded_key.rs

  # Restaurer la clé en clair depuis un embedded_key.rs existant
  python3 scripts/generate_embedded_key.py decode \
      --embedded-file src-tauri/src/rawg/embedded_key.rs \
      --out ~/.sylloge-secrets/rawg-api-key.txt

La clé ne doit jamais être collée dans un terminal ni affichée : elle transite
par les fichiers, jamais par l'historique shell ni par la sortie du script.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Graine par défaut, utilisée quand aucune graine explicite n'est fournie.
# Choisie une fois pour toutes : changer de graine change les octets embarqués
# mais rien d'autre, car le décodeur est régénéré avec le fichier.
DEFAULT_SEED = [0x5A, 0xC3, 0x17, 0xE9, 0x42, 0x8D, 0x6B, 0xF1]

PROVIDER_LABELS = {"tmdb": "TMDB", "rawg": "RAWG", "igdb": "IGDB"}


def mask_byte(seed: list[int], index: int) -> int:
    s = seed[index % len(seed)]
    return ((s ^ (index * 0x9D)) ^ (s << 1)) & 0xFF


def xor_bytes(data: bytes, seed: list[int]) -> list[int]:
    return [byte ^ mask_byte(seed, i) for i, byte in enumerate(data)]


def format_u8_list(values: list[int], per_line: int = 12) -> str:
    lines = []
    for start in range(0, len(values), per_line):
        chunk = ", ".join(f"0x{v:x}" for v in values[start : start + per_line])
        lines.append(f"    {chunk},")
    return "\n".join(lines)


def parse_seed(text: str | None) -> list[int]:
    if not text:
        return DEFAULT_SEED
    cleaned = text.replace("0x", "").replace(" ", "").replace(",", "")
    try:
        values = [int(cleaned[i : i + 2], 16) for i in range(0, len(cleaned), 2)]
    except ValueError as exc:
        raise SystemExit(f"Graine invalide : {exc}") from exc
    if not 4 <= len(values) <= 32:
        raise SystemExit("La graine doit compter entre 4 et 32 octets.")
    return values


def render_embedded(provider: str, seed: list[int], key: bytes) -> str:
    label = PROVIDER_LABELS.get(provider, provider.upper())
    masked = xor_bytes(key, seed)
    seed_literal = ", ".join(f"0x{v:X}" for v in seed)
    return f"""//! Clé API {label} embarquée pour Sylloge.
//!
//! Ce fichier est ignoré par Git (voir .gitignore). La clé est obfusquée par un
//! keystream multi-octets (graine + mélange par position) : c'est de
//! l'OBFUSCATION, pas du chiffrement. Le modèle reste réservé à une diffusion
//! gratuite à des personnes de confiance. Régénération :
//! `scripts/generate_embedded_key.py`.

const SEED: [u8; {len(seed)}] = [{seed_literal}];

/// Octets de la clé, XORés avec le keystream `mask_byte`.
const KEY_PARTS: &[u8] = &[
{format_u8_list(masked)}
];

const fn mask_byte(index: usize) -> u8 {{
    let s = SEED[index % SEED.len()];
    ((s ^ ((index * 0x9D) as u8)) ^ (s << 1)) & 0xFF
}}

/// Reconstruit la clé API à partir des fragments obfusqués.
pub fn embedded_api_key() -> String {{
    KEY_PARTS
        .iter()
        .enumerate()
        .map(|(index, byte)| (byte ^ mask_byte(index)) as char)
        .collect()
}}

#[cfg(test)]
mod tests {{
    use super::*;

    #[test]
    fn embedded_key_is_not_empty_and_is_ascii() {{
        let key = embedded_api_key();
        assert!(!key.trim().is_empty());
        assert!(key.is_ascii());
    }}

    #[test]
    fn mask_stream_is_deterministic() {{
        assert_eq!(mask_byte(0), mask_byte(0));
        assert_eq!(mask_byte(42), mask_byte(42));
        let distinct: std::collections::HashSet<u8> =
            (0..32).map(mask_byte).collect();
        assert!(distinct.len() > 16, "keystream trop faible");
    }}
}}
"""


def extract_seed_from_embedded(source: str) -> list[int] | None:
    marker = "const SEED:"
    at = source.find(marker)
    if at < 0:
        return None
    end = source.find("];", at)
    if end < 0:
        return None
    values = [int(tok, 16) for tok in re.findall(r"0x[0-9a-fA-F]+", source[at:end])]
    return values or None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    encode = sub.add_parser("encode", help="produire un embedded_key.rs")
    encode.add_argument("--key-file", required=True, type=Path)
    encode.add_argument("--provider", required=True, choices=sorted(PROVIDER_LABELS))
    encode.add_argument("--out", required=True, type=Path)
    encode.add_argument("--seed", help="graine hexadécimale ; défaut documentée")

    decode = sub.add_parser("decode", help="restaurer la clé en clair")
    decode.add_argument("--embedded-file", required=True, type=Path)
    decode.add_argument("--out", required=True, type=Path)

    args = parser.parse_args()

    if args.command == "encode":
        seed = parse_seed(getattr(args, "seed", None))
        key = args.key_file.read_bytes().strip()
        if not key:
            raise SystemExit(f"{args.key_file} est vide.")
        rendered = render_embedded(args.provider, seed, key)

        # Aller-retour obligatoire avant écriture : le fichier produit doit
        # redonner exactement la clé source.
        decoded_back = "".join(
            chr(b ^ mask_byte(seed, i)) for i, b in enumerate(xor_bytes(key, seed))
        )
        if decoded_back.encode("ascii") != key:
            raise SystemExit("Aller-retour échoué, fichier non écrit.")

        args.out.write_text(rendered, encoding="utf-8")
        print(f"{args.out} écrit ({len(key)} octets de clé, aller-retour vérifié).")
        return 0

    source = args.embedded_file.read_text(encoding="utf-8")
    seed = extract_seed_from_embedded(source)
    if seed is None:
        raise SystemExit("Graine introuvable dans le fichier embarqué.")
    parts_at = source.find("KEY_PARTS")
    parts_end = source.find("];", parts_at)
    if parts_at < 0 or parts_end < 0:
        raise SystemExit("Fragments introuvables dans le fichier embarqué.")
    values = [int(tok, 16) for tok in re.findall(r"0x[0-9a-fA-F]+", source[parts_at:parts_end])]
    key = bytes(b ^ mask_byte(seed, i) for i, b in enumerate(values)).decode("ascii")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(key, encoding="ascii")
    print(f"{args.out} restauré ({len(key)} caractères, clé jamais affichée).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
