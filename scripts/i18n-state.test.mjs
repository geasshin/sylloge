import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const coreUrl = new URL('../src/i18n/core.ts', import.meta.url).href

for (const settings of [
  { languages: ['fr-CA', 'en-US'], expected: 'fr', saved: null },
  { languages: ['en-US', 'fr-FR'], expected: 'en', saved: null },
  { languages: ['de-DE', 'fr-CH'], expected: 'fr', saved: null },
  { languages: ['ja-JP'], expected: 'en', saved: null },
  { languages: ['fr-FR'], expected: 'en', saved: 'en' },
  { languages: ['fr-FR'], expected: 'fr', saved: 'invalid' },
]) {
  test(`Détection webview ${JSON.stringify(settings)}`, () => {
    const script = `
      import assert from 'node:assert/strict';
      const settings = ${JSON.stringify(settings)};
      const storage = new Map(settings.saved ? [['sylloge-language', settings.saved]] : []);
      globalThis.window = new EventTarget();
      window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value) };
      Object.defineProperty(globalThis, 'navigator', { value: { languages: settings.languages, language: settings.languages[0] }, configurable: true });
      globalThis.document = { documentElement: { lang: 'fr' } };
      const core = await import(${JSON.stringify(coreUrl)});
      assert.equal(core.getLanguage(), settings.expected);
      assert.equal(document.documentElement.lang, settings.expected);
      assert.equal(storage.get('sylloge-language') ?? null, settings.saved, 'La détection seule ne persiste aucun choix');
      let updates = 0;
      const unsubscribe = core.subscribeLanguage(() => updates++);
      const next = settings.expected === 'fr' ? 'en' : 'fr';
      core.setLanguage(next);
      assert.equal(storage.get('sylloge-language'), next);
      assert.equal(core.getLanguage(), next);
      assert.equal(updates, 1);
      unsubscribe();
      core.setLanguage(settings.expected);
      assert.equal(updates, 1, 'Aucun listener après démontage');
      window.localStorage = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } };
      core.setLanguage(next);
      assert.equal(core.getLanguage(), next, 'Choix de session disponible sans stockage');
      assert.equal(document.documentElement.lang, next);
    `
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  })
}
