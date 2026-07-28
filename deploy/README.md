# Deployment: tempfile.xyz on VPS (103.253.27.32)

This app is now **fully self-hosted**, consisting of two deployed pieces:

1. **Frontend** — a static Vue build served directly by **nginx** (not via
   `vite preview`, which is a dev-only server, not meant for production).
2. **Backend** — a Node.js/Express API (`server/`) running as a permanent
   **systemd service**, which handles file uploads and stores them in an
   **S3-compatible bucket** (Neo.id NOS) instead of any third-party upload
   API. Nginx reverse-proxies `/api/`, `/f/`, and `/dl/` to this backend.

```
Browser ── https://tempfile.xyz ──▶ nginx
                                     ├─ static files (SPA) ──▶ /var/www/tempfile.xyz/
                                     └─ /api/, /f/, /dl/ ──▶ 127.0.0.1:3001 (Node/Express)
                                                                   │
                                                                   ├─ SQLite (upload metadata + TTL)
                                                                   └─ S3-compatible bucket (Neo.id NOS)
```

## Layout

| Path | Purpose |
|---|---|
| `/var/www/tempfile.xyz/` | Web root — synced from `dist/` after each build |
| `/opt/tmpfup-backend/` | Backend deployment — synced from `server/` (excludes `node_modules`, `data/`, `.env`); real `.env` lives only here, never in git |
| `/etc/systemd/system/tmpfup-backend.service` | Runs the backend permanently, auto-restarts on crash/reboot (copy in `deploy/tmpfup-backend.service`) |
| `/etc/nginx/sites-available/tempfile.xyz` | Nginx vhost config — serves the SPA and proxies `/api/`, `/f/`, `/dl/` to the backend (copy in `deploy/nginx-tempfile.xyz.conf`) |
| `/usr/local/bin/setup-ssl-tempfile.sh` | One-shot Let's Encrypt cert issuance (copy in `deploy/setup-ssl-tempfile.sh`) |
| `/etc/systemd/system/tempfile-ssl-retry.{service,timer}` | Auto-retries cert issuance every 15 min until DNS propagates, then self-disables (disabled now that the cert is live) |

## S3 storage backend

Uploaded files are stored in an S3-compatible bucket rather than on local
disk, so the app has no growing local storage footprint and can scale
independently of the VPS disk:

| Setting | Value |
|---|---|
| Endpoint | `https://nos.jkt-1.neo.id` (Neo.id NOS, S3-compatible) |
| Region | `jkt-1` |
| Bucket | `zti` (⚠️ shared with other unrelated apps/backups on this VPS) |
| Key prefix | `tmpfup/` (keeps this app's objects isolated inside the shared bucket) |
| Access mode | Bucket is **private**; downloads are served via short-lived (5 min) presigned URLs generated on demand — never made public |

Real credentials live only in `/opt/tmpfup-backend/.env` (and locally in
`server/.env` for dev) — both are gitignored and must never be committed.
See `server/.env.example` for the full list of configuration options
(expiry limits, max file size, cleanup interval, etc.) and `server/README.md`
for backend API details.

## Redeploying after code changes

```bash
bash deploy/deploy.sh              # deploys frontend AND backend
bash deploy/deploy.sh --skip-backend   # frontend only (faster, e.g. UI-only changes)
```

This runs `npm run build`, rsyncs `dist/` to `/var/www/tempfile.xyz/`, and
reloads nginx. Unless `--skip-backend` is passed, it also rsyncs `server/`
to `/opt/tmpfup-backend/` (excluding `node_modules`, `data/`, `.env`),
runs `npm install --omit=dev` there, and restarts
`tmpfup-backend.service` via systemd.

**Note:** `/opt/tmpfup-backend/.env` is never overwritten by this script —
it must be created/updated manually on the VPS the first time (or whenever
S3 credentials or other backend config changes), based on
`server/.env.example`.

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
