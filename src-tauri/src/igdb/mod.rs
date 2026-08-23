//! Client IGDB borné pour le préremplissage Jeux.
//!
//! IGDB (opéré par Twitch) est gratuit pour un usage non commercial. Il exige
//! un jeton OAuth « client credentials » renouvelé automatiquement (~60 jours)
//! à partir d'un Client ID et d'un Client Secret déposés hors dépôt dans
//! `~/.sylloge-secrets/`, puis embarqués obfusqués via
//! `scripts/generate_embedded_key.py` (fichiers `embedded_key.rs`, ignorés par
//! Git). Les couvertures sont verticales (3:4) servies par images.igdb.com.
//! Aucune écriture SQLite ici : recherche et préremplissage uniquement.

mod embedded_client_id;
mod embedded_client_secret;

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const MAX_SEARCH_RESULTS: usize = 20;

const TWITCH_TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const IGDB_API_BASE: &str = "https://api.igdb.com/v4";
const IGDB_IMAGE_BASE: &str = "https://images.igdb.com/igdb/image/upload";
const REQUEST_TIMEOUT_SECONDS: u64 = 10;
const USER_AGENT: &str = "Sylloge/0.6 (personal local cultural library)";

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
struct TokenResponse {
    access_token: String,
    expires_in: i64,
}

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

/// Jeton OAuth partagé, renouvelé avant expiration.
struct CachedToken {
    value: String,
    fetched_at: Instant,
    lifetime: Duration,
}

static TOKEN_CACHE: Mutex<Option<CachedToken>> = Mutex::new(None);

async fn fetch_access_token(
    client: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
) -> Result<(String, Duration), IgdbError> {
    let response = client
        .post(TWITCH_TOKEN_URL)
        .query(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|_| IgdbError::NetworkUnavailable)?;

    if !response.status().is_success() {
        return Err(IgdbError::ProviderError(response.status().as_u16()));
    }

    let token: TokenResponse = response
        .json()
        .await
        .map_err(|_| IgdbError::InvalidProviderResponse)?;
    Ok((
        token.access_token,
        Duration::from_secs(token.expires_in.max(0) as u64),
    ))
}

async fn access_token(client: &reqwest::Client) -> Result<String, IgdbError> {
    {
        let cache = TOKEN_CACHE
            .lock()
            .map_err(|_| IgdbError::NetworkUnavailable)?;
        if let Some(cached) = cache.as_ref() {
            // Marge de sécurité de cinq minutes avant l'expiration réelle.
            if cached.fetched_at.elapsed() + Duration::from_secs(300) < cached.lifetime {
                return Ok(cached.value.clone());
            }
        }
    }

    let client_id = embedded_client_id::embedded_api_key();
    let client_secret = embedded_client_secret::embedded_api_key();
    let (value, lifetime) = fetch_access_token(client, &client_id, &client_secret).await?;

    let mut cache = TOKEN_CACHE
        .lock()
        .map_err(|_| IgdbError::NetworkUnavailable)?;
    *cache = Some(CachedToken {
        value: value.clone(),
        fetched_at: Instant::now(),
        lifetime,
    });
    Ok(value)
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
        let token = access_token(&self.client).await?;
        let url = format!("{IGDB_API_BASE}/games");
        let response = self
            .client
            .post(&url)
            .header("Client-ID", embedded_client_id::embedded_api_key())
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/json")
            .body(request_body.to_string())
            .send()
            .await
            .map_err(|_| IgdbError::NetworkUnavailable)?;

        if !response.status().is_success() {
            return Err(IgdbError::ProviderError(response.status().as_u16()));
        }

        response
            .json::<T>()
            .await
            .map_err(|_| IgdbError::InvalidProviderResponse)
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
    fn release_year_handles_epoch_boundaries() {
        assert_eq!(release_year(Some(0)), Some(1970));
        assert_eq!(release_year(None), None);
    }
}
