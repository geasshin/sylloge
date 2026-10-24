// Enregistrement d'une carte à partager (image PNG). Validé avant toute écriture : seul un vrai PNG
// de taille raisonnable atteint le disque, sous un nom sûr qui se termine par « .png ».

#[test]
fn share_image_accepts_a_real_png_signature() {
    let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    png.extend_from_slice(&[0u8; 32]);
    assert!(validate_share_png(&png).is_ok());
}

#[test]
fn share_image_refuses_anything_that_is_not_a_png() {
    assert!(validate_share_png(&[]).is_err(), "vide");
    assert!(validate_share_png(b"<html></html>").is_err(), "HTML");
    assert!(
        validate_share_png(b"\xFF\xD8\xFF\xE0 JPEG").is_err(),
        "JPEG"
    );
    assert!(
        validate_share_png(&[0x89, b'P', b'N', b'G']).is_err(),
        "signature tronquée"
    );
    let error = validate_share_png(b"not an image").unwrap_err();
    assert!(
        error.contains("PNG"),
        "le message nomme le format : {error}"
    );
}

#[test]
fn share_image_refuses_an_oversized_png() {
    let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    png.resize(MAX_SHARE_IMAGE_BYTES + 1, 0);
    assert!(validate_share_png(&png).is_err());
    png.truncate(MAX_SHARE_IMAGE_BYTES);
    assert!(
        validate_share_png(&png).is_ok(),
        "la limite elle-même passe"
    );
}

#[test]
fn share_image_file_name_is_safe_and_ends_with_png() {
    assert_eq!(
        share_image_file_name("sylloge-carte-films-2026-10-24.png"),
        "sylloge-carte-films-2026-10-24.png"
    );
    assert_eq!(
        share_image_file_name("carte"),
        "carte.png",
        "extension ajoutée"
    );
    assert_eq!(
        share_image_file_name("carte.PNG"),
        "carte.PNG",
        "casse conservée"
    );
    assert_eq!(
        share_image_file_name("carte.jpg"),
        "carte.jpg.png",
        "une autre extension n'est pas prise pour un PNG"
    );
    assert_eq!(
        share_image_file_name("../../etc/passwd"),
        "passwd.png",
        "aucun chemin ne passe"
    );
    assert_eq!(
        share_image_file_name(""),
        "sylloge-carte.png",
        "nom vide : repli"
    );
    assert_eq!(share_image_file_name("   "), "sylloge-carte.png");
}

#[test]
fn share_image_dialog_copy_is_localized() {
    let french = native_dialog_labels(None);
    assert_eq!(french.image_filter, "Image PNG à partager");
    assert_eq!(french.share_title, "Enregistrer la carte à partager");
    let english = native_dialog_labels(Some("en"));
    assert_eq!(english.image_filter, "PNG image to share");
    assert_eq!(english.share_title, "Save the share card");
}

#[test]
fn write_export_bytes_writes_binary_content_exactly_and_replaces_atomically() {
    let directory = std::env::temp_dir().join(format!("sylloge-share-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("carte.png");
    let first: Vec<u8> = (0..=255u8).collect();
    let name = write_export_bytes(&path, &first, "fallback.png").unwrap();
    assert_eq!(name, "carte.png");
    assert_eq!(
        std::fs::read(&path).unwrap(),
        first,
        "octets identiques, y compris 0x00"
    );

    let second = vec![0x89, b'P', b'N', b'G'];
    write_export_bytes(&path, &second, "fallback.png").unwrap();
    assert_eq!(
        std::fs::read(&path).unwrap(),
        second,
        "l'ancien fichier est remplacé"
    );
    let leftovers: Vec<_> = std::fs::read_dir(&directory)
        .unwrap()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
        .collect();
    assert!(leftovers.is_empty(), "aucun fichier temporaire ne reste");
    std::fs::remove_dir_all(&directory).unwrap();
}
