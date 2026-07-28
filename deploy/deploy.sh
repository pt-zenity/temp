#!/bin/bash
# Rebuild the app and redeploy the static files to the VPS web root served
# by nginx for tempfile.xyz.
#
# Usage: bash deploy/deploy.sh
# Run from the project root (/home/files/webapp) or anywhere - it cd's
# into the script's own directory's parent first.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_ROOT="/var/www/tempfile.xyz"

echo "==> Building production bundle ..."
cd "$PROJECT_ROOT"
npm run build

echo "==> Syncing dist/ to ${WEB_ROOT} ..."
rsync -a --delete "$PROJECT_ROOT/dist/" "$WEB_ROOT/"

echo "==> Reloading nginx ..."
nginx -t
systemctl reload nginx

echo "==> Deployed. Verify: curl -I https://tempfile.xyz"
