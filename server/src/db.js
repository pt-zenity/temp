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
        deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_uploads_expires_at ON uploads (expires_at);
`);

export function insertUpload({ id, s3Key, originalName, contentType, size, createdAt, expiresAt }) {
    db.prepare(
        `INSERT INTO uploads (id, s3_key, original_name, content_type, size, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, s3Key, originalName, contentType, size, createdAt, expiresAt);
}

export function getUploadById(id) {
    return db.prepare(`SELECT * FROM uploads WHERE id = ? AND deleted_at IS NULL`).get(id);
}

export function getExpiredUploads(nowIso) {
    return db.prepare(`SELECT * FROM uploads WHERE expires_at <= ? AND deleted_at IS NULL`).all(nowIso);
}

export function markDeleted(id, deletedAtIso) {
    db.prepare(`UPDATE uploads SET deleted_at = ? WHERE id = ?`).run(deletedAtIso, id);
}
