//! Identifiant d’installation anonyme, créé une fois et gardé à côté des
//! données de l’application.
//!
//! Il sert au relais de métadonnées à compter les requêtes par appareil plutôt
//! que par adresse IP, pour qu’une machine ne prive pas les autres. Ce n’est ni
//! un compte, ni une donnée personnelle : aucun réglage, aucun contenu de
//! bibliothèque, et il ne part jamais dans une sauvegarde ou un export.
//!
//! Son absence n’empêche rien : le relais retombe alors sur l’adresse IP.

use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::path::Path;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

const FILE_NAME: &str = "installation.id";

/// 32 caractères hexadécimaux, la forme attendue par le relais.
const ID_LENGTH: usize = 32;

static INSTALLATION_ID: OnceLock<Option<String>> = OnceLock::new();

/// Lit l’identifiant existant ou en crée un. Sans effet si l’écriture échoue.
pub fn initialize(directory: &Path) -> Option<String> {
    INSTALLATION_ID
        .get_or_init(|| load_or_create(directory))
        .clone()
}

/// En-tête à joindre aux appels de métadonnées, quand l’identifiant existe.
pub fn header() -> Option<String> {
    INSTALLATION_ID.get().cloned().flatten()
}

/// Même en-tête, sous la forme attendue par un client HTTP : vide quand
/// l’identifiant n’a pas pu être lu, ce qui laisse le relais compter par IP.
pub fn header_map() -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(value) = header() {
        if let Ok(parsed) = reqwest::header::HeaderValue::from_str(&value) {
            headers.insert(
                reqwest::header::HeaderName::from_static("x-sylloge-install"),
                parsed,
            );
        }
    }
    headers
}

fn load_or_create(directory: &Path) -> Option<String> {
    let path = directory.join(FILE_NAME);
    if let Ok(existing) = fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if is_installation_id(trimmed) {
            return Some(trimmed.to_string());
        }
    }

    let created = generate();
    fs::create_dir_all(directory).ok()?;
    fs::write(&path, format!("{created}\n")).ok()?;
    Some(created)
}

/// Deux tirages de l’état aléatoire du système, chacun haché avec l’horloge :
/// assez pour qu’aucune installation ne partage le même identifiant, et sans
/// dépendance nouvelle pour un identifiant qui n’a rien de secret.
fn generate() -> String {
    let mut value = String::with_capacity(ID_LENGTH);
    for draw in 0..2u64 {
        let mut hasher = RandomState::new().build_hasher();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos() as u64)
            .unwrap_or(0);
        hasher.write_u64(nanos ^ draw);
        hasher.write_usize(std::process::id() as usize);
        value.push_str(&format!("{:016x}", hasher.finish()));
    }
    value
}

fn is_installation_id(value: &str) -> bool {
    value.len() == ID_LENGTH
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_identifiant_genere_a_la_bonne_forme() {
        let generated = generate();
        assert!(is_installation_id(&generated), "{generated}");
    }

    #[test]
    fn deux_tirages_different() {
        assert_ne!(generate(), generate());
    }

    #[test]
    fn un_fichier_absurde_est_remplace() {
        let directory = std::env::temp_dir().join(format!("sylloge-installation-{}", generate()));
        fs::create_dir_all(&directory).expect("dossier");
        fs::write(directory.join(FILE_NAME), "pas un identifiant").expect("écriture");
        let read = load_or_create(&directory).expect("identifiant");
        assert!(is_installation_id(&read), "{read}");
        fs::remove_dir_all(&directory).ok();
    }

    #[test]
    fn l_entete_porte_l_identifiant_une_fois_initialise() {
        let directory = std::env::temp_dir().join(format!("sylloge-installation-{}", generate()));
        let id = initialize(&directory).expect("identifiant");
        let headers = header_map();
        assert_eq!(
            headers
                .get("x-sylloge-install")
                .and_then(|value| value.to_str().ok()),
            Some(id.as_str())
        );
        fs::remove_dir_all(&directory).ok();
    }

    #[test]
    fn un_identifiant_existant_est_conserve() {
        let directory = std::env::temp_dir().join(format!("sylloge-installation-{}", generate()));
        fs::create_dir_all(&directory).expect("dossier");
        let expected = "0123456789abcdef0123456789abcdef";
        fs::write(directory.join(FILE_NAME), format!("{expected}\n")).expect("écriture");
        assert_eq!(load_or_create(&directory), Some(expected.to_string()));
        fs::remove_dir_all(&directory).ok();
    }
}
