//! Atomic custom-library writes. Table identifiers only come from the shared
//! closed whitelist; values are bound, and quote owners use domain `entryId`.
use serde::Deserialize;
use sqlx::{Sqlite, SqlitePool, Transaction};
use std::collections::BTreeMap;
use tauri::State;
use tauri_plugin_sql::DbInstances;

use crate::portability::{sqlite_pool, CustomLibrary, CUSTOM_LIBRARIES};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEntryWritePayload {
    library_id: String,
    entry: CustomEntryWriteInput,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomEntryWriteInput {
    id: String,
    profile_id: String,
    title: String,
    creator: Option<String>,
    year: Option<i64>,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    progress_current: Option<i64>,
    progress_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    cover_url: Option<String>,
    summary: Option<String>,
    personal_note: Option<String>,
    details: BTreeMap<String, String>,
    quotes: Vec<CustomQuoteWriteInput>,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomQuoteWriteInput {
    id: String,
    entry_id: String,
    body: String,
    position: i64,
    created_at: String,
}

fn library_for(id: &str) -> Result<&'static CustomLibrary, String> {
    CUSTOM_LIBRARIES
        .iter()
        .find(|library| library.id == id)
        .ok_or_else(|| format!("Bibliothèque inconnue : « {id} »."))
}

fn validate_payload(payload: &CustomEntryWritePayload) -> Result<&'static CustomLibrary, String> {
    let library = library_for(&payload.library_id)?;
    let entry = &payload.entry;
    if entry.id.trim().is_empty() || entry.profile_id.trim().is_empty() {
        return Err("La fiche ou son profil possède un identifiant invalide.".into());
    }
    if entry.title.trim().is_empty() {
        return Err("Le titre est obligatoire.".into());
    }
    // Deux contrats distincts : `maîtrisée` n'appartient qu'aux recettes, et une
    // recette n'a que deux états — `terminé`, `en cours` et `abandonné` y sont
    // refusés (arbitrage du 25 octobre : « Testée » doublonnait « Maîtrisée »).
    let status_allowed = if library.id == "recipes" {
        matches!(entry.status.as_str(), "à découvrir" | "maîtrisée")
    } else {
        matches!(
            entry.status.as_str(),
            "à découvrir" | "en cours" | "terminé" | "abandonné"
        )
    };
    if !status_allowed {
        return Err("Le statut de la fiche est invalide.".into());
    }
    if library.quotes.is_none() && !entry.quotes.is_empty() {
        return Err("Seuls les comics portent des citations.".into());
    }
    for (index, quote) in entry.quotes.iter().enumerate() {
        if quote.id.trim().is_empty() || quote.entry_id != entry.id {
            return Err("Une citation ne correspond pas à la fiche à enregistrer.".into());
        }
        if quote.body.trim().is_empty() || quote.position != index as i64 {
            return Err("Les citations doivent être non vides et ordonnées.".into());
        }
    }
    Ok(library)
}

async fn insert_quotes(
    transaction: &mut Transaction<'_, Sqlite>,
    quotes: &[CustomQuoteWriteInput],
) -> Result<(), String> {
    for quote in quotes {
        sqlx::query(
            "INSERT INTO comic_quotes (id, comic_id, body, position, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&quote.id)
        .bind(&quote.entry_id)
        .bind(&quote.body)
        .bind(quote.position)
        .bind(&quote.created_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("Impossible d’enregistrer une citation : {error}"))?;
    }
    Ok(())
}

async fn create_custom_entry_in_pool(
    pool: &SqlitePool,
    payload: CustomEntryWritePayload,
) -> Result<(), String> {
    let library = validate_payload(&payload)?;
    let entry = &payload.entry;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la création de la fiche : {error}"))?;
    sqlx::query(&format!(
        "INSERT INTO {} (
           id, profile_id, title, creator, year, status, rating, is_favorite,
           progress_current, progress_total, progress_updated_at, started_at, finished_at,
           cover_url, summary, personal_note, details, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)",
        library.table
    ))
    .bind(&entry.id)
    .bind(&entry.profile_id)
    .bind(&entry.title)
    .bind(&entry.creator)
    .bind(entry.year)
    .bind(&entry.status)
    .bind(entry.rating)
    .bind(entry.is_favorite)
    .bind(entry.progress_current)
    .bind(entry.progress_total)
    .bind(&entry.progress_updated_at)
    .bind(&entry.started_at)
    .bind(&entry.finished_at)
    .bind(&entry.cover_url)
    .bind(&entry.summary)
    .bind(&entry.personal_note)
    .bind(serde_json::to_string(&entry.details).map_err(|error| error.to_string())?)
    .bind(&entry.created_at)
    .bind(&entry.updated_at)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible d’enregistrer la fiche dans {} : {error}", library.label))?;
    insert_quotes(&mut transaction, &entry.quotes).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la création de la fiche : {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn create_custom_entry_atomically(
    db_instances: State<'_, DbInstances>,
    payload: CustomEntryWritePayload,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    create_custom_entry_in_pool(&pool, payload).await
}

async fn update_custom_entry_in_pool(
    pool: &SqlitePool,
    payload: CustomEntryWritePayload,
) -> Result<(), String> {
    let library = validate_payload(&payload)?;
    let entry = &payload.entry;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la modification de la fiche : {error}"))?;
    let result = sqlx::query(&format!(
        "UPDATE {} SET title = $1, creator = $2, year = $3, status = $4,
           rating = $5, is_favorite = $6, progress_current = $7, progress_total = $8,
           progress_updated_at = $9, started_at = $10, finished_at = $11,
           cover_url = $12, summary = $13, personal_note = $14, details = $15, updated_at = $16
         WHERE id = $17 AND profile_id = $18",
        library.table
    ))
    .bind(&entry.title)
    .bind(&entry.creator)
    .bind(entry.year)
    .bind(&entry.status)
    .bind(entry.rating)
    .bind(entry.is_favorite)
    .bind(entry.progress_current)
    .bind(entry.progress_total)
    .bind(&entry.progress_updated_at)
    .bind(&entry.started_at)
    .bind(&entry.finished_at)
    .bind(&entry.cover_url)
    .bind(&entry.summary)
    .bind(&entry.personal_note)
    .bind(serde_json::to_string(&entry.details).map_err(|error| error.to_string())?)
    .bind(&entry.updated_at)
    .bind(&entry.id)
    .bind(&entry.profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible de modifier la fiche dans {} : {error}",
            library.label
        )
    })?;
    if result.rows_affected() != 1 {
        return Err("La fiche à modifier est introuvable dans le profil courant.".into());
    }
    if library.quotes.is_some() {
        // Match exact bodies against the authoritative rows inside this same
        // transaction. Consume one occurrence at a time so duplicates retain
        // distinct IDs/dates even when the client regenerated its quote IDs.
        let mut previous: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT id, body, created_at FROM comic_quotes
             WHERE comic_id = $1 ORDER BY position ASC, id ASC",
        )
        .bind(&entry.id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de relire les citations : {error}"))?;
        let mut quotes = entry.quotes.clone();
        for quote in &mut quotes {
            if let Some(index) = previous.iter().position(|old| old.1 == quote.body) {
                let (id, _, created_at) = previous.remove(index);
                quote.id = id;
                quote.created_at = created_at;
            }
        }
        sqlx::query("DELETE FROM comic_quotes WHERE comic_id = $1")
            .bind(&entry.id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de remplacer les citations : {error}"))?;
        insert_quotes(&mut transaction, &quotes).await?;
    }
    transaction.commit().await.map_err(|error| {
        format!("Impossible de finaliser la modification de la fiche : {error}")
    })?;
    Ok(())
}

#[tauri::command]
pub async fn update_custom_entry_atomically(
    db_instances: State<'_, DbInstances>,
    payload: CustomEntryWritePayload,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    update_custom_entry_in_pool(&pool, payload).await
}

async fn delete_custom_entry_in_pool(
    pool: &SqlitePool,
    profile_id: &str,
    library_id: &str,
    entry_id: &str,
) -> Result<(), String> {
    let library = library_for(library_id)?;
    if profile_id.trim().is_empty() || entry_id.trim().is_empty() {
        return Err("La fiche ou son profil possède un identifiant invalide.".into());
    }
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la suppression de la fiche : {error}"))?;
    // Foreign keys are enabled by the SQL plugin. The cascade removes quotes
    // only for the scoped parent; no unscoped quote deletion can precede it.
    let result = sqlx::query(&format!(
        "DELETE FROM {} WHERE id = $1 AND profile_id = $2",
        library.table
    ))
    .bind(entry_id)
    .bind(profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de supprimer la fiche : {error}"))?;
    if result.rows_affected() != 1 {
        return Err("La fiche à supprimer est introuvable dans le profil courant.".into());
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la suppression de la fiche : {error}"))?;
    Ok(())
}

async fn remove_custom_library_in_pool(
    pool: &SqlitePool,
    profile_id: &str,
    library_id: &str,
) -> Result<(), String> {
    let library = library_for(library_id)?;
    if profile_id.trim().is_empty() {
        return Err("Le profil possède un identifiant invalide.".into());
    }
    let mut transaction = pool.begin().await.map_err(|error| {
        format!("Impossible de démarrer le retrait de la bibliothèque : {error}")
    })?;
    sqlx::query(&format!(
        "DELETE FROM {} WHERE profile_id = $1",
        library.table
    ))
    .bind(profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de supprimer les fiches de la bibliothèque : {error}"))?;
    sqlx::query("DELETE FROM profile_libraries WHERE profile_id = $1 AND library_id = $2")
        .bind(profile_id)
        .bind(library.id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de retirer la bibliothèque du profil : {error}"))?;
    transaction.commit().await.map_err(|error| {
        format!("Impossible de finaliser le retrait de la bibliothèque : {error}")
    })?;
    Ok(())
}

#[tauri::command]
pub async fn delete_custom_entry_atomically(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
    library_id: String,
    entry_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    delete_custom_entry_in_pool(&pool, &profile_id, &library_id, &entry_id).await
}

#[tauri::command]
pub async fn remove_custom_library_atomically(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
    library_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    remove_custom_library_in_pool(&pool, &profile_id, &library_id).await
}

#[cfg(test)]
#[path = "custom_entries_tests.rs"]
mod tests;
