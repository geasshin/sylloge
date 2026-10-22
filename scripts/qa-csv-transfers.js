// Seven real UI CSV entry points with synthetic in-memory profile data.
async page => {
  page.setDefaultTimeout(7000)
  const checks=[]
  const assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)}
  for(const [key,label] of [['films','Films'],['series','Séries'],['anime','Animation japonaise'],['books','Livres'],['mangas','Mangas'],['games','Jeux'],['artworks','Art']]){
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
    await page.getByRole('button',{name:label,exact:true}).click()
    await page.evaluate(async key=>{
      const {libraryRepository}=await import('/src/data/libraryRepository.ts')
      const {createCollectionCsvExport}=await import('/src/domain/collectionCsvTransfer.ts')
      const library=await libraryRepository.loadLibrary('qa-profile')
      const csv=createCollectionCsvExport(library,key)
      const invoke=window.__TAURI_INTERNALS__.invoke
      window.__csvUiTest={writes:[],exports:[],count:library[key].length,csv}
      window.__TAURI_INTERNALS__.invoke=async(cmd,args,...rest)=>{
        if(cmd==='save_export_csv'){window.__csvUiTest.exports.push(args);return args.suggestedName}
        if(cmd==='pick_import_any')return{name:csv.fileName,kind:'csv',contents:csv.contents,csvCandidates:[{id:'csv',name:csv.fileName,contents:csv.contents}],containerCandidates:[],markdownPages:[]}
        if(cmd.startsWith('import_')){window.__csvUiTest.writes.push({cmd,args});return{inserted:args.plan.inserts.length,updated:0,removed:0}}
        return invoke(cmd,args,...rest)
      }
    },key)
    await page.getByRole('button',{name:'Exporter',exact:true}).click()
    await page.getByRole('button',{name:/^CSV/}).click()
    assert(await page.evaluate(async()=>{
      const {parseCsv}=await import('/src/domain/csv.ts')
      const state=window.__csvUiTest
      const expected=parseCsv(state.csv.contents)
      const actual=parseCsv(state.exports[0].contents)
      const timestampColumn=actual.headers.indexOf('exported_at')
      const stable=table=>table.rows.map(row=>row.cells.filter((_,index)=>index!==timestampColumn))
      return actual.errors.length===0&&JSON.stringify(actual.headers)===JSON.stringify(expected.headers)&&JSON.stringify(stable(actual))===JSON.stringify(stable(expected))
    }),`${key}: CSV réel transmis sans altération des données`)
    await page.getByRole('button',{name:'Fermer',exact:true}).click()
    await page.getByRole('button',{name:'Importer',exact:true}).click()
    await page.getByRole('button',{name:'Choisir un fichier',exact:true}).click()
    const viewPreview=page.getByRole('button',{name:'Voir l’aperçu',exact:true})
    if(await viewPreview.count())await viewPreview.click()
    assert(await page.getByRole('button',{name:'Continuer',exact:true}).isEnabled(),`${key}: CSV strict reconnu et aperçu valide`)
    await page.getByRole('button',{name:'Continuer',exact:true}).click()
    await page.getByRole('button',{name:/^Remplacer/}).click()
    assert(await page.evaluate(()=>window.__csvUiTest.writes.length===0),`${key}: aucune écriture avant confirmation CSV`)
    await page.getByRole('checkbox').check()
    await page.getByRole('button',{name:'Confirmer le remplacement',exact:true}).click()
    await page.getByRole('heading',{name:'Import terminé',exact:true}).waitFor()
    const actual=await page.evaluate(()=>({writes:window.__csvUiTest.writes,count:window.__csvUiTest.count}))
    assert(actual.writes.length===1&&actual.writes[0].cmd===`import_${key}_into_profile`&&actual.writes[0].args.plan.inserts.length===actual.count,`${key}: CSV dirigé vers sa propre table`)
  }
  return{ok:true,count:checks.length,checks}
}
