// Settings restoration reuses the onboarding picker and production repository.
async page=>{
  page.setDefaultTimeout(7000)
  const checks=[]
  const assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)}
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.getByRole('button',{name:'Paramètres',exact:true}).click()
  await page.locator('aside').getByRole('button',{name:'Sauvegarde',exact:true}).click()
  const expected=await page.evaluate(async()=>{
    const {libraryRepository}=await import('/src/data/libraryRepository.ts')
    const {createLibraryDocument,serializeLibraryDocument}=await import('/src/domain/libraryDocument.ts')
    const library=await libraryRepository.loadLibrary('qa-profile')
    const source=serializeLibraryDocument(createLibraryDocument(library))
    const invoke=window.__TAURI_INTERNALS__.invoke
    window.__restoreTest={writes:[],source,invalid:false}
    window.__TAURI_INTERNALS__.invoke=async(cmd,args,...rest)=>{
      if(cmd==='pick_import_json')return{name:'complete.json',contents:window.__restoreTest.invalid?'{}':source}
      if(['create_profile','delete_profile','import_library_document_into_empty_profile'].includes(cmd))window.__restoreTest.writes.push({cmd,args})
      return invoke(cmd,args,...rest)
    }
    return Object.fromEntries(['films','series','anime','books','mangas','games','artworks'].map(key=>[key,library[key].length]))
  })
  assert(await page.getByRole('heading',{name:'Restaurer ou changer d’ordinateur',exact:true}).count()===1,'Réglages : la restauration du profil entier vit dans Sauvegarde')
  await page.getByRole('button',{name:'Restaurer une sauvegarde',exact:true}).click()
  await page.getByRole('button',{name:'Choisir un fichier JSON',exact:true}).click()
  assert(await page.evaluate(()=>window.__restoreTest.writes.length===0),'Choisir une sauvegarde dans les réglages n’écrit rien')
  await page.getByRole('dialog').getByRole('radio',{name:/^Profil courant/}).check()
  await page.getByRole('button',{name:'Confirmer la restauration',exact:true}).click()
  await page.getByRole('alert').waitFor()
  assert(await page.evaluate(()=>window.__restoreTest.writes.length===0),'Profil non vide : restauration bloquée avant la commande native')
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Restaurer une sauvegarde',exact:true}).click()
  await page.evaluate(()=>{window.__restoreTest.invalid=true})
  await page.getByRole('button',{name:'Choisir un fichier JSON',exact:true}).click()
  assert(await page.getByRole('button',{name:'Confirmer la restauration',exact:true}).isDisabled(),'JSON inconnu : aucune confirmation disponible')
  await page.keyboard.press('Escape')
  await page.evaluate(()=>{window.__restoreTest.invalid=false})
  await page.getByRole('button',{name:'Restaurer une sauvegarde',exact:true}).click()
  await page.getByRole('button',{name:'Choisir un fichier JSON',exact:true}).click()
  await page.getByRole('textbox',{name:'Nom du profil restauré'}).fill('Copie restaurée de recette')
  await page.getByRole('button',{name:'Confirmer la restauration',exact:true}).evaluate(button=>{button.click();button.click()})
  await page.getByRole('heading',{name:'Profil restauré',exact:true}).waitFor()
  const result=await page.evaluate(()=>{
    const select=window.__syllogeRecette.select
    const target=select("SELECT id FROM profiles WHERE name = 'Copie restaurée de recette'")[0]
    const keys=['films','series','anime','books','mangas','games','artworks']
    return{profiles:select('SELECT id FROM profiles').length,counts:Object.fromEntries(keys.map(key=>[key,Number(select(`SELECT COUNT(*) AS n FROM ${key} WHERE profile_id = $1`,[target.id])[0].n)])),sourceCounts:Object.fromEntries(keys.map(key=>[key,Number(select(`SELECT COUNT(*) AS n FROM ${key} WHERE profile_id = $1`,['qa-profile'])[0].n)])),writes:window.__restoreTest.writes.map(x=>x.cmd)}
  })
  assert(result.profiles===2&&JSON.stringify(result.counts)===JSON.stringify(expected),'Nouveau profil : les sept tables sont restaurées')
  assert(JSON.stringify(result.sourceCounts)===JSON.stringify(expected),'Profil existant : toutes les bibliothèques sont conservées')
  assert(result.writes.filter(x=>x==='create_profile').length===1&&result.writes.filter(x=>x==='import_library_document_into_empty_profile').length===1,'Double clic réglages : une seule création et une seule restauration')
  assert(await page.getByRole('button',{name:'Ouvrir le profil restauré',exact:true}).isVisible(),'Bilan conservé jusqu’à ouverture du profil restauré')
  await page.getByRole('button',{name:'Ouvrir le profil restauré',exact:true}).click()
  assert(await page.getByRole('dialog').count()===0,'Bilan fermé explicitement après restauration')
  return{ok:true,count:checks.length,checks}
}
