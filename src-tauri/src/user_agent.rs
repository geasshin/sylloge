//! En-tête `User-Agent` commun aux appels sortants vers des services publics.
//!
//! Open Library et Wikimedia demandent qu’un outil s’identifie, avec un contact
//! joignable, et qu’il n’usurpe pas un navigateur. La version est celle du
//! manifeste au moment de la compilation : elle suit la release, y compris
//! quand la CI réécrit le numéro avant de construire, sans qu’aucune ligne ne
//! soit à saisir à la main.

/// Identifie Sylloge, sa version compilée et une adresse de contact.
pub const APP_USER_AGENT: &str = concat!(
    "Sylloge/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/geasshin/sylloge; aurelien.trouble99@gmail.com)"
);
