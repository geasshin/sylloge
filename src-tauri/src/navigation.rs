use tauri::Url;

/// Seules les adresses de l'application elle-même sont autorisées à naviguer
/// dans la fenêtre. Un lien `http://` ou `https://` externe est intercepté par
/// l'interface et confié au navigateur du système ; s'il arrive malgré tout ici,
/// la navigation est refusée.
pub fn is_allowed(url: &Url) -> bool {
    match url.scheme() {
        // Protocoles internes de Tauri (chargement de l'interface et des
        // ressources embarquées).
        "tauri" | "asset" | "ipc" => url.host_str() == Some("localhost"),
        // Page blanche initiale de certaines vues web.
        "about" => url.path() == "blank",
        // Windows sert l'interface sous http(s)://tauri.localhost, les
        // ressources sous asset.localhost et l'IPC sous ipc.localhost.
        "http" | "https"
            if matches!(
                url.host_str(),
                Some("tauri.localhost") | Some("asset.localhost") | Some("ipc.localhost")
            ) =>
        {
            true
        }
        // Le serveur Vite de développement. Il n'existe pas dans un binaire
        // de release, et le laisser passer en production ouvrirait la fenêtre
        // à n'importe quel serveur local.
        "http" | "https" if cfg!(debug_assertions) => matches!(
            url.host_str(),
            Some("localhost") | Some("127.0.0.1") | Some("::1")
        ),
        _ => false,
    }
}

pub fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|_webview, url| is_allowed(url))
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(value: &str) -> bool {
        is_allowed(&Url::parse(value).expect("URL de test valide"))
    }

    #[test]
    fn accepts_the_application_protocols() {
        assert!(allowed("tauri://localhost/index.html"));
        assert!(allowed("asset://localhost/icon.png"));
        assert!(allowed("ipc://localhost"));
        assert!(allowed("http://tauri.localhost/"));
        assert!(allowed("https://tauri.localhost/"));
        assert!(allowed("http://asset.localhost/icon.png"));
        assert!(allowed("http://ipc.localhost/"));
        assert!(allowed("about:blank"));
    }

    #[test]
    fn refuses_external_pages_and_unknown_schemes() {
        assert!(!allowed("https://example.com/"));
        assert!(!allowed("http://example.com/"));
        assert!(!allowed("http://localhost.evil.example/"));
        assert!(!allowed("file:///etc/passwd"));
        assert!(!allowed("javascript:alert(1)"));
        assert!(!allowed("data:text/html,hello"));
    }

    #[test]
    fn allows_the_dev_server_only_in_debug_builds() {
        assert_eq!(allowed("http://localhost:5173/"), cfg!(debug_assertions));
        assert_eq!(allowed("http://127.0.0.1:1420/"), cfg!(debug_assertions));
    }
}
