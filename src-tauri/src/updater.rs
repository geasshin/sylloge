use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Error as UpdaterError, UpdaterExt};

use crate::updater_credentials;

pub struct PendingUpdate(Mutex<Option<String>>);

impl Default for PendingUpdate {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    version: String,
    notes: Option<String>,
}

#[tauri::command]
pub async fn check_for_app_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<Option<AvailableUpdate>, String> {
    let token = updater_credentials::read_updater_token()?
        .ok_or_else(|| "UPDATER_TOKEN_REQUIRED".to_string())?;

    let updater = app
        .updater_builder()
        .header("Authorization", format!("Bearer {}", token.as_str()))
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?
        .build()
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?;

    let update = updater.check().await.map_err(map_check_error)?;
    let details = update.as_ref().map(|update| AvailableUpdate {
        version: update.version.clone(),
        notes: update
            .body
            .as_deref()
            .map(str::trim)
            .filter(|notes| !notes.is_empty())
            .map(str::to_string),
    });

    let mut pending = pending_update
        .0
        .lock()
        .map_err(|_| "UPDATER_STATE_UNAVAILABLE".to_string())?;
    *pending = update.map(|update| update.version);

    Ok(details)
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    version: String,
    pending_update: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let expected_version = {
        let mut pending = pending_update
            .0
            .lock()
            .map_err(|_| "UPDATER_STATE_UNAVAILABLE".to_string())?;
        let Some(update) = pending.as_ref() else {
            return Err("UPDATER_UPDATE_EXPIRED".to_string());
        };
        if update != &version {
            return Err("UPDATER_UPDATE_CHANGED".to_string());
        }
        pending
            .take()
            .expect("la mise à jour vérifiée est présente")
    };

    let token = updater_credentials::read_updater_token()?
        .ok_or_else(|| "UPDATER_TOKEN_REQUIRED".to_string())?;
    let updater = app
        .updater_builder()
        .header("Authorization", format!("Bearer {}", token.as_str()))
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?
        .build()
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?;
    let update = updater
        .check()
        .await
        .map_err(map_check_error)?
        .ok_or_else(|| "UPDATER_UPDATE_EXPIRED".to_string())?;
    if update.version != expected_version {
        return Err("UPDATER_UPDATE_CHANGED".to_string());
    }

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| "UPDATER_INSTALL_FAILED".to_string())
}

fn map_check_error(error: UpdaterError) -> String {
    match error {
        UpdaterError::ReleaseNotFound => "UPDATER_PRIVATE_RELEASE_UNAVAILABLE".to_string(),
        _ => "UPDATER_CHECK_FAILED".to_string(),
    }
}
