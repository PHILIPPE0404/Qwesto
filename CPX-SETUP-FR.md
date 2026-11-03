# Activer CPX Research dans Qwesto 2.1

## 1. Dans CPX Publisher
- Ouvre l'application Qwesto déjà approuvée.
- Vérifie que le domaine public Qwesto est celui déclaré et approuvé.
- Récupère l'**App ID** et le **Secure Hash** de cette application.
- Ne mets pas le Secure Hash dans le code ou dans le navigateur.

## 2. Dans Render
Dans ton service web : **Environment** > **Add Environment Variable**. Ajoute ces trois variables :

| Key | Value |
|---|---|
| `CPX_ENABLED` | `true` |
| `CPX_APP_ID` | ton App ID |
| `CPX_SECURE_HASH` | ton Secure Hash |

Clique **Save, rebuild, and deploy** (ou l'équivalent proposé par Render). Ne poste pas de capture où le Secure Hash est visible.

## 3. Autoriser un membre
- Connecte-toi à Qwesto en administrateur.
- Dans **Comptes membres**, clique **Autoriser CPX** pour le compte voulu.
- Fais-le uniquement après avoir vérifié que la personne a au moins 14 ans et que son parent/représentant légal a donné son accord si elle est mineure. Les moins de 14 ans ne doivent pas accéder aux sondages CPX.
- Le membre se connecte, lit les conditions, coche la confirmation et ouvre le mur CPX. Il peut retirer son accord.

## 4. Tester
Ouvre `https://TON-DOMAINE/health` : la réponse doit indiquer `ok: true` et `database: connected`. Puis connecte-toi avec un compte membre autorisé. Le bloc **Sondages CPX Research** doit apparaître.

## Important
Cette intégration affiche le mur de sondages CPX. Elle ne crée pas de solde Qwesto, ne crédite pas les membres, ne configure pas les Postbacks et ne réalise aucun paiement PayPal. Les paramètres de Postback doivent être obtenus dans la documentation/du support CPX et validés avant de connecter les conversions ou les paiements. CPX peut traiter des informations personnelles et, selon l'enquête, des informations sensibles : consulte sa politique et passe toute question à laquelle tu ne souhaites pas répondre.
