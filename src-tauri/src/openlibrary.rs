//! Client Open Library borné pour le préremplissage Livres (jalon 0.4.27).
//!
//! Open Library (Internet Archive) est gratuit et sans clé. Leur etiquette :
//! requêtes ponctuelles déclenchées par un humain, User-Agent identifié, pas
//! de trafic en masse. Aucune écriture SQLite ici : recherche et
//! préremplissage uniquement, les données personnelles restent locales.

use serde::{Deserialize, Serialize};

pub const MAX_SEARCH_RESULTS: usize = 20;
pub const MAX_AUTHORS: usize = 5;

const OPENLIBRARY_API_BASE: &str = "https://openlibrary.org";
const OPENLIBRARY_COVERS_BASE: &str = "https://covers.openlibrary.org/b/id";
const REQUEST_TIMEOUT_SECONDS: u64 = 10;
const USER_AGENT: &str = "Sylloge/0.4 (personal local cultural library)";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenLibraryBookCandidateDto {
    pub work_key: String,
    pub title: String,
    pub author: Option<String>,
    pub first_publish_year: Option<i32>,
    pub cover_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenLibraryBookPresentationDto {
    pub work_key: String,
    pub title: String,
    pub author: Option<String>,
    pub first_publish_year: Option<i32>,
    pub synopsis: Option<String>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenLibraryError {
    NetworkUnavailable,
    ProviderError(u16),
    /// La requête ne contient aucun terme indexable : lettre unique, mot vide
    /// seul (« le », « et ») ou symboles. Open Library y répond 422 ; ce n'est
    /// ni une panne ni un problème réseau, la recherche est vouée à l'échec.
    UnsearchableQuery,
    InvalidProviderResponse,
    InvalidWorkKey,
}

impl std::fmt::Display for OpenLibraryError {
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
            Self::UnsearchableQuery => formatter.write_str(
                "Open Library n'a trouvé aucun terme cherchable dans cette requête : \
                 essaie un titre plus complet, avec un mot significatif.",
            ),
            Self::InvalidProviderResponse => {
                formatter.write_str("La réponse du service de métadonnées est invalide.")
            }
            Self::InvalidWorkKey => formatter.write_str("La référence d'œuvre est invalide."),
        }
    }
}

// --- Réponses API Open Library (désérialisation interne) ---

#[derive(Debug, Deserialize)]
struct SearchResponse {
    docs: Vec<SearchDoc>,
}

#[derive(Debug, Deserialize)]
struct SearchDoc {
    key: Option<String>,
    title: Option<String>,
    author_name: Option<Vec<String>>,
    first_publish_year: Option<i32>,
    cover_i: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct WorkResponse {
    title: Option<String>,
    description: Option<WorkDescription>,
    covers: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum WorkDescription {
    Plain(String),
    Wrapped { value: String },
}

fn cover_url(cover_id: i64) -> String {
    format!("{OPENLIBRARY_COVERS_BASE}/{cover_id}-L.jpg")
}

fn join_authors(authors: Option<Vec<String>>) -> Option<String> {
    let names: Vec<String> = authors
        .unwrap_or_default()
        .into_iter()
        .take(MAX_AUTHORS)
        .collect();
    if names.is_empty() {
        None
    } else {
        Some(names.join(", "))
    }
}

fn map_search_doc(doc: SearchDoc) -> Option<OpenLibraryBookCandidateDto> {
    let work_key = doc.key?;
    let title = doc.title?;
    if title.trim().is_empty() {
        return None;
    }
    Some(OpenLibraryBookCandidateDto {
        work_key,
        title,
        author: join_authors(doc.author_name),
        first_publish_year: doc.first_publish_year,
        cover_url: doc.cover_i.map(cover_url),
    })
}

pub struct OpenLibraryClient {
    client: reqwest::Client,
}

impl OpenLibraryClient {
    pub fn new() -> Result<Self, OpenLibraryError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|_| OpenLibraryError::NetworkUnavailable)?;
        Ok(Self { client })
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, OpenLibraryError> {
        let url = format!("{OPENLIBRARY_API_BASE}{path}");
        let response = self
            .client
            .get(&url)
            .header("Accept", "application/json")
            .query(query)
            .send()
            .await
            .map_err(|_| OpenLibraryError::NetworkUnavailable)?;

        if !response.status().is_success() {
            // Open Library répond 422 aux requêtes sans terme indexable
            // (lettre unique, mot vide seul, symboles) : ce n'est ni une panne
            // ni un problème réseau, on nomme la cause réelle.
            if response.status().as_u16() == 422 {
                return Err(OpenLibraryError::UnsearchableQuery);
            }
            return Err(OpenLibraryError::ProviderError(response.status().as_u16()));
        }

        let body = crate::http::read_body_capped(response, crate::http::MAX_PROVIDER_BYTES)
            .await
            .map_err(|_| OpenLibraryError::InvalidProviderResponse)?;
        serde_json::from_slice(&body).map_err(|_| OpenLibraryError::InvalidProviderResponse)
    }

    pub async fn search_books(
        &self,
        query: &str,
    ) -> Result<Vec<OpenLibraryBookCandidateDto>, OpenLibraryError> {
        let response: SearchResponse = self
            .get(
                "/search.json",
                &[
                    ("q", query),
                    ("lang", "fr"),
                    ("limit", "20"),
                    ("fields", "key,title,author_name,first_publish_year,cover_i"),
                ],
            )
            .await?;

        Ok(response
            .docs
            .into_iter()
            .filter_map(map_search_doc)
            .take(MAX_SEARCH_RESULTS)
            .collect())
    }

    pub async fn fetch_book_presentation(
        &self,
        candidate: &OpenLibraryBookCandidateDto,
    ) -> Result<OpenLibraryBookPresentationDto, OpenLibraryError> {
        // La clé de travail attendue a la forme /works/OL123W ; on borne le chemin.
        if !candidate.work_key.starts_with("/works/") || candidate.work_key.len() > 64 {
            return Err(OpenLibraryError::InvalidWorkKey);
        }

        let work: WorkResponse = self
            .get(&format!("{}.json", candidate.work_key), &[])
            .await?;

        let synopsis = work.description.and_then(|description| {
            let text = match description {
                WorkDescription::Plain(text) => text,
                WorkDescription::Wrapped { value } => value,
            };
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.chars().take(10_000).collect())
            }
        });

        Ok(OpenLibraryBookPresentationDto {
            work_key: candidate.work_key.clone(),
            title: work
                .title
                .filter(|title| !title.trim().is_empty())
                .unwrap_or_else(|| candidate.title.clone()),
            author: candidate.author.clone(),
            first_publish_year: candidate.first_publish_year,
            synopsis,
            cover_url: candidate.cover_url.clone().or_else(|| {
                work.covers
                    .and_then(|covers| covers.first().copied())
                    .map(cover_url)
            }),
        })
    }
}

// --- Commandes Tauri ---

#[tauri::command]
pub async fn search_openlibrary_books(
    query: String,
) -> Result<Vec<OpenLibraryBookCandidateDto>, String> {
    OpenLibraryClient::new()
        .map_err(|error| error.to_string())?
        .search_books(&query)
        .await
        .map_err(|error| error.to_string())
}

/// Présentation détaillée d'une œuvre, sans écriture dans SQLite : elle sert
/// à préremplir une nouvelle fiche Livre avant sa validation.
#[tauri::command]
pub async fn preview_openlibrary_book(
    work_key: String,
    title: String,
    author: Option<String>,
    first_publish_year: Option<i32>,
    cover_url: Option<String>,
) -> Result<OpenLibraryBookPresentationDto, String> {
    let candidate = OpenLibraryBookCandidateDto {
        work_key,
        title,
        author,
        first_publish_year,
        cover_url,
    };
    OpenLibraryClient::new()
        .map_err(|error| error.to_string())?
        .fetch_book_presentation(&candidate)
        .await
        .map_err(|error| error.to_string())
}

// --- Tests ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsearchable_query_error_explains_instead_of_raw_status() {
        let message = OpenLibraryError::UnsearchableQuery.to_string();
        assert!(message.contains("aucun terme cherchable"), "{message}");
        assert!(!message.contains("422"), "{message}");
    }

    #[test]
    fn search_doc_without_title_or_key_is_dropped() {
        assert!(map_search_doc(SearchDoc {
            key: None,
            title: Some("Titre".to_string()),
            author_name: None,
            first_publish_year: None,
            cover_i: None,
        })
        .is_none());
        assert!(map_search_doc(SearchDoc {
            key: Some("/works/OL1W".to_string()),
            title: Some("   ".to_string()),
            author_name: None,
            first_publish_year: None,
            cover_i: None,
        })
        .is_none());
    }

    #[test]
    fn search_doc_maps_to_bounded_candidate() {
        let candidate = map_search_doc(SearchDoc {
            key: Some("/works/OL82563W".to_string()),
            title: Some("L'Étranger".to_string()),
            author_name: Some(vec!["Albert Camus".to_string()]),
            first_publish_year: Some(1942),
            cover_i: Some(12345),
        })
        .expect("document complet");
        assert_eq!(candidate.author.as_deref(), Some("Albert Camus"));
        assert_eq!(candidate.first_publish_year, Some(1942));
        assert_eq!(
            candidate.cover_url.as_deref(),
            Some("https://covers.openlibrary.org/b/id/12345-L.jpg")
        );
    }

    #[test]
    fn authors_are_bounded_and_joined() {
        let joined = join_authors(Some(vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "D".to_string(),
            "E".to_string(),
            "F".to_string(),
        ]));
        assert_eq!(joined.as_deref(), Some("A, B, C, D, E"));
        assert_eq!(join_authors(Some(vec![])), None);
        assert_eq!(join_authors(None), None);
    }
}
