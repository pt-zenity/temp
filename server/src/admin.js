import express from 'express';
import rateLimit from 'express-rate-limit';

import {
    listUploads,
    getStats,
    getAnyUploadById,
    markDeleted,
    logActivity,
    listActivity,
} from './db.js';
import { deleteObject, getBucketUsage } from './s3.js';
import { getSystemSnapshot } from './system.js';
import { verifyCredentials, changePassword, recordLogin, issueToken, COOKIE_NAME, requireAdmin } from './auth.js';
import { getClientIp, getRateLimitKey } from './security.js';

export const adminRouter = express.Router();

const DB_PATH = process.env.DB_PATH || './data/uploads.sqlite';
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 12 * 3600 * 1000, // 12h, matches JWT TTL
    path: '/',
};

// Slow down brute-force login attempts. 10 attempts / 15 min / IP.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRateLimitKey,
    message: { status: 'error', message: 'Too many login attempts. Try again later.' },
});

// Applies to already-authenticated but sensitive mutation routes
// (change-password, file deletion). Generous enough for normal admin use,
// but stops a compromised/leaked session from being used to hammer these
// endpoints (e.g. mass-deleting files or password-spraying via the
// change-password route).
const sensitiveActionLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRateLimitKey,
    message: { status: 'error', message: 'Too many requests. Please slow down.' },
});

const MAX_SEARCH_LENGTH = 100;

// ── Auth ─────────────────────────────────────────────────────────────────
adminRouter.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        !username.trim() ||
        !password ||
        username.length > 100 ||
        password.length > 200
    ) {
        return res.status(400).json({ status: 'error', message: 'Username and password are required.' });
    }
    const cleanUsername = username.trim();

    const user = verifyCredentials(cleanUsername, password);
    if (!user) {
        logActivity({ actor: cleanUsername, action: 'login_failed', ip: getClientIp(req) });
        return res.status(401).json({ status: 'error', message: 'Invalid username or password.' });
    }

    recordLogin(cleanUsername, getClientIp(req));
    logActivity({ actor: cleanUsername, action: 'login_success', ip: getClientIp(req) });

    const token = issueToken(cleanUsername);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({ status: 'success', data: { username: cleanUsername } });
});

adminRouter.post('/logout', requireAdmin, (req, res) => {
    logActivity({ actor: req.admin.username, action: 'logout', ip: getClientIp(req) });
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
    res.json({ status: 'success' });
});

adminRouter.get('/me', requireAdmin, (req, res) => {
    res.json({ status: 'success', data: { username: req.admin.username } });
});

adminRouter.post('/change-password', sensitiveActionLimiter, requireAdmin, (req, res) => {
    const { newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
        return res
            .status(400)
            .json({ status: 'error', message: 'New password must be at least 8 characters.' });
    }
    changePassword(req.admin.username, newPassword);
    logActivity({ actor: req.admin.username, action: 'password_changed', ip: getClientIp(req) });
    // Existing cookie for THIS browser still works because the session
    // itself is unaffected, but let the client know so it can prompt the
    // admin to re-confirm if desired. (Other devices/sessions logged in as
    // the same admin remain valid until their JWTs naturally expire - see
    // auth.js for the tradeoffs of full server-side session revocation.)
    res.json({ status: 'success' });
});

// Everything below requires a valid admin session.
adminRouter.use(requireAdmin);

// ── Dashboard stats ──────────────────────────────────────────────────────
adminRouter.get('/stats', (_req, res) => {
    try {
        res.json({ status: 'success', data: getStats() });
    } catch (err) {
        console.error('[admin] stats failed:', err);
        res.status(500).json({ status: 'error', message: 'Failed to compute stats.' });
    }
});

// ── System health (CPU / memory / disk / uptime) ────────────────────────
adminRouter.get('/system', (_req, res) => {
    try {
        res.json({ status: 'success', data: getSystemSnapshot({ dbPath: DB_PATH }) });
    } catch (err) {
        console.error('[admin] system snapshot failed:', err);
        res.status(500).json({ status: 'error', message: 'Failed to read system metrics.' });
    }
});

// ── S3 bucket usage (real, queried live from the storage provider) ──────
adminRouter.get('/s3-usage', async (_req, res) => {
    try {
        const usage = await getBucketUsage();
        res.json({ status: 'success', data: usage });
    } catch (err) {
        console.error('[admin] s3 usage failed:', err);
        res.status(500).json({ status: 'error', message: 'Failed to query S3 bucket usage.' });
    }
});

// ── File listing (paginated, filterable) ─────────────────────────────────
adminRouter.get('/files', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const status = ['all', 'active', 'expired'].includes(req.query.status) ? req.query.status : 'all';
    const search =
        typeof req.query.search === 'string' ? req.query.search.trim().slice(0, MAX_SEARCH_LENGTH) : '';

    const result = listUploads({ page, pageSize, status, search });
    res.json({ status: 'success', data: result });
});

// ── Manually delete a file (revoke access + remove from S3 immediately) ─
adminRouter.delete('/files/:id', sensitiveActionLimiter, async (req, res) => {
    const row = getAnyUploadById(req.params.id);
    if (!row) {
        return res.status(404).json({ status: 'error', message: 'File not found.' });
    }
    if (row.deleted_at) {
        return res.status(409).json({ status: 'error', message: 'File already deleted.' });
    }

    try {
        try {
            await deleteObject(row.s3_key);
        } catch (err) {
            if (err?.name !== 'NoSuchKey' && err?.$metadata?.httpStatusCode !== 404) throw err;
        }
        markDeleted(row.id, new Date().toISOString(), 'manual_admin_delete');
        logActivity({
            actor: req.admin.username,
            action: 'file_deleted',
            target: row.id,
            detail: row.original_name,
            ip: getClientIp(req),
        });
        res.json({ status: 'success' });
    } catch (err) {
        console.error(`[admin] failed to delete file ${row.id}:`, err);
        res.status(500).json({ status: 'error', message: 'Failed to delete file.' });
    }
});

// ── Activity log ───────────────────────────────────────────────────────
adminRouter.get('/activity', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));
    res.json({ status: 'success', data: listActivity({ page, pageSize }) });
});
