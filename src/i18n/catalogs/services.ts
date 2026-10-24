/**
 * English copy for exports prepared for a third-party service (Letterboxd today; Goodreads and others
 * later): the dialog options and the report of what was carried over. French keys, English values.
 */
const services: Readonly<Record<string, string>> = {
  "Aucun film terminé à exporter pour Letterboxd.": "No finished films to export for Letterboxd.",
  "Aucun film à découvrir à exporter pour Letterboxd.": "No films to discover to export for Letterboxd.",
  "Export Letterboxd enregistré dans {files} · {count} film.": "Letterboxd export saved to {files} · {count} film.",
  "Export Letterboxd enregistré dans {files} · {count} films.": "Letterboxd export saved to {files} · {count} films.",
  "Reconnus par titre seulement (correspondance non garantie) : {count}.": "Matched by title only (match not guaranteed): {count}.",
  "Sans date de visionnage (marqués vus, sans entrée de journal) : {count}.": "No watch date (marked as watched, no diary entry): {count}.",
  "Favoris non transmis (Letterboxd n’a pas de colonne favori) : {count}.": "Favourites not carried over (Letterboxd has no favourite column): {count}.",
  "Films d’un autre statut, non inclus : {count}.": "Films with another status, not included: {count}.",
  "Export interrompu : il reste {count} fichier à enregistrer, relancer l’export pour le recréer.": "Export interrupted: {count} file left to save, run the export again to recreate it.",
  "Letterboxd · films vus": "Letterboxd · watched films",
  "CSV au format d’import de Letterboxd : films terminés avec note, date de visionnage et avis. À importer sur letterboxd.com/import.": "CSV in the Letterboxd import format: finished films with rating, watch date and review. To import at letterboxd.com/import.",
  "Letterboxd · liste à voir": "Letterboxd · watchlist",
  "CSV au format d’import de Letterboxd : films à découvrir, pour la liste « à voir » de Letterboxd. Un fichier distinct, importé séparément.": "CSV in the Letterboxd import format: films to discover, for the Letterboxd watchlist. A separate file, imported separately."
}

export default services
