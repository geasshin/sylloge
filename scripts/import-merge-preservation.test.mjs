import test from 'node:test'
import assert from 'node:assert/strict'
import { planFilmMerge, resolveFilmMerge, planSeriesMerge, resolveSeriesMerge, planBookMerge, resolveBookMerge, planGameMerge, resolveGameMerge, planArtworkMerge, resolveArtworkMerge, countModifiedDuplicateResolutions } from '../src/domain/importMerge.ts'

for (const [name,plan,resolve] of [
  ['films',planFilmMerge,resolveFilmMerge],['series/anime',planSeriesMerge,resolveSeriesMerge],
  ['books/mangas',planBookMerge,resolveBookMerge],['games',planGameMerge,resolveGameMerge],['artworks',planArtworkMerge,resolveArtworkMerge],
]) {
  test(`${name}: conserver deux homonymes ne modifie ni la fiche existante ni ses données personnelles`,()=>{
    const existing={id:'local',profileId:'local-profile',title:'Un titre homonyme',year:1980,personalNote:'Avis local',createdAt:'2020-01-01T00:00:00.000Z',quotes:[]}
    const imported={...existing,id:'source',year:2020,personalNote:'Avis importé',quotes:[]}
    const before=structuredClone({existing,imported})
    const merge=plan([existing],[imported])
    const resolutions=new Map([[merge.duplicates[0].normalizedTitle,'keep-both']])
    const write=resolve([existing],merge,resolutions,'2026-10-22T00:00:00.000Z')
    assert.equal(write.inserts.length,1)
    assert.equal(write.inserts[0].personalNote,'Avis importé')
    assert.equal(write.inserts[0].year,2020)
    assert.deepEqual(write.updates,[])
    assert.deepEqual(write.deletes,[])
    assert.deepEqual({existing,imported},before)
    assert.equal(countModifiedDuplicateResolutions(merge.duplicates,resolutions),1)
  })
}
