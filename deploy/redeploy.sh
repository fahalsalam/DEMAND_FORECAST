#!/usr/bin/env bash
# =============================================================================
#  Demand Forecast — fast re-deploy (after code changes)
#
#  Run AS ROOT on the VPS after `git pull`:
#      cd /opt/demand-forecast && git pull && sudo bash deploy/redeploy.sh
#
#  Skips package install, cmdstan compile, seed — only rebuilds + restarts.
#  Typical runtime: ~30-60 seconds.
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/demand-forecast}
APP_USER=${APP_USER:-demandapp}
APP_PORT=${APP_PORT:-8000}
SITE_PORT=${SITE_PORT:-8080}

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: please run as root (sudo bash $0)"
  exit 1
fi

echo "================================================================"
echo " Demand Forecast — re-deploy from $APP_DIR"
echo "================================================================"

# Refresh ownership in case git pull changed files
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Python deps may have changed
echo ">>> [1/4] pip install -r requirements.txt"
sudo -u "$APP_USER" bash -c "
  cd $APP_DIR/backend
  .venv/bin/pip install -r requirements.txt --quiet
"

# Frontend rebuild
echo ">>> [2/4] Rebuilding React bundle"
PUBLIC_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
echo "VITE_API_BASE=http://${PUBLIC_IP}:${SITE_PORT}/api" > "$APP_DIR/frontend/.env.production"
sudo -u "$APP_USER" bash <<EOF
set -e
cd $APP_DIR/frontend
npm ci --silent
npm run build
EOF

# Restart backend
echo ">>> [3/4] Restarting FastAPI service"
systemctl restart demand-forecast.service
systemctl --no-pager status demand-forecast.service | head -7

# Reload nginx in case the build changed (it shouldn't for static-only redeploys)
echo ">>> [4/4] Reloading nginx"
nginx -t && systemctl reload nginx

echo
echo "================================================================"
echo " ✅  RE-DEPLOYED"
echo "     App: http://${PUBLIC_IP}:${SITE_PORT}/"
echo "================================================================"
