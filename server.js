
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "public");

// Fichiers du site
app.use(express.static(publicPath));

// Vérification du serveur
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Accueil
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Pages inexistantes
app.use((req, res) => {
  res.status(404).send("Page introuvable.");
});

// Démarrage
app.listen(PORT, "0.0.0.0", () => {
  console.log("SurveySpace démarré sur le port " + PORT);
});
