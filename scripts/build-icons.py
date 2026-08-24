#!/usr/bin/env python3
"""Génère les icônes Sylloge : logo sur fond clair, proportions macOS.

macOS affiche les icônes de dock dans une « superellipse » avec une marge
interne d'environ 10 % par côté. On compose donc : fond dégradé très léger
blanc → gris pâle (lisible en light comme en dark), logo centré à ~78 %.
"""

import subprocess
from pathlib import Path

SRC = Path('src/assets/icon-1024.png')
OUT_DIR = Path('src-tauri/icons')
TMP = Path('/tmp/sylloge-icon-build')

SIZES = [16, 32, 64, 128, 256, 512, 1024]

# Fond blanc pur avec un voile gris très subtil en bas (relief discret).
SVG_TEMPLATE = '''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#EDEDEE"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="{radius}" fill="url(#bg)"/>
</svg>'''


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def build_square(size: int) -> Path:
    """Compose fond SVG + logo redimensionné via sips (pas de dépendance PIL)."""
    out = TMP / f'icon-{size}.png'
    # 1. Fond
    svg = TMP / 'bg.svg'
    radius = int(1024 * 0.2237)  # rayon de squircle Apple ≈ 22.37 %
    svg.write_text(SVG_TEMPLATE.format(size=1024, radius=radius))
    run(['qlmanage', '-t', '-s', '1024', '-o', str(TMP), str(svg)])
    bg = TMP / 'bg.svg.png'
    # 2. Logo agrandi à 80 % de la tuile
    logo = TMP / f'logo-{size}.png'
    run(['sips', '-z', str(int(size * .8)), str(int(size * .8)), str(SRC), '--out', str(logo)])
    # 3. Composition : sips ne sait pas superposer → on utilise CoreImage via
    #    un petit outil Swift natif disponible sur macOS.
    composite = TMP / f'composite-{size}.swift'
    composite.write_text(f'''
import AppKit
let bg = NSImage(contentsOfFile: "{bg}")!
let logo = NSImage(contentsOfFile: "{logo}")!
let size = NSSize(width: {size}, height: {size})
let image = NSImage(size: size)
image.lockFocus()
bg.draw(in: NSRect(origin: .zero, size: size))
let logoSize = logo.size
let origin = NSPoint(x: ({size} - logoSize.width) / 2, y: ({size} - logoSize.height) / 2)
logo.draw(in: NSRect(origin: origin, size: logoSize))
image.unlockFocus()
let tiff = image.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: "{out}"))
''')
    run(['swift', str(composite)])
    return out


def main() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        square = build_square(size)
        print(f'{size}px OK')
    # icns macOS
    iconset = TMP / 'icon.iconset'
    iconset.mkdir(exist_ok=True)
    pairs = [(16, 2), (16, 1), (32, 2), (32, 1), (128, 2), (128, 1), (256, 2), (256, 1), (512, 2), (512, 1)]
    for base, scale in sorted(pairs):
        target = iconset / (f'icon_{base}x{base}@{scale}x.png' if scale == 2 else f'icon_{base}x{base}.png')
        pixel = base * scale
        run(['sips', '-z', str(pixel), str(pixel), str(TMP / f'icon-{min(pixel, 1024)}.png'), '--out', str(target)])
    run(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT_DIR / 'icon.icns')])
    # PNG génériques + ICO Windows
    for name, pixel in [('128x128.png', 128), ('128x128@2x.png', 256), ('32x32.png', 32), ('64x64.png', 64),
                        ('Square30x30Logo.png', 30), ('Square44x44Logo.png', 44), ('Square71x71Logo.png', 71),
                        ('Square89x89Logo.png', 89), ('Square107x107Logo.png', 107), ('Square142x142Logo.png', 142),
                        ('Square150x150Logo.png', 150), ('Square284x284Logo.png', 284), ('Square310x310Logo.png', 310),
                        ('StoreLogo.png', 50), ('icon.png', 512)]:
        run(['sips', '-z', str(pixel), str(pixel), str(TMP / f'icon-{min(pixel, 1024)}.png'), '--out', str(OUT_DIR / name)])
    print('Icônes régénérées.')


if __name__ == '__main__':
    main()
