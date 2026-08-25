#!/usr/bin/env python3
"""Icônes Sylloge conformes au gabarit Apple (HIG App Icons).

Spécification appliquée :
- Canevas 1024x1024, fond transparent.
- Artwork 824x824 centré (marges de 100 px), coins arrondis au rayon
  du gabarit macOS (~185 px sur le canevas).
- Fond : dégradé vertical anthracite dessiné NATIVEMENT en AppKit
  (pas de passage par SVG/Quick Look, qui casse la transparence et
  ajoute un fond blanc — le bug constaté dans le dock).
- Logo Sylloge recadré puis centré à 82 % de la tuile, ombre douce.

Usage : python3 scripts/build-icons.py   (macOS requis)
"""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_LOGO = ROOT / 'src/assets/icon-1024.png'
OUT_DIR = ROOT / 'src-tauri/icons'
TMP = Path('/tmp/sylloge-icon-build')

CANVAS = 1024          # canevas final
ARTWORK = 824          # tuile dessinée (marges 100 px)
RADIUS = 185           # rayon de coin du gabarit macOS
LOGO_RATIO = 0.82      # cadre du logo recadré = 82 % de la tuile
# Le PNG maître contient un large transparent autour du pictogramme. Ce carré
# resserré conserve une respiration homogène sans déformer le symbole.
LOGO_CROP_X_RATIO = 175 / 1024
LOGO_CROP_Y_RATIO = 196 / 1024  # AppKit : origine en bas à gauche
LOGO_CROP_SIZE_RATIO = 675 / 1024


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f'{cmd[0]} a échoué : {result.stderr[:400]}')


def compose(size: int) -> Path:
    """Dessine toute l'icône en Swift/AppKit : transparence garantie."""
    out = TMP / f'icon-{size}.png'
    scale = size / CANVAS
    tile = round(ARTWORK * scale)
    radius = round(RADIUS * scale)
    margin = round((size - tile) / 2)
    logo_px = round(tile * LOGO_RATIO)

    logo = TMP / 'logo-1024.png'
    if not logo.exists():
        run(['sips', '-z', '1024', '1024', str(SRC_LOGO), '--out', str(logo)])

    script = TMP / f'compose-{size}.swift'
    script.write_text(f'''
import AppKit

let size = CGFloat({size})
let tile = CGFloat({tile})
let radius = CGFloat({radius})
let margin = CGFloat({margin})
let logoPx = {logo_px}.0

guard let logo = NSImage(contentsOfFile: "{logo}") else {{ fatalError("logo manquant") }}
let cropBase = min(logo.size.width, logo.size.height)
let logoCrop = NSRect(x: logo.size.width * {LOGO_CROP_X_RATIO},
                      y: logo.size.height * {LOGO_CROP_Y_RATIO},
                      width: cropBase * {LOGO_CROP_SIZE_RATIO},
                      height: cropBase * {LOGO_CROP_SIZE_RATIO})

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
NSGraphicsContext.current?.imageInterpolation = .high

let tileRect = NSRect(x: margin, y: margin, width: tile, height: tile)

// Fond : dégradé anthracite vertical dans un squircle
let bgPath = NSBezierPath(roundedRect: tileRect, xRadius: radius, yRadius: radius)
bgPath.addClip()
let gradient = NSGradient(starting: NSColor(srgbRed: 0.26, green: 0.26, blue: 0.28, alpha: 1),
                          ending: NSColor(srgbRed: 0.10, green: 0.10, blue: 0.12, alpha: 1))!
gradient.draw(in: bgPath, angle: -90)

// Filet lumineux discret sur le bord supérieur (profondeur)
NSGraphicsContext.current?.saveGraphicsState()
let highlight = NSGradient(starting: NSColor.white.withAlphaComponent(0.14),
                           ending: NSColor.white.withAlphaComponent(0.0))
highlight?.draw(in: bgPath, angle: -90)
NSGraphicsContext.current?.restoreGraphicsState()

// Logo centré avec ombre douce
let logoSize = NSSize(width: logoPx, height: logoPx)
let origin = NSPoint(x: tileRect.midX - logoSize.width / 2,
                     y: tileRect.midY - logoSize.height / 2)
NSGraphicsContext.current?.saveGraphicsState()
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.5)
shadow.shadowBlurRadius = Double(tile) * 0.02
shadow.shadowOffset = NSSize(width: 0, height: -Double(tile) * 0.008)
shadow.set()
logo.draw(in: NSRect(origin: origin, size: logoSize),
          from: logoCrop, operation: .sourceOver, fraction: 1.0)
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

    iconset = TMP / 'icon.iconset'
    iconset.mkdir(exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for name, pixel in [(f'icon_{base}x{base}.png', base), (f'icon_{base}x{base}@2x.png', base * 2)]:
            run(['sips', '-z', str(pixel), str(pixel),
                 str(TMP / f'icon-{min(pixel, 1024)}.png'), '--out', str(iconset / name)])
    run(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT_DIR / 'icon.icns')])

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

    import struct
    images = []
    for s in [16, 24, 32, 48, 64, 128, 256]:
        src_png = TMP / f'icon-{s}.png'
        nearest = max((p for p in (64, 128, 256, 512, 1024) if p >= s), default=1024)
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
