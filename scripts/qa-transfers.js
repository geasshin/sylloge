// Run against the real application on its isolated in-memory QA route:
// playwright-cli -s=transfers run-code --filename=scripts/qa-transfers.js
// Native pick/save dialogs and write boundaries are intercepted. These checks
// prove the UI contract and payload, not filesystem writes or native SQL.
async page => {
  page.setDefaultTimeout(7000)
  const origin = 'http://127.0.0.1:5173'
  const libraries = [
    ['films', 'Films'], ['series', 'Séries'], ['anime', 'Animation japonaise'],
    ['books', 'Livres'], ['mangas', 'Mangas'], ['games', 'Jeux'], ['artworks', 'Art'],
  ]
  const checks = []
  const assert = (condition, name) => { if (!condition) throw Error(name); checks.push(name) }
  for (const [key, label] of libraries) {
    await page.goto(`${origin}/qa-app.html?scenario=full`)
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.evaluate(async ({key}) => {
      const {libraryRepository} = await import('/src/data/libraryRepository.ts')
      const {createLibraryDocument,serializeLibraryDocument} = await import('/src/domain/libraryDocument.ts')
      const library=await libraryRepository.loadLibrary('qa-profile')
      // Include all seven sections: each entry point must select ONLY its own.
      const document=createLibraryDocument(library)
      const original=window.__TAURI_INTERNALS__.invoke
      window.__transferTest={document,writes:[],exports:[],cancelSave:false}
      window.__TAURI_INTERNALS__.invoke=async(cmd,args,...rest)=> {
        if(cmd==='pick_import_any') return {name:'profil-complet.json',kind:'json',contents:serializeLibraryDocument(document),csvCandidates:[],markdownPages:[],containerCandidates:[]}
        if(cmd.startsWith('import_')) {
          window.__transferTest.writes.push({cmd,args})
          return {inserted:args.plan.inserts.length,updated:args.plan.updates.length,removed:args.plan.replaceExisting?library[key].length:0}
        }
        if(cmd==='save_export_json'||cmd==='save_export_csv') {
          window.__transferTest.exports.push({cmd,args})
          return window.__transferTest.cancelSave?null:args.suggestedName
        }
        return original(cmd,args,...rest)
      }
    },{key})
    await page.getByRole('button',{name:'Importer',exact:true}).click()
    assert(await page.getByRole('group',{name:'Origine du fichier'}).isVisible(),`${key}: source guidée visible`)
    await page.getByRole('button',{name:'Choisir un fichier',exact:true}).click()
    assert(await page.getByRole('heading',{name:`Aperçu de ${label}`,exact:true}).isVisible(),`${key}: aperçu de sa bibliothèque`)
    await page.getByRole('button',{name:'Continuer',exact:true}).click()
    await page.getByRole('button',{name:/Remplacer/}).click()
    assert(await page.evaluate(()=>window.__transferTest.writes.length===0),`${key}: aucune écriture au choix du mode`)
    assert(await page.getByRole('button',{name:'Confirmer le remplacement',exact:true}).isDisabled(),`${key}: consentement requis`)
    // The confirmation can be abandoned without writing.
    await page.getByRole('button',{name:'Retour',exact:true}).click()
    assert(await page.evaluate(()=>window.__transferTest.writes.length===0),`${key}: retour sans écriture`)
    await page.getByRole('button',{name:/Remplacer/}).click()
    await page.getByRole('checkbox').check()
    await page.getByRole('button',{name:'Confirmer le remplacement',exact:true}).click()
    await page.getByRole('heading',{name:'Import terminé',exact:true}).waitFor()
    const result=await page.evaluate(({key})=>{
      const state=window.__transferTest
      const write=state.writes[0]
      return {count:state.writes.length,cmd:write.cmd,replace:write.args.plan.replaceExisting,
        titles:write.args.plan.inserts.map(x=>x.title),expected:state.document[key].map(x=>x.title)}
    },{key})
    assert(result.count===1&&result.cmd===`import_${key}_into_profile`&&result.replace,`${key}: une seule commande vers sa table`)
    assert(JSON.stringify(result.titles)===JSON.stringify(result.expected),`${key}: aucun contenu d’une autre bibliothèque`)
    await page.getByRole('button',{name:'Fermer',exact:true}).click()
    // Collection JSON and profile JSON are distinct, valid and named.
    await page.getByRole('button',{name:'Exporter',exact:true}).click()
    await page.getByRole('button',{name:/^JSON Sylloge/}).click()
    const single=await page.evaluate(async({key})=>{
      const {validateLibraryDocument}=await import('/src/domain/libraryDocument.ts')
      const saved=window.__transferTest.exports.at(-1)
      const parsed=validateLibraryDocument(saved.args.contents)
      return {valid:parsed.errors.length===0&&!!parsed.document,name:saved.args.suggestedName,
        other:parsed.document&&Object.entries(parsed.document).filter(([k,v])=>k!==key&&Array.isArray(v)&&v.length>0).map(([k])=>k)}
    },{key})
    assert(single.valid&&single.name.startsWith(`sylloge-${key}-`)&&single.other.length===0,`${key}: JSON valide et limité à la bibliothèque`)
    await page.getByRole('radio',{name:'Tout le profil · toutes ses bibliothèques'}).check()
    await page.getByRole('button',{name:/^JSON Sylloge/}).click()
    assert(await page.evaluate(()=>{
      const saved=window.__transferTest.exports.at(-1)
      const doc=JSON.parse(saved.args.contents)
      return ['films','series','anime','books','mangas','games','artworks'].every(k=>doc[k].length>0)&&doc.customLibraries.length===4
    }),`${key}: export complet des sept bibliothèques et des quatre bibliothèques personnalisées`)
    await page.evaluate(()=>{window.__transferTest.cancelSave=true})
    await page.getByRole('button',{name:/^JSON Sylloge/}).click()
    assert((await page.getByRole('dialog').innerText()).includes('Export annulé'),`${key}: annulation explicitement rapportée`)
  }
  return {ok:true,count:checks.length,checks}
}
