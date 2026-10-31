use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};

/// La mise à jour vérifiée est retenue ici, telle que le manifeste l'a décrite
/// (adresse du paquet et signature) : l'installation n'accepte que cette
/// version et installe exactement ce paquet, dont la signature est contrôlée
/// par le greffon avant toute écriture.
///
/// Elle n'est oubliée qu'après une installation réussie : un téléchargement
/// interrompu peut être relancé. L'installation ne relit pas le manifeste :
/// juste après une publication, GitHub peut encore servir l'ancien
/// `latest.json` pendant quelques minutes, et cette seconde lecture annonçait
/// à tort « Cette mise à jour n'est plus disponible » (31 octobre 2026).
pub struct PendingUpdate(Mutex<Option<Update>>);

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

    // Une réponse vide (manifeste encore en cache, version déjà installée) ne
    // fait pas oublier une mise à jour vérifiée plus tôt : celle-ci reste
    // installable telle qu'elle a été annoncée.
    if let Some(update) = update {
        let mut pending = pending_update
            .0
            .lock()
            .map_err(|_| "UPDATER_STATE_UNAVAILABLE".to_string())?;
        *pending = Some(update);
    }

    Ok(details)
}

/// Règle pure : la version demandée doit être celle qui a été vérifiée.
fn check_requested_version(pending: Option<&str>, requested: &str) -> Result<(), &'static str> {
    match pending {
        None => Err("UPDATER_UPDATE_EXPIRED"),
        Some(version) if version != requested => Err("UPDATER_UPDATE_CHANGED"),
        Some(_) => Ok(()),
    }
}

#[tauri::command]
pub async fn install_app_update(
    version: String,
    pending_update: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = {
        let pending = pending_update
            .0
            .lock()
            .map_err(|_| "UPDATER_STATE_UNAVAILABLE".to_string())?;
        check_requested_version(
            pending.as_ref().map(|update| update.version.as_str()),
            &version,
        )
        .map_err(str::to_string)?;
        pending
            .clone()
            .expect("la mise à jour vérifiée est présente")
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| "UPDATER_INSTALL_FAILED".to_string())?;

    if let Ok(mut pending) = pending_update.0.lock() {
        *pending = None;
    }
    Ok(())
}

/// Le manifeste est servi par la release publique. Son absence, son contenu et la
/// plateforme du client doivent rester trois diagnostics distincts : une entrée
/// manquante ressemblait à une panne réseau, et Windows ne pouvait jamais se mettre
/// à jour tant que `latest.json` ne publiait que `darwin-*`.
fn map_check_error(error: UpdaterError) -> String {
    match error {
        UpdaterError::ReleaseNotFound => "UPDATER_MANIFEST_INVALID".to_string(),
        UpdaterError::TargetNotFound(_) | UpdaterError::TargetsNotFound(_) => {
            "UPDATER_TARGET_MISSING".to_string()
        }
        _ => "UPDATER_CHECK_FAILED".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{check_requested_version, map_check_error};
    use tauri_plugin_updater::Error as UpdaterError;

    #[test]
    fn release_not_found_points_to_the_manifest() {
        assert_eq!(
            map_check_error(UpdaterError::ReleaseNotFound),
            "UPDATER_MANIFEST_INVALID"
        );
    }

    #[test]
    fn missing_platform_is_not_reported_as_a_network_failure() {
        let error = map_check_error(UpdaterError::TargetNotFound("windows-x86_64".to_string()));
        assert_eq!(error, "UPDATER_TARGET_MISSING");
        let fallbacks = map_check_error(UpdaterError::TargetsNotFound(vec![
            "darwin-aarch64".to_string()
        ]));
        assert_eq!(fallbacks, "UPDATER_TARGET_MISSING");
    }

    #[test]
    fn only_the_verified_version_can_be_installed() {
        assert_eq!(check_requested_version(Some("0.6.23"), "0.6.23"), Ok(()));
        assert_eq!(
            check_requested_version(Some("0.6.23"), "0.6.24"),
            Err("UPDATER_UPDATE_CHANGED")
        );
        assert_eq!(
            check_requested_version(None, "0.6.23"),
            Err("UPDATER_UPDATE_EXPIRED")
        );
    }
}
