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

Cette version permet de **créer et publier tes propres questionnaires** dans Qwesto. Elle ne se connecte pas à CPX Research, BitLabs ou à un autre fournisseur externe, et n'envoie pas de paiements PayPal. Aucun montant présenté dans l'ancien prototype ne doit être considéré comme de l'argent disponible.

Un raccordement réel à un fournisseur et à PayPal nécessite notamment les contrats/approbations du fournisseur, un compte professionnel PayPal éligible avec les permissions requises, la vérification d'identité, le traitement des données personnelles et un cadre légal/comptable adapté. Ces services doivent être mis en place par un adulte ou une structure légalement habilitée. Ne publie pas de promesse de rémunération avant validation et tests réels.

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
   git add server.js package.json render.yaml README.md DEPLOYER.ps1 public/index.html public/app.js public/styles.css
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
