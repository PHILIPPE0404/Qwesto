$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path $PSScriptRoot).Path
if (-not (Test-Path (Join-Path $ProjectRoot '.git'))) { throw "Ce dossier n'est pas un dépôt Git. Lance ce script depuis ton dossier Qwesto cloné depuis GitHub." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git n'est pas installé ou n'est pas dans le PATH." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js/npm n'est pas installé ou n'est pas dans le PATH." }

Push-Location $ProjectRoot
try {
  Write-Host "Vérification des fichiers…" -ForegroundColor Cyan
  npm run check
  if ($LASTEXITCODE -ne 0) { throw "La vérification a échoué. Aucun envoi GitHub effectué." }

  git add server.js package.json render.yaml README.md INTEGRATIONS-REAL.md CPX-SETUP-FR.md DEPLOYER.ps1 .gitignore .env.example public/index.html public/app.js public/styles.css
  if ($LASTEXITCODE -ne 0) { throw "Impossible d'ajouter les fichiers à Git." }
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Aucune modification à envoyer : les fichiers sont déjà à jour." -ForegroundColor Yellow
    exit 0
  }

  git commit -m "Qwesto 2.1: CPX Research iframe"
  if ($LASTEXITCODE -ne 0) { throw "Le commit Git a échoué." }
  git push origin HEAD
  if ($LASTEXITCODE -ne 0) { throw "Le push a échoué. Vérifie l'accès GitHub avec git remote -v, puis réessaie." }
  Write-Host "Modifications envoyées sur GitHub. Si Render est lié au dépôt, le redéploiement démarre automatiquement." -ForegroundColor Green
} finally { Pop-Location }
