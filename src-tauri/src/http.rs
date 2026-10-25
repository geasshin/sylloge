/// Taille maximale d'une réponse JSON d'un fournisseur. Les recherches TMDB,
/// IGDB et Open Library tiennent largement en dessous ; la limite évite qu'un
/// serveur compromis ou mal configuré fasse grossir la mémoire sans fin.
pub const MAX_PROVIDER_BYTES: usize = 8 * 1024 * 1024;

/// Lit un corps HTTP morceau par morceau, sans jamais dépasser `max` octets.
/// `Content-Length` sert de premier refus, mais peut manquer ou mentir : la
/// lecture elle-même reste plafonnée.
pub async fn read_body_capped(
    mut response: reqwest::Response,
    max: usize,
) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max as u64)
    {
        return Err("La réponse du fournisseur est trop volumineuse.".to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("La réponse du fournisseur n’a pas pu être lue : {error}"))?
    {
        if body.len().saturating_add(chunk.len()) > max {
            return Err("La réponse du fournisseur est trop volumineuse.".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}
