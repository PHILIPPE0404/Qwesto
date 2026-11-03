# SurveySpace — tableau de bord personnel

## Important
Cette interface ne récupère pas automatiquement les sondages de ton compte AttaPoll. Je n'ai pas trouvé de documentation publique officielle confirmant une API développeur. N'utilise que des exports ou intégrations que tu es autorisé à utiliser, et ne partage pas ton mot de passe.

## Déploiement Render
1. Décompresse ce dossier et ajoute les fichiers dans un dépôt GitHub.
2. Sur Render, choisis **New + → Web Service** et connecte le dépôt.
3. Build Command : `npm install`
4. Start Command : `npm start`
5. Déploie.

## Import
L'interface accepte un fichier JSON ou du JSON collé dans le champ d'import. Exemple :
```json
[{"title":"Mon sondage","reward":0.75,"minutes":8,"stars":4,"provider":"AttaPoll","url":"https://attapoll.app/","status":"Disponible"}]
```
Les données restent dans le stockage local du navigateur ; elles ne sont pas envoyées au serveur.
