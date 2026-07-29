#!/bin/bash
# One-shot helper: obtain Let's Encrypt SSL for tempfile.xyz once DNS has
# propagated. Safe to re-run — certbot is idempotent and will skip domains
# that already have a valid cert.
#
# Usage: bash setup-ssl-tempfile.sh

set -e

DOMAIN="tempfile.xyz"
WWW_DOMAIN="www.tempfile.xyz"

echo "==> Checking public DNS resolution for ${DOMAIN} ..."
IP=$(dig +short "${DOMAIN}" A @1.1.1.1 | tail -1)

if [ -z "$IP" ]; then
    echo "!! ${DOMAIN} does not resolve yet via public DNS (1.1.1.1)."
    echo "!! DNS propagation for a freshly registered domain can take"
    echo "!! anywhere from a few minutes up to ~24-48 hours."
    echo "!! Re-run this script later: bash $0"
    exit 1
fi

echo "==> ${DOMAIN} resolves to: ${IP}"

if [ "$IP" != "103.253.27.32" ]; then
    echo "!! WARNING: ${DOMAIN} resolves to ${IP}, not this server's IP (103.253.27.32)."
    echo "!! Check the A record in Cloudflare DNS before continuing."
    exit 1
fi

echo "==> DNS looks correct. Requesting certificate via certbot ..."
certbot --nginx -d "${DOMAIN}" -d "${WWW_DOMAIN}" \
    --non-interactive --agree-tos -m admin@tempfile.xyz --redirect

echo "==> Reloading nginx ..."
systemctl reload nginx

echo "==> Done. Verify: curl -I https://${DOMAIN}"
