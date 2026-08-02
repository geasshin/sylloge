use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;
use tauri_plugin_sql::DbInstances;

use crate::portability::sqlite_pool;

/// Nombre maximal de profils locaux (limite interne, non affichée dans
/// l'interface ; signalée seulement si elle est atteinte). Contrat 0.4.4.
pub const MAX_PROFILES: i64 = 5;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
    film_count: i64,
    series_count: i64,
    book_count: i64,
    game_count: i64,
    artwork_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProfileInput {
    id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameProfileInput {
    profile_id: String,
    name: String,
}

fn validate_profile_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Le nom du profil ne peut pas être vide.".to_string());
    }
    if trimmed.chars().count() > 60 {
        return Err("Le nom du profil ne peut pas dépasser 60 caractères.".to_string());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub async fn list_profiles(
    db_instances: State<'_, DbInstances>,
) -> Result<Vec<ProfileSummary>, String> {
    let pool = sqlite_pool(&db_instances).await?;
    let rows = sqlx::query(
        "SELECT
            p.id,
            p.name,
            p.created_at,
            p.updated_at,
            (SELECT COUNT(*) FROM films WHERE profile_id = p.id) AS film_count,
            (SELECT COUNT(*) FROM series WHERE profile_id = p.id) AS series_count,
            (SELECT COUNT(*) FROM books WHERE profile_id = p.id) AS book_count,
            (SELECT COUNT(*) FROM games WHERE profile_id = p.id) AS game_count,
            (SELECT COUNT(*) FROM artworks WHERE profile_id = p.id) AS artwork_count
         FROM profiles p
         ORDER BY p.created_at ASC, p.name COLLATE NOCASE ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|error| format!("Impossible de lister les profils : {error}"))?;

    Ok(rows
        .iter()
        .map(|row| ProfileSummary {
            id: row.get("id"),
            name: row.get("name"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            film_count: row.get("film_count"),
            series_count: row.get("series_count"),
            book_count: row.get("book_count"),
            game_count: row.get("game_count"),
            artwork_count: row.get("artwork_count"),
        })
        .collect())
}

#[tauri::command]
pub async fn create_profile(
    db_instances: State<'_, DbInstances>,
    input: CreateProfileInput,
) -> Result<(), String> {
    let name = validate_profile_name(&input.name)?;
    if input.id.trim().is_empty() {
        return Err("L'identifiant du profil est invalide.".to_string());
    }
    let pool = sqlite_pool(&db_instances).await?;

    let profile_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles")
        .fetch_one(&pool)
        .await
        .map_err(|error| format!("Impossible de compter les profils : {error}"))?;

    if profile_count >= MAX_PROFILES {
        return Err(format!(
            "Le nombre maximal de {MAX_PROFILES} profils est atteint. Supprimez un profil avant d'en créer un autre."
        ));
    }

    sqlx::query(
        "INSERT INTO profiles (id, name, created_at, updated_at)
         VALUES ($1, $2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&input.id)
    .bind(&name)
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible de créer le profil : {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn rename_profile(
    db_instances: State<'_, DbInstances>,
    input: RenameProfileInput,
) -> Result<(), String> {
    let name = validate_profile_name(&input.name)?;
    let pool = sqlite_pool(&db_instances).await?;

    let result = sqlx::query(
        "UPDATE profiles SET name = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $2",
    )
    .bind(&name)
    .bind(&input.profile_id)
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible de renommer le profil : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("Le profil à renommer est introuvable.".to_string());
    }

    Ok(())
}

/// Supprime un profil et toutes ses collections. Tout profil peut être
/// supprimé, y compris le dernier et le profil actuellement ouvert : la
/// ligne `current_profile` est alors vidée et l'application retombe sur
/// l'onboarding de premier lancement (contrat 0.4.4).
#[tauri::command]
pub async fn delete_profile(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la suppression : {error}"))?;

    let exists: i64 = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM profiles WHERE id = $1)")
        .bind(&profile_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de vérifier le profil : {error}"))?;

    if exists != 1 {
        return Err("Le profil à supprimer est introuvable.".to_string());
    }

    // Citations d'abord (clé étrangère vers books), puis collections et
    // réglages rattachés au profil.
    sqlx::query(
        "DELETE FROM book_quotes WHERE book_id IN (SELECT id FROM books WHERE profile_id = $1)",
    )
    .bind(&profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de supprimer les citations du profil : {error}"))?;

    for table in [
        "films",
        "series",
        "books",
        "games",
        "artworks",
        "backup_snapshots",
        "backup_settings",
    ] {
        sqlx::query(&format!("DELETE FROM {table} WHERE profile_id = $1"))
            .bind(&profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| {
                format!("Impossible de supprimer les données du profil ({table}) : {error}")
            })?;
    }

    sqlx::query("DELETE FROM profiles WHERE id = $1")
        .bind(&profile_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de supprimer le profil : {error}"))?;

    // Si le profil supprimé était le profil ouvert, on vide la sélection :
    // l'application retombera sur l'onboarding.
    sqlx::query(
        "UPDATE current_profile
         SET profile_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE singleton = 1 AND profile_id = $1",
    )
    .bind(&profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de réinitialiser le profil courant : {error}"))?;

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la suppression : {error}"))?;

    Ok(())
}

/// Sélectionne le profil ouvert. Refuse un profil inexistant.
#[tauri::command]
pub async fn select_profile(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;

    let result = sqlx::query(
        "UPDATE current_profile
         SET profile_id = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE singleton = 1
           AND EXISTS (SELECT 1 FROM profiles WHERE id = $1)",
    )
    .bind(&profile_id)
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible d'ouvrir le profil : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("Le profil à ouvrir est introuvable.".to_string());
    }

    Ok(())
}
