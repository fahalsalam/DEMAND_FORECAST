#!/usr/bin/env bash
# =============================================================================
#  Demand Forecast — VPS install / first-time deploy
#  Run AS ROOT on a fresh Ubuntu 22.04 / 24.04 server.
#
#    curl ... | bash                # quick test
#    OR
#    git clone <repo> /opt/demand-forecast && cd /opt/demand-forecast
#    sudo bash deploy/deploy.sh
#
#  After this script finishes, the app is live at
#      http://<this-vps-ip>:8080/
#
#  Re-run to update? Use deploy/redeploy.sh instead (much faster).
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/demand-forecast}
APP_USER=${APP_USER:-demandapp}
APP_PORT=${APP_PORT:-8000}      # internal FastAPI port (only nginx talks to it)
SITE_PORT=${SITE_PORT:-8080}    # public nginx port → http://IP:8080

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [ "$REPO_DIR" != "$APP_DIR" ]; then
  echo "Note: running from $REPO_DIR — files will be copied to $APP_DIR"
fi

echo "================================================================"
echo " Demand Forecast — VPS deploy"
echo "   app dir  : $APP_DIR"
echo "   port     : $SITE_PORT (public) → $APP_PORT (backend)"
echo "================================================================"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: please run as root (sudo bash $0)"
  exit 1
fi

# --- 1. System packages -------------------------------------------------------
echo
echo ">>> 1/9  Installing system packages (Python 3.11, build tools, nginx)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y software-properties-common ca-certificates curl
# deadsnakes for Python 3.11 (Ubuntu 24.04 only ships 3.12 by default).
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y \
  python3.11 python3.11-venv python3.11-dev \
  build-essential git \
  libomp-dev \
  nginx

# Node 20 from NodeSource (only if missing)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# --- 2. Service user ----------------------------------------------------------
echo
echo ">>> 2/9  Creating service user '$APP_USER'"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# --- 3. App directory ---------------------------------------------------------
echo
echo ">>> 3/9  Syncing app code to $APP_DIR"
mkdir -p "$APP_DIR"
if [ "$REPO_DIR" != "$APP_DIR" ]; then
  rsync -a --delete \
    --exclude='.venv' --exclude='node_modules' --exclude='dist' \
    --exclude='__pycache__' --exclude='*.db' \
    "$REPO_DIR/" "$APP_DIR/"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# --- 4. Python venv + deps ----------------------------------------------------
echo
echo ">>> 4/9  Python venv + pip install (this is the slow step, ~5-10 min)"
sudo -u "$APP_USER" bash <<EOF
set -e
cd $APP_DIR/backend
[ -d .venv ] || python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt
EOF

# --- 5. cmdstan for Prophet ---------------------------------------------------
echo
echo ">>> 5/9  Compiling cmdstan for Prophet (one-time, ~2-3 min)"
sudo -u "$APP_USER" bash -c "
  cd $APP_DIR/backend
  if [ ! -d /home/$APP_USER/.cmdstan ]; then
    .venv/bin/python -c 'import cmdstanpy; cmdstanpy.install_cmdstan(progress=False)'
  else
    echo '   (cmdstan already installed)'
  fi
"

# --- 6. Seed the database (first run only) ------------------------------------
echo
echo ">>> 6/9  Seeding the database (only if empty)"
sudo -u "$APP_USER" bash -c "
  cd $APP_DIR/backend
  if [ ! -f demand_forecast.db ]; then
    .venv/bin/python seed.py
  else
    echo '   (DB already exists — skipping seed)'
  fi
"

# --- 7. Frontend build --------------------------------------------------------
echo
echo ">>> 7/9  Building React production bundle"
PUBLIC_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
echo "VITE_API_BASE=http://${PUBLIC_IP}:${SITE_PORT}/api" > "$APP_DIR/frontend/.env.production"
sudo -u "$APP_USER" bash <<EOF
set -e
cd $APP_DIR/frontend
npm ci --silent
npm run build
EOF
chown -R "$APP_USER:$APP_USER" "$APP_DIR/frontend"

# --- 8. systemd service -------------------------------------------------------
echo
echo ">>> 8/9  Installing systemd unit for the FastAPI backend"
cat >/etc/systemd/system/demand-forecast.service <<EOF
[Unit]
Description=Demand Forecast FastAPI backend
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$APP_DIR/backend/.venv/bin"
ExecStart=$APP_DIR/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $APP_PORT --workers 1
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now demand-forecast.service

# --- 9. Nginx vhost -----------------------------------------------------------
echo
echo ">>> 9/9  Installing nginx vhost on port $SITE_PORT (additive — won't touch :80/:443)"
cat >/etc/nginx/sites-available/demand-forecast <<EOF
server {
    listen $SITE_PORT;
    listen [::]:$SITE_PORT;
    server_name _;

    root $APP_DIR/frontend/dist;
    index index.html;

    # client-side routing — fall back to index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # proxy /api/* → FastAPI on 127.0.0.1:$APP_PORT
    location /api/ {
        rewrite ^/api/(.*)\$ /\$1 break;
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    # tighten static asset caching
    location ~* \.(?:js|css|ico|svg|png|jpg|jpeg|webp|woff2?)$ {
        try_files \$uri =404;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }
}
EOF
ln -sf /etc/nginx/sites-available/demand-forecast /etc/nginx/sites-enabled/demand-forecast
nginx -t
systemctl reload nginx

# Open port in ufw if it's active
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${SITE_PORT}/tcp" >/dev/null
fi

echo
echo "================================================================"
echo " ✅  DEPLOYED"
echo "     App      : http://${PUBLIC_IP}:${SITE_PORT}/"
echo "     API docs : http://${PUBLIC_IP}:${SITE_PORT}/api/docs"
echo "     Login    : admin@retail.local / demo1234"
echo ""
echo "     Backend service:  systemctl status demand-forecast"
echo "     Tail logs      :  journalctl -u demand-forecast -f"
echo "     Re-deploy code :  cd $APP_DIR && git pull && bash deploy/redeploy.sh"
echo "================================================================"
