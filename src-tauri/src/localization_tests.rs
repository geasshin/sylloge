use super::*;

fn dialog_copy(labels: NativeDialogLabels) -> [&'static str; 13] {
    [
        labels.import_any_title,
        labels.import_any_filter,
        labels.import_container_title,
        labels.import_json_title,
        labels.json_filter,
        labels.import_films_title,
        labels.import_films_filter,
        labels.export_title,
        labels.csv_filter,
        labels.backup_destination_title,
        labels.backup_directory_title,
        labels.image_filter,
        labels.share_title,
    ]
}

#[test]
fn native_dialog_labels_select_all_english_titles_and_filters() {
    assert_eq!(
        dialog_copy(native_dialog_labels(Some("en"))),
        [
            "Choose a file to import",
            "Sylloge import (JSON, CSV, ZIP)",
            "Choose a folder to scan",
            "Choose a Sylloge export",
            "Sylloge JSON export",
            "Choose a Films CSV or a compatible ZIP",
            "Compatible CSV or ZIP",
            "Export the Sylloge profile",
            "Sylloge CSV export",
            "Choose the folder for future Sylloge backups",
            "Choose the Sylloge backup folder",
            "PNG image to share",
            "Save the share card",
        ]
    );
}

#[test]
fn native_dialog_labels_default_to_french_for_omitted_or_unsupported_languages() {
    let french = [
        "Choisir un fichier à importer",
        "Import Sylloge (JSON, CSV, ZIP)",
        "Choisir un dossier à analyser",
        "Choisir un export Sylloge",
        "Export JSON Sylloge",
        "Choisir un CSV Films ou un ZIP compatible",
        "CSV ou ZIP compatible",
        "Exporter le profil Sylloge",
        "Export CSV Sylloge",
        "Choisir le dossier des futures sauvegardes Sylloge",
        "Choisir le dossier de sauvegarde Sylloge",
        "Image PNG à partager",
        "Enregistrer la carte à partager",
    ];
    for language in [
        None,
        Some("fr"),
        Some(""),
        Some("de"),
        Some("EN"),
        Some("en-GB"),
        Some(" en "),
        Some("en\0"),
    ] {
        assert_eq!(
            dialog_copy(native_dialog_labels(language)),
            french,
            "{language:?}"
        );
    }
}
