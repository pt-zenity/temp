import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { getAdminByUsername, getAdminCount, createAdminUser, updateAdminPassword, touchAdminLogin } from './db.js';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const TOKEN_TTL = '12h';
const COOKIE_NAME = 'tmpfup_admin_token';

if (!JWT_SECRET || JWT_SECRET.length < 16) {
    throw new Error(
        'ADMIN_JWT_SECRET is missing or too short. Set a long random value in .env (see .env.example).'
    );
}

// Ensures at least one admin account exists on boot. Bootstraps from
// ADMIN_USERNAME / ADMIN_PASSWORD env vars the first time the server ever
// starts (i.e. when the admin_users table is empty). After that, the
// password can be changed via the admin panel and env vars are ignored.
export function ensureBootstrapAdmin() {
    if (getAdminCount() > 0) return;

    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
        throw new Error(
            'No admin users exist yet and ADMIN_PASSWORD is not set. Set ADMIN_USERNAME / ADMIN_PASSWORD in .env for the first boot (see .env.example).'
        );
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    createAdminUser({ username, passwordHash, createdAt: new Date().toISOString() });
    console.log(`[auth] Bootstrapped initial admin user "${username}".`);
}

export function verifyCredentials(username, password) {
    const user = getAdminByUsername(username);
    if (!user) return null;
    const ok = bcrypt.compareSync(password, user.password_hash);
    return ok ? user : null;
}

export function changePassword(username, newPassword) {
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    updateAdminPassword(username, passwordHash);
}

export function recordLogin(username, ip) {
    touchAdminLogin(username, ip, new Date().toISOString());
}

export function issueToken(username) {
    return jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (_err) {
        return null;
    }
}

export { COOKIE_NAME };

// Express middleware: requires a valid admin session (JWT in httpOnly
// cookie or Authorization: Bearer header). Attaches req.admin = { username }.
export function requireAdmin(req, res, next) {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null;
    const token = req.cookies?.[COOKIE_NAME] || bearer;

    if (!token) {
        return res.status(401).json({ status: 'error', message: 'Not authenticated.' });
    }

    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ status: 'error', message: 'Session expired or invalid. Please log in again.' });
    }

    req.admin = { username: payload.sub };
    next();
}
