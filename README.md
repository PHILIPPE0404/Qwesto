# Qwesto 2.0 — refonte complète

Qwesto 2.0 est une plateforme privée de questionnaires internes avec comptes membres, création/publication de questionnaires, enregistrement des réponses, consultation des résultats et podium animé.

## Fonctions

- Connexion administrateur et membres ; aucun formulaire d'inscription public.
- Comptes membres créés, activés/désactivés et réinitialisés par l'administrateur.
- Changement obligatoire du mot de passe temporaire.
- Création de questionnaires en brouillon, publication, dépublication, archivage et suppression des questionnaires sans réponses.
- Membres capables de répondre une seule fois à chaque questionnaire publié.
- Historique membre et consultation des réponses par questionnaire côté administration.
- Classement par nombre de questionnaires terminés ; révélation animée 3e place, 2e place, pause, puis 1re place avec petits personnages pixel-art en CSS.
- Export CSV des membres.
- PostgreSQL pour les membres, questionnaires, réponses et sessions.
- Les tables historiques `qwesto_members` et `qwesto_demo_ledger` sont conservées. Les anciens montants de démonstration ne sont plus affichés comme des gains.

## Important : sondages externes et PayPal

Cette version permet de créer et publier des questionnaires Qwesto et d'afficher le mur CPX Research pour les membres explicitement autorisés. L'intégration CPX affiche les offres du fournisseur ; elle ne crédite pas automatiquement un solde Qwesto et n'effectue aucun paiement PayPal. Le suivi des conversions et le mécanisme de récompense interne doivent être configurés séparément, avec validation du contrat et du Postback par CPX.

Un raccordement réel à un fournisseur et à PayPal nécessite notamment les contrats/approbations du fournisseur, un compte professionnel PayPal éligible avec les permissions requises, la vérification d'identité, le traitement des données personnelles et un cadre légal/comptable adapté. Ces services doivent être mis en place par un adulte ou une structure légalement habilitée. Ne publie pas de promesse de rémunération avant validation et tests réels.


## CPX Research (mur de sondages)

L'intégration utilise l'iframe officiellement documentée par CPX : `https://offers.cpx-research.com/index.php`. Le serveur construit l'URL pour chaque membre à partir de son UUID Qwesto et calcule `MD5(ext_user_id + '-' + CPX_SECURE_HASH)` côté serveur. Le Secure Hash n'est jamais envoyé au navigateur.

Dans Render > ton service web > Environment, ajoute :

| Variable | Valeur |
|---|---|
| `CPX_ENABLED` | `true` (uniquement après validation de l'application/domaine par CPX) |
| `CPX_APP_ID` | App ID de l'application Qwesto affiché dans ton Publisher Dashboard |
| `CPX_SECURE_HASH` | Secure Hash de cette application (secret, jamais dans GitHub) |

Ne partage pas le Secure Hash dans un chat ou une capture. Après avoir ajouté les variables, sauvegarde et laisse Render redéployer.

Dans Qwesto, connecte-toi en admin > Comptes membres > **Autoriser CPX**. N'autorise que les membres qui respectent l'âge minimum CPX (14 ans) et dont le représentant légal a donné son accord lorsqu'ils sont mineurs. Le membre doit ensuite lire les informations et confirmer son consentement avant d'ouvrir le mur. Un membre peut retirer son accord depuis son espace.

Le lien d'entrée transmis à CPX contient uniquement l'App ID, l'UUID externe stable, son Secure Hash dérivé et le nom de compte Qwesto. Qwesto n'envoie pas de date de naissance, d'adresse e-mail, d'adresse postale ou de profil démographique.

CPX indique que son service peut traiter des informations de profil et, selon les enquêtes, des données sensibles. Le membre doit lire la politique CPX, ne jamais fournir de fausses informations et quitter une enquête s'il ne souhaite pas répondre. Conditions répondant : https://cpx-research.com/main/en/terms-user.php ; politique de confidentialité : https://www.cpx-research.com/main/en/privacy.php.

**Limites actuelles :** cette intégration affiche le mur CPX uniquement. Elle ne met pas à jour un solde Qwesto, ne calcule pas la part membre/plateforme, ne configure pas le Postback CPX et ne paie personne via PayPal. Configure le Postback dans le Publisher Dashboard seulement après avoir reçu les paramètres exacts de CPX et fait valider le système de suivi/paiement par l'adulte responsable. Ne présente pas les offres comme un revenu garanti.

## Prérequis

- Node.js 20 ou plus récent (npm inclus).
- Git pour envoyer le code sur GitHub.
- Une base PostgreSQL (Render PostgreSQL convient).
- Un service web Render ou un autre hébergeur Node.js.

## Installation Windows (recommandée)

1. Télécharge et décompresse le ZIP.
2. Ouvre le dossier `Qwesto-complet` extrait.
3. Dans la barre d'adresse de l'Explorateur, tape `powershell` puis Entrée.
4. Lance :

   ```powershell
   powershell -ExecutionPolicy Bypass -File ".\INSTALLER.ps1"
   ```

5. Quand le script le demande, colle le chemin du dossier de ton dépôt Qwesto cloné depuis GitHub. C'est le dossier qui contient déjà `server.js` et `public`.
6. Le script sauvegarde les anciens fichiers dans `backup-qwesto-AAAA...`, copie les nouveaux fichiers, installe les dépendances et vérifie la syntaxe.
7. Pour envoyer les changements sur GitHub, toujours depuis le dossier du dépôt, lance :

   ```powershell
   powershell -ExecutionPolicy Bypass -File ".\DEPLOYER.ps1"
   ```

   Tu peux aussi faire manuellement :

   ```powershell
   npm install
   npm run check
   git add server.js package.json render.yaml README.md CPX-SETUP-FR.md DEPLOYER.ps1 public/index.html public/app.js public/styles.css
   git commit -m "Qwesto 2.0"
   git push
   ```

## Déploiement Render

Dans le service web Render, conserve ou configure ces variables d'environnement :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Internal Database URL de PostgreSQL Render |
| `ADMIN_PASSWORD` | Ton mot de passe admin secret, au moins 20 caractères |
| `SESSION_SECRET` | Une chaîne aléatoire secrète d'au moins 64 caractères |

Build command : `npm install`  
Start command : `npm start`  
Health check path : `/health`

Pour générer une valeur forte de `SESSION_SECRET` sur Windows avec Node.js :

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Ne mets jamais ces secrets dans GitHub, dans `server.js`, dans `public` ou dans une capture d'écran.

## Première utilisation

1. Connecte-toi avec l'identifiant `admin` et la valeur de `ADMIN_PASSWORD`.
2. Crée un membre et transmets son identifiant/mot de passe temporaire en privé.
3. Crée un questionnaire : une question par ligne.
4. Dans « Mes sondages », clique sur « Publier ».
5. Le membre se connecte et répond au questionnaire.
6. Retourne dans l'administration pour consulter les réponses et lancer « Révéler le podium ».

## Vérifications

- `GET /health` doit répondre avec `ok: true` et `database: connected`.
- `npm run check` vérifie la syntaxe de `server.js` et `public/app.js`.
- Les membres désactivés sont refusés même si une session était déjà ouverte.
- Un membre ne peut répondre qu'une fois au même questionnaire.
- Les questionnaires publiés ne peuvent pas être supprimés ; archive-les pour les retirer de l'espace membre.

## Données existantes

La base n'est pas réinitialisée. Les comptes membres existants sont conservés, mais chaque membre qui a encore `must_change_password = true` devra d'abord changer son mot de passe. Les anciennes lignes de simulation sont conservées dans `qwesto_demo_ledger`, mais ne sont plus présentées comme des gains ou des paiements.
