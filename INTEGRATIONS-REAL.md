# Connexions réelles : fournisseurs de sondages et PayPal

## État actuel

Dans Qwesto 2.0, l'administration peut publier des questionnaires créés directement dans l'application. Les membres y répondent et les réponses sont enregistrées dans PostgreSQL. Il n'y a pas d'argent réel, pas de portefeuille retirable, pas de connexion CPX/BitLabs et pas de transfert PayPal.

## Avant toute mise en production rémunérée

La partie rémunération ne doit être activée qu'après validation par un adulte responsable ou une structure légalement habilitée. Il faut notamment :

1. Obtenir un accord fournisseur et les identifiants officiels de production ; vérifier que le fournisseur autorise bien le modèle d'utilisation prévu.
2. Vérifier les conditions d'âge, de résidence, de consentement et de traitement des données des participants.
3. Préparer les mentions d'information, la politique de confidentialité, la durée de conservation et les procédures de suppression des données.
4. Disposer d'un compte professionnel de paiement éligible, vérifié et autorisé par le prestataire pour le type de versements prévu.
5. Mettre en place la vérification cryptographique des webhooks, l'idempotence, la journalisation, les rapprochements, les limites et un mécanisme de gestion des remboursements/contestations.
6. Faire des tests sandbox, puis une validation réelle contrôlée par le responsable avant toute ouverture.

## Règle de sécurité

Ne demande jamais aux membres leur mot de passe PayPal, leurs identifiants bancaires ou une capture de leur compte. Ne place jamais une clé secrète dans `public/`, dans le navigateur ou dans GitHub. Les secrets doivent rester dans les variables privées de l'hébergeur.

Qwesto 2.0 laisse volontairement les paiements désactivés : il ne suffit pas de mettre un identifiant PayPal dans une variable pour créer un système de rémunération conforme et fiable.
