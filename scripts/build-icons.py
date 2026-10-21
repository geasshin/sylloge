#!/usr/bin/env python3
"""Icônes Sylloge conformes au gabarit Apple (HIG App Icons).

Spécification appliquée :
- Canevas 1024x1024, fond transparent.
- Tuile 824x824 centrée (marges de 100 px), forme continue : superellipse
  d'exposant 5, proche du squircle macOS.
- Fond : dégradé vertical anthracite et filet lumineux sur le bord supérieur,
  dessinés NATIVEMENT en AppKit (pas de passage par SVG/Quick Look, qui casse
  la transparence et ajoute un fond blanc — le bug constaté dans le dock).
- Symbole : Σ à arêtes nettes, initiale de ΣΥΛΛΟΓΗ et signe de la somme.
  Même géométrie que sylloge-icon.svg du dépôt de la page
  (~/Documents/ChatGPT/sylloge-web, assets/brand/).

Usage : python3 scripts/build-icons.py   (macOS requis)
"""

import math
import shutil
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'src-tauri/icons'
TMP = Path('/tmp/sylloge-icon-build')

CANVAS = 1024          # canevas final
HALF_TILE = 412        # demi-côté de la tuile (824 px, marges de 100 px)
EXPONENT = 5           # superellipse
POINTS = 240           # finesse du contour
SIZES = (16, 32, 64, 128, 256, 512, 1024)  # tailles dessinées en natif

# Dégradés (sRGB 0-255), du haut vers le bas.
TILE_TOP, TILE_BOTTOM = (0x2D, 0x2D, 0x31), (0x14, 0x14, 0x16)
INK_TOP, INK_BOTTOM = (0xF6, 0xF6, 0xF8), (0xD3, 0xD3, 0xD8)

# Σ dans le repère du canevas (origine en haut à gauche, y vers le bas).
# Tous les polygones tournent dans le même sens : leur union se remplit d'un bloc.
SIGMA = [
    [(300, 290), (724, 290), (724, 370), (300, 370)],   # barre haute
    [(300, 654), (724, 654), (724, 734), (300, 734)],   # barre basse
    [(300, 290), (414, 290), (584, 512), (470, 512)],   # diagonale descendante
    [(470, 512), (584, 512), (414, 734), (300, 734)],   # diagonale remontante
]


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f'{cmd[0]} a échoué : {result.stderr[:400]}')


def squircle() -> list[tuple[float, float]]:
    points = []
    for index in range(POINTS):
        angle = 2 * math.pi * index / POINTS
        cos, sin = math.cos(angle), math.sin(angle)
        x = CANVAS / 2 + HALF_TILE * math.copysign(abs(cos) ** (2 / EXPONENT), cos)
        y = CANVAS / 2 + HALF_TILE * math.copysign(abs(sin) ** (2 / EXPONENT), sin)
        points.append((x, y))
    return points


def swift_path(name: str, polygons: list[list[tuple[float, float]]], size: int) -> str:
    """Chemin AppKit : origine en bas à gauche, d'où l'inversion de y."""
    scale = size / CANVAS
    lines = [f'let {name} = NSBezierPath()']
    for polygon in polygons:
        for index, (x, y) in enumerate(polygon):
            verb = 'move' if index == 0 else 'line'
            lines.append(f'{name}.{verb}(to: NSPoint(x: {x * scale:.3f}, y: {size - y * scale:.3f}))')
        lines.append(f'{name}.close()')
    return '\n'.join(lines)


def swift_color(rgb: tuple[int, int, int], alpha: float = 1) -> str:
    red, green, blue = (channel / 255 for channel in rgb)
    return f'NSColor(srgbRed: {red:.4f}, green: {green:.4f}, blue: {blue:.4f}, alpha: {alpha})'


def compose(size: int) -> Path:
    """Dessine toute l'icône en Swift/AppKit : transparence garantie."""
    out = TMP / f'icon-{size}.png'
    script = TMP / f'compose-{size}.swift'
    script.write_text(f'''
import AppKit

let size = CGFloat({size})
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
NSGraphicsContext.current?.imageInterpolation = .high
NSGraphicsContext.current?.shouldAntialias = true

{swift_path('tile', [squircle()], size)}

// Fond : dégradé anthracite vertical
NSGradient(starting: {swift_color(TILE_TOP)}, ending: {swift_color(TILE_BOTTOM)})!.draw(in: tile, angle: -90)

// Filet lumineux sur le bord, qui s'éteint sur le tiers supérieur
let bounds = tile.bounds
let fade = bounds.height * 0.35
let bands = 16
tile.lineWidth = max(1, 4 * size / 1024)
for band in 0..<bands {{
    NSGraphicsContext.current?.saveGraphicsState()
    let top = bounds.maxY - fade * CGFloat(band) / CGFloat(bands)
    NSBezierPath(rect: NSRect(x: 0, y: top - fade / CGFloat(bands), width: size, height: fade / CGFloat(bands) + 0.5)).addClip()
    tile.addClip()
    NSColor.white.withAlphaComponent(0.2 * (1 - CGFloat(band) / CGFloat(bands))).setStroke()
    tile.stroke()
    NSGraphicsContext.current?.restoreGraphicsState()
}}

// Symbole Σ, encre claire en léger dégradé
{swift_path('sigma', SIGMA, size)}
NSGradient(starting: {swift_color(INK_TOP)}, ending: {swift_color(INK_BOTTOM)})!.draw(in: sigma, angle: -90)

image.unlockFocus()

let tiff = image.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: "{out}"))
''')
    run(['swift', str(script)])
    return out


def nearest(pixel: int) -> Path:
    """Plus petite tuile native au moins aussi grande que la cible."""
    return TMP / f'icon-{min(s for s in SIZES if s >= pixel)}.png'


def main() -> None:
    # Repartir d'un dossier vide : une tuile restée d'un ancien logo finirait dans l'icns.
    shutil.rmtree(TMP, ignore_errors=True)
    TMP.mkdir(parents=True)
    for size in SIZES:
        compose(size)
        print(f'tuile {size}px OK')

    iconset = TMP / 'icon.iconset'
    iconset.mkdir(exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for name, pixel in [(f'icon_{base}x{base}.png', base), (f'icon_{base}x{base}@2x.png', base * 2)]:
            run(['sips', '-z', str(pixel), str(pixel), str(nearest(pixel)), '--out', str(iconset / name)])
    run(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT_DIR / 'icon.icns')])

    png_targets = [
        ('128x128.png', 128), ('128x128@2x.png', 256), ('32x32.png', 32), ('64x64.png', 64),
        ('Square30x30Logo.png', 30), ('Square44x44Logo.png', 44), ('Square71x71Logo.png', 71),
        ('Square89x89Logo.png', 89), ('Square107x107Logo.png', 107), ('Square142x142Logo.png', 142),
        ('Square150x150Logo.png', 150), ('Square284x284Logo.png', 284), ('Square310x310Logo.png', 310),
        ('StoreLogo.png', 50), ('icon.png', 512),
    ]
    for name, pixel in png_targets:
        run(['sips', '-z', str(pixel), str(pixel), str(nearest(pixel)), '--out', str(OUT_DIR / name)])

    images = []
    for s in [16, 24, 32, 48, 64, 128, 256]:
        src_png = TMP / f'ico-{s}.png'
        run(['sips', '-z', str(s), str(s), str(nearest(s)), '--out', str(src_png)])
        images.append((s, src_png.read_bytes()))
    header = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    directory = b''
    payload = b''
    for s, data in images:
        directory += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
        payload += data
        offset += len(data)
    (OUT_DIR / 'icon.ico').write_bytes(header + directory + payload)

    print('Toutes les icônes sont régénérées (icns, PNG, ICO).')


if __name__ == '__main__':
    main()
