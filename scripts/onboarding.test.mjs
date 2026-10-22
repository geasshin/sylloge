import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileFromPreparation } from '../src/domain/onboarding.ts'

test('la création finale restaure une seule fois et retourne le même profil',async()=>{
 const calls=[]
 const library={profile:{id:'new-profile'}}
 const deps={create:async(name)=>{calls.push(['create',name]);return'new-profile'},load:async()=>library,importDocument:async(profile,document)=>{calls.push(['import',profile.id,document]);return library},remove:async(id)=>calls.push(['delete',id]),now:()=> '2026-10-22T08:00:00.000Z'}
 const document={test:'prepared'}
 const result=await createProfileFromPreparation({name:'  Recette  ',avatarDataUrl:null,document},deps)
 assert.equal(result,library)
 assert.deepEqual(calls,[['create','Recette'],['import','new-profile',document]])
})
test('un échec de restauration nettoie uniquement le nouveau profil puis échoue clairement',async()=>{
 const calls=[]
 const deps={create:async()=> 'new-profile',load:async()=>({}),importDocument:async()=>{throw Error('native rollback')},remove:async(id)=>calls.push(id),now:()=> '2026-10-22T08:00:00.000Z'}
 await assert.rejects(createProfileFromPreparation({name:'Recette',avatarDataUrl:null,document:{}},deps),/native rollback/)
 assert.deepEqual(calls,['new-profile'])
})
test('un nom vide ne déclenche aucune création',async()=>{
 let calls=0
 await assert.rejects(createProfileFromPreparation({name:' ',avatarDataUrl:null,document:null},{create:async()=>{calls++;return'x'}}),/nom/)
 assert.equal(calls,0)
})
