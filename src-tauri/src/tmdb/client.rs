use serde::{Deserialize, Serialize};

use super::TmdbError;

pub const MAX_ALTERNATIVE_POSTERS: usize = 4;
pub const MAX_CAST_MEMBERS: usize = 20;
pub const MAX_DIRECTORS: usize = 5;
pub const MAX_SEARCH_RESULTS: usize = 20;

const TMDB_API_BASE: &str = "https://sylloge.vercel.app/api/tmdb";
const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p";
const DEFAULT_LANGUAGE: &str = "fr-FR";
const REQUEST_TIMEOUT_SECONDS: u64 = 10;

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
pub struct TmdbSearchCandidateDto {
    pub tmdb_id: i64,
    pub title: String,
    pub original_title: Option<String>,
    pub release_year: Option<i32>,
    pub synopsis: Option<String>,
    pub poster_url: Option<String>,
}

/// Présentation TV bornée pour le préremplissage Séries (jalon 0.4.26) :
/// recherche et préremplissage uniquement, sans cache ni association persistée.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TmdbSeriesPresentationDto {
    pub tmdb_id: i64,
    pub title: String,
    pub original_title: Option<String>,
    pub first_air_year: Option<i32>,
    pub synopsis: Option<String>,
    pub showrunners: Vec<String>,
    pub cast: Vec<String>,
    pub seasons_total: Option<u32>,
    pub poster_url: Option<String>,
}

#[allow(async_fn_in_trait)]
pub trait TmdbClient: Send + Sync {
    async fn search_films(
        &self,
        query: &str,
        language: &str,
    ) -> Result<Vec<TmdbSearchCandidateDto>, TmdbError>;

    async fn fetch_film_presentation(
        &self,
        tmdb_id: i64,
        language: &str,
    ) -> Result<TmdbFilmPresentationDto, TmdbError>;

    async fn search_series(
        &self,
        query: &str,
        language: &str,
    ) -> Result<Vec<TmdbSearchCandidateDto>, TmdbError>;

    async fn fetch_series_presentation(
        &self,
        tmdb_id: i64,
        language: &str,
    ) -> Result<TmdbSeriesPresentationDto, TmdbError>;
}

// --- Réponses API TMDB (désérialisation interne) ---

#[derive(Debug, Deserialize)]
struct TmdbSearchResponse {
    results: Vec<TmdbSearchResult>,
}

#[derive(Debug, Deserialize)]
struct TmdbSearchResult {
    id: i64,
    title: Option<String>,
    original_title: Option<String>,
    release_date: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbMovieDetailsResponse {
    id: i64,
    title: Option<String>,
    original_title: Option<String>,
    release_date: Option<String>,
    runtime: Option<u16>,
    overview: Option<String>,
    poster_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbCreditsResponse {
    cast: Vec<TmdbCastEntry>,
    crew: Vec<TmdbCrewEntry>,
}

#[derive(Debug, Deserialize)]
struct TmdbCastEntry {
    name: Option<String>,
    character: Option<String>,
    profile_path: Option<String>,
    order: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct TmdbCrewEntry {
    name: Option<String>,
    job: Option<String>,
    profile_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbImagesResponse {
    posters: Vec<TmdbImageEntry>,
}

#[derive(Debug, Deserialize)]
struct TmdbImageEntry {
    file_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbTvSearchResponse {
    results: Vec<TmdbTvSearchResult>,
}

#[derive(Debug, Deserialize)]
struct TmdbTvSearchResult {
    id: i64,
    name: Option<String>,
    original_name: Option<String>,
    first_air_date: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbTvDetailsResponse {
    id: i64,
    name: Option<String>,
    original_name: Option<String>,
    first_air_date: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    number_of_seasons: Option<u32>,
    created_by: Vec<TmdbCreatedByEntry>,
}

#[derive(Debug, Deserialize)]
struct TmdbCreatedByEntry {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbAggregateCreditsResponse {
    cast: Vec<TmdbAggregateCastEntry>,
}

#[derive(Debug, Deserialize)]
struct TmdbAggregateCastEntry {
    name: Option<String>,
    order: Option<i32>,
}

// --- Client HTTP réel ---

pub struct ReqwestTmdbClient {
    client: reqwest::Client,
}

impl ReqwestTmdbClient {
    pub fn new() -> Result<Self, TmdbError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
            .build()
            .map_err(|_| TmdbError::NetworkUnavailable)?;
        Ok(Self { client })
    }

    fn build_url(&self, path: &str) -> String {
        format!("{TMDB_API_BASE}{path}")
    }

    fn image_url(path: &str, size: &str) -> String {
        format!("{TMDB_IMAGE_BASE}/{size}{path}")
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, TmdbError> {
        let url = self.build_url(path);
        let response = self
            .client
            .get(&url)
            .header("Accept", "application/json")
            .query(query)
            .send()
            .await
            .map_err(|_| TmdbError::NetworkUnavailable)?;

        if !response.status().is_success() {
            return Err(TmdbError::ProviderError(response.status().as_u16()));
        }

        let body = crate::http::read_body_capped(response, crate::http::MAX_PROVIDER_BYTES)
            .await
            .map_err(|_| TmdbError::InvalidProviderResponse)?;
        serde_json::from_slice(&body).map_err(|_| TmdbError::InvalidProviderResponse)
    }
}

/// Photo (185 px) du réalisateur nommé dans les crédits d'un film : celle de l'entrée « Director » dont le nom
/// correspond, sans tenir compte de la casse ni des espaces. Le nom vient d'une fiche TMDB du même film, donc
/// deux homonymes ne se confondent pas ; sans photo publiée, `None`.
fn director_portrait(crew: &[TmdbCrewEntry], name: &str) -> Option<String> {
    let wanted = name.trim().to_lowercase();
    if wanted.is_empty() {
        return None;
    }
    crew.iter()
        .filter(|member| member.job.as_deref() == Some("Director"))
        .filter(|member| {
            member
                .name
                .as_deref()
                .is_some_and(|candidate| candidate.trim().to_lowercase() == wanted)
        })
        .find_map(|member| member.profile_path.as_deref())
        .map(|path| ReqwestTmdbClient::image_url(path, "w185"))
}

impl ReqwestTmdbClient {
    /// Lit les crédits d'un film pour y trouver la photo d'un réalisateur. Un seul appel, à la demande : le cache
    /// local ne conserve que les noms des réalisateurs.
    pub async fn fetch_director_portrait(
        &self,
        tmdb_id: i64,
        name: &str,
    ) -> Result<Option<String>, TmdbError> {
        let credits: TmdbCreditsResponse = self
            .get(
                &format!("/movie/{tmdb_id}/credits"),
                &[("language", DEFAULT_LANGUAGE)],
            )
            .await?;
        Ok(director_portrait(&credits.crew, name))
    }
}

impl TmdbClient for ReqwestTmdbClient {
    async fn search_films(
        &self,
        query: &str,
        language: &str,
    ) -> Result<Vec<TmdbSearchCandidateDto>, TmdbError> {
        let language = if language.is_empty() {
            DEFAULT_LANGUAGE
        } else {
            language
        };

        let response: TmdbSearchResponse = self
            .get(
                "/search/movie",
                &[
                    ("query", query),
                    ("language", language),
                    ("include_adult", "false"),
                ],
            )
            .await?;

        let candidates = response
            .results
            .into_iter()
            .take(MAX_SEARCH_RESULTS)
            .map(|result| {
                let release_year = result
                    .release_date
                    .as_deref()
                    .and_then(|date| date.split('-').next())
                    .and_then(|year| year.parse().ok());

                TmdbSearchCandidateDto {
                    tmdb_id: result.id,
                    title: result.title.unwrap_or_default(),
                    original_title: result.original_title,
                    release_year,
                    synopsis: result.overview,
                    poster_url: result
                        .poster_path
                        .as_deref()
                        .map(|path| Self::image_url(path, "w500")),
                }
            })
            .collect();

        Ok(candidates)
    }

    async fn fetch_film_presentation(
        &self,
        tmdb_id: i64,
        language: &str,
    ) -> Result<TmdbFilmPresentationDto, TmdbError> {
        let language = if language.is_empty() {
            DEFAULT_LANGUAGE
        } else {
            language
        };

        // Détails du film
        let details: TmdbMovieDetailsResponse = self
            .get(&format!("/movie/{tmdb_id}"), &[("language", language)])
            .await?;

        // Crédits (cast + crew)
        let credits: TmdbCreditsResponse = self
            .get(
                &format!("/movie/{tmdb_id}/credits"),
                &[("language", language)],
            )
            .await?;

        // Images (affiches alternatives)
        let images: TmdbImagesResponse = self.get(&format!("/movie/{tmdb_id}/images"), &[]).await?;

        // Construction du DTO
        let directors: Vec<String> = credits
            .crew
            .iter()
            .filter(|member| member.job.as_deref() == Some("Director"))
            .filter_map(|member| member.name.clone())
            .take(MAX_DIRECTORS)
            .collect();

        let mut cast: Vec<TmdbCastMemberDto> = credits
            .cast
            .iter()
            .filter(|member| member.name.is_some())
            .take(MAX_CAST_MEMBERS)
            .map(|member| TmdbCastMemberDto {
                name: member.name.clone().unwrap_or_default(),
                character: member.character.clone(),
                portrait_url: member
                    .profile_path
                    .as_deref()
                    .map(|path| Self::image_url(path, "w185")),
            })
            .collect();

        // Tri déterministe par ordre de billing si disponible
        cast.sort_by_key(|member| {
            credits
                .cast
                .iter()
                .find(|m| m.name.as_deref() == Some(&member.name))
                .and_then(|m| m.order)
                .unwrap_or(u32::MAX)
        });

        let mut alternative_poster_urls: Vec<String> = images
            .posters
            .iter()
            .filter_map(|image| image.file_path.as_deref())
            .take(MAX_ALTERNATIVE_POSTERS + 1) // +1 car on va filtrer l'affiche principale
            .map(|path| Self::image_url(path, "w500"))
            .collect();

        // Exclure l'affiche principale des alternatives
        if let Some(ref main_poster) = details.poster_path {
            let main_url = Self::image_url(main_poster, "w500");
            alternative_poster_urls.retain(|url| url != &main_url);
        }
        alternative_poster_urls.truncate(MAX_ALTERNATIVE_POSTERS);

        Ok(TmdbFilmPresentationDto {
            tmdb_id: details.id,
            title: details.title.unwrap_or_default(),
            original_title: details.original_title,
            release_date: details.release_date,
            runtime_minutes: details.runtime,
            synopsis: details.overview,
            directors,
            poster_url: details
                .poster_path
                .as_deref()
                .map(|path| Self::image_url(path, "w500")),
            alternative_poster_urls,
            cast,
        })
    }

    async fn search_series(
        &self,
        query: &str,
        language: &str,
    ) -> Result<Vec<TmdbSearchCandidateDto>, TmdbError> {
        let language = if language.is_empty() {
            DEFAULT_LANGUAGE
        } else {
            language
        };

        let response: TmdbTvSearchResponse = self
            .get(
                "/search/tv",
                &[
                    ("query", query),
                    ("language", language),
                    ("include_adult", "false"),
                ],
            )
            .await?;

        let candidates = response
            .results
            .into_iter()
            .take(MAX_SEARCH_RESULTS)
            .map(|result| {
                let release_year = result
                    .first_air_date
                    .as_deref()
                    .and_then(|date| date.split('-').next())
                    .and_then(|year| year.parse().ok());

                TmdbSearchCandidateDto {
                    tmdb_id: result.id,
                    title: result.name.unwrap_or_default(),
                    original_title: result.original_name,
                    release_year,
                    synopsis: result.overview,
                    poster_url: result
                        .poster_path
                        .as_deref()
                        .map(|path| Self::image_url(path, "w500")),
                }
            })
            .collect();

        Ok(candidates)
    }

    async fn fetch_series_presentation(
        &self,
        tmdb_id: i64,
        language: &str,
    ) -> Result<TmdbSeriesPresentationDto, TmdbError> {
        let language = if language.is_empty() {
            DEFAULT_LANGUAGE
        } else {
            language
        };

        let details: TmdbTvDetailsResponse = self
            .get(&format!("/tv/{tmdb_id}"), &[("language", language)])
            .await?;

        let credits: TmdbAggregateCreditsResponse = self
            .get(&format!("/tv/{tmdb_id}/credits"), &[("language", language)])
            .await?;

        let showrunners: Vec<String> = details
            .created_by
            .iter()
            .filter_map(|creator| creator.name.clone())
            .take(MAX_DIRECTORS)
            .collect();

        let mut cast_entries: Vec<&TmdbAggregateCastEntry> = credits
            .cast
            .iter()
            .filter(|member| member.name.is_some())
            .collect();
        cast_entries.sort_by_key(|member| member.order.unwrap_or(i32::MAX));
        let cast: Vec<String> = cast_entries
            .into_iter()
            .take(MAX_CAST_MEMBERS)
            .map(|member| member.name.clone().unwrap_or_default())
            .collect();

        let first_air_year = details
            .first_air_date
            .as_deref()
            .and_then(|date| date.split('-').next())
            .and_then(|year| year.parse().ok());

        Ok(TmdbSeriesPresentationDto {
            tmdb_id: details.id,
            title: details.name.unwrap_or_default(),
            original_title: details.original_name,
            first_air_year,
            synopsis: details.overview,
            showrunners,
            cast,
            seasons_total: details.number_of_seasons,
            poster_url: details
                .poster_path
                .as_deref()
                .map(|path| Self::image_url(path, "w500")),
        })
    }
}

// --- Validation ---

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

/// Validation bornée de la présentation TV (jalon 0.4.26), sans écriture ni cache.
pub fn validate_series_presentation(
    presentation: &TmdbSeriesPresentationDto,
) -> Result<(), TmdbError> {
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
        presentation.synopsis.as_deref(),
        10_000,
        "synopsis incorrect",
    )?;

    if presentation.showrunners.len() > MAX_DIRECTORS {
        return Err(TmdbError::InvalidCache("trop de showrunners"));
    }
    for showrunner in &presentation.showrunners {
        validate_required_text(showrunner, 500, "showrunner incorrect")?;
    }

    if presentation.cast.len() > MAX_CAST_MEMBERS {
        return Err(TmdbError::InvalidCache("casting trop long"));
    }
    for member in &presentation.cast {
        validate_required_text(member, 500, "nom de casting incorrect")?;
    }

    if presentation.seasons_total.is_some_and(|total| total > 500) {
        return Err(TmdbError::InvalidCache("nombre de saisons incorrect"));
    }
    validate_optional_https_url(presentation.poster_url.as_deref())?;

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
    match value {
        // TMDB renvoie souvent des chaînes vides pour les champs absents
        // (personnage de casting, synopsis manquant…). Vide = absent : on
        // accepte, on ne rejette pas la fiche entière pour autant.
        None => Ok(()),
        Some(value) if value.trim().is_empty() => Ok(()),
        Some(value) => validate_required_text(value, max_characters, error),
    }
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

// --- Tests ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn director_portrait_matches_the_credited_director_only() {
        let crew = vec![
            TmdbCrewEntry {
                name: Some("Jane Producer".to_string()),
                job: Some("Producer".to_string()),
                profile_path: Some("/producer.jpg".to_string()),
            },
            TmdbCrewEntry {
                name: Some("  Céline Sciamma ".to_string()),
                job: Some("Director".to_string()),
                profile_path: None,
            },
            TmdbCrewEntry {
                name: Some("Céline Sciamma".to_string()),
                job: Some("Director".to_string()),
                profile_path: Some("/celine.jpg".to_string()),
            },
        ];
        assert_eq!(
            director_portrait(&crew, "céline sciamma"),
            Some("https://image.tmdb.org/t/p/w185/celine.jpg".to_string()),
            "casse et espaces ignorés, première entrée avec une photo"
        );
        assert_eq!(
            director_portrait(&crew, "Jane Producer"),
            None,
            "un producteur n'est pas le réalisateur"
        );
        assert_eq!(director_portrait(&crew, "Inconnu"), None);
        assert_eq!(director_portrait(&crew, "   "), None);
    }

    struct FakeTmdbClient;

    impl TmdbClient for FakeTmdbClient {
        async fn search_films(
            &self,
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

        async fn search_series(
            &self,
            query: &str,
            _language: &str,
        ) -> Result<Vec<TmdbSearchCandidateDto>, TmdbError> {
            Ok(vec![TmdbSearchCandidateDto {
                tmdb_id: 43,
                title: query.to_string(),
                original_title: None,
                release_year: Some(2026),
                synopsis: None,
                poster_url: None,
            }])
        }

        async fn fetch_series_presentation(
            &self,
            tmdb_id: i64,
            _language: &str,
        ) -> Result<TmdbSeriesPresentationDto, TmdbError> {
            Ok(TmdbSeriesPresentationDto {
                tmdb_id,
                title: "Série factice".to_string(),
                original_title: None,
                first_air_year: Some(2026),
                synopsis: Some("Une intrigue factice.".to_string()),
                showrunners: vec!["Showrunner Factice".to_string()],
                cast: vec!["Acteur Factice".to_string()],
                seasons_total: Some(3),
                poster_url: None,
            })
        }
    }

    #[test]
    fn injectable_fake_client_returns_only_bounded_dtos() {
        tauri::async_runtime::block_on(async {
            let client = FakeTmdbClient;

            let candidates = client
                .search_films("Film de test", "fr-FR")
                .await
                .expect("recherche factice");
            assert_eq!(candidates.len(), 1);
            assert!(candidates.len() <= MAX_SEARCH_RESULTS);

            let presentation = client
                .fetch_film_presentation(candidates[0].tmdb_id, "fr-FR")
                .await
                .expect("présentation factice");
            validate_presentation(&presentation).expect("DTO factice borné");
        });
    }

    #[test]
    fn series_fake_client_returns_bounded_presentation() {
        tauri::async_runtime::block_on(async {
            let client = FakeTmdbClient;

            let candidates = client
                .search_series("Série de test", "fr-FR")
                .await
                .expect("recherche séries factice");
            assert_eq!(candidates.len(), 1);

            let presentation = client
                .fetch_series_presentation(candidates[0].tmdb_id, "fr-FR")
                .await
                .expect("présentation séries factice");
            validate_series_presentation(&presentation).expect("DTO séries factice borné");
            assert_eq!(presentation.seasons_total, Some(3));
        });
    }

    #[test]
    fn image_url_constructs_valid_https_url() {
        let url = ReqwestTmdbClient::image_url("/abc123.jpg", "w500");
        assert!(url.starts_with("https://"));
        assert!(url.contains("image.tmdb.org"));
        assert!(url.contains("w500"));
        assert!(url.ends_with(".jpg"));
    }

    // 0.6.11 : TMDB renvoie souvent `character = ""` pour un membre de casting
    // sans personnage nommé. Vide = absent, la fiche ne doit pas être rejetée.
    #[test]
    fn optional_text_treats_empty_string_as_absent() {
        validate_optional_text(Some(""), 500, "personnage incorrect")
            .expect("une chaîne vide est une valeur absente");
        validate_optional_text(Some("   "), 500, "personnage incorrect")
            .expect("une chaîne blanche est une valeur absente");
        validate_optional_text(None, 500, "personnage incorrect").expect("absent est valide");
        assert!(
            validate_optional_text(
                Some("Nom dépassant la limite".repeat(60).as_str()),
                500,
                "personnage incorrect"
            )
            .is_err(),
            "au-delà de la borne, l'erreur reste levée"
        );
    }

    #[test]
    fn search_result_maps_to_candidate() {
        let result = TmdbSearchResult {
            id: 123,
            title: Some("Le Film".to_string()),
            original_title: Some("The Movie".to_string()),
            release_date: Some("2024-05-15".to_string()),
            overview: Some("Un synopsis.".to_string()),
            poster_path: Some("/poster.jpg".to_string()),
        };

        let release_year = result
            .release_date
            .as_deref()
            .and_then(|date| date.split('-').next())
            .and_then(|year| year.parse().ok());

        assert_eq!(release_year, Some(2024));
    }
}
