# Sécurité

Sylloge est une application locale : les données restent dans SQLite sur la
machine de la personne. Les sujets sensibles sont donc surtout la chaîne de
distribution, l’updater, les téléchargements d’images et les liens externes.

## Signaler une vulnérabilité

Merci de ne pas ouvrir d’issue publique. Utiliser l’onglet **Security** du
dépôt GitHub, puis **Report a vulnerability** :

https://github.com/geasshin/sylloge/security/advisories/new

Indiquer la version concernée, la plateforme (macOS ou Windows), les étapes de
reproduction et l’impact observé. Ne joindre aucune donnée personnelle réelle
ni aucun secret.

## Versions prises en charge

La dernière version publiée et la version en développement de `main` sont
examinées. Les versions antérieures ne reçoivent pas de correctif dédié.

## Ce qui n’est pas un secret

Les clés TMDB et IGDB ne sont pas embarquées dans le binaire : elles vivent
côté proxy. Les adresses des fournisseurs et la clé publique de l’updater sont
publiques par nature.
