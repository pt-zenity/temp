import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';

import { insertUpload, getUploadById, incrementDownloadCount, logActivity } from './src/db.js';
import { buildKey, putObject, checkBucketAccess, getObject } from './src/s3.js';
import { startCleanupLoop } from './src/cleanup.js';
import { ensureBootstrapAdmin } from './src/auth.js';
import { adminRouter } from './src/admin.js';
import { getClientIp, getRateLimitKey, buildContentDisposition, isUnsafeInlineContentType } from './src/security.js';

const PORT = Number(process.env.PORT || 3001);
const DEFAULT_EXPIRE_SECONDS = Number(process.env.DEFAULT_EXPIRE_SECONDS || 3600);
const MAX_EXPIRE_SECONDS = Number(process.env.MAX_EXPIRE_SECONDS || 172800);
const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_BYTES || 100 * 1024 * 1024);
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 60_000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Admin API routes carry a credentialed session cookie, so they must NEVER
// be served with a reflected wildcard origin (Access-Control-Allow-Origin:
// <anything> + Allow-Credentials: true lets *any* website read the logged-in
// admin's data via the visitor's browser). The public upload/download
// endpoints carry no cookie-based auth, so a permissive origin there is
// safe and intentional (this is a public anonymous upload tool meant to be
// embeddable/callable from anywhere).
const explicitOrigins = CORS_ORIGIN === '*' ? [] : CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

const publicCors = cors({
    origin: CORS_ORIGIN === '*' ? true : explicitOrigins,
    credentials: false,
});

const adminCors = cors({
    origin(origin, callback) {
        // Same-origin requests (no Origin header, e.g. curl/server-to-server)
        // are always allowed. Cross-origin requests are only allowed if an
        // explicit, non-wildcard allowlist was configured via CORS_ORIGIN.
        if (!origin) return callback(null, true);
        if (explicitOrigins.length > 0 && explicitOrigins.includes(origin)) return callback(null, true);
        if (explicitOrigins.length === 0) return callback(null, false); // wildcard config -> no cross-origin admin access
        return callback(null, false);
    },
    credentials: true,
});

// Dispatch to the right CORS policy by path instead of chaining two
// unconditional `cors()` middlewares - otherwise the second one to run
// would blindly overwrite the Access-Control-* headers the first one set,
// silently negating the /api/admin restriction below.
function corsRouter(req, res, next) {
    if (req.path.startsWith('/api/admin')) return adminCors(req, res, next);
    return publicCors(req, res, next);
}

const app = express();
app.disable('x-powered-by');
// Required so req.protocol reflects the original client scheme (https)
// when running behind the nginx reverse proxy, instead of always
// reporting "http" for the internal proxy_pass connection.
app.set('trust proxy', true);

// Standard hardening headers (nosniff, no X-Frame embedding of the API,
// disabled cross-domain policies, hidden Referer info, etc). We disable
// helmet's default Content-Security-Policy here because this process only
// serves a JSON API + raw file bytes, not HTML pages that need a CSP - the
// actual frontend HTML is served by nginx/static hosting, not this app.
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
);

app.use(corsRouter);

// Cap JSON body size well above any legitimate admin/API payload but far
// below anything that could be used for a memory-exhaustion DoS (actual
// file uploads go through multer's separate, configurable limit).
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Basic protection against abuse on the public upload endpoint - generous
// enough for legitimate use (this is a public anonymous upload tool) but
// stops a single client from hammering the API / S3 bucket.
const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRateLimitKey,
    message: { status: 'error', message: 'Too many uploads from this IP. Please slow down.' },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// ── Admin panel API (auth, stats, file management, system health) ────────
// Mounted at /api/admin/*; the router itself enforces authentication on
// every route except /login.
app.use('/api/admin', adminRouter);

// ── Upload ────────────────────────────────────────────────────────────────
// Kept response-shape compatible with the previous tmpfiles.org integration
// ({"status":"success","data":{"url": "..."}}) so the existing Vue frontend
// (App.vue / FileCard.vue) needs no changes beyond pointing at this URL.
app.post('/api/upload', uploadLimiter, upload.single('file'), async (req, res) => {
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
            uploaderIp: getClientIp(req),
        });
        logActivity({ actor: 'public', action: 'file_uploaded', target: id, detail: req.file.originalname, ip: getClientIp(req) });

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

        // Never let the browser execute/render an uploaded file as active
        // content on our own origin (HTML/SVG/JS can carry stored XSS that
        // would run with tempfile.xyz's privileges against anyone who opens
        // the link, including an admin). Such files are always served as a
        // generic, non-executable download regardless of the requested mode.
        const unsafeInline = isUnsafeInlineContentType(row.content_type);
        const effectiveContentType = unsafeInline ? 'application/octet-stream' : row.content_type || 'application/octet-stream';
        const disposition = forceDownload || unsafeInline ? 'attachment' : 'inline';

        res.setHeader('Content-Type', effectiveContentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (typeof row.size === 'number') {
            res.setHeader('Content-Length', row.size);
        }
        res.setHeader('Content-Disposition', buildContentDisposition(disposition, row.original_name));
        // Short cache is fine since each id is immutable content until it expires.
        res.setHeader('Cache-Control', 'private, max-age=60');

        incrementDownloadCount(row.id, new Date().toISOString());

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

// ── 404 fallback for any unmatched API/app route ──────────────────────────
app.use((req, res) => {
    res.status(404).json({ status: 'error', message: 'Not found.' });
});

// ── Centralized error handler ─────────────────────────────────────────────
// Catches anything an upstream middleware/route passed to next(err) or
// threw synchronously - most notably malformed JSON bodies from
// express.json(), which would otherwise surface as an unhandled 500 with a
// raw stack trace. Kept last, per Express's error-handling middleware
// convention (4-arg signature, mounted after all other app.use/app.METHOD).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
        return res.status(400).json({ status: 'error', message: 'Malformed request body.' });
    }
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ status: 'error', message: 'Request body too large.' });
    }
    if (err?.message === 'Not allowed by CORS') {
        return res.status(403).json({ status: 'error', message: 'Origin not allowed.' });
    }
    console.error('[unhandled]', err);
    if (res.headersSent) return; // response already started (e.g. mid-stream) - nothing more we can send
    res.status(500).json({ status: 'error', message: 'Internal server error.' });
});

let httpServer;

async function main() {
    try {
        await checkBucketAccess();
        console.log('[startup] S3 bucket access verified.');
    } catch (err) {
        console.error('[startup] FAILED to access S3 bucket. Check .env configuration.', err);
        process.exit(1);
    }

    try {
        ensureBootstrapAdmin();
    } catch (err) {
        console.error('[startup] FAILED to set up admin account:', err.message);
        process.exit(1);
    }

    startCleanupLoop(CLEANUP_INTERVAL_MS);

    httpServer = app.listen(PORT, '0.0.0.0', () => {
        console.log(`[startup] /tmp/fup backend listening on http://0.0.0.0:${PORT}`);
    });
}

// Graceful shutdown: stop accepting new connections and let in-flight
// requests (e.g. an in-progress file stream) finish, so systemd
// restarts/deploys never abruptly cut off a download or upload.
function shutdown(signal) {
    console.log(`[shutdown] received ${signal}, closing server ...`);
    if (!httpServer) process.exit(0);
    httpServer.close(() => process.exit(0));
    // Safety net in case some connection never closes.
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main();
