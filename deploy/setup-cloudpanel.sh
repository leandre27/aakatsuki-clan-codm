#!/usr/bin/env bash
# Préparation du VPS CloudPanel, une seule fois, en root, APRÈS avoir créé le site Node.js dans CloudPanel :
#   bash setup-cloudpanel.sh <utilisateur-du-site> [port-de-l-appli] [port-ssh]
# Exemple : bash setup-cloudpanel.sh aakatsuki 3000 22
#
# - vérifie Node.js 22.13+ pour l'utilisateur du site (l'installe avec nvm si besoin)
# - installe pm2 et le redémarrage automatique au boot
# - crée ~/aakatsuki (versions, données, réglages .env)
# - crée une clé SSH réservée à GitHub Actions et affiche les secrets à copier dans GitHub
set -euo pipefail
SITE_USER=${1:?Usage : bash setup-cloudpanel.sh <utilisateur-du-site> [port-appli] [port-ssh]}
APP_PORT=${2:-3000}
SSH_PORT=${3:-22}
[ "$(id -u)" = 0 ] || { echo "À lancer en root."; exit 1; }
id "$SITE_USER" >/dev/null 2>&1 || { echo "Utilisateur $SITE_USER introuvable : crée d'abord le site Node.js dans CloudPanel."; exit 1; }
HOME_DIR=$(getent passwd "$SITE_USER" | cut -d: -f6)
APP_DIR="$HOME_DIR/aakatsuki"

# Tout ce qui suit tourne avec l'utilisateur du site, jamais en root
su - "$SITE_USER" -s /bin/bash -c "APP_DIR='$APP_DIR' APP_PORT='$APP_PORT' bash -s" <<'AS_SITE_USER'
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  command -v nvm >/dev/null || { echo "nvm introuvable : choisis Node.js 22 dans CloudPanel (réglages du site) puis relance."; exit 1; }
  nvm install 22 && nvm alias default 22
fi
echo "Node.js $(node -v)"
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null
echo "pm2 $(pm2 -v)"

mkdir -p "$APP_DIR/releases" "$APP_DIR/shared/data"
chmod 700 "$APP_DIR/shared" "$APP_DIR/shared/data"
if [ ! -f "$APP_DIR/shared/.env" ]; then
  cat > "$APP_DIR/shared/.env" <<EOF
# Réglages du site, lus à chaque démarrage
NODE_ENV=production
# Écoute seulement en local : CloudPanel (Nginx) sert le site en HTTPS sur ton domaine
HOST=127.0.0.1
PORT=$APP_PORT
TRUST_PROXY=1
DATA_DIR=$APP_DIR/shared/data
# Fuseau horaire du clan : séances, rappels, classement du dimanche
TZ=Africa/Abidjan
# Contact transmis aux services de notifications (obligatoire pour les iPhone)
PUSH_SUBJECT=mailto:contact@exemple.com
DEMO=0
BACKUP_KEEP=14
EOF
  chmod 600 "$APP_DIR/shared/.env"
fi

cat > "$APP_DIR/shared/ecosystem.config.cjs" <<EOF
// Lancement du site par pm2. « current » pointe vers la version en service.
module.exports = {
  apps: [{
    name: 'aakatsuki',
    cwd: '$APP_DIR/current',
    script: 'server/index.js',
    node_args: ['--env-file=$APP_DIR/shared/.env', '--disable-warning=ExperimentalWarning'],
    exec_mode: 'fork',
    instances: 1,
    max_memory_restart: '300M',
    kill_timeout: 5000,
    time: true,
  }],
};
EOF

# Redémarrage automatique du site quand le VPS redémarre
CRON="@reboot bash -lc '. \$HOME/.nvm/nvm.sh; pm2 resurrect'"
( crontab -l 2>/dev/null | grep -v 'pm2 resurrect' || true; echo "$CRON" ) | crontab -
AS_SITE_USER

# Clé réservée au déploiement : la partie privée va dans GitHub, jamais ailleurs
install -d -m 700 -o "$SITE_USER" -g "$(id -gn "$SITE_USER")" "$HOME_DIR/.ssh"
TMP=$(mktemp -d); KEY="$TMP/deploy_key"
ssh-keygen -q -t ed25519 -N '' -C "github-actions-aakatsuki" -f "$KEY"
cat "$KEY.pub" >> "$HOME_DIR/.ssh/authorized_keys"
chown "$SITE_USER:$(id -gn "$SITE_USER")" "$HOME_DIR/.ssh/authorized_keys"; chmod 600 "$HOME_DIR/.ssh/authorized_keys"

HOST_IP=$(curl -fsS4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
KNOWN_HOST=$HOST_IP; [ "$SSH_PORT" = 22 ] || KNOWN_HOST="[$HOST_IP]:$SSH_PORT"
echo
echo "===== À copier dans GitHub : Settings > Environments > production > Secrets ====="
echo "VPS_HOST        = $HOST_IP"
echo "VPS_USER        = $SITE_USER"
[ "$SSH_PORT" = 22 ] || echo "VPS_PORT        = $SSH_PORT"
echo "VPS_SSH_KEY     = (tout le bloc ci-dessous, lignes BEGIN et END comprises)"
cat "$KEY"
echo "VPS_KNOWN_HOSTS = (les lignes ci-dessous)"
ssh-keyscan -p "$SSH_PORT" 127.0.0.1 2>/dev/null | sed "s/^\S*/$KNOWN_HOST/"
echo "================================================================================="
rm -rf "$TMP"
echo
echo "Ensuite :"
echo " 1. Modifie $APP_DIR/shared/.env (TZ, PUSH_SUBJECT)."
echo " 2. Dans CloudPanel, le port de l'appli du site doit être $APP_PORT."
echo " 3. Ajoute les secrets dans GitHub et relance le workflow CI/CD."
