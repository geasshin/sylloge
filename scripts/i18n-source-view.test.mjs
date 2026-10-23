import assert from 'node:assert/strict'
import { test } from 'node:test'

const { withoutTranslation } = await import('./ui-source.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw error
})

const view = (source) => {
  assert.equal(typeof withoutTranslation, 'function', 'scripts/ui-source.mjs doit exporter withoutTranslation')
  return withoutTranslation(source)
}

test('Un texte JSX et un attribut redeviennent le français brut du source', () => {
  assert.equal(view(`<span className="nav-item-label">{t('Accueil')}</span>`), `<span className="nav-item-label">Accueil</span>`)
  assert.equal(view(`<button aria-label={t('Fermer l’assistant')}>×</button>`), `<button aria-label="Fermer l’assistant">×</button>`)
  assert.equal(view(`<i aria-label={t("Favori")}>♥</i>`), `<i aria-label="Favori">♥</i>`)
})

test('Les gabarits étiquetés et les valeurs nommées redeviennent des gabarits JavaScript', () => {
  assert.equal(view('aria-label={t`Ouvrir la fiche de ${entry.title}`}'), 'aria-label={`Ouvrir la fiche de ${entry.title}`}')
  assert.equal(view(`label={t('{position} sur {count}', { position: position + 1, count })}`), 'label={`${position + 1} sur ${count}`}')
  assert.equal(view(`const text = t('Saison {seen} sur {total}', { seen: formatNumber(seen), total })`), 'const text = `Saison ${formatNumber(seen)} sur ${total}`')
})

test('Les variables, tc() et translateMessage() laissent leur argument', () => {
  assert.equal(view('<p>{t(error)}</p>'), '<p>{error}</p>')
  assert.equal(view('<p>{translateMessage(error.message)}</p>'), '<p>{error.message}</p>')
  assert.equal(view(`<b>{tc('comics', 'Dessin')}</b>`), '<b>Dessin</b>')
  assert.equal(view(`const label = t(LABELS[value])`), 'const label = LABELS[value]')
})

test('Les appels imbriqués et les parenthèses ou guillemets dans les arguments ne déroutent pas la lecture', () => {
  assert.equal(view(`x = t('Nom (facultatif) : « {x} »', { x: format('a)', t('Vue')) })`), "x = `Nom (facultatif) : « ${format('a)', 'Vue')} »`")
  assert.equal(view(`x = t(cond ? 'Un titre' : 'Des titres', { count: n })`), "x = cond ? 'Un titre' : 'Des titres'")
  assert.equal(view('<a title={t(`Ligne ${n}`)}>x</a>'), '<a title={`Ligne ${n}`}>x</a>')
})

test('Le reste du code, y compris les identifiants qui finissent par t, n’est pas modifié', () => {
  const source = `const a = at(0) + split(',') + format(x) + obj.t('x') + result(1)\nreturn <i>{' · '}</i>\nconst ease = (t) => t * 2\nconst t = 4`
  assert.equal(view(source), source)
})

test('La lecture est idempotente', () => {
  const once = view(`<span>{t('Accueil')}</span> <b aria-label={t('Tri')}>{t('Trier')}</b> {t('{n} sur {m}', { n, m })}`)
  assert.equal(view(once), once)
})
