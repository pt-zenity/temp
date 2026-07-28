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
nameservers (`amit.ns.cloudflare.com`, `dee.ns.cloudflare.com`). The A record
was already configured correctly (`tempfile.xyz -> 103.253.27.32`) when
checked directly against the Cloudflare nameservers, but had not yet
propagated to public resolvers (1.1.1.1, 8.8.8.8) or the `.xyz` registry at
setup time. This is normal for a same-day domain registration.

## SSL

Once DNS has propagated, either:

- Wait for the `tempfile-ssl-retry.timer` systemd timer to succeed
  automatically (checks every 15 min, self-disables on success), or
- Run manually: `bash /usr/local/bin/setup-ssl-tempfile.sh`

Check timer status: `systemctl list-timers tempfile-ssl-retry.timer`
Check cert status: `certbot certificates`

## Verifying

```bash
curl -I -H "Host: tempfile.xyz" http://127.0.0.1/   # works immediately (local vhost test)
curl -I http://tempfile.xyz/                         # works once DNS propagates
curl -I https://tempfile.xyz/                        # works once SSL cert is issued
```
