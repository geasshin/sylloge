import {
  assertSavedViewAllowed,
  deserializeSavedViewCriteria,
  serializeSavedViewCriteria,
  SAVED_VIEW_SCHEMA_VERSION,
  validateSavedViewName,
  type SavedView,
  type SavedViewCriteria,
  type SavedViewMedium,
} from '../domain/savedViews.ts'
import { loadSyllogeDatabase } from './database.ts'
import type { DatabaseLoader, IdFactory, NowFactory } from './filmsRepository.ts'

type SavedViewRow = {
  id: string
  profile_id: string
  medium: string
  name: string
  criteria_json: string
  created_at: string
  updated_at: string
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}

const DUPLICATE_NAME_ERROR = 'Une vue enregistrée porte déjà ce nom dans cette bibliothèque.'

/**
 * Dépôt SQLite des vues enregistrées (jalon 0.4.21). Chaque requête cible
 * explicitement le profil et le médium : une vue ne fuit jamais d'une
 * bibliothèque ou d'une personne à l'autre. Les critères sont relus via le
 * sanitizeur du domaine, qui absorbe les schémas anciens ou incomplets.
 */
export class SqliteSavedViewsRepository {
  private readonly loadDatabase: DatabaseLoader
  private readonly createId: IdFactory
  private readonly now: NowFactory

  constructor(
    loadDatabase: DatabaseLoader = loadSyllogeDatabase,
    createId: IdFactory = () => crypto.randomUUID(),
    now: NowFactory = () => new Date().toISOString(),
  ) {
    this.loadDatabase = loadDatabase
    this.createId = createId
    this.now = now
  }

  private toSavedView(row: SavedViewRow): SavedView {
    return {
      id: row.id,
      profileId: row.profile_id,
      medium: row.medium as SavedViewMedium,
      name: row.name,
      criteria: deserializeSavedViewCriteria(row.medium as SavedViewMedium, row.criteria_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async list(profileId: string, medium: SavedViewMedium): Promise<SavedView[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<SavedViewRow[]>(
      `SELECT id, profile_id, medium, name, criteria_json, created_at, updated_at
       FROM saved_views
       WHERE profile_id = $1 AND medium = $2
       ORDER BY name COLLATE NOCASE ASC, created_at ASC`,
      [profileId, medium],
    )

    return rows.map((row) => this.toSavedView(row))
  }

  async create(
    profileId: string,
    medium: SavedViewMedium,
    rawName: string,
    rawCriteria: SavedViewCriteria,
  ): Promise<SavedView> {
    const name = validateSavedViewName(rawName)
    if (!name.ok) {
      throw new Error(name.error)
    }
    const criteria = deserializeSavedViewCriteria(medium, serializeSavedViewCriteria(rawCriteria))
    assertSavedViewAllowed(medium, criteria)

    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    try {
      const result = await database.execute(
        `INSERT INTO saved_views (
           id, profile_id, medium, name, criteria_json, schema_version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, profileId, medium, name.name, serializeSavedViewCriteria(criteria), SAVED_VIEW_SCHEMA_VERSION, now, now],
      )
      if (result.rowsAffected !== 1) {
        throw new Error('La création de la vue enregistrée n’a modifié aucune ligne SQLite.')
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(DUPLICATE_NAME_ERROR)
      }
      throw error
    }

    return { id, profileId, medium, name: name.name, criteria, createdAt: now, updatedAt: now }
  }

  async rename(profileId: string, id: string, rawName: string): Promise<void> {
    const name = validateSavedViewName(rawName)
    if (!name.ok) {
      throw new Error(name.error)
    }

    const database = await this.loadDatabase()
    try {
      const result = await database.execute(
        `UPDATE saved_views
         SET name = $1, updated_at = $2
         WHERE id = $3 AND profile_id = $4`,
        [name.name, this.now(), id, profileId],
      )
      if (result.rowsAffected !== 1) {
        throw new Error('La vue à renommer est introuvable dans le profil courant.')
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(DUPLICATE_NAME_ERROR)
      }
      throw error
    }
  }

  /**
   * Remplace les critères d'une vue enregistrée par le combo courant
   * (« Mettre à jour la vue »). Mêmes garanties qu'à la création : critères
   * réparés par le domaine, schéma v2, profil et médium ciblés explicitement.
   */
  async update(
    profileId: string,
    medium: SavedViewMedium,
    id: string,
    rawCriteria: SavedViewCriteria,
  ): Promise<SavedViewCriteria> {
    const criteria = deserializeSavedViewCriteria(medium, serializeSavedViewCriteria(rawCriteria))
    assertSavedViewAllowed(medium, criteria)

    const database = await this.loadDatabase()
    const result = await database.execute(
      `UPDATE saved_views
       SET criteria_json = $1, schema_version = $2, updated_at = $3
       WHERE id = $4 AND profile_id = $5 AND medium = $6`,
      [serializeSavedViewCriteria(criteria), SAVED_VIEW_SCHEMA_VERSION, this.now(), id, profileId, medium],
    )
    if (result.rowsAffected !== 1) {
      throw new Error('La vue à mettre à jour est introuvable dans le profil courant.')
    }
    return criteria
  }

  async remove(profileId: string, id: string): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `DELETE FROM saved_views
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )
    if (result.rowsAffected !== 1) {
      throw new Error('La vue à supprimer est introuvable dans le profil courant.')
    }
  }
}

export const savedViewsRepository = new SqliteSavedViewsRepository()
