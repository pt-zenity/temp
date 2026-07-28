# Deployment: tempfile.xyz on VPS (103.253.27.32)

This app is deployed as a **static build** served directly by **nginx** on
the VPS, rather than via `vite preview` (which is a dev-only server, not
meant for production).

## Layout

| Path | Purpose |
|---|---|
| `/var/www/tempfile.xyz/` | Web root — synced from `dist/` after each build |
| `/etc/nginx/sites-available/tempfile.xyz` | Nginx vhost config (copy in `deploy/nginx-tempfile.xyz.conf`) |
| `/usr/local/bin/setup-ssl-tempfile.sh` | One-shot Let's Encrypt cert issuance (copy in `deploy/setup-ssl-tempfile.sh`) |
| `/etc/systemd/system/tempfile-ssl-retry.{service,timer}` | Auto-retries cert issuance every 15 min until DNS propagates, then self-disables |

## Redeploying after code changes

```bash
bash deploy/deploy.sh
```

This runs `npm run build`, rsyncs `dist/` to `/var/www/tempfile.xyz/`, and
reloads nginx.

## DNS

`tempfile.xyz` was registered 2026-07-28 via Hostinger, using Cloudflare
nameservers (`amit.ns.cloudflare.com`, `dee.ns.cloudflare.com`) with the
Cloudflare proxy (orange cloud) enabled. The A record points to this VPS
(`103.253.27.32`), but public clients actually connect to Cloudflare's edge
IPs (e.g. `104.21.x.x`, `172.67.x.x`), which then proxy to the origin server.
DNS/NS delegation from the `.xyz` registry took a short time to propagate to
public resolvers after same-day registration — this is normal.

## SSL

Let's Encrypt certificate for `tempfile.xyz` + `www.tempfile.xyz` was issued
successfully via `certbot --nginx` once DNS had propagated. Certbot also
added the `listen 443 ssl` server block and the HTTP→HTTPS redirect to the
nginx vhost automatically (see `nginx-tempfile.xyz.conf` in this directory
for the resulting config), and registered its own renewal timer
(`certbot renew` via systemd, checked twice daily).

The one-shot retry helper (`setup-ssl-tempfile.sh` /
`tempfile-ssl-retry.service` + `.timer`) is kept here for reference / reuse
if the cert ever needs to be re-obtained from scratch (e.g. after a domain
change), but the timer has been disabled now that the cert is live.

Check cert status: `certbot certificates`

**Note on the Cloudflare proxy + certbot interaction**: because Cloudflare
proxies to origin over HTTPS by default ("Full" SSL mode), the nginx vhost
for `tempfile.xyz` MUST have its own `listen 443 ssl` block with a valid
certificate. Without it, HTTPS requests reaching this VPS with no matching
SNI/server_name on port 443 fall through to nginx's `default_server` block
(here, an unrelated app), serving the wrong content over HTTPS while HTTP
still worked correctly. Always run certbot (or otherwise add a 443 listener)
for any new Cloudflare-proxied domain added to this VPS.

## Verifying

```bash
curl -I -H "Host: tempfile.xyz" http://127.0.0.1/   # local vhost test, works immediately
curl -I http://tempfile.xyz/                         # 301 -> https, once DNS propagates
curl -I https://tempfile.xyz/                        # 200, once SSL cert is issued
```
