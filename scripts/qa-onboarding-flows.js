// Synthetic source documents, real QA SQLite and production repositories.
// Filesystem pick/write boundaries remain simulated; no personal base is opened.
async page => {
  page.setDefaultTimeout(7000)
  const checks=[]
  const assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)}
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  const source=await page.evaluate(async()=>{
    const {libraryRepository}=await import('/src/data/libraryRepository.ts')
    const {createLibraryDocument,serializeLibraryDocument}=await import('/src/domain/libraryDocument.ts')
    const library=await libraryRepository.loadLibrary('qa-profile')
    return serializeLibraryDocument(createLibraryDocument(library))
  })
  const sourceCounts=Object.fromEntries(['films','series','anime','books','mangas','games','artworks'].map(key=>[key,JSON.parse(source)[key].length]))
  const writes=['create_profile','delete_profile','import_library_document_into_empty_profile','configure_backup_destination','save_manual_backup_snapshot']
  async function setup(mode){
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=onboarding')
    await page.getByRole('textbox',{name:'Pseudo ou prénom'}).waitFor()
    await page.evaluate(async({mode,source})=>{
      const csv={}
      for(const filename of ['letterboxd-ratings.csv','goodreads-library.csv'])csv[filename]=await(await fetch(`/tests/fixtures/third-party-import/${filename}`)).text()
      const invoke=window.__TAURI_INTERNALS__.invoke
      window.__onboardTest={events:[],mode,file:'letterboxd-ratings.csv',failed:false}
      window.__TAURI_INTERNALS__.invoke=async(cmd,args,...rest)=>{
        const state=window.__onboardTest
        state.events.push({cmd,args})
        if(cmd==='pick_import_json')return{name:'profile.json',contents:source}
        if(cmd==='find_backup_candidates'&&mode==='search'){
          const old=JSON.parse(source);old.exportedAt='2026-01-01T00:00:00.000Z'
          return{candidates:[{fileName:'z-old.json',contents:JSON.stringify(old),location:'Documents'},{fileName:'a-recent.json',contents:source,location:'iCloud Drive'}],unreadableLocations:[]}
        }
        if(cmd==='pick_import_any')return{name:state.file,kind:'csv',contents:null,csvCandidates:[{id:'csv',name:state.file,contents:csv[state.file]}],containerCandidates:[],markdownPages:[]}
        if(cmd==='pick_backup_destination'&&mode==='cancel-destination')return null
        if((mode==='backup-error'&&cmd==='save_manual_backup_snapshot'||mode==='config-error'&&cmd==='configure_backup_destination'||mode==='import-error'&&cmd==='import_library_document_into_empty_profile')&&!state.failed){state.failed=true;throw Error('Synthetic boundary failure')}
        return invoke(cmd,args,...rest)
      }
    },{mode,source})
    await page.getByRole('textbox',{name:'Pseudo ou prénom'}).fill(`Profil ${mode}`)
    await page.getByRole('button',{name:'Continuer',exact:true}).click()
  }
  const events=async()=>await page.evaluate(()=>window.__onboardTest.events)
  const noWrites=async()=>!(await events()).some(x=>writes.includes(x.cmd))
  async function restoreFromFile(){
    await page.getByRole('radio',{name:/^Restaurer Sylloge/}).click()
    await page.getByRole('button',{name:'Choisir un fichier JSON',exact:true}).click()
    await page.getByRole('region',{name:'Contenu de la sauvegarde'}).waitFor()
  }
  async function chooseBackup(){
    await page.getByRole('button',{name:'Continuer',exact:true}).click()
    await page.getByRole('button',{name:'Choisir un dossier de sauvegarde',exact:true}).click()
  }
  async function assertCounts(expected){
    const actual=await page.evaluate(()=>{
      const profile=window.__syllogeRecette.select('SELECT id FROM profiles')[0]
      const counts=Object.fromEntries(['films','series','anime','books','mangas','games','artworks'].map(key=>[key,Number(window.__syllogeRecette.select(`SELECT COUNT(*) AS n FROM ${key} WHERE profile_id = $1`,[profile.id])[0].n)]))
      return{profiles:window.__syllogeRecette.select('SELECT id FROM profiles').length,counts}
    })
    assert(actual.profiles===1&&JSON.stringify(actual.counts)===JSON.stringify(expected),'Sept tables mémoire et profil réconciliés avec la source')
  }
  await setup('restore')
  await restoreFromFile()
  assert(await noWrites(),'JSON préparé sans création ni import')
  await chooseBackup()
  assert(await noWrites(),'Dossier présélectionné sans configuration persistée')
  await page.getByRole('button',{name:'Créer et restaurer le profil',exact:true}).evaluate(button=>{button.click();button.click()})
  await page.getByRole('heading',{name:'Le profil est prêt',exact:true}).waitFor()
  await assertCounts(sourceCounts)
  let log=await events()
  assert(log.filter(x=>x.cmd==='create_profile').length===1&&log.filter(x=>x.cmd==='import_library_document_into_empty_profile').length===1,'Double clic final : création et import uniques')
  const snapshot=log.find(x=>x.cmd==='save_manual_backup_snapshot')
  assert(!!snapshot&&['anime','mangas'].every(key=>JSON.parse(snapshot.args.contents)[key].length===sourceCounts[key]),'Première sauvegarde JSON : Anime et Mangas inclus')
  assert(log.findIndex(x=>x.cmd==='save_manual_backup_snapshot')>log.findIndex(x=>x.cmd==='import_library_document_into_empty_profile'),'Première sauvegarde après import finalisé')

  await setup('search')
  await page.getByRole('radio',{name:/^Restaurer Sylloge/}).click()
  await page.getByRole('region',{name:'Sauvegarde la plus récente trouvée'}).waitFor()
  assert(await page.getByRole('region',{name:'Sauvegarde la plus récente trouvée'}).getByText(/a-recent\.json/).count()===1,'Recherche : la copie la plus récente est proposée')
  assert(await page.getByRole('button',{name:'Continuer',exact:true}).isDisabled(),'Recherche : aucune copie sélectionnée implicitement')
  await page.getByRole('button',{name:'Utiliser cette sauvegarde',exact:true}).click()
  assert(await page.getByRole('button',{name:'Continuer',exact:true}).isEnabled(),'Recherche : sélection explicite avant poursuite')
  await page.locator('details.import-guide-limits summary').click()
  assert(await page.getByRole('radio',{name:/z-old\.json/}).count()===1,'Recherche : les autres copies sont listées')
  assert(await page.getByRole('button',{name:'Parcourir un dossier de sauvegardes',exact:true}).count()===0,'Recherche : plus de bouton « dossier »')
  assert(await noWrites(),'Recherche : aucune configuration de destination implicite')

  await setup('third-party')
  await page.getByRole('radio',{name:/^Importer d’un autre service/}).click()
  await page.getByRole('button',{name:'Préparer un fichier',exact:true}).click()
  await page.getByRole('button',{name:'Choisir un fichier',exact:true}).click()
  await page.getByRole('heading',{name:'Letterboxd reconnu',exact:true}).waitFor()
  await page.getByRole('dialog').getByRole('button',{name:'Continuer',exact:true}).click()
  assert(await page.getByRole('dialog').count()===0&&await noWrites(),'Letterboxd préparé dans l’onboarding sans écrire')
  await page.locator('#onboarding-library').click()
  await page.getByRole('option',{name:'Livres',exact:true}).click()
  await page.evaluate(()=>{window.__onboardTest.file='goodreads-library.csv'})
  await page.getByRole('button',{name:'Préparer un fichier',exact:true}).click()
  await page.getByRole('button',{name:'Choisir un fichier',exact:true}).click()
  await page.getByRole('heading',{name:'Goodreads reconnu',exact:true}).waitFor()
  await page.getByRole('dialog').getByRole('button',{name:'Continuer',exact:true}).click()
  assert(await noWrites(),'Plusieurs services préparés sans création de profil')
  await chooseBackup()
  await page.getByRole('button',{name:'Créer et importer les données',exact:true}).click()
  await page.getByRole('heading',{name:'Le profil est prêt',exact:true}).waitFor()
  await assertCounts({films:2,series:0,anime:0,books:3,mangas:0,games:0,artworks:0})

  for(const mode of ['backup-error','config-error']){
    await setup(mode)
    await restoreFromFile()
    await chooseBackup()
    await page.getByRole('button',{name:'Créer et restaurer le profil',exact:true}).click()
    await page.getByRole('heading',{name:'Terminer la sauvegarde',exact:true}).waitFor()
    const text=await page.getByRole('alert').innerText()
    assert(/profil.*conserv|profil est créé/i.test(text),`${mode}: le profil conservé est explicitement annoncé`)
    await assertCounts(sourceCounts)
    await page.getByRole('button',{name:'Réessayer la sauvegarde',exact:true}).click()
    await page.getByRole('heading',{name:'Le profil est prêt',exact:true}).waitFor()
    log=await events()
    assert(log.filter(x=>x.cmd==='create_profile').length===1&&log.filter(x=>x.cmd==='import_library_document_into_empty_profile').length===1,`${mode}: reprise sans recréer ni réimporter le profil`)
  }
  await setup('import-error')
  await restoreFromFile()
  await chooseBackup()
  await page.getByRole('button',{name:'Créer et restaurer le profil',exact:true}).click()
  await page.getByRole('alert').waitFor()
  assert(await page.evaluate(()=>window.__syllogeRecette.select('SELECT id FROM profiles').length===0),'Échec import : seul le nouveau profil préparatoire est nettoyé')
  assert(!(await events()).some(x=>x.cmd==='save_manual_backup_snapshot'),'Échec import : aucune sauvegarde de données partielles')

  await setup('cancel-destination')
  await chooseBackup()
  assert(await page.getByRole('button',{name:'Créer le profil',exact:true}).isDisabled(),'Annulation dossier : aucune protection active annoncée')
  await page.getByRole('checkbox',{name:'Continuer sans sauvegarde automatique pour le moment'}).check()
  await page.getByRole('button',{name:'Créer le profil',exact:true}).click()
  await page.getByRole('heading',{name:'Le profil est prêt',exact:true}).waitFor()
  log=await events()
  assert(!log.some(x=>['configure_backup_destination','save_manual_backup_snapshot'].includes(x.cmd)),'Démarrage sans sauvegarde : choix explicite et aucune copie inventée')
  return{ok:true,count:checks.length,checks}
}
