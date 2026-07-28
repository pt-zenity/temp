import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { nanoid } from 'nanoid';

import { insertUpload, getUploadById } from './src/db.js';
import { buildKey, putObject, checkBucketAccess, getObject } from './src/s3.js';
import { startCleanupLoop } from './src/cleanup.js';

const PORT = Number(process.env.PORT || 3001);
const DEFAULT_EXPIRE_SECONDS = Number(process.env.DEFAULT_EXPIRE_SECONDS || 3600);
const MAX_EXPIRE_SECONDS = Number(process.env.MAX_EXPIRE_SECONDS || 172800);
const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_BYTES || 100 * 1024 * 1024);
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 60_000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.disable('x-powered-by');
// Required so req.protocol reflects the original client scheme (https)
// when running behind the nginx reverse proxy, instead of always
// reporting "http" for the internal proxy_pass connection.
app.set('trust proxy', true);
app.use(
    cors({
        origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((s) => s.trim()),
    })
);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// ── Upload ────────────────────────────────────────────────────────────────
// Kept response-shape compatible with the previous tmpfiles.org integration
// ({"status":"success","data":{"url": "..."}}) so the existing Vue frontend
// (App.vue / FileCard.vue) needs no changes beyond pointing at this URL.
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'No file provided (field name must be "file").' });
        }

        let expireSeconds = DEFAULT_EXPIRE_SECONDS;
        if (req.body?.expire) {
            const parsed = Number(req.body.expire);
            if (Number.isFinite(parsed) && parsed > 0) {
                expireSeconds = Math.min(parsed, MAX_EXPIRE_SECONDS);
            }
        }

        const id = nanoid(10);
        const key = buildKey(id, req.file.originalname || 'file');

        await putObject({
            key,
            body: req.file.buffer,
            contentType: req.file.mimetype,
            contentLength: req.file.size,
        });

        const now = new Date();
        const expiresAt = new Date(now.getTime() + expireSeconds * 1000);

        insertUpload({
            id,
            s3Key: key,
            originalName: req.file.originalname || 'file',
            contentType: req.file.mimetype || 'application/octet-stream',
            size: req.file.size,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
        });

        const baseUrl = `${req.protocol}://${req.get('host')}`;

        res.json({
            status: 'success',
            data: {
                url: `${baseUrl}/f/${id}`,
                id,
                expiresAt: expiresAt.toISOString(),
            },
        });
    } catch (err) {
        console.error('[upload] failed:', err);
        if (err?.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ status: 'error', message: 'File too large.' });
        }
        res.status(500).json({ status: 'error', message: 'Upload failed.' });
    }
});

// ── Metadata (used by the frontend to display file info if needed) ────────
app.get('/api/files/:id', (req, res) => {
    const row = getUploadById(req.params.id);
    if (!row) {
        return res.status(404).json({ status: 'error', message: 'File not found or expired.' });
    }
    res.json({
        status: 'success',
        data: {
            id: row.id,
            fileName: row.original_name,
            fileType: row.content_type,
            fileSize: row.size,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
        },
    });
});

// ── View (inline) ───────────────────────────────────────────────────────
// Mirrors the previous "https://tmpfiles.org/{id}/{name}" viewer link.
app.get('/f/:id', async (req, res) => {
    await streamFile(req, res, { forceDownload: false });
});

// ── Download (attachment) ─────────────────────────────────────────────────
// Mirrors the previous injectDownloadPath() transform in FileCard.vue, which
// prepends "dl" as the first path segment of the view URL
// (".../f/<id>" -> ".../dl/f/<id>") - no frontend changes needed for this.
app.get('/dl/f/:id', async (req, res) => {
    await streamFile(req, res, { forceDownload: true });
});

// Streams the object from S3 through this backend rather than redirecting
// to a presigned S3/NOS URL. This keeps the app genuinely self-hosted from
// the visitor's perspective: the browser's address bar, and every byte it
// receives, stays on tempfile.xyz - the S3-compatible storage endpoint is
// an internal implementation detail the client never sees or depends on.
async function streamFile(req, res, { forceDownload }) {
    const row = getUploadById(req.params.id);
    if (!row) {
        return res.status(404).send('File not found or expired.');
    }

    try {
        const object = await getObject(row.s3_key);

        res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
        if (typeof row.size === 'number') {
            res.setHeader('Content-Length', row.size);
        }
        if (forceDownload) {
            res.setHeader('Content-Disposition', `attachment; filename="${row.original_name.replace(/"/g, '')}"`);
        }
        // Short cache is fine since each id is immutable content until it expires.
        res.setHeader('Cache-Control', 'private, max-age=60');

        const body = object.Body;
        if (body && typeof body.pipe === 'function') {
            body.on('error', (err) => {
                console.error(`[download] stream error for ${row.id}:`, err);
                res.destroy(err);
            });
            body.pipe(res);
        } else {
            // Fallback for SDK responses that don't expose a Node stream.
            const buffer = Buffer.from(await object.Body.transformToByteArray());
            res.end(buffer);
        }
    } catch (err) {
        if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
            return res.status(404).send('File not found or expired.');
        }
        console.error(`[download] failed to fetch object for ${row.id}:`, err);
        res.status(500).send('Failed to retrieve file.');
    }
}

async function main() {
    try {
        await checkBucketAccess();
        console.log('[startup] S3 bucket access verified.');
    } catch (err) {
        console.error('[startup] FAILED to access S3 bucket. Check .env configuration.', err);
        process.exit(1);
    }

    startCleanupLoop(CLEANUP_INTERVAL_MS);

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[startup] /tmp/fup backend listening on http://0.0.0.0:${PORT}`);
    });
}

main();
