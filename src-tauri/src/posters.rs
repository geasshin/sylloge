//! Affiches officielles d'une série ou d'un animé (galerie TMDB).
//!
//! Même source que la bannière 16:9 : la réponse de `/tv/{id}/images` porte
//! `posters` et `backdrops`. Cette commande ne lit que les affiches et rend
//! leurs adresses ; rien n'est écrit ici — l'affiche choisie est enregistrée
//! par le dépôt de l'interface dans `poster_url`.
//!
//! Le tri est fait ici, dans une fonction pure et testée : la fenêtre de choix
//! affiche la liste telle quelle. La langue française passe devant, puis les
//! affiches sans texte, puis l'anglais, puis le reste ; à l'intérieur d'un
//! groupe, la meilleure note TMDB d'abord, puis le plus de votes. Trente à
//! quarante affiches suffisent : une série célèbre en publie plusieurs
//! centaines, dont la fenêtre n'a pas besoin.

use std::cmp::Ordering;
use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::banners::{provider_identifier, valid_tmdb_path};
use crate::tmdb::{ReqwestTmdbClient, TmdbPosterEntry};

/// La fenêtre de choix défile : au-delà, personne ne cherche plus.
const MAX_POSTER_CANDIDATES: usize = 40;
const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p";
/// Taille déjà stockée pour les affiches (films, séries, animés).
const POSTER_SIZE: &str = "w500";
/// Même image en petit, pour la grille de la fenêtre.
const THUMBNAIL_SIZE: &str = "w342";

/// Une affiche proposée pour la fiche, prête à afficher.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PosterCandidateDto {
    /// Adresse en grand : TMDB `w500`, la taille des affiches enregistrées.
    pub url: String,
    /// Même affiche en petit : TMDB `w342`.
    pub thumbnail_url: String,
    /// Langue du texte incrusté ; `null` quand l'affiche n'en porte pas.
    pub language: Option<String>,
}

/// Fiche dont on cherche les affiches : séries et animés seulement, les films
/// gardent leur propre circuit (cache TMDB, `alternative_poster_urls`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PosterMedium {
    Series,
    Anime,
}

impl PosterMedium {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim() {
            "series" => Ok(Self::Series),
            "anime" => Ok(Self::Anime),
            _ => Err("Type de fiche inconnu pour une affiche.".to_string()),
        }
    }

    /// Les séries et les animés partagent le même chemin TMDB.
    fn tmdb_images_path(self, provider_id: i64) -> String {
        match self {
            Self::Series | Self::Anime => format!("/tv/{provider_id}/images"),
        }
    }
}

/// Langue normalisée d'une affiche : vide vaut absente, `xx` (le code TMDB des
/// images sans texte) aussi. Une comparaison insensible à la casse suffit pour
/// les codes à deux lettres que publie le fournisseur.
fn poster_language(raw: Option<&str>) -> Option<String> {
    let trimmed = raw?.trim().to_lowercase();
    if trimmed.is_empty() || trimmed == "xx" {
        None
    } else {
        Some(trimmed)
    }
}

/// Rang de tri d'une langue : français, sans texte, anglais, puis le reste.
fn poster_group(language: Option<&str>) -> u8 {
    match language {
        Some("fr") => 0,
        None => 1,
        Some("en") => 2,
        Some(_) => 3,
    }
}

/// Affiches TMDB → candidats, filtrés, dédoublonnés et triés.
///
/// Un chemin douteux (`../`, relatif, avec espace) est écarté par
/// `valid_tmdb_path` : l'adresse rendue est toujours sous `image.tmdb.org`.
fn ordered_poster_candidates(entries: &[TmdbPosterEntry]) -> Vec<PosterCandidateDto> {
    let mut seen = HashSet::new();
    let mut rows: Vec<(String, Option<String>, f64, u32)> = Vec::new();

    for entry in entries {
        let Some(path) = entry.file_path.as_deref().and_then(valid_tmdb_path) else {
            continue;
        };
        if !seen.insert(path.to_string()) {
            continue;
        }
        rows.push((
            path.to_string(),
            poster_language(entry.language.as_deref()),
            entry.vote_average.unwrap_or(0.0),
            entry.vote_count.unwrap_or(0),
        ));
    }

    rows.sort_by(|left, right| {
        poster_group(left.1.as_deref())
            .cmp(&poster_group(right.1.as_deref()))
            .then_with(|| right.2.partial_cmp(&left.2).unwrap_or(Ordering::Equal))
            .then_with(|| right.3.cmp(&left.3))
            // Départage stable : deux affiches également notées gardent un ordre
            // reproductible d'un appel à l'autre.
            .then_with(|| left.0.cmp(&right.0))
    });

    rows.into_iter()
        .take(MAX_POSTER_CANDIDATES)
        .map(|(path, language, _, _)| PosterCandidateDto {
            url: format!("{TMDB_IMAGE_BASE}/{POSTER_SIZE}{path}"),
            thumbnail_url: format!("{TMDB_IMAGE_BASE}/{THUMBNAIL_SIZE}{path}"),
            language,
        })
        .collect()
}

/// Affiches officielles d'une série ou d'un animé, lues une fois, sans
/// écriture.
///
/// `medium` vaut `series` ou `anime` ; `provider_id` est l'identifiant TMDB de
/// la fiche, lu dans `media_provider_links`. Les autres médiums sont refusés :
/// un film garde le cache TMDB et ses quatre alternatives, les livres, mangas,
/// jeux, l'Art et les bibliothèques ajoutées n'ont pas de galerie.
#[tauri::command]
pub async fn fetch_poster_candidates(
    medium: String,
    provider_id: String,
) -> Result<Vec<PosterCandidateDto>, String> {
    let medium = PosterMedium::parse(&medium)?;
    let provider_id = provider_identifier(&provider_id)?;
    let client = ReqwestTmdbClient::new().map_err(|error| error.to_string())?;
    let posters = client
        .fetch_posters(&medium.tmdb_images_path(provider_id))
        .await
        .map_err(|error| error.to_string())?;
    Ok(ordered_poster_candidates(&posters))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn posters(payload: &str) -> Vec<TmdbPosterEntry> {
        #[derive(Deserialize)]
        struct Response {
            posters: Vec<TmdbPosterEntry>,
        }
        serde_json::from_str::<Response>(payload)
            .expect("réponse TMDB simulée")
            .posters
    }

    #[test]
    fn a_series_and_an_anime_read_the_tv_images_path() {
        assert_eq!(
            PosterMedium::parse("series")
                .expect("série")
                .tmdb_images_path(95396),
            "/tv/95396/images"
        );
        assert_eq!(
            PosterMedium::parse("anime")
                .expect("animé")
                .tmdb_images_path(1429),
            "/tv/1429/images"
        );
    }

    #[test]
    fn a_film_or_another_medium_has_no_poster_gallery() {
        for medium in ["film", "game", "book", "livre", "manga", ""] {
            let error = PosterMedium::parse(medium).expect_err("médium refusé");
            assert!(error.contains("inconnu"), "{medium}: {error}");
        }
    }

    #[test]
    fn a_poster_needs_a_provider_identifier() {
        let error = provider_identifier("   ").expect_err("identifiant absent");
        assert!(error.contains("absent"), "{error}");
        let error = provider_identifier("abc").expect_err("identifiant invalide");
        assert!(error.contains("invalide"), "{error}");
        assert_eq!(provider_identifier(" 95396 "), Ok(95396));
    }

    #[test]
    fn posters_are_ordered_french_then_textless_then_english_then_the_rest() {
        let entries = posters(
            r#"{
                "id": 95396,
                "posters": [
                    { "file_path": "/ja.jpg", "iso_639_1": "ja", "vote_average": 9.5, "vote_count": 900 },
                    { "file_path": "/en-low.jpg", "iso_639_1": "en", "vote_average": 2.0, "vote_count": 10 },
                    { "file_path": "/none-high.jpg", "iso_639_1": null, "vote_average": 8.0, "vote_count": 300 },
                    { "file_path": "/fr.jpg", "iso_639_1": "fr", "vote_average": 3.0, "vote_count": 5 },
                    { "file_path": "/xx.jpg", "iso_639_1": "xx", "vote_average": 9.0, "vote_count": 400 },
                    { "file_path": "/en-high.jpg", "iso_639_1": "EN", "vote_average": 6.0, "vote_count": 50 },
                    { "file_path": "/none-low.jpg", "iso_639_1": null, "vote_average": 8.0, "vote_count": 20 }
                ]
            }"#,
        );

        let candidates = ordered_poster_candidates(&entries);
        assert_eq!(
            candidates
                .iter()
                .map(|candidate| candidate.url.as_str())
                .collect::<Vec<_>>(),
            vec![
                "https://image.tmdb.org/t/p/w500/fr.jpg",
                "https://image.tmdb.org/t/p/w500/xx.jpg",
                "https://image.tmdb.org/t/p/w500/none-high.jpg",
                "https://image.tmdb.org/t/p/w500/none-low.jpg",
                "https://image.tmdb.org/t/p/w500/en-high.jpg",
                "https://image.tmdb.org/t/p/w500/en-low.jpg",
                "https://image.tmdb.org/t/p/w500/ja.jpg",
            ],
            "français, sans texte, anglais, puis le reste ; note puis votes décroissants"
        );
        assert_eq!(candidates[0].language.as_deref(), Some("fr"));
        assert_eq!(
            candidates[1].language, None,
            "xx est le code TMDB des images sans texte"
        );
        assert_eq!(
            candidates[0].thumbnail_url,
            "https://image.tmdb.org/t/p/w342/fr.jpg"
        );
    }

    #[test]
    fn posters_skip_dangerous_paths_and_duplicates() {
        let entries = posters(
            r#"{
                "posters": [
                    { "file_path": "../../etc/passwd", "iso_639_1": null },
                    { "file_path": "nested.jpg", "iso_639_1": null },
                    { "file_path": "/with space.jpg", "iso_639_1": null },
                    { "file_path": "/ok.jpg", "iso_639_1": "fr" },
                    { "file_path": " /ok.jpg ", "iso_639_1": "fr" },
                    { "iso_639_1": null }
                ]
            }"#,
        );

        let candidates = ordered_poster_candidates(&entries);
        assert_eq!(candidates.len(), 1, "un seul chemin sûr et sa copie");
        assert_eq!(candidates[0].url, "https://image.tmdb.org/t/p/w500/ok.jpg");
    }

    #[test]
    fn posters_stop_at_forty_candidates() {
        let mut payload = String::from(r#"{"posters":["#);
        for index in 0..60 {
            if index > 0 {
                payload.push(',');
            }
            payload.push_str(&format!(
                r#"{{ "file_path": "/poster-{index}.jpg", "iso_639_1": null, "vote_average": {index}, "vote_count": 1 }}"#
            ));
        }
        payload.push_str("]}");
        let candidates = ordered_poster_candidates(&posters(&payload));
        assert_eq!(candidates.len(), MAX_POSTER_CANDIDATES);
        assert_eq!(
            candidates[0].url, "https://image.tmdb.org/t/p/w500/poster-59.jpg",
            "les mieux notées restent"
        );
        assert_eq!(
            candidates[MAX_POSTER_CANDIDATES - 1].url,
            "https://image.tmdb.org/t/p/w500/poster-20.jpg"
        );
    }

    #[test]
    fn a_missing_or_empty_poster_list_renders_nothing() {
        assert!(ordered_poster_candidates(&[]).is_empty());
        assert!(ordered_poster_candidates(&posters(r#"{"posters":[]}"#)).is_empty());
        assert!(
            ordered_poster_candidates(&posters(r#"{"posters":[{"file_path":null}]}"#)).is_empty()
        );
    }
}
