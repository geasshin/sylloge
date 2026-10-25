#!/usr/bin/env node
/**
 * Import des recettes Notion (« Meal Tracker » › base « Recettes ») vers un
 * document Sylloge v5, bibliothèque personnalisée `recipes`.
 *
 * Le script lit la base Notion avec l'intégration « Hermès » : la clé
 * NOTION_API_KEY est prise dans l'environnement, sinon dans le .env du profil
 * Hermes (option --env-file). Elle n'est jamais affichée ni écrite sur disque.
 *
 * Il ne modifie rien dans Notion : uniquement des GET.
 *
 * Correspondances : l'option d'état Notion ne sert que d'indice pour le type de
 * plat (« Pain », « Brioches & beignets » désignent un rayon, pas un état : ces
 * recettes arrivent « à découvrir » et leur état réel se décide à la main). Le
 * champ Notion « Durée » est un temps total : il remplit « Préparation », la
 * cuisson se complète à la main quand elle est connue.
 *
 * Usage :
 *   node scripts/import-notion-recipes.mjs --out fixtures/recettes-notion.json
 *   node scripts/import-notion-recipes.mjs --inspect          # diagnostic seul
 *
 * Le document produit se restaure dans un profil neuf (Paramètres ›
 * Restauration) ; il ne contient que la bibliothèque Recettes.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

const NOTION_VERSION = '2022-06-28'
/** Base Notion « Recettes » de la page « Meal Tracker ». */
const DEFAULT_DATABASE_ID = '102b59f3-a2a9-803a-acad-c68f6c5533b0'

/**
 * Type de plat, décidé recette par recette à partir du titre Notion. La base
 * Notion n'a pas de champ catégorie : ses options d'état « Pain » et
 * « Brioches & beignets » tenaient lieu de rayon. Le mapping reste explicite
 * et relu à la main ; une recette absente de cette table est signalée.
 */
const DISH_BY_TITLE = {
  'Mouhalabieh — crème libanaise à la fleur d’oranger': 'Dessert',
  'Riz au lait crémeux à la vanille': 'Dessert',
  'Goulash végétarien aux dés de soja': 'Plat',
  'Mini-fondants au cacao au beurre — air fryer': 'Dessert',
  'Petits pains façon pâte à pizza, air fryer': 'Pain',
  'Cookies aux pépites de chocolat au Air Fryer': 'Dessert',
  'Buns pomme de terre-mozzarella à la poêle': 'Pain',
  'Petits biscuits à la pâte sucrée (à découper)': 'Dessert',
  'Sablés au beurre': 'Dessert',
  'Brioche nuage (brioches ultra légères)': 'Pain',
  'Brioches au sucre (briochettes au lait)': 'Pain',
  'Beignets moelleux au Airfryer (sans friture)': 'Pain',
  'Pain shawarma libanais fin à poche — khobz arabi': 'Pain',
  'Manakish au zaatar': 'Pain',
  'English muffins maison pour 4': 'Pain',
  'Cheese naans': 'Pain',
  'Garlic bread maison': 'Accompagnement',
  'Pâte à pizza et panuozzo — cuisson poêle ou air fryer': 'Pain',
  'Mini fougasses provençales': 'Pain',
  'Mini focaccias': 'Pain',
  'Pains burger maison pour 4 buns': 'Pain',
  'Petits pains blancs': 'Pain',
  'Pitas à poche maison pour kebab — poêle ou air fryer': 'Pain',
  'Naans nature à la poêle': 'Pain',
  'Matlouh algérien à la poêle': 'Pain',
  'Batbouts marocains à poche, air fryer': 'Pain',
  'Sada roti — galette caribéenne à la farine blanche': 'Pain',
  'Tortillas de blé maison': 'Pain',
  'Blancs de poireaux au lait de coco & riz': 'Plat',
  Rajma: 'Plat',
  'Steak de lentilles': 'Plat',
  'Soupe froide courgette feta': 'Entrée',
  'Purée de potimarron': 'Accompagnement',
  'Nouilles Udon sauce cacahuète': 'Plat',
  'Compotée de chou rouge': 'Accompagnement',
  'Houmous Cacahuetes': 'Apéritif',
  'Sauce tomate': 'Sauce',
  'Salade composée': 'Entrée',
  'Pâtes au pesto': 'Plat',
  'Gnocchis sauce tomate': 'Plat',
  'Purée de carottes': 'Accompagnement',
  'Steaks végétariens aux lentilles, facile à faire ! - YouTube': 'Plat',
  'PAILLASSON DE POMMES DE TERRE AKA L’ENTRÉE ULTIME -- FOOD IS LOVE - YouTube': 'Entrée',
  'Faire une chakchouka en 30 minutes top chrono ! 🍳🥫🔥 - YouTube': 'Plat',
  'Une sauce incroyable, prête en 5 minutes ! 🍃🧨 (chimichurri) - YouTube': 'Sauce',
  'Dahl de lentilles corail': 'Plat',
  'Riz Mujaddara': 'Plat',
  'Panna Cotta': 'Dessert',
  'Pois chiches tikka masala': 'Plat',
  'Galettes de pois chiches': 'Plat',
  Pancakes: 'Dessert',
  'Poulet sauce moutarde': 'Plat',
  "PAILLASSON DE POMMES DE TERRE AKA L'ENTRÉE ULTIME -- FOOD IS LOVE - YouTube": 'Entrée',
}

/** État Notion → statut Sylloge. */
function statusFor(notionStatus) {
  const value = String(notionStatus ?? '').trim().toLocaleLowerCase('fr')
  if (value === 'maitrisé' || value === 'maîtrisé' || value === 'maitrisée' || value === 'maîtrisée') return 'maîtrisée'
  if (value === 'pain' || value === 'brioches & beignets') return 'à découvrir'
  if (value === 'testé' || value === 'testée') return 'terminé'
  return 'à découvrir'
}

function parseArgs(argv) {
  const args = { out: null, inspect: false, limit: null, envFile: null, database: DEFAULT_DATABASE_ID }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--out') args.out = argv[++index]
    else if (value === '--inspect') args.inspect = true
    else if (value === '--limit') args.limit = Number(argv[++index])
    else if (value === '--env-file') args.envFile = argv[++index]
    else if (value === '--database') args.database = argv[++index]
    else if (value === '--help' || value === '-h') {
      console.log('Usage : node scripts/import-notion-recipes.mjs [--out fichier.json] [--inspect] [--limit n] [--env-file chemin] [--database id]')
      process.exit(0)
    } else {
      throw new Error(`Argument inconnu : ${value}`)
    }
  }
  return args
}

function readApiKey(envFile) {
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY.trim()
  const candidates = [
    envFile,
    process.env.HERMES_HOME ? resolve(process.env.HERMES_HOME, '..', '.env') : null,
    resolve(homedir(), '.hermes', 'profiles', 'promethee', '.env'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    let content
    try {
      content = readFileSync(candidate, 'utf8')
    } catch {
      continue
    }
    for (const line of content.split(/\r?\n/u)) {
      if (!line.startsWith('NOTION_API_KEY=')) continue
      const raw = line.slice('NOTION_API_KEY='.length).trim()
      const key = raw.replace(/^["']|["']$/gu, '')
      if (key) return key
    }
  }
  throw new Error('NOTION_API_KEY introuvable : exportez-la ou passez --env-file chemin/du/.env')
}

async function notion(path, apiKey, options = {}) {
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Notion ${response.status} sur ${path} : ${body.slice(0, 400)}`)
  }
  return response.json()
}

async function queryAllPages(databaseId, apiKey) {
  const pages = []
  let cursor
  for (;;) {
    const page = await notion(`databases/${databaseId}/query`, apiKey, {
      method: 'POST',
      body: cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 },
    })
    pages.push(...page.results)
    if (!page.has_more) break
    cursor = page.next_cursor
  }
  return pages
}

async function fetchBlocks(blockId, apiKey) {
  const blocks = []
  let cursor
  for (;;) {
    const query = cursor ? `?page_size=100&start_cursor=${cursor}` : '?page_size=100'
    const page = await notionWithRetry(`blocks/${blockId}/children${query}`, apiKey)
    blocks.push(...page.results)
    if (!page.has_more) break
    cursor = page.next_cursor
  }
  return blocks
}

/** Notion limite à trois requêtes par seconde : on attend sur un 429. */
async function notionWithRetry(path, apiKey, options, attempt = 0) {
  try {
    return await notion(path, apiKey, options)
  } catch (error) {
    if (!/Notion 429/u.test(String(error)) || attempt >= 5) throw error
    await new Promise((done) => setTimeout(done, 800 * (attempt + 1)))
    return notionWithRetry(path, apiKey, options, attempt + 1)
  }
}

/**
 * Arbre complet d'une page : les blocs imbriqués (puces, bascules, colonnes)
 * portent souvent la moitié des ingrédients. Sans eux, une recette arrive
 * vide à l'import.
 */
async function fetchBlockTree(blockId, apiKey, depth = 0) {
  const blocks = await fetchBlocks(blockId, apiKey)
  if (depth >= 4) return blocks
  for (const block of blocks) {
    if (block.has_children === true) block.children = await fetchBlockTree(block.id, apiKey, depth + 1)
  }
  return blocks
}

/** Aplatit l'arbre dans l'ordre de lecture. */
function flatten(blocks, out = []) {
  for (const block of blocks) {
    out.push(block)
    if (Array.isArray(block.children)) flatten(block.children, out)
  }
  return out
}

const richText = (value) => (Array.isArray(value) ? value.map((part) => part.plain_text ?? '').join('') : '')
const cleanLine = (value) => value.replace(/\s+/gu, ' ').trim()
const headingText = (block) => richText(block.heading_1?.rich_text ?? block.heading_2?.rich_text ?? block.heading_3?.rich_text)

/**
 * Découpe le corps d'une page en ingrédients, étapes et notes. Les titres de
 * section (« Ingrédients : », « Préparation : ») donnent le rôle des puces ;
 * sans titre, une puce est un ingrédient et une ligne numérotée une étape.
 */
function readBody(blocks) {
  const ingredients = []
  const steps = []
  const notes = []
  const images = []
  let section = null
  for (const block of blocks) {
    if (block.archived || block.in_trash) continue
    const type = block.type
    if (type === 'heading_1' || type === 'heading_2' || type === 'heading_3') {
      const text = headingText(block).toLocaleLowerCase('fr')
      if (/ingr[ée]dient/u.test(text)) section = 'ingredients'
      else if (/pr[ée]paration|instruction|m[ée]thode|recette|cuisson|dressage/u.test(text)) section = 'steps'
      else if (/v[ée]rifier|astuce|note|conseil|conservation|remarque|variante/u.test(text)) section = 'notes'
      // Un sous-titre sans mot-clé (« Marinade », « Pour la garniture ») ne
      // change pas de section : il range la suite là où l'on était.
      else if (section === null) section = 'notes'
      continue
    }
    if (type === 'image') {
      const url = block.image?.external?.url ?? block.image?.file?.url
      if (url) images.push(url)
      continue
    }
    if (type === 'table_row') {
      const text = cleanLine((block.table_row?.cells ?? []).map((cell) => richText(cell)).join(' '))
      if (!text) continue
      ;(section === 'steps' ? steps : section === 'notes' ? notes : ingredients).push(text)
      continue
    }
    const text = cleanLine(richText(block[type]?.rich_text ?? []))
    if (!text) continue
    if (type === 'numbered_list_item') {
      if (section === 'ingredients') ingredients.push(text)
      else if (section === 'notes') notes.push(text)
      else steps.push(text)
      continue
    }
    if (type === 'bulleted_list_item' || type === 'to_do' || type === 'toggle' || type === 'quote' || type === 'callout') {
      if (section === 'steps') steps.push(text)
      else if (section === 'notes') notes.push(text)
      else ingredients.push(text)
      continue
    }
    if (type === 'paragraph') {
      if (section === 'ingredients') ingredients.push(text)
      else if (section === 'steps') steps.push(text)
      else notes.push(text)
    }
  }
  return { ingredients, steps, notes, images }
}

function propertyValues(page) {
  const properties = page.properties ?? {}
  const title = richText(properties.Nom?.title ?? [])
  const status = properties['État']?.status?.name ?? properties['État']?.select?.name ?? null
  const duration = richText(properties['Durée']?.rich_text ?? [])
  const source = properties.Lien?.url ?? null
  const files = Array.isArray(properties.Photo?.files) ? properties.Photo.files : []
  const photo = files.map((file) => file.external?.url ?? file.file?.url ?? null).find(Boolean) ?? null
  const favorite = properties['Favori ?']?.checkbox === true
  return { title, status, duration, source, photo, favorite, cover: page.cover?.external?.url ?? page.cover?.file?.url ?? null }
}

function buildEntry(page, body, warnings, dishNotes) {
  const values = propertyValues(page)
  const title = cleanLine(values.title)
  const dish = DISH_BY_TITLE[title]
  if (!dish) {
    dishNotes.push(title)
  }
  const details = {}
  if (dish) details.dish = dish
  if (values.duration) details.prepTime = cleanLine(values.duration)
  if (body.ingredients.length) details.ingredients = body.ingredients.join('\n')
  if (body.steps.length) details.steps = body.steps.join('\n')

  // Une photo Notion hébergée (S3 signé) expire en une heure : elle n'est pas
  // une adresse durable, contrairement à une photo importée par lien.
  const hosted = values.photo && /prod-files-secure|amazonaws\.com/u.test(values.photo)
  const coverUrl = !hosted ? (values.photo ?? values.cover ?? body.images[0] ?? null) : (values.cover && !/prod-files-secure|amazonaws\.com/u.test(values.cover) ? values.cover : null)
  if (hosted) warnings.push({ title, kind: 'photo-notion-hebergee' })
  if (!coverUrl) warnings.push({ title, kind: 'sans-visuel' })
  if (!details.ingredients) warnings.push({ title, kind: 'sans-ingredients' })
  if (!details.steps) warnings.push({ title, kind: 'sans-etapes' })
  if (!values.source) warnings.push({ title, kind: 'sans-source' })
  if (['Pain', 'Brioches & beignets'].includes(values.status)) warnings.push({ title, kind: `etat-categorie:${values.status}` })

  return {
    id: page.id,
    profileId: PROFILE_ID,
    title: title || 'Recette sans titre',
    creator: values.source,
    year: null,
    status: statusFor(values.status),
    rating: null,
    isFavorite: values.favorite,
    progressCurrent: null,
    progressTotal: null,
    progressUpdatedAt: null,
    startedAt: null,
    finishedAt: null,
    coverUrl,
    summary: null,
    personalNote: body.notes.length ? body.notes.join('\n') : null,
    details,
    quotes: [],
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  }
}

const PROFILE_ID = 'notion-recettes'
const PROFILE_NAME = 'Recettes Notion'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apiKey = readApiKey(args.envFile)
  const pages = await queryAllPages(args.database, apiKey)
  const selected = args.limit ? pages.slice(0, args.limit) : pages
  const warnings = []
  const dishNotes = []
  const entries = []
  for (const page of selected) {
    const blocks = flatten(await fetchBlockTree(page.id, apiKey))
    entries.push(buildEntry(page, readBody(blocks), warnings, dishNotes))
  }

  const now = new Date().toISOString()
  const document = {
    format: 'sylloge-library',
    version: 5,
    exportedAt: now,
    profile: { id: PROFILE_ID, name: PROFILE_NAME, createdAt: now, updatedAt: now },
    films: [], series: [], anime: [], books: [], mangas: [], games: [], artworks: [],
    customLibraries: [{ libraryId: 'recipes', position: 0, addedAt: now, entries }],
    experience: { version: 1, savedViews: [], preferences: {} },
  }

  const byStatus = entries.reduce((total, entry) => ({ ...total, [entry.status]: (total[entry.status] ?? 0) + 1 }), {})
  const byDish = entries.reduce((total, entry) => ({ ...total, [entry.details.dish ?? '—']: (total[entry.details.dish ?? '—'] ?? 0) + 1 }), {})
  const kinds = warnings.reduce((total, warning) => ({ ...total, [warning.kind]: (total[warning.kind] ?? 0) + 1 }), {})
  const duplicates = entries
    .map((entry) => entry.title.toLocaleLowerCase('fr'))
    .filter((title, index, all) => all.indexOf(title) !== index)

  console.log(`Recettes lues : ${entries.length}`)
  console.log(`Statuts : ${Object.entries(byStatus).map(([key, count]) => `${key} ${count}`).join(' · ')}`)
  console.log(`Types de plat : ${Object.entries(byDish).map(([key, count]) => `${key} ${count}`).join(' · ')}`)
  console.log(`Signalements : ${Object.entries(kinds).map(([key, count]) => `${key} ${count}`).join(' · ') || 'aucun'}`)
  if (dishNotes.length) console.log(`Sans type de plat : ${dishNotes.join(' | ')}`)
  if (duplicates.length) console.log(`Titres en double : ${[...new Set(duplicates)].join(' | ')}`)
  if (args.inspect) {
    for (const entry of entries) {
      const ingredients = entry.details.ingredients ? entry.details.ingredients.split('\n').length : 0
      const steps = entry.details.steps ? entry.details.steps.split('\n').length : 0
      console.log(`- [${entry.status}] ${entry.title} · ${ingredients} ingr. · ${steps} étapes · ${entry.coverUrl ? 'visuel' : 'sans visuel'} · ${entry.creator ? 'source' : 'sans source'}`)
    }
    return
  }
  if (!args.out) throw new Error('Indiquez --out fichier.json (ou --inspect pour un diagnostic seul).')
  const output = resolve(args.out)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  console.log(`Document écrit : ${output}`)
}

await main()
