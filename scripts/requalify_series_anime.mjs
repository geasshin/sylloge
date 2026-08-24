#!/usr/bin/env node
/**
 * Requalification Séries → Animé (jalon 0.6.11).
 *
 * Pour chaque série classée « série télé », interroge la recherche TMDB TV
 * avec le titre exact, retient la meilleure correspondance (même scoring que
 * l'association automatique) et requalifie en « animation » uniquement si :
 *   - le pays d'origine du résultat contient « JP », ET
 *   - ses genres incluent 16 (Animation), ET
 *   - le score de correspondance titre ≥ MATCH_THRESHOLD.
 *
 * Sûreté : lecture seule par défaut (dry-run) ; --apply pour écrire.
 * Idempotent : rejouer ne produit aucune nouvelle modification.
 * La clé TMDB reste dans ~/.sylloge-secrets/, jamais affichée ni loguée.
 *
 * Usage : node scripts/requalify_series_anime.mjs [--apply]
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const { MATCH_THRESHOLD, delay } = await import('../src/domain/autoAssociateMedia.ts')
const REQUEST_DELAY_MS = 260

const apply = process.argv.includes('--apply')
const dbPath = join(homedir(), 'Library', 'Application Support', 'com.aurelientrouble.sylloge', 'sylloge.db')
const token = readFileSync(join(homedir(), '.sylloge-secrets', 'tmdb-api-key.txt'), 'utf8').trim()

const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync(dbPath)

function normalizeTitle(value) {
  return value
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Score titre normalisé (mot à mot, ordre insensible), comme autoAssociate. */
function scoreTitles(candidateTitle, targetTitle) {
  const candidate = normalizeTitle(candidateTitle)
  const target = normalizeTitle(targetTitle)
  if (!candidate || !target) return 0
  if (candidate === target) return 1
  const candidateTokens = new Set(candidate.split(' '))
  const targetTokens = target.split(' ')
  const hits = targetTokens.filter((token) => candidateTokens.has(token)).length
  return hits / targetTokens.length
}

async function searchTmdbTv(title) {
  const url = new URL('https://api.themoviedb.org/3/search/tv')
  url.searchParams.set('query', title)
  url.searchParams.set('language', 'fr-FR')
  url.searchParams.set('include_adult', 'false')
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`)
  return response.json()
}

const rows = db.prepare("SELECT id, title FROM series WHERE category = 'série télé' ORDER BY title").all()
console.log(`Séries « série télé » à examiner : ${rows.length}`)

const promotions = []
let failures = 0

for (const row of rows) {
  try {
    const payload = await searchTmdbTv(row.title)
    const best = (payload.results ?? [])
      .map((result) => ({ result, score: scoreTitles(result.name ?? '', row.title) }))
      .sort((a, b) => b.score - a.score)[0]

    if (!best || best.score < MATCH_THRESHOLD) {
      console.log(`  · ${row.title} → correspondance trop faible, inchangée`)
    } else {
      const { result } = best
      const countries = result.origin_country ?? []
      const genres = result.genre_ids ?? []
      if (countries.includes('JP') && genres.includes(16)) {
        promotions.push(row.id)
        console.log(`  ✚ ${row.title} → ANIMÉ (JP + Animation, score ${best.score.toFixed(2)})`)
      } else {
        console.log(`  · ${row.title} → série (${countries.join('/') || 'pays inconnu'}, score ${best.score.toFixed(2)})`)
      }
    }
  } catch (error) {
    failures += 1
    console.log(`  ! ${row.title} → échec (${error.message}), inchangée`)
  }
  await delay(REQUEST_DELAY_MS)
}

console.log('')
if (failures > 0) console.log(`⚠ ${failures} échec(s) réseau : relancer plus tard, rien n'a été écrit pour ces fiches.`)
console.log(`Requalifications proposées : ${promotions.length}`)

if (!apply) {
  console.log('Dry-run terminé. Relancer avec --apply pour écrire.')
} else if (promotions.length > 0) {
  const update = db.prepare("UPDATE series SET category = 'animation' WHERE id = ?")
  db.exec('BEGIN')
  try {
    for (const id of promotions) update.run(id)
    db.exec('COMMIT')
    console.log(`${promotions.length} série(s) requalifiée(s) en « animation ».`)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
} else {
  console.log('Rien à écrire.')
}
