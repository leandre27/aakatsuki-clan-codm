#!/usr/bin/env bash
# Préparation du VPS, une seule fois, en root :
#   scp deploy/setup-vps.sh root@TON_VPS:/root/ && ssh root@TON_VPS bash /root/setup-vps.sh
# - installe Docker s'il manque
# - crée l'utilisateur « deploy » utilisé par GitHub Actions, avec sa propre clé SSH
# - crée /opt/aakatsuki et son fichier .env
# À la fin, le script affiche les valeurs à copier dans les secrets GitHub.
set -euo pipefail
APP_DIR=${APP_DIR:-/opt/aakatsuki}
DEPLOY_USER=${DEPLOY_USER:-deploy}
[ "$(id -u)" = 0 ] || { echo "À lancer en root."; exit 1; }

if ! command -v docker >/dev/null; then
  echo "Installation de Docker (script officiel get.docker.com)…"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null || { echo "Le plugin docker compose est requis."; exit 1; }

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

# Clé réservée au déploiement : la partie privée va dans GitHub, jamais ailleurs
HOME_DIR=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$HOME_DIR/.ssh"
KEY=$(mktemp -d)/deploy_key
ssh-keygen -q -t ed25519 -N '' -C "github-actions-aakatsuki" -f "$KEY"
cat "$KEY.pub" >> "$HOME_DIR/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$HOME_DIR/.ssh/authorized_keys"; chmod 600 "$HOME_DIR/.ssh/authorized_keys"

install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'EOF'
# Réglages du site (lus au démarrage du conteneur)
TRUST_PROXY=1
# Fuseau horaire du clan : séances, rappels, classement du dimanche
TZ=Africa/Abidjan
# Contact transmis aux services de notifications (obligatoire pour les iPhone)
PUSH_SUBJECT=mailto:contact@exemple.com
DEMO=0
BACKUP_KEEP=14
# Port local du site, derrière ton proxy HTTPS
APP_PORT=3000
EOF
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"
fi

HOST_IP=$(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo
echo "===== À copier dans GitHub : Settings > Environments > production > Secrets ====="
echo "VPS_HOST        = $HOST_IP   (ou ton nom de domaine)"
echo "VPS_USER        = $DEPLOY_USER"
echo "VPS_SSH_KEY     = (tout le bloc ci-dessous, lignes BEGIN et END comprises)"
cat "$KEY"
echo "VPS_KNOWN_HOSTS = (les lignes ci-dessous)"
ssh-keyscan -t ed25519,rsa,ecdsa localhost 2>/dev/null | sed "s/^localhost/$HOST_IP/"
echo "================================================================================="
rm -rf "$(dirname "$KEY")"
echo
echo "Ensuite : modifie $APP_DIR/.env (TZ, PUSH_SUBJECT), puis pousse sur main pour déployer."
