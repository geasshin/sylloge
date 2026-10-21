use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Error as UpdaterError, UpdaterExt};

/// La mise à jour vérifiée est retenue ici : l'installation n'accepte que cette
/// version, et une seule fois. Une release qui change entre la vérification et
/// l'installation est refusée.
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
    let updater = app
        .updater()
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

    let updater = app
        .updater()
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

/// Le manifeste est servi par la release publique. Son absence et sa lecture
/// doivent rester deux diagnostics distincts.
fn map_check_error(error: UpdaterError) -> String {
    match error {
        UpdaterError::ReleaseNotFound => "UPDATER_MANIFEST_INVALID".to_string(),
        _ => "UPDATER_CHECK_FAILED".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::map_check_error;
    use tauri_plugin_updater::Error as UpdaterError;

    #[test]
    fn release_not_found_points_to_the_manifest() {
        assert_eq!(
            map_check_error(UpdaterError::ReleaseNotFound),
            "UPDATER_MANIFEST_INVALID"
        );
    }
}
