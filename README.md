<a href="https://tempfile.xyz">
    <img src="https://azukashiic.sirv.com/app/tmp/tmp-icon.png?format=original&q=100" alt="/tmp/fup/" style="float: left; margin: 0 10px 0 0; pointer-events: none; z-index: 100;" align="left" height="150" width="150">
</a>

## 📄 /tmp/fup

Temporary file upload solution with 1-hour expiration. **Fully self-hosted**: the
Vue frontend talks to a small self-hosted Node/Express backend (in [`server/`](./server)),
which stores files in an S3-compatible bucket and auto-deletes them once expired.
No third-party file-upload API is used.

[![Project Version](https://img.shields.io/github/package-json/v/azukashi/tmp-files?logo=node.js&style=for-the-badge)](./package.json)

## 📂 Usage

Drag & drop your files, or click browse, and click on the checkmark to start uploading your file. Once successfully uploaded, your files will be available to copy or download in the right side. **Please note that your files will only available in 1 hour.** Your files will be deleted when the expiration timer ends.

## 🏗️ Architecture

```
Browser (Vue + FilePond)
   │  POST /api/upload  (same-origin, proxied by nginx)
   ▼
Node/Express backend (server/)
   │  PutObject / DeleteObject / presigned GetObject
   ▼
S3-compatible bucket (any provider: Neo.id NOS, MinIO, AWS S3, ...)
```

- The frontend never talks to the S3 bucket or holds any S3 credentials.
- The backend stores upload metadata + expiry timestamps in a local SQLite
  database and runs a background job that deletes expired files from S3.
- View/download links (`/f/:id`, `/dl/f/:id`) redirect (302) to a short-lived
  presigned S3 URL, so the bucket itself never needs to be public.

See [`server/README.md`](./server/README.md) for backend setup and
[`deploy/README.md`](./deploy/README.md) for the production VPS deployment.

## ➡️ Developing

### 🛠️ Requirements

Node.js >= 20 (a [Bun](https://bun.sh) >= 1.2.0 setup also works for the frontend).

### 📦 Install dependencies

```sh
# Frontend
$ npm install

# Backend
$ cd server && npm install
```

### 🚀 Start development servers

```sh
# Backend (from server/, after copying .env.example to .env and filling in
# your S3 credentials)
$ cd server && npm run dev

# Frontend (from the project root, in another terminal)
$ npm run dev
#
#  VITE v5.x.x  ready in xx ms
#
#  ➜  Local:   http://localhost:5173/
#  ➜  Network: http://[local_ip]:5173/
#  ➜  press h to show help
```

Vite's dev server proxies `/api` and `/f` to the backend (see `vite.config.ts`),
so the frontend can call same-origin paths in both dev and production.
