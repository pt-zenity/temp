import { getExpiredUploads, markDeleted } from './db.js';
import { deleteObject } from './s3.js';

export async function runCleanupOnce() {
    const nowIso = new Date().toISOString();
    const expired = getExpiredUploads(nowIso);

    for (const row of expired) {
        try {
            await deleteObject(row.s3_key);
        } catch (err) {
            // If the object is already gone (e.g. manually removed), that's fine -
            // still mark it deleted locally so we stop retrying it forever.
            if (err?.name !== 'NoSuchKey' && err?.$metadata?.httpStatusCode !== 404) {
                console.error(`[cleanup] failed to delete s3 object for upload ${row.id}:`, err);
                continue;
            }
        }
        markDeleted(row.id, nowIso);
        console.log(`[cleanup] deleted expired upload ${row.id} (${row.original_name})`);
    }

    return expired.length;
}

export function startCleanupLoop(intervalMs) {
    const tick = () => {
        runCleanupOnce().catch((err) => console.error('[cleanup] unexpected error:', err));
    };
    tick();
    return setInterval(tick, intervalMs);
}
