use reqwest::{header::ACCEPT, StatusCode, Url};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Error as UpdaterError, Updater, UpdaterExt};

use crate::updater_credentials;

const GITHUB_LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/geasshin/sylloge/releases/latest";
const GITHUB_RELEASE_ASSET_API_URL: &str =
    "https://api.github.com/repos/geasshin/sylloge/releases/assets/";
const GITHUB_API_VERSION: &str = "2026-03-10";
const RELEASE_MANIFEST_ASSET_NAME: &str = "latest.json";

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
    let manifest_endpoint = latest_manifest_endpoint(token.as_str()).await?;
    let updater = build_authenticated_updater(&app, token.as_str(), manifest_endpoint)?;

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
    let manifest_endpoint = latest_manifest_endpoint(token.as_str()).await?;
    let updater = build_authenticated_updater(&app, token.as_str(), manifest_endpoint)?;
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

fn build_authenticated_updater(
    app: &AppHandle,
    token: &str,
    manifest_endpoint: Url,
) -> Result<Updater, String> {
    let builder = app
        .updater_builder()
        .endpoints(vec![manifest_endpoint])
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?
        .header("Authorization", format!("Bearer {token}"))
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?
        .header(ACCEPT.as_str(), "application/octet-stream")
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?
        .header("User-Agent", "Sylloge")
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())?;

    builder
        .build()
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())
}

#[derive(Deserialize)]
struct GitHubRelease {
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Deserialize)]
struct GitHubReleaseAsset {
    id: u64,
    name: String,
    state: String,
}

async fn latest_manifest_endpoint(token: &str) -> Result<Url, String> {
    let response = reqwest::Client::new()
        .get(GITHUB_LATEST_RELEASE_API_URL)
        .bearer_auth(token)
        .header(ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .header("User-Agent", "Sylloge")
        .send()
        .await
        .map_err(|_| "UPDATER_CHECK_FAILED".to_string())?;

    if let Some(error) = github_response_error(response.status()) {
        return Err(error.to_string());
    }

    let release = response
        .json::<GitHubRelease>()
        .await
        .map_err(|_| "UPDATER_RELEASE_METADATA_INVALID".to_string())?;
    let Some(asset_id) = latest_manifest_asset_id(&release.assets) else {
        return Err("UPDATER_MANIFEST_INVALID".to_string());
    };

    release_asset_url(asset_id)
}

fn latest_manifest_asset_id(assets: &[GitHubReleaseAsset]) -> Option<u64> {
    assets
        .iter()
        .find(|asset| asset.name == RELEASE_MANIFEST_ASSET_NAME && asset.state == "uploaded")
        .map(|asset| asset.id)
        .filter(|asset_id| *asset_id > 0)
}

fn release_asset_url(asset_id: u64) -> Result<Url, String> {
    if asset_id == 0 {
        return Err("UPDATER_RELEASE_METADATA_INVALID".to_string());
    }

    Url::parse(&format!("{GITHUB_RELEASE_ASSET_API_URL}{asset_id}"))
        .map_err(|_| "UPDATER_REQUEST_SETUP_FAILED".to_string())
}

fn github_response_error(status: StatusCode) -> Option<&'static str> {
    match status {
        StatusCode::UNAUTHORIZED => Some("UPDATER_TOKEN_INVALID"),
        StatusCode::FORBIDDEN => Some("UPDATER_TOKEN_PERMISSION_DENIED"),
        StatusCode::NOT_FOUND => Some("UPDATER_PRIVATE_RELEASE_UNAVAILABLE"),
        status if status.is_success() => None,
        _ => Some("UPDATER_CHECK_FAILED"),
    }
}

fn map_check_error(error: UpdaterError) -> String {
    match error {
        UpdaterError::ReleaseNotFound => "UPDATER_MANIFEST_INVALID".to_string(),
        _ => "UPDATER_CHECK_FAILED".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        github_response_error, latest_manifest_asset_id, map_check_error, release_asset_url,
        GitHubReleaseAsset,
    };
    use reqwest::StatusCode;
    use tauri_plugin_updater::Error as UpdaterError;

    #[test]
    fn github_api_errors_explain_authentication_statuses() {
        assert_eq!(
            github_response_error(StatusCode::UNAUTHORIZED),
            Some("UPDATER_TOKEN_INVALID")
        );
        assert_eq!(
            github_response_error(StatusCode::FORBIDDEN),
            Some("UPDATER_TOKEN_PERMISSION_DENIED")
        );
        assert_eq!(
            github_response_error(StatusCode::NOT_FOUND),
            Some("UPDATER_PRIVATE_RELEASE_UNAVAILABLE")
        );
    }

    #[test]
    fn github_api_errors_allow_successful_responses() {
        assert_eq!(github_response_error(StatusCode::OK), None);
    }

    #[test]
    fn unexpected_github_responses_keep_a_generic_error() {
        assert_eq!(
            github_response_error(StatusCode::INTERNAL_SERVER_ERROR),
            Some("UPDATER_CHECK_FAILED")
        );
    }

    #[test]
    fn latest_uploaded_manifest_asset_is_selected_by_name() {
        let assets = vec![
            GitHubReleaseAsset {
                id: 41,
                name: "Sylloge.app.tar.gz".to_string(),
                state: "uploaded".to_string(),
            },
            GitHubReleaseAsset {
                id: 42,
                name: "latest.json".to_string(),
                state: "uploaded".to_string(),
            },
            GitHubReleaseAsset {
                id: 43,
                name: "latest.json".to_string(),
                state: "starter".to_string(),
            },
        ];

        assert_eq!(latest_manifest_asset_id(&assets), Some(42));
        assert_eq!(latest_manifest_asset_id(&assets[..1]), None);
    }

    #[test]
    fn release_asset_url_uses_the_github_api_endpoint() {
        assert_eq!(
            release_asset_url(42).unwrap().as_str(),
            "https://api.github.com/repos/geasshin/sylloge/releases/assets/42"
        );
        assert_eq!(
            release_asset_url(0).unwrap_err(),
            "UPDATER_RELEASE_METADATA_INVALID"
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
