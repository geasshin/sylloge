#!/usr/bin/env node
/**
 * Requalification Livres → Manga / Comics (jalon 0.6.11).
 *
 * Classification par auteurs connus, appliquée en transaction, idempotente.
 * Aucun titre ambigu n'est touché : les faux amis restent « livre ».
 *
 * Usage : node scripts/requalify_books_categories.mjs [--apply]
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const apply = process.argv.includes('--apply')
const dbPath = join(homedir(), 'Library', 'Application Support', 'com.aurelientrouble.sylloge', 'sylloge.db')
const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync(dbPath)

/** Mangas identifiés avec certitude : auteur japonais du médium ou titre unique. */
const MANGA_AUTHORS = [
  'Naoki Urasawa',
  'Tatsuki Fujimoto',
  'Norihiro Yagi',
  'Q Hayashida',
  'Sui Ishida',
  'Boichi',
  '諫山創', // Hajime Isayama
  '浅野いにお', // Inio Asano
  '幸村誠', // Makoto Yukimura
]

const MANGA_TITLES = [
  'berserk',
  'chainsaw man',
  'claymore',
  'dorohedoro',
  "l'attaque des titans",
  'l’attaque des titans',
  'oyasumi punpun',
  'sun-ken rock',
  'tokyo ghoul',
  '20th century boys',
  '21th century boys',
]

function classify(title, author) {
  const titleLower = title.toLocaleLowerCase('fr')
  if (MANGA_TITLES.some((needle) => titleLower === needle || titleLower.startsWith(needle))) return 'manga'
  if (MANGA_AUTHORS.some((needle) => (author ?? '').includes(needle))) return 'manga'
  return null
}

const rows = db.prepare("SELECT id, title, author FROM books WHERE category = 'livre' ORDER BY title").all()
console.log(`Livres « livre » à examiner : ${rows.length}`)

const promotions = []
for (const row of rows) {
  const target = classify(row.title, row.author)
  if (target === 'manga') {
    promotions.push(row.id)
    console.log(`  ✚ ${row.title} → manga`)
  } else {
    console.log(`  · ${row.title} → livre (inchangé)`)
  }
}

console.log('')
console.log(`Requalifications proposées : ${promotions.length}`)

if (!apply) {
  console.log('Dry-run terminé. Relancer avec --apply pour écrire.')
} else if (promotions.length > 0) {
  const update = db.prepare("UPDATE books SET category = 'manga' WHERE id = ?")
  db.exec('BEGIN')
  try {
    for (const id of promotions) update.run(id)
    db.exec('COMMIT')
    console.log(`${promotions.length} livre(s) requalifié(s).`)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
} else {
  console.log('Rien à écrire.')
}
