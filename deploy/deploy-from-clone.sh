#!/usr/bin/env bash
# Mise en ligne manuelle depuis un clone du dépôt sur le VPS (sans GitHub Actions).
# Avec l'utilisateur du site CloudPanel, dans le dossier du clone :
#   bash deploy/deploy-from-clone.sh            récupère la dernière version (git pull) puis la met en ligne
#   bash deploy/deploy-from-clone.sh --no-pull  met en ligne la version déjà présente dans le clone
# Prérequis : deploy/setup-cloudpanel.sh lancé une fois en root, et shared/.env rempli.
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)
APP_DIR=${APP_DIR:-$HOME/aakatsuki}
[ "$(id -u)" != 0 ] || { echo "Lance ce script avec l'utilisateur du site, pas en root : su - <utilisateur-du-site>"; exit 1; }
[ -f "$APP_DIR/shared/.env" ] || { echo "$APP_DIR/shared/.env introuvable : lance d'abord, en root, bash deploy/setup-cloudpanel.sh $(whoami)"; exit 1; }

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null
command -v npm >/dev/null || { echo "npm introuvable pour $(whoami) : choisis Node.js 22 dans CloudPanel."; exit 1; }

cd "$SRC"
[ "${1:-}" = "--no-pull" ] || git pull --ff-only
RELEASE="$(git rev-parse --short=12 HEAD)-$(date +%Y%m%d%H%M%S)"
DEST="$APP_DIR/releases/$RELEASE"
echo "Préparation de $RELEASE"
mkdir -p "$DEST"
# Seulement les fichiers suivis par Git (jamais .env ni données locales du clone)
git archive HEAD package.json package-lock.json index.html sw.js manifest.webmanifest css js assets server | tar -x -C "$DEST"
(cd "$DEST" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

APP_DIR="$APP_DIR" RELEASE="$RELEASE" bash "$SRC/deploy/activate.sh"
