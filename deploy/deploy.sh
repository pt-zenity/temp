#!/bin/bash
# Rebuild the frontend and redeploy both the static site and the backend
# service to the VPS.
#
# Usage: bash deploy/deploy.sh [--skip-backend]
# Run from the project root (/home/files/webapp) or anywhere - it cd's
# into the script's own directory's parent first.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_ROOT="/var/www/tempfile.xyz"
BACKEND_DIR="/opt/tmpfup-backend"

echo "==> Building frontend production bundle ..."
cd "$PROJECT_ROOT"
npm run build

echo "==> Syncing dist/ to ${WEB_ROOT} ..."
rsync -a --delete "$PROJECT_ROOT/dist/" "$WEB_ROOT/"

if [ "$1" != "--skip-backend" ]; then
    echo "==> Syncing server/ to ${BACKEND_DIR} (excluding .env, node_modules, data) ..."
    rsync -a --exclude=node_modules --exclude=data --exclude=.env \
        "$PROJECT_ROOT/server/" "$BACKEND_DIR/"

    echo "==> Installing backend production dependencies ..."
    (cd "$BACKEND_DIR" && npm install --omit=dev)

    echo "==> Restarting backend service ..."
    systemctl restart tmpfup-backend.service
    sleep 1
    systemctl --no-pager status tmpfup-backend.service | head -5
fi

echo "==> Reloading nginx ..."
nginx -t
systemctl reload nginx

echo "==> Deployed. Verify:"
echo "    curl -s https://tempfile.xyz/api/health"
echo "    curl -I https://tempfile.xyz"
