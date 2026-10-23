const messages: Record<string, string> = {
  'Fermer l’assistant': 'Close assistant',
  'La colonne « {0} » n’existe pas dans le fichier.': 'The column “{0}” does not exist in the file.',
  'Ligne {0}': 'Line {0}',
  'Lignes {0}': 'Lines {0}',
  // Même mot français, autre sens : seul le contexte les départage (voir tc() dans core.ts).
  'comics\u0004Dessin': 'Artist',
  'podcasts\u0004Animation': 'Host',
}
export default messages
