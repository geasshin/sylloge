//! Les octets d'une image distante, pour la carte à partager.
//!
//! Constat du 25 octobre 2026 : `image.tmdb.org` ne renvoie plus d'autorisation inter-sites
//! (`access-control-allow-origin`), alors qu'il la renvoyait avant son passage à BunnyCDN. Une image
//! chargée par la fenêtre avec `crossOrigin` est donc refusée, alors que la même image s'affiche sans
//! cette option — c'est pourquoi les bibliothèques montrent les affiches et la carte retombait sur les
//! titres. Le dessin sur canevas exige pourtant cette autorisation, sinon le canevas est « contaminé »
//! et le PNG impossible.
//!
//! La fenêtre ne demande donc plus l'image au serveur : elle demande ses octets à Rust, puis dessine un
//! blob de même origine. Cela vaut pour toutes les sources (TMDB, affiche collée à la main, autre
//! fournisseur), sans dépendre de la bonne volonté d'un CDN. Rien n'est écrit sur le disque.

use std::net::IpAddr;
use std::time::Duration;

/// Taille maximale acceptée pour une image : une affiche TMDB en `w500` pèse moins de 500 Ko.
const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const TIMEOUT_SECONDS: u64 = 20;

/// Vrai pour une adresse qui désigne cette machine ou le réseau local : la fenêtre n'a aucune raison
/// d'y chercher une affiche, et une fiche ne doit pas pouvoir servir de sonde interne.
fn is_local_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return true;
    }
    if host.starts_with('[') {
        // Adresse IPv6 entre crochets : `reqwest::Url::host_str` rend la forme entre crochets.
        let inner = host.trim_start_matches('[').trim_end_matches(']');
        return inner
            .parse::<IpAddr>()
            .map(|address| is_local_address(&address))
            .unwrap_or(false);
    }
    host.parse::<IpAddr>()
        .map(|address| is_local_address(&address))
        .unwrap_or(false)
}

fn is_local_address(address: &IpAddr) -> bool {
    match address {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

/// Adresse acceptée : `http` ou `https` seulement, jamais une adresse locale.
pub fn validate_image_url(raw: &str) -> Result<reqwest::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Adresse d’image vide.".to_string());
    }
    let url = reqwest::Url::parse(trimmed).map_err(|_| "Adresse d’image illisible.".to_string())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("Seules les adresses http et https sont acceptées.".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Adresse d’image sans hôte.".to_string())?;
    if is_local_host(host) {
        return Err("Adresse locale refusée.".to_string());
    }
    Ok(url)
}

/// Les octets d'une image distante, rendus à la fenêtre sans passer par une chaîne JSON.
#[tauri::command]
pub async fn fetch_remote_image(url: String) -> Result<tauri::ipc::Response, String> {
    let url = validate_image_url(&url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECONDS))
        .build()
        .map_err(|_| "Le client réseau n’a pas pu être préparé.".to_string())?;
    let response = client
        .get(url)
        .header("Accept", "image/*")
        .send()
        .await
        .map_err(|_| "L’image n’a pas pu être téléchargée.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Le serveur a refusé l’image ({}).",
            response.status().as_u16()
        ));
    }
    if let Some(content_type) = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
    {
        if !content_type.to_ascii_lowercase().starts_with("image/") {
            return Err("L’adresse ne renvoie pas une image.".to_string());
        }
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "L’image n’a pas pu être lue.".to_string())?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("L’image est trop volumineuse pour la carte.".to_string());
    }
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepte_les_adresses_publiques_http_et_https() {
        assert!(validate_image_url("https://image.tmdb.org/t/p/w500/affiche.jpg").is_ok());
        assert!(validate_image_url("https://exemple.test/une/image.png").is_ok());
        assert!(validate_image_url("http://exemple.test/une/image.png").is_ok());
        // Les espaces autour d'une adresse collée à la main sont sans conséquence.
        assert!(validate_image_url("  https://image.tmdb.org/t/p/w500/affiche.jpg  ").is_ok());
    }

    #[test]
    fn refuse_les_schemas_qui_ne_sont_pas_du_web() {
        assert!(validate_image_url("file:///Users/personne/photo.jpg").is_err());
        assert!(validate_image_url("data:image/png;base64,AAAA").is_err());
        assert!(validate_image_url("javascript:alert(1)").is_err());
        assert!(validate_image_url("").is_err());
        assert!(validate_image_url("pas une adresse").is_err());
    }

    #[test]
    fn refuse_les_adresses_de_la_machine_et_du_reseau_local() {
        for address in [
            "http://localhost/affiche.jpg",
            "http://127.0.0.1:8080/affiche.jpg",
            "http://[::1]/affiche.jpg",
            "http://192.168.1.20/affiche.jpg",
            "http://10.0.0.5/affiche.jpg",
            "http://172.16.4.4/affiche.jpg",
            "http://169.254.1.1/affiche.jpg",
            "http://imprimante.local/affiche.jpg",
            "http://0.0.0.0/affiche.jpg",
        ] {
            assert!(validate_image_url(address).is_err(), "{address}");
        }
    }
}
