use serde::{Deserialize, Serialize};

use super::secrets::SecretValue;
use super::TmdbError;

pub const MAX_ALTERNATIVE_POSTERS: usize = 4;
pub const MAX_CAST_MEMBERS: usize = 20;
pub const MAX_DIRECTORS: usize = 5;
#[allow(dead_code)]
pub const MAX_SEARCH_RESULTS: usize = 20;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TmdbCastMemberDto {
    pub name: String,
    pub character: Option<String>,
    pub portrait_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TmdbFilmPresentationDto {
    pub tmdb_id: i64,
    pub title: String,
    pub original_title: Option<String>,
    pub release_date: Option<String>,
    pub runtime_minutes: Option<u16>,
    pub synopsis: Option<String>,
    pub directors: Vec<String>,
    pub poster_url: Option<String>,
    pub alternative_poster_urls: Vec<String>,
    pub cast: Vec<TmdbCastMemberDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(dead_code)]
pub struct TmdbSearchCandidateDto {
    pub tmdb_id: i64,
    pub title: String,
    pub original_title: Option<String>,
    pub release_year: Option<i32>,
    pub synopsis: Option<String>,
    pub poster_url: Option<String>,
}

#[allow(async_fn_in_trait)]
#[allow(dead_code)]
pub trait TmdbClient: Send + Sync {
    async fn search_films(
        &self,
        secret: &SecretValue,
        query: &str,
        language: &str,
    ) -> Result<Vec<TmdbSearchCandidateDto>, TmdbError>;

    async fn fetch_film_presentation(
        &self,
        secret: &SecretValue,
        tmdb_id: i64,
        language: &str,
    ) -> Result<TmdbFilmPresentationDto, TmdbError>;
}

pub fn validate_presentation(presentation: &TmdbFilmPresentationDto) -> Result<(), TmdbError> {
    if presentation.tmdb_id <= 0 {
        return Err(TmdbError::InvalidCache("identifiant fournisseur incorrect"));
    }
    validate_required_text(&presentation.title, 500, "titre incorrect")?;
    validate_optional_text(
        presentation.original_title.as_deref(),
        500,
        "titre original incorrect",
    )?;
    validate_optional_text(
        presentation.release_date.as_deref(),
        32,
        "date de sortie incorrecte",
    )?;
    validate_optional_text(
        presentation.synopsis.as_deref(),
        10_000,
        "synopsis incorrect",
    )?;

    if presentation
        .runtime_minutes
        .is_some_and(|runtime| runtime > 1_440)
    {
        return Err(TmdbError::InvalidCache("durée incorrecte"));
    }
    if presentation.directors.len() > MAX_DIRECTORS {
        return Err(TmdbError::InvalidCache("trop de réalisateurs"));
    }
    for director in &presentation.directors {
        validate_required_text(director, 500, "réalisateur incorrect")?;
    }

    validate_optional_https_url(presentation.poster_url.as_deref())?;
    if presentation.alternative_poster_urls.len() > MAX_ALTERNATIVE_POSTERS {
        return Err(TmdbError::InvalidCache("trop d’affiches alternatives"));
    }
    for url in &presentation.alternative_poster_urls {
        validate_https_url(url)?;
    }

    if presentation.cast.len() > MAX_CAST_MEMBERS {
        return Err(TmdbError::InvalidCache("casting trop long"));
    }
    for member in &presentation.cast {
        validate_required_text(&member.name, 500, "nom de casting incorrect")?;
        validate_optional_text(member.character.as_deref(), 500, "personnage incorrect")?;
        validate_optional_https_url(member.portrait_url.as_deref())?;
    }

    Ok(())
}

fn validate_required_text(
    value: &str,
    max_characters: usize,
    error: &'static str,
) -> Result<(), TmdbError> {
    if value.trim().is_empty() || value.chars().count() > max_characters {
        return Err(TmdbError::InvalidCache(error));
    }
    Ok(())
}

fn validate_optional_text(
    value: Option<&str>,
    max_characters: usize,
    error: &'static str,
) -> Result<(), TmdbError> {
    if let Some(value) = value {
        validate_required_text(value, max_characters, error)?;
    }
    Ok(())
}

fn validate_optional_https_url(value: Option<&str>) -> Result<(), TmdbError> {
    if let Some(value) = value {
        validate_https_url(value)?;
    }
    Ok(())
}

fn validate_https_url(value: &str) -> Result<(), TmdbError> {
    let Some(host) = value
        .strip_prefix("https://")
        .and_then(|remainder| remainder.split('/').next())
    else {
        return Err(TmdbError::InvalidCache("URL distante incorrecte"));
    };
    if value.len() > 2_048
        || host.is_empty()
        || value
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(TmdbError::InvalidCache("URL distante incorrecte"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeTmdbClient;

    impl TmdbClient for FakeTmdbClient {
        async fn search_films(
            &self,
            _secret: &SecretValue,
            query: &str,
            _language: &str,
        ) -> Result<Vec<TmdbSearchCandidateDto>, TmdbError> {
            Ok(vec![TmdbSearchCandidateDto {
                tmdb_id: 42,
                title: query.to_string(),
                original_title: None,
                release_year: Some(2026),
                synopsis: None,
                poster_url: None,
            }])
        }

        async fn fetch_film_presentation(
            &self,
            _secret: &SecretValue,
            tmdb_id: i64,
            _language: &str,
        ) -> Result<TmdbFilmPresentationDto, TmdbError> {
            Ok(TmdbFilmPresentationDto {
                tmdb_id,
                title: "Film factice".to_string(),
                original_title: None,
                release_date: None,
                runtime_minutes: None,
                synopsis: None,
                directors: Vec::new(),
                poster_url: None,
                alternative_poster_urls: Vec::new(),
                cast: Vec::new(),
            })
        }
    }

    #[test]
    fn injectable_fake_client_returns_only_bounded_dtos() {
        tauri::async_runtime::block_on(async {
            let client = FakeTmdbClient;
            let secret = SecretValue::new("fake-token-for-client".to_string());

            let candidates = client
                .search_films(&secret, "Film de test", "fr-FR")
                .await
                .expect("recherche factice");
            assert_eq!(candidates.len(), 1);
            assert!(candidates.len() <= MAX_SEARCH_RESULTS);

            let presentation = client
                .fetch_film_presentation(&secret, candidates[0].tmdb_id, "fr-FR")
                .await
                .expect("présentation factice");
            validate_presentation(&presentation).expect("DTO factice borné");
        });
    }
}
