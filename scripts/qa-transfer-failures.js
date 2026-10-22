// Failure and homonym checks on synthetic data. Native I/O remains intercepted.
async page => {
  page.setDefaultTimeout(7000)
  const checks=[]
  const assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)}
  async function setup(mode){
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
    await page.getByRole('button',{name:'Films',exact:true}).click()
    await page.evaluate(async mode=>{
      const {libraryRepository}=await import('/src/data/libraryRepository.ts')
      const {createLibraryDocument,serializeLibraryDocument}=await import('/src/domain/libraryDocument.ts')
      const library=await libraryRepository.loadLibrary('qa-profile')
      const contents=serializeLibraryDocument(createLibraryDocument(library))
      const original=window.__TAURI_INTERNALS__.invoke
      window.__failureTest={writes:[],filmCount:library.films.length}
      window.__TAURI_INTERNALS__.invoke=async(cmd,args,...rest)=>{
        if(cmd==='pick_import_any')return mode==='cancel'?null:{name:'fixture.json',kind:'json',contents:mode==='invalid'?'{invalid-json':contents,csvCandidates:[],containerCandidates:[],markdownPages:[]}
        if(cmd.startsWith('import_')){
          window.__failureTest.writes.push({cmd,args})
          if(mode==='write-error')throw Error('Synthetic native transaction failure')
          await new Promise(r=>setTimeout(r,100))
          return{inserted:args.plan.inserts.length,updated:args.plan.updates.length,removed:0}
        }
        if(cmd==='save_export_json')throw Error('Synthetic disk write failure')
        return original(cmd,args,...rest)
      }
    },mode)
    await page.getByRole('button',{name:'Importer',exact:true}).click()
    await page.getByRole('button',{name:'Choisir un fichier',exact:true}).click()
  }
  for(const mode of ['cancel','invalid']){
    await setup(mode)
    assert(await page.getByRole('alert').isVisible(),`${mode}: explication d’échec visible`)
    assert(await page.evaluate(()=>window.__failureTest.writes.length===0),`${mode}: zéro écriture`)
  }
  await setup('write-error')
  await page.getByRole('button',{name:'Continuer',exact:true}).click()
  await page.getByRole('button',{name:/^Remplacer/}).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:'Confirmer le remplacement',exact:true}).click()
  await page.getByRole('alert').waitFor()
  assert((await page.getByRole('alert').innerText()).includes('transaction a été annulée'),'Erreur native: échec signalé, aucun faux succès')
  assert(await page.getByRole('button',{name:/^Fusionner/}).isVisible(),'Erreur native: parcours récupérable')
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Exporter',exact:true}).click()
  await page.getByRole('button',{name:/^JSON Sylloge/}).click()
  await page.getByRole('dialog').getByRole('status').waitFor()
  assert((await page.getByRole('dialog').getByRole('status').innerText()).includes('a échoué'),'Erreur disque: export non annoncé comme enregistré')
  await setup('keep-both')
  await page.getByRole('button',{name:'Continuer',exact:true}).click()
  await page.getByRole('button',{name:/^Fusionner/}).click()
  const buttons=await page.getByRole('button',{name:'Conserver les deux fiches',exact:true}).all()
  assert(buttons.length>0,'Homonymes: conservation séparée proposée')
  for(const button of buttons)await button.click()
  await page.getByRole('button',{name:'Valider ces choix',exact:true}).first().click()
  assert(await page.evaluate(()=>window.__failureTest.writes.length===0),'Choix doublons: aucune écriture avant résumé final')
  await page.getByRole('button',{name:'Importer les fiches',exact:true}).evaluate(button=>{button.click();button.click()})
  await page.getByRole('heading',{name:'Import terminé',exact:true}).waitFor()
  const result=await page.evaluate(()=>{
    const state=window.__failureTest
    return{count:state.writes.length,inserts:state.writes[0].args.plan.inserts.length,updates:state.writes[0].args.plan.updates.length,filmCount:state.filmCount}
  })
  assert(result.count===1,'Double clic: une seule commande native')
  assert(result.updates===0&&result.inserts===result.filmCount,'Conserver les deux: inserts indépendants et aucune mise à jour locale')
  return{ok:true,count:checks.length,checks}
}
