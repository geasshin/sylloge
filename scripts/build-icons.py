#!/usr/bin/env python3
"""Icônes Sylloge conformes au gabarit Apple (HIG App Icons).

Spécification appliquée :
- Canevas 1024x1024, fond transparent.
- Artwork 824x824 centré (marges de 100 px), coins arrondis au rayon
  du gabarit macOS (~185 px sur la tuile 824) — le système peut encore
  masquer sans déformer.
- Fond du artwork : dégradé vertical gris anthracite (#3A3A3F → #1D1D20),
  sobre et moderne, lisible dans un dock clair ou sombre.
- Logo Sylloge centré à 62 % de la tuile (zone sûre du gabarit).

Usage : python3 scripts/build-icons.py
Nécessite macOS (sips + Swift/AppKit pour la composition).
"""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_LOGO = ROOT / 'src/assets/icon-1024.png'
OUT_DIR = ROOT / 'src-tauri/icons'
TMP = Path('/tmp/sylloge-icon-build')

CANVAS = 1024          # canevas final
ARTWORK = 824          # taille de la tuile dessinée (marges 100 px)
RADIUS = 185           # rayon de coin du gabarit macOS sur 1024
LOGO_RATIO = 0.62      # logo = 62 % de la tuile

SVG_BG = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{ARTWORK}" height="{ARTWORK}" viewBox="0 0 {ARTWORK} {ARTWORK}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3E3E44"/>
      <stop offset="0.55" stop-color="#2B2B30"/>
      <stop offset="1" stop-color="#1D1D20"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".10"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="{ARTWORK}" height="{ARTWORK}" rx="{RADIUS}" fill="url(#bg)"/>
  <rect width="{ARTWORK}" height="{ARTWORK}" rx="{RADIUS}" fill="url(#sheen)"/>
  <rect x="1" y="1" width="{ARTWORK - 2}" height="{ARTWORK - 2}" rx="{RADIUS - 1}" fill="none"
        stroke="#FFFFFF" stroke-opacity=".14" stroke-width="2"/>
</svg>'''


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f'{cmd[0]} a échoué : {result.stderr[:400]}')


def compose(size: int) -> Path:
    """Compose fond + logo à `size` px via Swift/AppKit."""
    out = TMP / f'icon-{size}.png'
    scale = size / CANVAS
    tile = round(ARTWORK * scale)
    radius = round(RADIUS * scale)
    logo_px = max(1, round(tile * LOGO_RATIO))
    margin = (size - tile) // 2

    bg_svg = TMP / 'bg.svg'
    bg_png = TMP / 'bg.png'
    bg_svg.write_text(SVG_BG)
    # Rendu SVG → PNG via qlmanage (Quick Look, présent sur tout macOS)
    run(['qlmanage', '-t', '-s', str(ARTWORK), '-o', str(TMP), str(bg_svg)])
    produced = TMP / f'bg.svg.png'
    run(['sips', '-z', str(tile), str(tile), str(produced), '--out', str(bg_png)])

    logo = TMP / 'logo.png'
    run(['sips', '-z', str(logo_px), str(logo_px), str(SRC_LOGO), '--out', str(logo)])

    script = TMP / 'compose.swift'
    script.write_text(f'''
import AppKit
guard let bg = NSImage(contentsOfFile: "{bg_png}") else {{ fatalError("bg") }}
guard let logo = NSImage(contentsOfFile: "{logo}") else {{ fatalError("logo") }}
let canvas = NSSize(width: {size}, height: {size})
let image = NSImage(size: canvas)
image.lockFocus()
let tileRect = NSRect(x: {margin}, y: {margin}, width: {tile}, height: {tile})
bg.draw(in: tileRect)
let logoSize = logo.size
let origin = NSPoint(x: tileRect.midX - logoSize.width / 2, y: tileRect.midY - logoSize.height / 2)
// Ombre douce sous le logo pour le détacher du fond sombre
NSGraphicsContext.current?.saveGraphicsState()
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.45)
shadow.shadowBlurRadius = {max(2, round(tile * 0.02))}
shadow.shadowOffset = NSSize(width: 0, height: -{max(1, round(tile * 0.008))}
)
shadow.set()
logo.draw(in: NSRect(origin: origin, size: logoSize))
NSGraphicsContext.current?.restoreGraphicsState()
image.unlockFocus()
let tiff = image.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: "{out}"))
''')
    run(['swift', str(script)])
    return out


def main() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    for size in [64, 128, 256, 512, 1024]:
        compose(size)
        print(f'tuile {size}px OK')

    # iconset macOS (le dock et le Finder utilisent l'icns)
    iconset = TMP / 'icon.iconset'
    iconset.mkdir(exist_ok=True)
    entries = []
    for base in (16, 32, 128, 256, 512):
        entries.append((f'icon_{base}x{base}.png', base))
        entries.append((f'icon_{base}x{base}@2x.png', base * 2))
    for name, pixel in entries:
        src = TMP / f'icon-{min(pixel, 1024)}.png'
        run(['sips', '-z', str(pixel), str(pixel), str(src), '--out', str(iconset / name)])
    run(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT_DIR / 'icon.icns')])

    # PNG applicatifs
    png_targets = [
        ('128x128.png', 128), ('128x128@2x.png', 256), ('32x32.png', 32), ('64x64.png', 64),
        ('Square30x30Logo.png', 30), ('Square44x44Logo.png', 44), ('Square71x71Logo.png', 71),
        ('Square89x89Logo.png', 89), ('Square107x107Logo.png', 107), ('Square142x142Logo.png', 142),
        ('Square150x150Logo.png', 150), ('Square284x284Logo.png', 284), ('Square310x310Logo.png', 310),
        ('StoreLogo.png', 50), ('icon.png', 512),
    ]
    for name, pixel in png_targets:
        run(['sips', '-z', str(pixel), str(pixel), str(TMP / f'icon-{min(pixel, 1024)}.png'),
             '--out', str(OUT_DIR / name)])

    # ICO Windows (PNG embarqués, multi-tailles) — les petites tailles
    # sont produites par redimensionnement sips à la volée.
    import struct
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = []
    for s in sizes:
        src_png = TMP / f'icon-{min(s, 1024)}.png'
        if not src_png.exists():
            nearest = max((p for p in (64, 128, 256, 512, 1024) if p >= s), default=1024)
            src_png = TMP / f'icon-{s}.png'
            run(['sips', '-z', str(s), str(s), str(TMP / f'icon-{nearest}.png'), '--out', str(src_png)])
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
