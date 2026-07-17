use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::database::DATABASE_URL;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedJsonFile {
    name: String,
    contents: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryPayload {
    profile: ImportProfile,
    films: Vec<ImportFilm>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportProfile {
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportFilm {
    id: String,
    profile_id: String,
    title: String,
    original_title: Option<String>,
    year: Option<i64>,
    status: String,
    is_favorite: bool,
    rating: Option<f64>,
    watched_at: Option<String>,
    personal_note: Option<String>,
    director: Option<String>,
    summary: Option<String>,
    provider_name: Option<String>,
    provider_id: Option<String>,
    poster_url: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryResult {
    profile_id: String,
    film_count: usize,
}

#[tauri::command]
pub async fn pick_import_json(app: AppHandle) -> Result<Option<PickedJsonFile>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("Export JSON Sylloge", &["json"])
        .set_title("Choisir un export Sylloge")
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Chemin de fichier illisible : {error}"))?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Impossible de lire le fichier choisi : {error}"))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("export.json")
        .to_string();

    Ok(Some(PickedJsonFile { name, contents }))
}

#[tauri::command]
pub async fn save_export_json(
    app: AppHandle,
    suggested_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    let safe_name = Path::new(&suggested_name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("sylloge-films.json");
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("Export JSON Sylloge", &["json"])
        .set_file_name(safe_name)
        .set_title("Exporter le profil Sylloge")
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Chemin de fichier illisible : {error}"))?;
    fs::write(&path, contents)
        .map_err(|error| format!("Impossible d’écrire l’export choisi : {error}"))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("sylloge-films.json")
        .to_string();

    Ok(Some(name))
}

#[tauri::command]
pub async fn import_library_atomically(
    db_instances: State<'_, DbInstances>,
    payload: ImportLibraryPayload,
) -> Result<ImportLibraryResult, String> {
    let instances = db_instances.0.read().await;
    let database = instances
        .get(DATABASE_URL)
        .ok_or_else(|| "La base SQLite Sylloge n’est pas chargée.".to_string())?;
    let pool = match database {
        DbPool::Sqlite(pool) => pool,
        #[allow(unreachable_patterns)]
        _ => return Err("La base Sylloge chargée n’est pas SQLite.".to_string()),
    };
    write_import(pool, &payload).await?;

    Ok(ImportLibraryResult {
        profile_id: payload.profile.id,
        film_count: payload.films.len(),
    })
}

async fn write_import(
    pool: &sqlx::SqlitePool,
    payload: &ImportLibraryPayload,
) -> Result<(), String> {
    if payload
        .films
        .iter()
        .any(|film| film.profile_id != payload.profile.id)
    {
        return Err("Un film ne cible pas le nouveau profil d’import.".to_string());
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import SQLite : {error}"))?;

    sqlx::query("INSERT INTO profiles (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)")
        .bind(&payload.profile.id)
        .bind(&payload.profile.name)
        .bind(&payload.profile.created_at)
        .bind(&payload.profile.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de créer le nouveau profil : {error}"))?;

    for film in &payload.films {
        sqlx::query(
            "INSERT INTO films (
                id, profile_id, title, original_title, year, status, is_favorite, rating,
                watched_at, personal_note, director, summary, provider_name, provider_id,
                poster_url, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
             )",
        )
        .bind(&film.id)
        .bind(&film.profile_id)
        .bind(&film.title)
        .bind(&film.original_title)
        .bind(film.year)
        .bind(&film.status)
        .bind(if film.is_favorite { 1 } else { 0 })
        .bind(film.rating)
        .bind(&film.watched_at)
        .bind(&film.personal_note)
        .bind(&film.director)
        .bind(&film.summary)
        .bind(&film.provider_name)
        .bind(&film.provider_id)
        .bind(&film.poster_url)
        .bind(&film.created_at)
        .bind(&film.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible d’importer le film « {} » : {error}", film.title))?;
    }

    sqlx::query(
        "UPDATE current_profile
         SET profile_id = $1, updated_at = $2
         WHERE singleton = 1",
    )
    .bind(&payload.profile.id)
    .bind(&payload.profile.updated_at)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible d’activer le nouveau profil : {error}"))?;

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import SQLite : {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[test]
    fn failed_film_insert_rolls_back_the_new_profile() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("base SQLite de test");
            sqlx::raw_sql(include_str!(
                "../migrations/0001_create_profiles_and_films.sql"
            ))
            .execute(&pool)
            .await
            .expect("schéma initial");
            sqlx::raw_sql(include_str!(
                "../migrations/0002_create_default_profile.sql"
            ))
            .execute(&pool)
            .await
            .expect("profil default");
            sqlx::raw_sql(include_str!("../migrations/0003_track_current_profile.sql"))
                .execute(&pool)
                .await
                .expect("profil courant");

            let timestamp = "2026-07-17T13:00:00.000Z".to_string();
            let payload = ImportLibraryPayload {
                profile: ImportProfile {
                    id: "new-profile".to_string(),
                    name: "Import de test".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![ImportFilm {
                    id: "new-film".to_string(),
                    profile_id: "new-profile".to_string(),
                    title: "Film refusé".to_string(),
                    original_title: None,
                    year: None,
                    status: "statut invalide".to_string(),
                    is_favorite: false,
                    rating: None,
                    watched_at: None,
                    personal_note: None,
                    director: None,
                    summary: None,
                    provider_name: None,
                    provider_id: None,
                    poster_url: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp,
                }],
            };

            let result = write_import(&pool, &payload).await;
            assert!(
                result.is_err(),
                "la contrainte de statut doit refuser le film"
            );

            let profile_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles")
                .fetch_one(&pool)
                .await
                .expect("compte profils");
            let film_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM films")
                .fetch_one(&pool)
                .await
                .expect("compte films");
            let current_profile: (String,) =
                sqlx::query_as("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&pool)
                    .await
                    .expect("profil courant");

            assert_eq!(profile_count.0, 1, "le profil d’import doit être annulé");
            assert_eq!(film_count.0, 0, "aucun film ne doit subsister");
            assert_eq!(
                current_profile.0, "default",
                "le profil courant doit rester intact"
            );
        });
    }
}
