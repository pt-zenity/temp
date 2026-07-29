# /tmp/fup backend

Self-hosted Node/Express backend for the `/tmp/fup` temporary file upload app.
Replaces the previous dependency on the third-party `tmpfiles.org` API: this
service stores uploads in your own S3-compatible bucket and manages expiry
itself.

## What it does

- `POST /api/upload` — accepts a multipart `file` field (+ optional `expire`
  in seconds), uploads it to S3, and records metadata (name, size, type,
  expiry) in a local SQLite database. Response shape is intentionally
  compatible with the old tmpfiles.org response
  (`{"status":"success","data":{"url": "..."}}`) so the frontend needs no
  special-casing.
- `GET /f/:id` — fetches the object from S3 and **streams it directly**
  through this backend for inline viewing. The client only ever talks to
  tempfile.xyz; the S3/NOS endpoint and credentials are never exposed to
  the browser (no redirect to a presigned S3 URL).
- `GET /dl/f/:id` — same streaming behaviour, but sends
  `Content-Disposition: attachment` so the browser downloads instead of
  rendering inline.
- `GET /api/files/:id` — JSON metadata for an upload (name, type, size,
  created/expires timestamps).
- `GET /api/health` — trivial health check.
- Background cleanup loop (default: every 60s) that finds expired,
  not-yet-deleted uploads, removes the S3 object, and marks them deleted in
  SQLite.

## Setup

```sh
cd server
npm install
cp .env.example .env
# edit .env: fill in S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET
npm start
```

See `.env.example` for all available options (expiry limits, max file size,
CORS, cleanup interval, etc).

## S3 compatibility

Any S3-compatible provider works (tested against Neo.id NOS). The client
uses **path-style addressing** (`forcePathStyle: true`), which most
self-hosted / non-AWS S3 implementations require (MinIO, Neo.id NOS, Ceph
RGW, etc). If you use AWS S3 directly, path-style still works fine.

Uploaded objects are stored under `S3_PREFIX` (default: none) inside
`S3_BUCKET`, so this backend can safely share a bucket with other
applications/data without colliding — just give it its own prefix.

## Running in production

This backend is meant to be run as a long-lived process (e.g. via systemd)
behind a reverse proxy (nginx) that forwards `/api/*`, `/f/*`, and `/dl/*` to
it while serving the built frontend (`dist/`) for everything else. See
`../deploy/README.md` and `../deploy/tmpfup-backend.service` for the VPS
deployment used for tempfile.xyz.

## Data & security notes

- The S3 bucket does **not** need to be public. `/f/:id` and `/dl/f/:id`
  fetch the object with the backend's own S3 credentials and stream the
  bytes straight to the client — the bucket, endpoint, and credentials stay
  entirely server-side and are never visible to the browser (no S3 URLs are
  ever exposed, presigned or otherwise).
- `data/uploads.sqlite` (the metadata DB) is local to this backend and is
  git-ignored. Back it up if you need upload history beyond what's in S3.
- Never commit `.env` — it holds your S3 secret key. Only `.env.example` is
  tracked in git.

## Admin panel API

Mounted at `/api/admin/*` (see `src/admin.js`). All routes except `/login`
require a valid session (httpOnly JWT cookie, or `Authorization: Bearer`).

- `POST /api/admin/login` — `{ username, password }` → sets session cookie. Rate-limited (10/15min/IP).
- `POST /api/admin/logout`
- `GET /api/admin/me` — current session's username.
- `POST /api/admin/change-password` — `{ newPassword }` (min 8 chars).
- `GET /api/admin/stats` — upload counts/bytes (total, 24h, 7d), downloads, by-type breakdown, 14-day daily trend.
- `GET /api/admin/system` — live CPU %, load average, memory, disk, uptime, Node version.
- `GET /api/admin/s3-usage` — real object count + bytes queried live from the S3 bucket (not just local DB).
- `GET /api/admin/files?page=&pageSize=&status=all|active|expired&search=` — paginated file listing.
- `DELETE /api/admin/files/:id` — deletes the S3 object + marks it deleted in SQLite immediately (revokes access).
- `GET /api/admin/activity?page=&pageSize=` — audit log of logins, uploads, deletions, password changes.

Admin accounts live in the `admin_users` SQLite table (bcrypt-hashed
passwords). The first account is bootstrapped from `ADMIN_USERNAME` /
`ADMIN_PASSWORD` env vars the first time the server ever starts (i.e. when
that table is empty) — see `.env.example`. Change the password from the
panel's Settings page afterwards; the env password is not re-read once an
account exists.
