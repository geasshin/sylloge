import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogBackupFiles, profileWorkCount } from '../src/domain/backupRestore.ts'

const profile={id:'source-profile',name:'Source de recette',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}
const backup=(date)=>JSON.stringify({format:'sylloge-library',version:3,exportedAt:date,profile,films:[],series:[],anime:[],books:[],mangas:[],games:[],artworks:[]})
test('le catalogue valide le contenu, trie par date embarquée et ne choisit aucune sauvegarde implicitement',()=>{
 const result=catalogBackupFiles([{name:'z-old.json',contents:backup('2025-01-01T00:00:00.000Z')},{name:'a-recent.json',contents:backup('2026-01-01T00:00:00.000Z')},{name:'invalid.json',contents:'{"format":"unknown"}'}])
 assert.deepEqual(result.valid.map(x=>x.fileName),['a-recent.json','z-old.json'])
 assert.equal(result.invalid.length,1)
 assert.equal(result.invalid[0].fileName,'invalid.json')
 assert.equal(result.valid[0].document.profile.name,profile.name)
 assert.equal(result.selected,undefined)
})
test('un simple fichier JSON inconnu ne devient pas une sauvegarde vide',()=>{
 const result=catalogBackupFiles([{name:'x.json',contents:'{}'},{name:'broken.json',contents:'{broken'}])
 assert.equal(result.valid.length,0)
 assert.equal(result.invalid.length,2)
})
test('les compteurs prennent les sept sections, y compris un profil ne contenant que des mangas et anime',()=>{
 assert.equal(profileWorkCount({films:[],series:[],anime:[{}],books:[],mangas:[{},{}],games:[],artworks:[]}),3)
})
