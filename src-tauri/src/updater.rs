use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Error as UpdaterError, UpdaterExt};

use crate::updater_credentials;

const PRIVATE_RELEASE_MANIFEST_URL: &str =
    "https://github.com/geasshin/sylloge/releases/latest/download/latest.json";

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
    verify_private_release_access(token.as_str()).await?;

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
    verify_private_release_access(token.as_str()).await?;

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
        UpdaterError::ReleaseNotFound => "UPDATER_MANIFEST_INVALID".to_string(),
        _ => "UPDATER_CHECK_FAILED".to_string(),
    }
}

async fn verify_private_release_access(token: &str) -> Result<(), String> {
    let response = reqwest::Client::new()
        .get(PRIVATE_RELEASE_MANIFEST_URL)
        .bearer_auth(token)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| "UPDATER_CHECK_FAILED".to_string())?;

    if let Some(code) = manifest_access_error(response.status()) {
        return Err(code.to_string());
    }

    Ok(())
}

fn manifest_access_error(status: reqwest::StatusCode) -> Option<&'static str> {
    match status {
        reqwest::StatusCode::UNAUTHORIZED => Some("UPDATER_TOKEN_INVALID"),
        reqwest::StatusCode::FORBIDDEN => Some("UPDATER_TOKEN_PERMISSION_DENIED"),
        reqwest::StatusCode::NOT_FOUND => Some("UPDATER_PRIVATE_RELEASE_UNAVAILABLE"),
        status if status.is_success() => None,
        _ => Some("UPDATER_CHECK_FAILED"),
    }
}

#[cfg(test)]
mod tests {
    use super::{manifest_access_error, map_check_error};
    use reqwest::StatusCode;
    use tauri_plugin_updater::Error as UpdaterError;

    #[test]
    fn manifest_access_errors_explain_authentication_statuses() {
        assert_eq!(
            manifest_access_error(StatusCode::UNAUTHORIZED),
            Some("UPDATER_TOKEN_INVALID")
        );
        assert_eq!(
            manifest_access_error(StatusCode::FORBIDDEN),
            Some("UPDATER_TOKEN_PERMISSION_DENIED")
        );
        assert_eq!(
            manifest_access_error(StatusCode::NOT_FOUND),
            Some("UPDATER_PRIVATE_RELEASE_UNAVAILABLE")
        );
    }

    #[test]
    fn manifest_access_accepts_success_and_no_content_responses() {
        assert_eq!(manifest_access_error(StatusCode::OK), None);
        assert_eq!(manifest_access_error(StatusCode::NO_CONTENT), None);
    }

    #[test]
    fn unexpected_manifest_responses_keep_a_generic_error() {
        assert_eq!(
            manifest_access_error(StatusCode::INTERNAL_SERVER_ERROR),
            Some("UPDATER_CHECK_FAILED")
        );
    }

    #[test]
    fn release_not_found_after_successful_access_check_points_to_manifest() {
        assert_eq!(
            map_check_error(UpdaterError::ReleaseNotFound),
            "UPDATER_MANIFEST_INVALID"
        );
    }
}
