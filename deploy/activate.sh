#!/usr/bin/env bash
# Exécuté sur le VPS (utilisateur du site CloudPanel) par le déploiement GitHub Actions,
# une fois la nouvelle version copiée dans $APP_DIR/releases/$RELEASE.
# Bascule « current » vers cette version, redémarre le site avec pm2, vérifie qu'il répond,
# sinon revient à la version précédente. Garde les 5 dernières versions.
set -euo pipefail
: "${APP_DIR:?}" "${RELEASE:?}"
cd "$APP_DIR"
NEW="$APP_DIR/releases/$RELEASE"
[ -d "$NEW" ] || { echo "Version introuvable : $NEW"; exit 1; }
[ -f shared/.env ] || { echo "Fichier $APP_DIR/shared/.env manquant : lance d'abord deploy/setup-cloudpanel.sh"; exit 1; }

# Node installé par CloudPanel (nvm) pour l'utilisateur du site
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null
command -v node >/dev/null || { echo "Node.js introuvable pour $(whoami)."; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "Node.js $(node -v) trop ancien : il faut 22.13 ou plus (CloudPanel : réglages du site, version Node.js 22)."; exit 1; }
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null

PORT=$(grep -E '^PORT=' shared/.env | tail -1 | cut -d= -f2); PORT=${PORT:-3000}
PREV=$(readlink current 2>/dev/null || true)

switch_to() { ln -sfn "$1" current.tmp && mv -Tf current.tmp current; }
healthy() {
  for _ in $(seq 1 30); do
    # La réponse doit venir de la nouvelle version, pas d'un ancien processus encore en vie
    node -e "fetch('http://127.0.0.1:$PORT/api/health').then(r=>r.json()).then(j=>process.exit(j.ok&&j.release===process.argv[1]?0:1),()=>process.exit(1))" "$1" && return 0
    sleep 2
  done
  return 1
}
restart() { pm2 startOrRestart shared/ecosystem.config.cjs --update-env >/dev/null && pm2 save >/dev/null; }

echo "Mise en service de $RELEASE"
switch_to "$NEW"
restart
if healthy "$RELEASE"; then
  echo "Site en ligne : $RELEASE"
  # Ménage : on garde les 5 versions les plus récentes
  ls -1dt releases/*/ | tail -n +6 | xargs -r rm -rf
  exit 0
fi

echo "Le site ne répond pas. Journal :"
pm2 logs aakatsuki --lines 40 --nostream 2>&1 | tail -40 || true
if [ -n "$PREV" ] && [ -d "$PREV" ]; then
  echo "Retour à la version précédente : $(basename "$PREV")"
  switch_to "$PREV"
  restart
  if healthy "$(basename "$PREV")"; then echo "Version précédente rétablie, le site reste en ligne."
  else echo "ATTENTION : la version précédente ne répond pas non plus. Regarde « pm2 logs aakatsuki » sur le VPS."; fi
fi
[ "$NEW" = "$PREV" ] || rm -rf "$NEW"
exit 1
