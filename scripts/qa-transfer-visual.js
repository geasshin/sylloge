// Captures are written relative to the playwright-cli session's working directory.
// Open the session from the scratch directory first, so screenshots never land in the repository.
// playwright-cli -s=sylloge-imports run-code --filename=<repo>/scripts/qa-transfer-visual.js
async page => {
  page.setDefaultTimeout(7000)
  const dir='.'
  const checks=[]
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)}
  for(const theme of ['light','dark']) for(const [width,height] of [[1440,900],[1000,760]]) {
    await page.setViewportSize({width,height})
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
    await page.evaluate(theme=>localStorage.setItem('sylloge-theme',theme),theme)
    await page.reload()
    await page.getByRole('button',{name:'Films',exact:true}).click()
    const opener=page.getByRole('button',{name:'Importer',exact:true})
    await opener.click()
    const key=`${theme}-${width}`
    await page.getByRole('button',{name:/^Letterboxd/}).click()
    await page.evaluate(()=>document.fonts.ready)
    const metrics=await page.evaluate(()=>{
      const modal=document.querySelector('[role=dialog]')
      const box=modal.getBoundingClientRect()
      const pick=modal.querySelector('.import-source-footer button').getBoundingClientRect()
      return{theme:document.documentElement.dataset.theme,overflow:modal.scrollWidth-modal.clientWidth,
        within:box.x>=0&&box.y>=0&&box.right<=innerWidth&&box.bottom<=innerHeight,
        pickVisible:pick.top>=box.top&&pick.bottom<=box.bottom,
        height:box.height,scrollHeight:modal.scrollHeight}
    })
    assert(metrics.theme===theme,`${key}: thème réel`)
    assert(metrics.overflow<=1&&metrics.within,`${key}: fenêtre contenue sans débordement horizontal`)
    // The guide can scroll. Verify that its primary action is reachable.
    await page.getByRole('button',{name:'Choisir un fichier',exact:true}).scrollIntoViewIfNeeded()
    assert(await page.getByRole('button',{name:'Choisir un fichier',exact:true}).isVisible(),`${key}: action fichier accessible`)
    await page.screenshot({path:`${dir}/sylloge-import-guide-${key}.png`})
    // Keyboard focus must remain inside the dialog and return to the opener.
    await page.getByRole('button',{name:'Choisir un fichier',exact:true}).focus()
    await page.keyboard.press('Tab')
    assert(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')),`${key}: focus contenu`)
    await page.keyboard.press('Escape')
    assert(await opener.evaluate(el=>el===document.activeElement),`${key}: focus rendu à Importer`)
    await page.getByRole('button',{name:'Exporter',exact:true}).click()
    await page.getByRole('radio',{name:'Tout le profil · toutes ses bibliothèques'}).check()
    assert(await page.getByRole('button',{name:'CSV',exact:true}).count()===0,`${key}: pas de CSV global ambigu`)
    await page.screenshot({path:`${dir}/sylloge-export-${key}.png`})
    await page.keyboard.press('Escape')
  }
  assert(errors.length===0,'Aucune exception JavaScript sur les parcours capturés')
  return{ok:true,count:checks.length,checks,errors}
}
