const messages: Record<string, string> = {
  'Fermer l’assistant': 'Close assistant',
  'La colonne « {0} » n’existe pas dans le fichier.': 'The column “{0}” does not exist in the file.',
  'Ligne {0}': 'Line {0}',
  'Lignes {0}': 'Lines {0}',
  // Même mot français, autre sens : seul le contexte les départage (voir tc() dans core.ts).
  'comics\u0004Dessin': 'Artist',
  'recipes\u0004Entrée': 'Starter',
  'recipes\u0004Plat': 'Main course',
  'recipes\u0004Durée': 'Total time',
  'recipes\u0004Préparation': 'Prep time',
  'recipes\u0004Cuisson': 'Cooking time',
  'recipes\u0004Étapes': 'Method',
  'recipes\u0004Notes': 'Notes',
  'recipes\u0004Tes notes s’écriront ici.': 'Your notes go here.',
  'recipes\u0004Tes remarques : variante, conservation, ce que tu referais autrement…': 'Your remarks: variation, keeping, what you would do differently…',
  'podcasts\u0004Animation': 'Host',
}
export default messages
