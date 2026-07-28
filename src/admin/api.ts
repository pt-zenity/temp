// Thin fetch wrapper for the admin API (/api/admin/*). All requests use
// `credentials: 'include'` so the httpOnly session cookie set by
// POST /api/admin/login is sent automatically - no token handling needed
// in the frontend.

const BASE = '/api/admin';

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        credentials: 'include',
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
        ...options,
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new ApiError(body?.message || `Request failed (${res.status})`, res.status);
    }
    return body;
}

// ── Auth ─────────────────────────────────────────────────────────────────
export interface LoginResponse {
    status: string;
    data: { username: string };
}

export function login(username: string, password: string) {
    return request<LoginResponse>('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
}

export function logout() {
    return request('/logout', { method: 'POST' });
}

export function me() {
    return request<LoginResponse>('/me');
}

export function changePassword(newPassword: string) {
    return request('/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
    });
}

// Cheap session check used by the router guard. Returns false (rather than
// throwing) on any failure so navigation always resolves to a decision.
export async function isLoggedIn(): Promise<boolean> {
    try {
        await me();
        return true;
    } catch {
        return false;
    }
}

// ── Stats / system / S3 usage ────────────────────────────────────────────
export interface StatsData {
    totalUploads: number;
    totalBytesAllTime: number;
    activeCount: number;
    activeBytes: number;
    totalDownloads: number;
    uploads24h: number;
    bytes24h: number;
    uploads7d: number;
    byType: { category: string; count: number }[];
    daily: { day: string; count: number; bytes: number }[];
}

export function getStats() {
    return request<{ status: string; data: StatsData }>('/stats');
}

export interface SystemData {
    hostname: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    processUptimeSeconds: number;
    nodeVersion: string;
    cpu: { cores: number; model: string; usagePercent: number; loadAverage: number[] };
    memory: { totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number; processRssBytes: number };
    disk: { totalBytes?: number; freeBytes?: number; usedBytes?: number; usedPercent?: number; error?: string };
    timestamp: string;
}

export function getSystem() {
    return request<{ status: string; data: SystemData }>('/system');
}

export interface S3UsageData {
    totalBytes: number;
    objectCount: number;
    bucket: string;
    prefix: string;
}

export function getS3Usage() {
    return request<{ status: string; data: S3UsageData }>('/s3-usage');
}

// ── Files ────────────────────────────────────────────────────────────────
export interface FileRow {
    id: string;
    s3_key: string;
    original_name: string;
    content_type: string;
    size: number;
    created_at: string;
    expires_at: string;
    deleted_at: string | null;
    deleted_reason: string | null;
    uploader_ip: string | null;
    download_count: number;
    last_downloaded_at: string | null;
}

export interface FilesPage {
    rows: FileRow[];
    total: number;
    page: number;
    pageSize: number;
}

export function listFiles(params: { page?: number; pageSize?: number; status?: string; search?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    return request<{ status: string; data: FilesPage }>(`/files?${qs.toString()}`);
}

export function deleteFile(id: string) {
    return request(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Activity log ─────────────────────────────────────────────────────────
export interface ActivityRow {
    id: number;
    created_at: string;
    actor: string;
    action: string;
    target: string | null;
    detail: string | null;
    ip: string | null;
}

export interface ActivityPage {
    rows: ActivityRow[];
    total: number;
    page: number;
    pageSize: number;
}

export function listActivity(params: { page?: number; pageSize?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return request<{ status: string; data: ActivityPage }>(`/activity?${qs.toString()}`);
}
