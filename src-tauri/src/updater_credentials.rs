use serde::Serialize;
use zeroize::Zeroizing;

const KEYCHAIN_SERVICE: &str = "com.aurelientrouble.sylloge";
const KEYCHAIN_ACCOUNT: &str = "github-private-updater-token";
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterCredentialStatus {
    supported: bool,
    configured: bool,
}

#[tauri::command]
pub fn get_private_updater_credential_status() -> Result<UpdaterCredentialStatus, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(UpdaterCredentialStatus {
            supported: true,
            configured: read_updater_token()?.is_some(),
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(UpdaterCredentialStatus {
            supported: false,
            configured: false,
        })
    }
}

#[tauri::command]
pub fn set_private_updater_token(token: String) -> Result<UpdaterCredentialStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let token = Zeroizing::new(token);
        let token = normalize_token(&token)?;
        security_framework::passwords::set_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
            token.as_bytes(),
        )
        .map_err(|_| "Impossible d’enregistrer le jeton dans le Trousseau macOS.".to_string())?;

        Ok(UpdaterCredentialStatus {
            supported: true,
            configured: true,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = token;
        Err(
            "Le stockage sécurisé des mises à jour est disponible uniquement sur macOS."
                .to_string(),
        )
    }
}

#[tauri::command]
pub fn remove_private_updater_token() -> Result<UpdaterCredentialStatus, String> {
    #[cfg(target_os = "macos")]
    {
        match security_framework::passwords::delete_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
        ) {
            Ok(()) => {}
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => {}
            Err(_) => {
                return Err("Impossible de supprimer le jeton du Trousseau macOS.".to_string());
            }
        }

        Ok(UpdaterCredentialStatus {
            supported: true,
            configured: false,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err(
            "Le stockage sécurisé des mises à jour est disponible uniquement sur macOS."
                .to_string(),
        )
    }
}

pub(crate) fn read_updater_token() -> Result<Option<Zeroizing<String>>, String> {
    #[cfg(target_os = "macos")]
    {
        match security_framework::passwords::get_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
        ) {
            Ok(bytes) => {
                let token = String::from_utf8(bytes)
                    .map_err(|_| "Le jeton du Trousseau macOS est invalide.".to_string())?;
                if normalize_token(&token).is_err() {
                    return Ok(None);
                }
                Ok(Some(Zeroizing::new(token)))
            }
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            Err(_) => Err("Impossible de lire le jeton dans le Trousseau macOS.".to_string()),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err(
            "Le stockage sécurisé des mises à jour est disponible uniquement sur macOS."
                .to_string(),
        )
    }
}

fn normalize_token(token: &str) -> Result<&str, String> {
    let token = token.trim();
    if token.is_empty()
        || token.len() > 512
        || token
            .bytes()
            .any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control())
    {
        return Err("Le jeton GitHub est vide ou mal formé.".to_string());
    }
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::normalize_token;

    #[test]
    fn token_input_trims_outer_whitespace_without_accepting_internal_whitespace() {
        assert_eq!(
            normalize_token("  github_pat_example  ").unwrap(),
            "github_pat_example"
        );
        assert!(normalize_token("  \n  ").is_err());
        assert!(normalize_token("github_pat_\nexample").is_err());
    }

    #[test]
    fn token_input_rejects_values_over_the_bound() {
        assert!(normalize_token(&"x".repeat(513)).is_err());
        assert_eq!(normalize_token(&"x".repeat(512)).unwrap().len(), 512);
    }
}
