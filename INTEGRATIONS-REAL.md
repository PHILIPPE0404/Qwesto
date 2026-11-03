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


## CPX Research — mur iframe intégré dans Qwesto 2.1

L'intégration technique est activée par variables Render, sans clé secrète dans le navigateur :

- `CPX_ENABLED=true`
- `CPX_APP_ID` : identifiant public de l'application CPX approuvée
- `CPX_SECURE_HASH` : Secure Hash privé de l'application

Le serveur construit le lien CPX pour le membre authentifié. Un administrateur doit d'abord autoriser chaque membre dans Qwesto, après vérification de l'âge minimal CPX et de l'accord du représentant légal si le membre est mineur. Le membre confirme ensuite son propre accord et peut le retirer.

L'intégration n'envoie pas l'e-mail, la date de naissance ni les données démographiques du membre depuis Qwesto. CPX peut néanmoins demander ces informations directement dans son mur. Les règles CPX indiquent que les mineurs de 14 ans et plus ne peuvent participer qu'avec le consentement de leur représentant légal ; les moins de 14 ans sont exclus. La politique CPX mentionne aussi le traitement possible de données sensibles. L'adulte responsable doit relire les conditions actuelles avant d'activer le service.

Cette étape n'intègre ni postback de conversion, ni attribution de commission, ni solde membre, ni PayPal. Ne branche pas de retraits avant d'avoir la documentation Postback exacte, la validation CPX et un processus de paiement conforme.
