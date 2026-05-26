#!/usr/bin/env bash
# =============================================================================
#  Demand Forecast — one-line bootstrap
#  Run AS ROOT on a fresh / existing Ubuntu VPS:
#
#    curl -fsSL https://raw.githubusercontent.com/fahalsalam/DEMAND_FORECAST/main/files/deploy/bootstrap.sh | sudo bash
#
#  What it does:
#   1. apt install git (if missing)
#   2. git clone the repo to /opt/demand-forecast
#   3. cd into the inner files/ dir
#   4. run deploy/deploy.sh (full install)
# =============================================================================
set -euo pipefail

REPO=${REPO:-https://github.com/fahalsalam/DEMAND_FORECAST.git}
CLONE_DIR=${CLONE_DIR:-/opt/demand-forecast}

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: please run as root (try:  sudo bash $0)"
  exit 1
fi

echo "================================================================"
echo " Demand Forecast — bootstrap"
echo "   repo      : $REPO"
echo "   clone dir : $CLONE_DIR"
echo "================================================================"

# 1. git
if ! command -v git >/dev/null 2>&1; then
  echo ">>> Installing git"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y git
fi

# 2. clone or update
if [ -d "$CLONE_DIR/.git" ]; then
  echo ">>> Repo already cloned — pulling latest"
  git -C "$CLONE_DIR" fetch --quiet
  git -C "$CLONE_DIR" reset --hard origin/main --quiet
else
  echo ">>> Cloning repo"
  rm -rf "$CLONE_DIR"
  git clone --quiet --depth 1 "$REPO" "$CLONE_DIR"
fi

# 3. hand off to deploy.sh inside files/
FILES_DIR="$CLONE_DIR/files"
if [ ! -f "$FILES_DIR/deploy/deploy.sh" ]; then
  echo "ERROR: $FILES_DIR/deploy/deploy.sh not found — wrong repo layout?"
  exit 1
fi
chmod +x "$FILES_DIR/deploy/deploy.sh" "$FILES_DIR/deploy/redeploy.sh" 2>/dev/null || true

echo
echo ">>> Handing off to deploy/deploy.sh (~10-15 min)"
echo
cd "$FILES_DIR"
APP_DIR="$FILES_DIR" bash deploy/deploy.sh
