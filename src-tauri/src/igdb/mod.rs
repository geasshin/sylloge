//! Client IGDB borné pour le préremplissage Jeux.
//!
//! IGDB (opéré par Twitch) est appelé à travers le proxy du projet, qui détient
//! le Client ID, le Client Secret et le jeton OAuth. L'application n'embarque
//! donc aucune clé et ne parle jamais à Twitch. Les couvertures verticales
//! (3:4) restent servies par images.igdb.com, sans clé.
//! Aucune écriture SQLite ici : recherche et préremplissage uniquement.

use serde::{Deserialize, Serialize};

pub const MAX_SEARCH_RESULTS: usize = 20;

const IGDB_API_BASE: &str = "https://sylloge.vercel.app/api/igdb";
const IGDB_IMAGE_BASE: &str = "https://images.igdb.com/igdb/image/upload";
const REQUEST_TIMEOUT_SECONDS: u64 = 10;
const USER_AGENT: &str = crate::user_agent::APP_USER_AGENT;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IgdbGameCandidateDto {
    pub game_id: i64,
    pub title: String,
    pub release_year: Option<i32>,
    pub cover_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IgdbGamePresentationDto {
    pub game_id: i64,
    pub title: String,
    pub developer: Option<String>,
    pub release_year: Option<i32>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IgdbError {
    NetworkUnavailable,
    ProviderError(u16),
    InvalidProviderResponse,
}

impl std::fmt::Display for IgdbError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NetworkUnavailable => {
                formatter.write_str("La connexion au service de métadonnées a échoué.")
            }
            // Le proxy renvoie 502/503/504 quand c'est lui ou Twitch qui est
            // en cause : rien à corriger côté utilisateur.
            Self::ProviderError(502..=504) => formatter.write_str(
                "Le service de métadonnées est momentanément indisponible. Réessayez dans un instant.",
            ),
            Self::ProviderError(429) => formatter.write_str(
                "Trop de recherches en peu de temps. Patientez une minute avant de réessayer.",
            ),
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

// --- Réponses API IGDB (désérialisation interne) ---

#[derive(Debug, Deserialize)]
struct GameResult {
    id: i64,
    name: Option<String>,
    first_release_date: Option<i64>,
    cover: Option<CoverEntry>,
    involved_companies: Option<Vec<InvolvedCompany>>,
}

#[derive(Debug, Deserialize)]
struct CoverEntry {
    image_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InvolvedCompany {
    company: Option<NamedEntry>,
    developer: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct NamedEntry {
    name: Option<String>,
}

/// Visuel paysage d'un jeu : `artworks` (illustrations officielles) puis
/// `screenshots` (captures). Un artwork est préféré à une capture pour une
/// bannière ; les deux passent par la même entrée `games`, sans endpoint séparé.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct IgdbImageEntry {
    #[serde(default)]
    pub image_id: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
}

#[derive(Debug, Default, Deserialize)]
struct IgdbGameImages {
    #[serde(default)]
    artworks: Vec<IgdbImageEntry>,
    #[serde(default)]
    screenshots: Vec<IgdbImageEntry>,
}

/// Champs demandés pour les visuels d'un jeu. `artworks` et `screenshots` sont
/// ouverts côté relais pour la requête `games` (pas d'endpoint séparé).
const IMAGE_FIELDS: &str = "artworks.image_id,artworks.width,artworks.height,screenshots.image_id,screenshots.width,screenshots.height";

/// Corps Apicalypse des visuels d'un jeu : `where id = N`, une seule fiche.
fn images_request_body(game_id: i64) -> String {
    format!("fields {IMAGE_FIELDS}; where id = {game_id}; limit 1;")
}

fn release_year(timestamp_seconds: Option<i64>) -> Option<i32> {
    let seconds = timestamp_seconds?;
    let days = seconds / 86_400;
    // Conversion date epoch → année civile (UTC), sans dépendance externe.
    let mut year = 1970i64;
    let mut remaining = days;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        let length = if leap { 366 } else { 365 };
        if remaining < length {
            break;
        }
        remaining -= length;
        year += 1;
    }
    Some(year as i32)
}

/// URL de couverture verticale (264 x 374) depuis l'identifiant d'image IGDB.
fn cover_url(image_id: &Option<String>) -> Option<String> {
    image_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
        .map(|id| format!("{IGDB_IMAGE_BASE}/t_cover_big/{id}.jpg"))
}

fn join_developers(companies: Option<Vec<InvolvedCompany>>) -> Option<String> {
    let names: Vec<String> = companies
        .unwrap_or_default()
        .into_iter()
        .filter(|entry| entry.developer.unwrap_or(false))
        .filter_map(|entry| entry.company.and_then(|company| company.name))
        .take(3)
        .collect();
    if names.is_empty() {
        None
    } else {
        Some(names.join(", "))
    }
}

fn map_game_result(result: GameResult) -> Option<IgdbGameCandidateDto> {
    let title = result.name?;
    if title.trim().is_empty() {
        return None;
    }
    Some(IgdbGameCandidateDto {
        game_id: result.id,
        title,
        release_year: release_year(result.first_release_date),
        cover_url: cover_url(&result.cover.map(|cover| cover.image_id).unwrap_or_default()),
    })
}

pub struct IgdbClient {
    client: reqwest::Client,
}

impl IgdbClient {
    pub fn new() -> Result<Self, IgdbError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|_| IgdbError::NetworkUnavailable)?;
        Ok(Self { client })
    }

    async fn query<T: for<'de> Deserialize<'de>>(
        &self,
        request_body: &str,
    ) -> Result<T, IgdbError> {
        let url = format!("{IGDB_API_BASE}/games");
        let response = self
            .client
            .post(&url)
            .header("Accept", "application/json")
            .headers(crate::installation::header_map())
            .body(request_body.to_string())
            .send()
            .await
            .map_err(|_| IgdbError::NetworkUnavailable)?;

        if !response.status().is_success() {
            return Err(IgdbError::ProviderError(response.status().as_u16()));
        }

        let body = crate::http::read_body_capped(response, crate::http::MAX_PROVIDER_BYTES)
            .await
            .map_err(|_| IgdbError::InvalidProviderResponse)?;
        serde_json::from_slice(&body).map_err(|_| IgdbError::InvalidProviderResponse)
    }

    pub async fn search_games(
        &self,
        query_text: &str,
    ) -> Result<Vec<IgdbGameCandidateDto>, IgdbError> {
        let escaped = query_text.replace('"', "");
        let body = format!(
            "search \"{}\"; fields id,name,first_release_date,cover.image_id,involved_companies.developer,involved_companies.company.name; limit {};",
            escaped, MAX_SEARCH_RESULTS
        );
        let results: Vec<GameResult> = self.query(&body).await?;
        Ok(results
            .into_iter()
            .filter_map(map_game_result)
            .take(MAX_SEARCH_RESULTS)
            .collect())
    }

    /// Détails d'un jeu précis, avec repli sur le candidat de la recherche si
    /// l'API renvoie moins d'informations.
    /// Visuels paysage d'un jeu : illustrations officielles puis captures.
    /// Aucune écriture, aucun autre appel.
    pub async fn fetch_game_images(
        &self,
        game_id: i64,
    ) -> Result<(Vec<IgdbImageEntry>, Vec<IgdbImageEntry>), IgdbError> {
        let mut results: Vec<IgdbGameImages> = self.query(&images_request_body(game_id)).await?;
        Ok(results
            .pop()
            .map(|images| (images.artworks, images.screenshots))
            .unwrap_or_default())
    }

    pub async fn fetch_game_presentation(
        &self,
        game_id: i64,
        fallback: &IgdbGameCandidateDto,
    ) -> Result<IgdbGamePresentationDto, IgdbError> {
        let body = format!(
            "fields id,name,first_release_date,cover.image_id,involved_companies.developer,involved_companies.company.name; where id = {game_id}; limit 1;"
        );
        let mut results: Vec<GameResult> = self.query(&body).await?;
        match results.pop() {
            Some(mut result) => {
                let developer = join_developers(result.involved_companies.take());
                let candidate =
                    map_game_result(result).ok_or(IgdbError::InvalidProviderResponse)?;
                Ok(IgdbGamePresentationDto {
                    game_id: candidate.game_id,
                    title: candidate.title,
                    developer,
                    release_year: candidate.release_year.or(fallback.release_year),
                    cover_url: candidate.cover_url.or_else(|| fallback.cover_url.clone()),
                })
            }
            None => Ok(IgdbGamePresentationDto {
                game_id: fallback.game_id,
                title: fallback.title.clone(),
                developer: None,
                release_year: fallback.release_year,
                cover_url: fallback.cover_url.clone(),
            }),
        }
    }
}

// --- Commandes Tauri ---

#[tauri::command]
pub async fn search_igdb_games(query: String) -> Result<Vec<IgdbGameCandidateDto>, String> {
    IgdbClient::new()
        .map_err(|error| error.to_string())?
        .search_games(&query)
        .await
        .map_err(|error| error.to_string())
}

/// Présentation détaillée d'un jeu, sans écriture dans SQLite : elle sert à
/// préremplir une nouvelle fiche Jeu avant sa validation.
#[tauri::command]
pub async fn preview_igdb_game(
    game_id: i64,
    title: String,
    release_year: Option<i32>,
    cover_url: Option<String>,
) -> Result<IgdbGamePresentationDto, String> {
    let fallback = IgdbGameCandidateDto {
        game_id,
        title,
        release_year,
        cover_url,
    };
    IgdbClient::new()
        .map_err(|error| error.to_string())?
        .fetch_game_presentation(game_id, &fallback)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn game_result_without_name_is_dropped() {
        assert!(map_game_result(GameResult {
            id: 1,
            name: None,
            first_release_date: None,
            cover: None,
            involved_companies: None,
        })
        .is_none());
        assert!(map_game_result(GameResult {
            id: 2,
            name: Some("   ".to_string()),
            first_release_date: None,
            cover: None,
            involved_companies: None,
        })
        .is_none());
    }

    #[test]
    fn game_result_maps_cover_and_year() {
        let candidate = map_game_result(GameResult {
            id: 237895,
            name: Some("Zelda".to_string()),
            first_release_date: Some(1_512_691_200),
            cover: Some(CoverEntry {
                image_id: Some("co67oa".to_string()),
            }),
            involved_companies: Some(vec![InvolvedCompany {
                developer: Some(true),
                company: Some(NamedEntry {
                    name: Some("Nintendo".to_string()),
                }),
            }]),
        })
        .expect("candidat complet");
        assert_eq!(candidate.game_id, 237895);
        assert_eq!(candidate.release_year, Some(2017));
        assert_eq!(
            candidate.cover_url.as_deref(),
            Some("https://images.igdb.com/igdb/image/upload/t_cover_big/co67oa.jpg")
        );
    }

    #[test]
    fn images_request_asks_for_artworks_then_screenshots_on_the_games_endpoint() {
        let body = images_request_body(237895);
        assert!(body.contains("where id = 237895"), "{body}");
        assert!(body.contains("artworks.image_id"), "{body}");
        assert!(body.contains("artworks.width,artworks.height"), "{body}");
        assert!(body.contains("screenshots.image_id"), "{body}");
        assert!(
            body.contains("screenshots.width,screenshots.height"),
            "{body}"
        );
        assert!(body.contains("limit 1"), "{body}");
    }

    #[test]
    fn image_entries_read_a_simulated_relay_response() {
        let payload = r#"[
            {
                "id": 237895,
                "artworks": [
                    { "image_id": "ar1", "width": 1920, "height": 1080 },
                    { "image_id": "ar2" }
                ],
                "screenshots": [ { "image_id": "sc1", "width": 1920, "height": 1080 } ]
            }
        ]"#;
        let mut results: Vec<IgdbGameImages> =
            serde_json::from_str(payload).expect("réponse simulée");
        let images = results.pop().expect("une fiche");
        assert_eq!(images.artworks.len(), 2);
        assert_eq!(images.artworks[0].image_id.as_deref(), Some("ar1"));
        assert_eq!(images.artworks[1].width, None);
        assert_eq!(images.screenshots.len(), 1);
    }

    #[test]
    fn release_year_handles_epoch_boundaries() {
        assert_eq!(release_year(Some(0)), Some(1970));
        assert_eq!(release_year(None), None);
    }
}
