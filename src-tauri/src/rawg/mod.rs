//! Client RAWG borné pour le préremplissage Jeux (jalon 0.4.28).
//!
//! RAWG est gratuit avec attribution (plan Free : 20 000 requêtes/mois,
//! usage personnel et commercial sous 100 000 utilisateurs actifs). La clé
//! vit obfusquée dans `embedded_key.rs`, ignoré par Git, jamais exposée dans
//! les logs, les exports ou les réponses. Aucune écriture SQLite ici :
//! recherche et préremplissage uniquement.

mod embedded_key;

use serde::{Deserialize, Serialize};

pub const MAX_SEARCH_RESULTS: usize = 20;
pub const MAX_DEVELOPERS: usize = 3;

const RAWG_API_BASE: &str = "https://api.rawg.io/api";
const REQUEST_TIMEOUT_SECONDS: u64 = 10;
const USER_AGENT: &str = "Sylloge/0.4 (personal local cultural library)";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawgGameCandidateDto {
    pub game_id: i64,
    pub title: String,
    pub release_year: Option<i32>,
    pub cover_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawgGamePresentationDto {
    pub game_id: i64,
    pub title: String,
    pub developer: Option<String>,
    pub release_year: Option<i32>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawgError {
    NetworkUnavailable,
    ProviderError(u16),
    InvalidProviderResponse,
}

impl std::fmt::Display for RawgError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NetworkUnavailable => {
                formatter.write_str("La connexion au service de métadonnées a échoué.")
            }
            Self::ProviderError(status) => {
                write!(
                    formatter,
                    "Le service de métadonnées a renvoyé une erreur ({status})."
                )
            }
            Self::InvalidProviderResponse => {
                formatter.write_str("La réponse du service de métadonnées est invalide.")
            }
        }
    }
}

// --- Réponses API RAWG (désérialisation interne) ---

#[derive(Debug, Deserialize)]
struct SearchResponse {
    results: Vec<SearchResult>,
}

#[derive(Debug, Deserialize)]
struct SearchResult {
    id: i64,
    name: Option<String>,
    released: Option<String>,
    background_image: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GameDetailsResponse {
    id: i64,
    name: Option<String>,
    released: Option<String>,
    background_image: Option<String>,
    developers: Option<Vec<NamedEntry>>,
}

#[derive(Debug, Deserialize)]
struct NamedEntry {
    name: Option<String>,
}

fn release_year(released: Option<&str>) -> Option<i32> {
    released
        .and_then(|date| date.split('-').next())
        .and_then(|year| year.parse().ok())
}

fn join_developers(developers: Option<Vec<NamedEntry>>) -> Option<String> {
    let names: Vec<String> = developers
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.name)
        .take(MAX_DEVELOPERS)
        .collect();
    if names.is_empty() {
        None
    } else {
        Some(names.join(", "))
    }
}

/// RAWG sert ses visuels via un service de redimensionnement officiel ;
/// on demande une largeur raisonnable pour les couvertures de bibliothèque.
fn resized_cover(url: Option<String>) -> Option<String> {
    url.map(|value| {
        if let Some(rest) = value.strip_prefix("https://media.rawg.io/media/games/") {
            format!("https://media.rawg.io/media/resize/640/-/games/{rest}")
        } else if let Some(rest) = value.strip_prefix("https://media.rawg.io/media/screenshots/") {
            format!("https://media.rawg.io/media/resize/640/-/screenshots/{rest}")
        } else {
            value
        }
    })
}

fn map_search_result(result: SearchResult) -> Option<RawgGameCandidateDto> {
    let title = result.name?;
    if title.trim().is_empty() {
        return None;
    }
    Some(RawgGameCandidateDto {
        game_id: result.id,
        title,
        release_year: release_year(result.released.as_deref()),
        cover_url: resized_cover(result.background_image),
    })
}

pub struct RawgClient {
    client: reqwest::Client,
}

impl RawgClient {
    pub fn new() -> Result<Self, RawgError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|_| RawgError::NetworkUnavailable)?;
        Ok(Self { client })
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, RawgError> {
        // La clé ne vit que dans les paramètres de la requête, jamais dans un log.
        let key = embedded_key::embedded_api_key();
        let url = format!("{RAWG_API_BASE}{path}");
        let response = self
            .client
            .get(&url)
            .header("Accept", "application/json")
            .query(&[("key", key.as_str())])
            .query(query)
            .send()
            .await
            .map_err(|_| RawgError::NetworkUnavailable)?;

        if !response.status().is_success() {
            return Err(RawgError::ProviderError(response.status().as_u16()));
        }

        response
            .json::<T>()
            .await
            .map_err(|_| RawgError::InvalidProviderResponse)
    }

    pub async fn search_games(&self, query: &str) -> Result<Vec<RawgGameCandidateDto>, RawgError> {
        let response: SearchResponse = self
            .get(
                "/games",
                &[
                    ("search", query.to_string()),
                    ("page_size", MAX_SEARCH_RESULTS.to_string()),
                    ("exclude_additions", "true".to_string()),
                ],
            )
            .await?;

        Ok(response
            .results
            .into_iter()
            .filter_map(map_search_result)
            .take(MAX_SEARCH_RESULTS)
            .collect())
    }

    pub async fn fetch_game_presentation(
        &self,
        game_id: i64,
        fallback: &RawgGameCandidateDto,
    ) -> Result<RawgGamePresentationDto, RawgError> {
        let details: GameDetailsResponse = self.get(&format!("/games/{game_id}"), &[]).await?;

        Ok(RawgGamePresentationDto {
            game_id: details.id,
            title: details
                .name
                .filter(|title| !title.trim().is_empty())
                .unwrap_or_else(|| fallback.title.clone()),
            developer: join_developers(details.developers),
            release_year: release_year(details.released.as_deref()).or(fallback.release_year),
            cover_url: resized_cover(
                details
                    .background_image
                    .or_else(|| fallback.cover_url.clone()),
            ),
        })
    }
}

// --- Commandes Tauri ---

#[tauri::command]
pub async fn search_rawg_games(query: String) -> Result<Vec<RawgGameCandidateDto>, String> {
    RawgClient::new()
        .map_err(|error| error.to_string())?
        .search_games(&query)
        .await
        .map_err(|error| error.to_string())
}

/// Présentation détaillée d'un jeu, sans écriture dans SQLite : elle sert à
/// préremplir une nouvelle fiche Jeu avant sa validation.
#[tauri::command]
pub async fn preview_rawg_game(
    game_id: i64,
    title: String,
    release_year: Option<i32>,
    cover_url: Option<String>,
) -> Result<RawgGamePresentationDto, String> {
    let fallback = RawgGameCandidateDto {
        game_id,
        title,
        release_year,
        cover_url,
    };
    RawgClient::new()
        .map_err(|error| error.to_string())?
        .fetch_game_presentation(game_id, &fallback)
        .await
        .map_err(|error| error.to_string())
}

// --- Tests ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_result_without_title_is_dropped() {
        assert!(map_search_result(SearchResult {
            id: 1,
            name: None,
            released: None,
            background_image: None,
        })
        .is_none());
        assert!(map_search_result(SearchResult {
            id: 1,
            name: Some("   ".to_string()),
            released: None,
            background_image: None,
        })
        .is_none());
    }

    #[test]
    fn search_result_maps_to_bounded_candidate() {
        let candidate = map_search_result(SearchResult {
            id: 3328,
            name: Some("The Witcher 3: Wild Hunt".to_string()),
            released: Some("2015-05-18".to_string()),
            background_image: Some("https://media.rawg.io/media/games/witcher3.jpg".to_string()),
        })
        .expect("résultat complet");
        assert_eq!(candidate.game_id, 3328);
        assert_eq!(candidate.release_year, Some(2015));
        assert!(candidate.cover_url.is_some());
    }

    #[test]
    fn client_builds_with_declared_user_agent() {
        // Régression recette : un User-Agent non ASCII ferait échouer la
        // construction du client (reqwest refuse les accents en en-tête).
        assert!(RawgClient::new().is_ok());
    }

    #[test]
    fn chained_query_calls_keep_all_parameters() {
        // Diagnostic recette : deux appels .query() en chaîne doivent conserver
        // la clé ET la recherche dans l'URL finale.
        let client = reqwest::Client::new();
        let request = client
            .get("https://api.rawg.io/api/games")
            .query(&[("key", "abc")])
            .query(&[("search", "zelda")])
            .build()
            .expect("requête construite");
        assert_eq!(request.url().query(), Some("key=abc&search=zelda"));
    }

    #[test]
    fn developers_are_bounded_and_joined() {
        let joined = join_developers(Some(vec![
            NamedEntry {
                name: Some("CD Projekt Red".to_string()),
            },
            NamedEntry {
                name: Some("Autre studio".to_string()),
            },
            NamedEntry { name: None },
            NamedEntry {
                name: Some("Troisième".to_string()),
            },
            NamedEntry {
                name: Some("Quatrième".to_string()),
            },
        ]));
        assert_eq!(
            joined.as_deref(),
            Some("CD Projekt Red, Autre studio, Troisième")
        );
        assert_eq!(join_developers(Some(vec![])), None);
        assert_eq!(join_developers(None), None);
    }
}
