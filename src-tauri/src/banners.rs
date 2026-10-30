//! Images officielles proposées pour la bannière 16:9 d'une fiche.
//!
//! Une bannière est l'adresse d'une image, jamais un fichier : cette commande
//! ne fait que lire les visuels publiés par le fournisseur et rendre leurs
//! adresses. Rien n'est écrit ici — la bannière choisie est enregistrée par le
//! dépôt de l'interface dans `banner_url` (migration 0026).
//!
//! Cibles : décors TMDB pour un film (`/movie/{id}/images`), une série ou un
//! animé (`/tv/{id}/images`) ; illustrations puis captures IGDB pour un jeu
//! (requête `games` sur `artworks`/`screenshots`, sans endpoint séparé). Tout
//! passe par le relais du projet, et la fenêtre de choix ne joint donc aucun
//! service elle-même (`connect-src 'self' ipc:`).
//!
//! Le filtrage géométrique est fait ici et dans `src/domain/bannerImages.ts` :
//! le natif écarte ce qui n'est visiblement pas un bandeau, l'interface choisit
//! l'ordre (sans texte, puis la langue) et borne la liste à 24.

use serde::{Deserialize, Serialize};

use crate::igdb::{IgdbClient, IgdbImageEntry};
use crate::tmdb::{ReqwestTmdbClient, TmdbBackdropEntry};

/// Marge avant la fenêtre de choix de l'interface (qui n'en garde que 24).
const MAX_CANDIDATES: usize = 40;
/// Fenêtre de format d'un bandeau : du 16:10 au 2:1.
const MIN_RATIO: f64 = 1.6;
const MAX_RATIO: f64 = 2.0;
/// En dessous, l'image est agrandie et perd en netteté sur toute la largeur.
const MIN_WIDTH: u32 = 1280;
/// Tolérance sur 16:9 (1,777…) et 2:1, pour une valeur arrondie par le fournisseur.
const RATIO_EPSILON: f64 = 0.005;

const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p";
const IGDB_IMAGE_BASE: &str = "https://images.igdb.com/igdb/image/upload";

/// Une image proposée pour la bannière, prête à afficher.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BannerCandidateDto {
    /// Adresse en grand : TMDB `original` (1 920 px ou plus : `w1280` paraît
    /// flou sur un bandeau pleine largeur d'écran Retina), IGDB `t_1080p`.
    pub url: String,
    /// Même image en petit : TMDB `w780`, IGDB `t_screenshot_med`.
    pub thumbnail_url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Langue du texte incrusté (`iso_639_1`) ; `null` quand l'image n'en porte pas.
    pub language: Option<String>,
    /// `tmdb` ou `igdb`, pour l'attribution affichée par la fenêtre.
    pub source: String,
}

/// Fiche dont on cherche la bannière : elle décide du fournisseur et du chemin.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BannerMedium {
    Film,
    Series,
    Anime,
    Game,
}

impl BannerMedium {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim() {
            "film" => Ok(Self::Film),
            "series" => Ok(Self::Series),
            "anime" => Ok(Self::Anime),
            "game" => Ok(Self::Game),
            _ => Err("Type de fiche inconnu pour une bannière.".to_string()),
        }
    }

    /// Chemin TMDB des décors ; `None` pour un jeu (IGDB).
    fn tmdb_images_path(self, provider_id: i64) -> Option<String> {
        match self {
            Self::Film => Some(format!("/movie/{provider_id}/images")),
            Self::Series | Self::Anime => Some(format!("/tv/{provider_id}/images")),
            Self::Game => None,
        }
    }
}

/// Identifiant fournisseur exigé : sans lui, aucune image officielle n'existe.
fn provider_identifier(raw: &str) -> Result<i64, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(
            "L’identifiant du fournisseur est absent : aucune image officielle ne peut être proposée."
                .to_string(),
        );
    }
    trimmed
        .parse::<i64>()
        .map_err(|_| "L’identifiant du fournisseur est invalide.".to_string())
}

/// Un bandeau est paysage, assez large, et proche de 16:9 ou 2:1. Des
/// dimensions absentes ne disqualifient pas : l'affichage jugera.
fn is_banner_shape(width: Option<u32>, height: Option<u32>) -> bool {
    let (Some(width), Some(height)) = (width, height) else {
        return true;
    };
    if width == 0 || height == 0 {
        return false;
    }
    let ratio = f64::from(width) / f64::from(height);
    width >= MIN_WIDTH && (MIN_RATIO - RATIO_EPSILON..=MAX_RATIO + RATIO_EPSILON).contains(&ratio)
}

/// Chemin TMDB acceptable : racine absolue, sans remontée ni espace.
fn valid_tmdb_path(path: &str) -> Option<&str> {
    let trimmed = path.trim();
    if trimmed.starts_with('/')
        && trimmed.len() > 1
        && !trimmed.contains("..")
        && !trimmed.chars().any(|character| character.is_whitespace())
    {
        Some(trimmed)
    } else {
        None
    }
}

/// Décors TMDB → candidats. Le fichier absent ou douteux est écarté ; l'ordre
/// du fournisseur est conservé, l'interface décidera de l'ordre final.
fn tmdb_banner_candidates(entries: &[TmdbBackdropEntry]) -> Vec<BannerCandidateDto> {
    let mut candidates = Vec::new();
    for entry in entries {
        let Some(path) = entry.file_path.as_deref().and_then(valid_tmdb_path) else {
            continue;
        };
        if !is_banner_shape(entry.width, entry.height) {
            continue;
        }
        let language = entry
            .language
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        candidates.push(BannerCandidateDto {
            url: format!("{TMDB_IMAGE_BASE}/original{path}"),
            thumbnail_url: format!("{TMDB_IMAGE_BASE}/w780{path}"),
            width: entry.width,
            height: entry.height,
            language,
            source: "tmdb".to_string(),
        });
        if candidates.len() == MAX_CANDIDATES {
            break;
        }
    }
    candidates
}

/// Identifiant d'image IGDB acceptable : simple jeton, sans chemin.
fn valid_igdb_image_id(image_id: &str) -> Option<&str> {
    let trimmed = image_id.trim();
    if trimmed.is_empty()
        || trimmed.len() > 64
        || !trimmed
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(trimmed)
}

/// Visuels IGDB → candidats. Les illustrations officielles passent avant les
/// captures ; une même image n'est proposée qu'une fois, et la liste est
/// bornée comme celle de TMDB.
fn igdb_banner_candidates(
    artworks: &[IgdbImageEntry],
    screenshots: &[IgdbImageEntry],
) -> Vec<BannerCandidateDto> {
    let mut candidates = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for entry in artworks.iter().chain(screenshots.iter()) {
        if candidates.len() == MAX_CANDIDATES {
            break;
        }
        let Some(image_id) = entry.image_id.as_deref().and_then(valid_igdb_image_id) else {
            continue;
        };
        if !seen.insert(image_id.to_string()) || !is_banner_shape(entry.width, entry.height) {
            continue;
        }
        candidates.push(BannerCandidateDto {
            url: format!("{IGDB_IMAGE_BASE}/t_1080p/{image_id}.jpg"),
            thumbnail_url: format!("{IGDB_IMAGE_BASE}/t_screenshot_med/{image_id}.jpg"),
            width: entry.width,
            height: entry.height,
            // IGDB ne publie pas la langue du texte incrusté : l'image est
            // traitée comme « sans texte » par l'interface.
            language: None,
            source: "igdb".to_string(),
        });
    }
    candidates
}

/// Images officielles d'une fiche, lues une fois, sans écriture.
///
/// `medium` vaut `film`, `series`, `anime` ou `game` ; `provider_id` est
/// l'identifiant TMDB (film, série, animé) ou IGDB (jeu) déjà associé à la
/// fiche. Sans identifiant, la commande refuse : il n'existe pas de bannière
/// par défaut.
#[tauri::command]
pub async fn fetch_banner_candidates(
    medium: String,
    provider_id: String,
) -> Result<Vec<BannerCandidateDto>, String> {
    let medium = BannerMedium::parse(&medium)?;
    let provider_id = provider_identifier(&provider_id)?;

    if let Some(path) = medium.tmdb_images_path(provider_id) {
        let client = ReqwestTmdbClient::new().map_err(|error| error.to_string())?;
        let backdrops = client
            .fetch_backdrops(&path)
            .await
            .map_err(|error| error.to_string())?;
        return Ok(tmdb_banner_candidates(&backdrops));
    }

    let client = IgdbClient::new().map_err(|error| error.to_string())?;
    let (artworks, screenshots) = client
        .fetch_game_images(provider_id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(igdb_banner_candidates(&artworks, &screenshots))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn backdrops(payload: &str) -> Vec<TmdbBackdropEntry> {
        #[derive(Deserialize)]
        struct Response {
            backdrops: Vec<TmdbBackdropEntry>,
        }
        serde_json::from_str::<Response>(payload)
            .expect("réponse TMDB simulée")
            .backdrops
    }

    #[test]
    fn a_film_and_a_series_read_their_own_tmdb_path() {
        assert_eq!(
            BannerMedium::parse("film")
                .expect("film")
                .tmdb_images_path(550),
            Some("/movie/550/images".to_string())
        );
        assert_eq!(
            BannerMedium::parse("series")
                .expect("série")
                .tmdb_images_path(95396),
            Some("/tv/95396/images".to_string())
        );
        assert_eq!(
            BannerMedium::parse("anime")
                .expect("animé")
                .tmdb_images_path(1429),
            Some("/tv/1429/images".to_string())
        );
        assert_eq!(
            BannerMedium::parse("game")
                .expect("jeu")
                .tmdb_images_path(237895),
            None,
            "un jeu ne passe pas par TMDB"
        );
        assert!(BannerMedium::parse("livre").is_err());
    }

    #[test]
    fn a_banner_needs_a_provider_identifier() {
        let error = provider_identifier("   ").expect_err("identifiant absent");
        assert!(error.contains("absent"), "{error}");
        let error = provider_identifier("abc").expect_err("identifiant invalide");
        assert!(error.contains("invalide"), "{error}");
        assert_eq!(provider_identifier(" 550 "), Ok(550));
    }

    #[test]
    fn tmdb_backdrops_build_original_addresses_and_their_thumbnails() {
        let entries = backdrops(
            r#"{
                "id": 550,
                "backdrops": [
                    { "file_path": "/no-text.jpg", "width": 3840, "height": 2160, "iso_639_1": null },
                    { "file_path": "/french.jpg", "width": 1920, "height": 1080, "iso_639_1": "fr" },
                    { "file_path": "/portrait.jpg", "width": 1000, "height": 1500, "iso_639_1": "en" },
                    { "file_path": "/small.jpg", "width": 780, "height": 439, "iso_639_1": null },
                    { "width": 1920, "height": 1080 }
                ]
            }"#,
        );

        let candidates = tmdb_banner_candidates(&entries);
        assert_eq!(
            candidates.len(),
            2,
            "portrait, trop petit et sans fichier écartés"
        );
        assert_eq!(
            candidates[0],
            BannerCandidateDto {
                url: "https://image.tmdb.org/t/p/original/no-text.jpg".to_string(),
                thumbnail_url: "https://image.tmdb.org/t/p/w780/no-text.jpg".to_string(),
                width: Some(3840),
                height: Some(2160),
                language: None,
                source: "tmdb".to_string(),
            }
        );
        assert_eq!(candidates[1].language.as_deref(), Some("fr"));
        assert_eq!(
            candidates[1].thumbnail_url,
            "https://image.tmdb.org/t/p/w780/french.jpg"
        );
    }

    #[test]
    fn tmdb_backdrops_skip_a_path_that_tries_to_escape_the_image_host() {
        let entries = backdrops(
            r#"{
                "backdrops": [
                    { "file_path": "../../etc/passwd", "width": 1920, "height": 1080 },
                    { "file_path": "nested.jpg", "width": 1920, "height": 1080 },
                    { "file_path": "/ok.jpg", "width": 1920, "height": 1080 }
                ]
            }"#,
        );
        let candidates = tmdb_banner_candidates(&entries);
        assert_eq!(candidates.len(), 1);
        assert_eq!(
            candidates[0].url,
            "https://image.tmdb.org/t/p/original/ok.jpg"
        );
    }

    #[test]
    fn igdb_artworks_come_before_screenshots_with_their_two_sizes() {
        let payload = r#"[
            {
                "id": 237895,
                "artworks": [
                    { "image_id": "ar1", "width": 1920, "height": 1080 },
                    { "image_id": "ar2", "width": 1080, "height": 1080 },
                    { "image_id": "../evil" }
                ],
                "screenshots": [
                    { "image_id": "sc1", "width": 1920, "height": 1080 },
                    { "image_id": "ar1", "width": 1920, "height": 1080 }
                ]
            }
        ]"#;

        #[derive(Deserialize)]
        struct Images {
            #[serde(default)]
            artworks: Vec<IgdbImageEntry>,
            #[serde(default)]
            screenshots: Vec<IgdbImageEntry>,
        }
        let images: Images = serde_json::from_str::<Vec<Images>>(payload)
            .expect("réponse IGDB simulée")
            .pop()
            .expect("une fiche");

        let candidates = igdb_banner_candidates(&images.artworks, &images.screenshots);
        assert_eq!(
            candidates
                .iter()
                .map(|candidate| candidate.url.as_str())
                .collect::<Vec<_>>(),
            vec![
                "https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg",
                "https://images.igdb.com/igdb/image/upload/t_1080p/sc1.jpg",
            ],
            "carré, identifiant douteux et doublon écartés ; artworks puis captures"
        );
        assert_eq!(
            candidates[0].thumbnail_url,
            "https://images.igdb.com/igdb/image/upload/t_screenshot_med/ar1.jpg"
        );
        assert_eq!(candidates[0].source, "igdb");
        assert_eq!(candidates[0].language, None);
    }

    #[test]
    fn banner_shape_accepts_missing_dimensions_and_rejects_the_rest() {
        assert!(is_banner_shape(None, None));
        assert!(is_banner_shape(Some(1920), Some(1080)));
        assert!(is_banner_shape(Some(1600), Some(1000)));
        assert!(!is_banner_shape(Some(1080), Some(1080)));
        assert!(!is_banner_shape(Some(2400), Some(1000)));
        assert!(!is_banner_shape(Some(1280), Some(0)));
    }
}
