#!/usr/bin/env bash
# Exécuté sur le VPS par le déploiement GitHub Actions.
# Récupère la nouvelle image, redémarre le site, vérifie qu'il répond, sinon revient à la version précédente.
set -euo pipefail
cd "$APP_DIR"
[ -f .env ] || { echo "Fichier $APP_DIR/.env manquant : lance d'abord deploy/setup-vps.sh"; exit 1; }

# La version en service est notée dans .env (IMAGE=...) pour que « docker compose logs » marche à la main
set_image() { grep -v '^IMAGE=' .env > .env.tmp || true; echo "IMAGE=$1" >> .env.tmp; cat .env.tmp > .env; rm -f .env.tmp; }
PREV=$(grep '^IMAGE=' .env | cut -d= -f2- || true)

echo "Version demandée : $IMAGE"
docker pull "$IMAGE"
docker logout ghcr.io >/dev/null 2>&1 || true
set_image "$IMAGE"
docker compose up -d --remove-orphans

for _ in $(seq 1 30); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    docker image prune -f >/dev/null
    echo "Site en ligne : $IMAGE"
    exit 0
  fi
  sleep 2
done

echo "Le site ne répond pas. Journal :"
docker compose logs --tail 50 app || true
if [ -n "$PREV" ]; then
  echo "Retour à la version précédente : $PREV"
  set_image "$PREV"
  docker compose up -d
fi
exit 1
