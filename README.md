# Qwesto — prototype de démonstration

Qwesto est un prototype web qui contient :
- une connexion administrateur (`admin`) protégée par une variable Render ;
- la création de comptes membres privés par l'administrateur ;
- un mot de passe temporaire et un changement obligatoire à la première connexion ;
- l'activation ou la désactivation d'un compte ;
- un espace membre ;
- trois sondages entièrement fictifs pour essayer l'interface ;
- une comptabilité de démonstration paramétrable (60 % membre / 40 % plateforme) ;
- une base PostgreSQL pour conserver les comptes et les simulations après redéploiement.

## Limites impératives de cette version

**Cette version est une démonstration, pas un service rémunéré.** Elle ne se connecte ni à CPX Research ni à PayPal. Les sondages, montants et transactions sont fictifs ; aucun argent n'est gagné, collecté, transféré ou dû aux membres. Le bouton « Simuler » enregistre uniquement une simulation dans PostgreSQL.

Les conditions éditeur publiques de CPX Research indiquent que le titulaire éditeur doit avoir au moins 18 ans (ou être une personne morale admissible) et posséder les droits nécessaires sur la plateforme. Les conditions PayPal France demandent également 18 ans minimum et la pleine capacité juridique pour un compte particulier. Cette démonstration ne contourne pas ces conditions. Ne crée pas de compte en utilisant l'identité ou les informations d'une autre personne.

L'interface appelle les utilisateurs « membres » : créer un compte dans ce prototype ne crée pas un contrat de travail et ne remplace aucune formalité légale.

## 1. Préparer les fichiers

1. Télécharge et décompresse `qwesto-demo.zip`.
2. Ouvre le dossier `qwesto-demo`.
3. Envoie **le contenu de ce dossier** à un dépôt GitHub que tu contrôles. `package.json` et `server.js` doivent se trouver à la racine du dépôt, pas dans un sous-dossier supplémentaire.

## 2. Créer la base PostgreSQL sur Render

1. Ouvre Render et crée une base **PostgreSQL**.
2. Choisis une région proche du service web.
3. Une fois la base créée, ouvre ses informations de connexion.
4. Copie l'**Internal Database URL** si le service web se trouve dans la même région Render. Garde cette adresse privée.

## 3. Créer le service web

1. Dans Render, choisis **New → Web Service**.
2. Connecte le dépôt GitHub contenant les fichiers Qwesto.
3. Paramètres :
   - Runtime : `Node`
   - Build Command : `npm install`
   - Start Command : `npm start`
4. Crée le service. Attends que Render affiche son URL publique, par exemple `https://qwesto-demo.onrender.com`.

## 4. Ajouter les variables d'environnement

Dans **Render → service Qwesto → Environment**, ajoute ces variables :

| Nom | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Internal Database URL de PostgreSQL |
| `ADMIN_PASSWORD` | Mot de passe admin unique de 20 caractères minimum |
| `SESSION_SECRET` | Secret aléatoire de 64 caractères hexadécimaux |
| `DEMO_MEMBER_PERCENT` | `60` |

Pour générer un secret aléatoire avec Node.js sur ton ordinateur, ouvre PowerShell et exécute :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie le résultat dans `SESSION_SECRET`. Pour `ADMIN_PASSWORD`, choisis séparément un mot de passe long et unique, et conserve-le dans un gestionnaire de mots de passe. Ne publie aucune de ces valeurs dans GitHub, dans le code du navigateur ou dans une conversation.

Après avoir ajouté ou modifié les variables, lance **Manual Deploy → Deploy latest commit** dans Render. Les tables PostgreSQL sont créées au démarrage.

## 5. Se connecter en administrateur

1. Ouvre l'URL Render de Qwesto.
2. Entre `admin` dans le champ Identifiant.
3. Entre exactement la valeur que tu as définie dans `ADMIN_PASSWORD`.
4. Tu arrives sur l'espace administrateur.

Si le site ne démarre pas, consulte **Render → Logs**. Vérifie en premier que `DATABASE_URL`, `ADMIN_PASSWORD` et `SESSION_SECRET` existent et que la base PostgreSQL est active.

## 6. Créer le premier membre de test

Dans l'espace administrateur, utilise le bloc **Créer le premier membre** :

1. **Nom affiché** : `Membre de test 01`.
2. **Identifiant** : `membre01`.
3. **Mot de passe temporaire** : crée un mot de passe aléatoire de 12 caractères ou plus. Exemple de génération dans PowerShell :

   ```powershell
   node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"
   ```

4. Clique sur **Créer le compte de test**.
5. Transmets l'identifiant et le mot de passe temporaire uniquement par un canal privé et sûr. Ne le poste pas dans un serveur Discord public.
6. Déconnecte-toi de l'administrateur.
7. Connecte-toi avec `membre01` et le mot de passe temporaire.
8. À la première connexion, le site demande un nouveau mot de passe d'au moins 12 caractères. Après son changement, le membre voit les trois sondages fictifs.
9. Clique sur **Simuler une fin de sondage** pour vérifier le calcul de partage. Le tableau de bord admin affiche ensuite la simulation.

Pour désactiver ce compte, retourne dans l'espace admin et clique sur **Désactiver**. Un compte désactivé ne peut plus se connecter.

## 7. Vérifier le fonctionnement

- Vérification du serveur : `https://TON-SERVICE.onrender.com/health` doit afficher `{ "ok": true, "mode": "demo-only" }`.
- L'administrateur doit pouvoir créer et désactiver un membre.
- Le membre doit devoir changer son mot de passe temporaire.
- Les sondages de test doivent porter la mention **EXEMPLE FICTIF**.
- Le portefeuille et les statistiques doivent afficher uniquement les simulations.

## Ce qui manque pour un véritable service

Une intégration réelle à un fournisseur d'enquêtes, la distribution de récompenses monétaires, les paiements, la gestion des litiges, la protection des données, les conditions d'utilisation et les obligations de l'éditeur exigent un fournisseur qui approuve le projet et un exploitant légalement habilité. Rien de cela n'est activé dans ce prototype.
