// Real UI, synthetic CSV fixtures, intercepted native picker/write boundary.
// playwright-cli -s=sylloge-imports run-code --filename=scripts/qa-third-party-transfers.js
async page => {
  page.setDefaultTimeout(7000)
  const checks=[]
  const assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)}
  async function setup(library,fixture,name,archive=false){
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
    await page.getByRole('button',{name:library,exact:true}).click()
    await page.evaluate(async({fixture,name,archive})=>{
      const contents=await (await fetch(`/tests/fixtures/third-party-import/${fixture}`)).text()
      const candidate={id:name,name,kind:'csv',contents}
      const picked={name:archive?'letterboxd.zip':name,kind:archive?'container':'csv',contents:archive?null:contents,csvCandidates:[candidate],containerCandidates:archive?[candidate]:[],markdownPages:[]}
      const invoke=window.__TAURI_INTERNALS__.invoke
      window.__serviceTest={writes:[]}
      window.__TAURI_INTERNALS__.invoke=async(cmd,args,...rest)=>{
        if(cmd==='pick_import_any')return picked
        if(cmd.startsWith('import_')){window.__serviceTest.writes.push({cmd,args});return{inserted:args.plan.inserts.length,updated:args.plan.updates.length,removed:0}}
        return invoke(cmd,args,...rest)
      }
    },{fixture,name,archive})
    await page.getByRole('button',{name:'Importer',exact:true}).click()
    await page.getByRole('button',{name:'Choisir un fichier',exact:true}).click()
  }
  for(const scenario of [
    {library:'Films',fixture:'letterboxd-ratings.csv',name:'ratings.csv',service:'Letterboxd'},
    {library:'Films',fixture:'letterboxd-diary.csv',name:'diary.csv',service:'Letterboxd',archive:true},
    {library:'Livres',fixture:'goodreads-library.csv',name:'goodreads.csv',service:'Goodreads'},
  ]){
    await setup(scenario.library,scenario.fixture,scenario.name,scenario.archive)
    assert(await page.getByRole('heading',{name:`${scenario.service} reconnu`,exact:true}).isVisible(),`${scenario.service}: reconnaissance dédiée visible`)
    assert((await page.getByRole('dialog').innerText()).includes('Colonnes non importées'),`${scenario.service}: exclusions visibles`)
    await page.getByRole('button',{name:'Continuer',exact:true}).click()
    await page.getByRole('button',{name:/^Fusionner/}).click()
    const resolve=page.getByRole('button',{name:'Valider ces choix',exact:true})
    if(await resolve.count())await resolve.first().click()
    assert(await page.evaluate(()=>window.__serviceTest.writes.length===0),`${scenario.service}: aucun appel avant confirmation`)
    await page.getByRole('button',{name:'Importer les fiches',exact:true}).click()
    await page.getByRole('heading',{name:'Import terminé',exact:true}).waitFor()
    const writes=await page.evaluate(()=>window.__serviceTest.writes)
    assert(writes.length===1&&writes[0].cmd===(scenario.library==='Livres'?'import_books_into_profile':'import_films_into_profile'),`${scenario.service}: une commande vers la bonne bibliothèque`)
  }
  await setup('Mangas','goodreads-library.csv','goodreads.csv')
  assert((await page.getByRole('dialog').innerText()).includes('Ouvrez la bibliothèque Livres'), 'Goodreads dans Mangas: destination bloquée et expliquée')
  assert(await page.getByRole('button',{name:'Continuer',exact:true}).isDisabled(),'Mauvaise destination: poursuite impossible')
  await setup('Films','letterboxd-list.csv','renamed.csv')
  assert(await page.getByRole('group',{name:'Type de liste Letterboxd'}).isVisible(),'Letterboxd renommé: interprétation explicitement demandée')
  assert(await page.getByRole('button',{name:'Continuer',exact:true}).isDisabled(),'Letterboxd ambigu: import bloqué')
  await page.getByRole('radio',{name:'Liste à voir',exact:true}).check()
  assert(await page.getByRole('button',{name:'Continuer',exact:true}).isEnabled(),'Letterboxd ambigu: choix explicite résolu')
  return{ok:true,count:checks.length,checks}
}
