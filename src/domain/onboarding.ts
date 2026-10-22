import type { CulturalLibrary } from '../data/libraryRepository.ts'
import type { Profile } from './profile.ts'
import type { SyllogeLibraryDocument } from './libraryDocument.ts'

type Input = { name: string; avatarDataUrl: string | null; document: SyllogeLibraryDocument | null }
type Dependencies = {
  create: (name: string, options: { avatarDataUrl: string | null; selectAfterCreation: boolean }) => Promise<string>
  load: (profileId: string) => Promise<CulturalLibrary>
  importDocument: (profile: Profile, document: SyllogeLibraryDocument) => Promise<CulturalLibrary>
  remove: (profileId: string) => Promise<void>
  now: () => string
}

/** Called only by the final confirmation. Backup failure is handled separately:
 * once this returns, the created/imported profile must never be deleted on a
 * failed filesystem write or recreated on retry. */
export async function createProfileFromPreparation(input: Input, deps: Dependencies): Promise<CulturalLibrary> {
  const name = input.name.trim()
  if (!name) throw new Error('Le nom du profil est obligatoire.')
  const id = await deps.create(name, { avatarDataUrl: input.avatarDataUrl, selectAfterCreation: true })
  try {
    const timestamp = deps.now()
    return input.document
      ? await deps.importDocument({ id, name, createdAt: timestamp, updatedAt: timestamp }, input.document)
      : await deps.load(id)
  } catch (cause) {
    try { await deps.remove(id) } catch {
      throw new Error('La restauration a échoué et le nouveau profil n’a pas pu être nettoyé. Ne pas relancer la création avant de vérifier ce profil dans les réglages.')
    }
    throw cause
  }
}
