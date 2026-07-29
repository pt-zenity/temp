// Small, focused security helpers shared across the backend. Kept in one
// place so the reasoning behind each mitigation is documented next to the
// code instead of scattered as inline comments in index.js / admin.js.

import { ipKeyGenerator } from 'express-rate-limit';

// ── Client IP resolution ───────────────────────────────────────────────────
// The public site sits behind Cloudflare -> nginx -> this Node process.
// Express's own `req.ip` (with `trust proxy` enabled) reads the *leftmost*
// entry of X-Forwarded-For, which an attacker can freely set on their own
// request to spoof whatever IP they like - defeating IP-based rate limiting.
// Cloudflare's `CF-Connecting-IP` header is set by Cloudflare's edge itself
// (it strips/overwrites any client-supplied copy before forwarding), so it
// is a much more trustworthy source of the real visitor IP when present.
// Falls back to Express's computed req.ip for local/dev use without
// Cloudflare in front.
export function getClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
    return req.ip;
}

// Same as getClientIp, but additionally normalizes IPv6 addresses down to
// a /56 subnet (via express-rate-limit's own helper) before use as a rate
// limiter key - a single IPv6 user can trivially rotate through billions
// of addresses within their assigned /64, so keying on the exact address
// would make the limiter meaningless for those clients.
export function getRateLimitKey(req) {
    return ipKeyGenerator(getClientIp(req));
}

// ── Header-injection-safe filename sanitization ────────────────────────────
// Used to build Content-Disposition values. Strips CR/LF and other control
// characters (which could otherwise be used for HTTP response header
// injection / splitting on older/non-conforming HTTP stacks), strips
// double quotes (they would otherwise terminate the quoted filename early),
// and caps length so a pathological filename can't bloat the response
// headers.
export function sanitizeHeaderFilename(name) {
    const fallback = 'download';
    if (typeof name !== 'string' || !name) return fallback;
    const cleaned = name
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f"]/g, '')
        .replace(/\\/g, '')
        .trim();
    const truncated = cleaned.slice(0, 200);
    return truncated || fallback;
}

// Builds a full, safe Content-Disposition header value. Includes both a
// plain `filename` (ASCII-sanitized fallback) and an RFC 5987 encoded
// `filename*` so non-ASCII names still render correctly in browsers that
// support it, without reopening any injection risk (percent-encoding is
// injection-proof).
export function buildContentDisposition(disposition, filename) {
    const safeAscii = sanitizeHeaderFilename(filename).replace(/[^\x20-\x7e]/g, '_');
    const encoded = encodeURIComponent(sanitizeHeaderFilename(filename));
    return `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

// ── Inline-render safety ────────────────────────────────────────────────────
// Content types that browsers will actively execute/render as active
// content (HTML, SVG with embedded scripts, XML with XSL, etc). Serving a
// user-uploaded file of one of these types with its original Content-Type
// on our own origin (tempfile.xyz) would let an attacker host a stored-XSS
// payload that runs with our origin's privileges (cookies, DOM) against
// anyone who opens the /f/:id link. We still let people upload/download
// these files losslessly, we just never let the browser execute them: they
// are always served as a forced attachment with a neutral content type.
const UNSAFE_INLINE_CONTENT_TYPES = new Set([
    'text/html',
    'application/xhtml+xml',
    'image/svg+xml',
    'application/xml',
    'text/xml',
    'application/rss+xml',
    'application/atom+xml',
    'application/x-shockwave-flash',
    'text/javascript',
    'application/javascript',
    'application/x-javascript',
]);

export function isUnsafeInlineContentType(contentType) {
    if (!contentType) return false;
    const base = contentType.split(';')[0].trim().toLowerCase();
    return UNSAFE_INLINE_CONTENT_TYPES.has(base);
}
