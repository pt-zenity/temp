import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/uploads.sqlite';

// Make sure the parent directory exists (e.g. ./data)
const dir = path.dirname(DB_PATH);
if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        s3_key TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        content_type TEXT,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        deleted_at TEXT,
        deleted_reason TEXT,
        uploader_ip TEXT,
        download_count INTEGER NOT NULL DEFAULT 0,
        last_downloaded_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_uploads_expires_at ON uploads (expires_at);
    CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads (created_at);

    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_login_at TEXT,
        last_login_ip TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        ip TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at);
`);

// Lightweight, additive migration for columns introduced after the initial
// release (older deployments may already have an `uploads` table without
// them). Safe to run on every boot - ALTER TABLE ADD COLUMN is a no-op error
// we just swallow if the column already exists.
for (const stmt of [
    `ALTER TABLE uploads ADD COLUMN deleted_reason TEXT`,
    `ALTER TABLE uploads ADD COLUMN uploader_ip TEXT`,
    `ALTER TABLE uploads ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE uploads ADD COLUMN last_downloaded_at TEXT`,
]) {
    try {
        db.exec(stmt);
    } catch (_err) {
        // column already exists - ignore
    }
}

export function insertUpload({ id, s3Key, originalName, contentType, size, createdAt, expiresAt, uploaderIp }) {
    db.prepare(
        `INSERT INTO uploads (id, s3_key, original_name, content_type, size, created_at, expires_at, uploader_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, s3Key, originalName, contentType, size, createdAt, expiresAt, uploaderIp || null);
}

export function getUploadById(id) {
    return db.prepare(`SELECT * FROM uploads WHERE id = ? AND deleted_at IS NULL`).get(id);
}

export function getAnyUploadById(id) {
    return db.prepare(`SELECT * FROM uploads WHERE id = ?`).get(id);
}

export function getExpiredUploads(nowIso) {
    return db.prepare(`SELECT * FROM uploads WHERE expires_at <= ? AND deleted_at IS NULL`).all(nowIso);
}

export function markDeleted(id, deletedAtIso, reason = 'expired') {
    db.prepare(`UPDATE uploads SET deleted_at = ?, deleted_reason = ? WHERE id = ?`).run(deletedAtIso, reason, id);
}

export function incrementDownloadCount(id, nowIso) {
    db.prepare(
        `UPDATE uploads SET download_count = download_count + 1, last_downloaded_at = ? WHERE id = ?`
    ).run(nowIso, id);
}

// ── Admin: paginated / filterable upload listing ───────────────────────────
export function listUploads({ page = 1, pageSize = 20, status = 'all', search = '' } = {}) {
    const offset = (page - 1) * pageSize;
    const where = [];
    const params = {};

    if (status === 'active') {
        where.push(`deleted_at IS NULL`);
    } else if (status === 'expired') {
        where.push(`deleted_at IS NOT NULL`);
    }
    if (search) {
        where.push(`(original_name LIKE @search OR id LIKE @search)`);
        params.search = `%${search}%`;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) AS c FROM uploads ${whereSql}`).get(params).c;
    const rows = db
        .prepare(
            `SELECT * FROM uploads ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
        )
        .all({ ...params, limit: pageSize, offset });

    return { rows, total, page, pageSize };
}

// ── Admin: aggregate statistics ─────────────────────────────────────────────
export function getStats() {
    const totals = db
        .prepare(
            `SELECT
                COUNT(*) AS total_uploads,
                COALESCE(SUM(size), 0) AS total_bytes_all_time
             FROM uploads`
        )
        .get();

    const active = db
        .prepare(
            `SELECT
                COUNT(*) AS active_count,
                COALESCE(SUM(size), 0) AS active_bytes
             FROM uploads WHERE deleted_at IS NULL`
        )
        .get();

    const downloads = db
        .prepare(`SELECT COALESCE(SUM(download_count), 0) AS total_downloads FROM uploads`)
        .get();

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const uploads24h = db
        .prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(size),0) AS bytes FROM uploads WHERE created_at >= ?`)
        .get(since24h);

    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const uploads7d = db
        .prepare(`SELECT COUNT(*) AS c FROM uploads WHERE created_at >= ?`)
        .get(since7d);

    const byType = db
        .prepare(
            `SELECT
                CASE
                    WHEN content_type LIKE 'image/%' THEN 'image'
                    WHEN content_type LIKE 'video/%' THEN 'video'
                    WHEN content_type LIKE 'audio/%' THEN 'audio'
                    WHEN content_type LIKE 'text/%' THEN 'text'
                    WHEN content_type LIKE 'application/pdf' THEN 'pdf'
                    WHEN content_type LIKE 'application/zip' OR content_type LIKE '%compressed%' THEN 'archive'
                    ELSE 'other'
                END AS category,
                COUNT(*) AS count
             FROM uploads
             GROUP BY category
             ORDER BY count DESC`
        )
        .all();

    // Daily upload counts for the last 14 days (for a trend chart).
    const daily = db
        .prepare(
            `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count, COALESCE(SUM(size),0) AS bytes
             FROM uploads
             WHERE created_at >= ?
             GROUP BY day
             ORDER BY day ASC`
        )
        .all(new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());

    return {
        totalUploads: totals.total_uploads,
        totalBytesAllTime: totals.total_bytes_all_time,
        activeCount: active.active_count,
        activeBytes: active.active_bytes,
        totalDownloads: downloads.total_downloads,
        uploads24h: uploads24h.c,
        bytes24h: uploads24h.bytes,
        uploads7d: uploads7d.c,
        byType,
        daily,
    };
}

// ── Admin users ──────────────────────────────────────────────────────────
export function getAdminByUsername(username) {
    return db.prepare(`SELECT * FROM admin_users WHERE username = ?`).get(username);
}

export function getAdminCount() {
    return db.prepare(`SELECT COUNT(*) AS c FROM admin_users`).get().c;
}

export function createAdminUser({ username, passwordHash, createdAt }) {
    db.prepare(`INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)`).run(
        username,
        passwordHash,
        createdAt
    );
}

export function updateAdminPassword(username, passwordHash) {
    db.prepare(`UPDATE admin_users SET password_hash = ? WHERE username = ?`).run(passwordHash, username);
}

export function touchAdminLogin(username, ip, atIso) {
    db.prepare(`UPDATE admin_users SET last_login_at = ?, last_login_ip = ? WHERE username = ?`).run(
        atIso,
        ip,
        username
    );
}

// ── Activity log ─────────────────────────────────────────────────────────
export function logActivity({ actor, action, target, detail, ip }) {
    db.prepare(
        `INSERT INTO activity_log (created_at, actor, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), actor, action, target || null, detail || null, ip || null);
}

export function listActivity({ page = 1, pageSize = 30 } = {}) {
    const offset = (page - 1) * pageSize;
    const total = db.prepare(`SELECT COUNT(*) AS c FROM activity_log`).get().c;
    const rows = db
        .prepare(`SELECT * FROM activity_log ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(pageSize, offset);
    return { rows, total, page, pageSize };
}
