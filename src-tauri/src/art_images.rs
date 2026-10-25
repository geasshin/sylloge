//! La recherche d'images libres pour une œuvre, auprès de Wikimedia Commons.
//!
//! Constat du 25 octobre 2026 : les six premières bibliothèques savent proposer un visuel (TMDB, Open
//! Library, IGDB, par le proxy qui garde les clés) ; l'Art n'a rien, et une œuvre se retrouve sans image
//! tant que la personne ne colle pas une adresse à la main. Google Images est écarté (clé payante, quota,
//! conditions d'utilisation, pertinence non maîtrisée) ; Commons répond sans clé, sans quota, et ses
//! fichiers portent leur licence.
//!
//! La fenêtre ne fait pas la requête elle-même : la politique de sécurité de l'application n'autorise
//! que `connect-src 'self' ipc:`, et l'ouvrir à un hôte de plus pour une recherche serait un
//! élargissement durable. Rust interroge donc Commons (une seule adresse, écrite ici), rend le JSON brut,
//! et la fenêtre le lit (`src/domain/artImageSearch.ts`) : le tri et le filtrage restent testables en
//! Node, une seule fois.
//!
//! Rien n'est écrit sur le disque, aucune image n'est copiée : seule l'adresse de la vignette est retenue
//! dans la fiche, comme pour une adresse collée à la main.

use std::time::Duration;

/// L'adresse de l'API Commons : une constante, jamais une adresse reçue de la fenêtre.
const COMMONS_ENDPOINT: &str = "https://commons.wikimedia.org/w/api.php";
/// Une réponse de recherche pèse quelques dizaines de kilo-octets ; au-delà, c'est une anomalie.
const MAX_JSON_BYTES: usize = 2 * 1024 * 1024;
const TIMEOUT_SECONDS: u64 = 15;
/// Un titre ou un artiste plus long qu'une notice entière n'a rien à faire dans une requête.
const MAX_QUERY_CHARS: usize = 300;
/// Ce que la fenêtre montre : six propositions au plus.
const SEARCH_LIMIT: u32 = 12;

/// L'adresse de recherche : `titre artiste`, ou le titre seul. Rendue en clair pour être testable.
pub fn commons_search_url(title: &str, artist: Option<&str>) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Titre vide : aucune recherche possible.".to_string());
    }
    if title.chars().count() > MAX_QUERY_CHARS {
        return Err("Le titre est trop long pour une recherche.".to_string());
    }
    let artist = artist.map(str::trim).filter(|value| !value.is_empty());
    if let Some(artist) = artist {
        if artist.chars().count() > MAX_QUERY_CHARS {
            return Err("Le nom d’artiste est trop long pour une recherche.".to_string());
        }
    }
    let query = match artist {
        Some(artist) => format!("{title} {artist}"),
        None => title.to_string(),
    };
    let mut url = reqwest::Url::parse(COMMONS_ENDPOINT)
        .map_err(|_| "L’adresse de Commons est illisible.".to_string())?;
    url.query_pairs_mut()
        .append_pair("action", "query")
        .append_pair("format", "json")
        .append_pair("formatversion", "2")
        .append_pair("generator", "search")
        .append_pair("gsrsearch", &query)
        .append_pair("gsrnamespace", "6")
        .append_pair("gsrlimit", &SEARCH_LIMIT.to_string())
        .append_pair("prop", "imageinfo")
        .append_pair("iiprop", "url|extmetadata|size|mime")
        .append_pair("iiurlwidth", "800");
    Ok(url.to_string())
}

/// Le JSON de Commons, tel quel. Le tri et le filtrage se font dans la fenêtre.
#[tauri::command]
pub async fn fetch_commons_search(title: String, artist: Option<String>) -> Result<String, String> {
    let url = commons_search_url(&title, artist.as_deref())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECONDS))
        .build()
        .map_err(|_| "Le client réseau n’a pas pu être préparé.".to_string())?;
    let response = client
        .get(url)
        .header("Accept", "application/json")
        // Commons demande un agent identifiable pour les clients qui ne sont pas un navigateur.
        .header("User-Agent", "Sylloge/0.6 (recherche de visuels)")
        .send()
        .await
        .map_err(|_| "La recherche n’a pas pu aboutir.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Le serveur a refusé la recherche ({}).",
            response.status().as_u16()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "La réponse de la recherche n’a pas pu être lue.".to_string())?;
    if bytes.len() > MAX_JSON_BYTES {
        return Err("La réponse de la recherche est trop volumineuse.".to_string());
    }
    String::from_utf8(bytes.to_vec())
        .map_err(|_| "La réponse de la recherche n’est pas du texte UTF-8.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_recherche_vise_commons_et_les_fichiers() {
        let url = commons_search_url("La vague", Some("Courbet")).expect("adresse");
        assert!(url.starts_with("https://commons.wikimedia.org/w/api.php?"));
        assert!(url.contains("generator=search"));
        assert!(url.contains("gsrnamespace=6"), "les fichiers, pas les articles");
        assert!(url.contains("iiprop=url%7Cextmetadata%7Csize%7Cmime"));
        assert!(url.contains("La+vague+Courbet") || url.contains("La%20vague%20Courbet"), "{url}");
    }

    #[test]
    fn sans_artiste_la_requete_se_limite_au_titre() {
        let url = commons_search_url("  Les Nymphéas  ", None).expect("adresse");
        assert!(url.contains("Les+Nymph%C3%A9as") || url.contains("Les%20Nymph%C3%A9as"), "{url}");
        assert!(!url.contains("gsrsearch=Les+Nymph%C3%A9as+"), "aucun espace final");
    }

    #[test]
    fn un_titre_vide_ou_trop_long_est_refuse() {
        assert!(commons_search_url("   ", Some("Monet")).is_err());
        assert!(commons_search_url("x", Some("  ")).is_ok(), "un artiste vide ne bloque pas");
        assert!(commons_search_url(&"a".repeat(MAX_QUERY_CHARS + 1), None).is_err());
        assert!(commons_search_url("ok", Some(&"b".repeat(MAX_QUERY_CHARS + 1))).is_err());
    }
}
