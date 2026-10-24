// Cartes à partager : la lueur d'ambiance tirée des affiches, en calcul pur.
//
// Le fond de la carte est l'anthracite de l'application ; la couleur vient des affiches (décision du
// 16 octobre : la couleur vient des œuvres, pas de l'interface). On en tire une lueur douce derrière la
// composition. La teinte est plafonnée pour qu'une affiche très claire n'éclaircisse jamais le fond au
// point de rendre le texte illisible : le texte secondaire garde au moins 4,5:1 sur le pire fond.

export type Rgb = [number, number, number]

/** Fond de base de la carte (#121214). */
export const AMBIENT_BASE: Rgb = [18, 18, 20]
/** Part maximale de la lueur dans le fond. */
export const AMBIENT_ALPHA = 0.3
/** Plafond d'un canal de la teinte : voir le test du pire cas. */
const MAX_CHANNEL = 150
/** Part de gris ajoutée : une affiche criarde donne une lueur plus calme. */
const NEUTRAL_MIX = 0.25

/** Couleur moyenne des pixels opaques d'une image RGBA aplatie ; `null` si rien n'est opaque. */
export function averageColor(data: ArrayLike<number>): Rgb | null {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    count += 1
  }
  return count === 0 ? null : [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
}

/** La teinte de lueur d'une affiche : sa couleur, adoucie, jamais au-delà du plafond. */
export function ambientTint(color: Rgb): Rgb {
  const mixed = color.map(channel => channel * (1 - NEUTRAL_MIX) + 110 * NEUTRAL_MIX)
  const peak = Math.max(...mixed)
  const scale = peak > MAX_CHANNEL ? MAX_CHANNEL / peak : 1
  return mixed.map(channel => Math.round(channel * scale)) as Rgb
}
