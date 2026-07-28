import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// Snapshot of CPU times, used to compute a delta-based (instantaneous)
// CPU usage percentage rather than the misleading Linux "load average"
// alone (load average is a queue-length metric, not a %).
let lastCpuSample = os.cpus();
let lastCpuSampleAt = Date.now();

function sampleCpuUsagePercent() {
    const now = Date.now();
    const current = os.cpus();

    let idleDelta = 0;
    let totalDelta = 0;

    for (let i = 0; i < current.length; i++) {
        const prev = lastCpuSample[i]?.times;
        const cur = current[i].times;
        if (!prev) continue;

        const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
        const curTotal = cur.user + cur.nice + cur.sys + cur.idle + cur.irq;

        idleDelta += cur.idle - prev.idle;
        totalDelta += curTotal - prevTotal;
    }

    lastCpuSample = current;
    lastCpuSampleAt = now;

    if (totalDelta <= 0) return 0;
    const usage = 1 - idleDelta / totalDelta;
    return Math.max(0, Math.min(100, usage * 100));
}

function diskUsage(targetPath) {
    try {
        const stats = fs.statfsSync(targetPath);
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bfree * stats.bsize;
        const usedBytes = totalBytes - freeBytes;
        return {
            totalBytes,
            freeBytes,
            usedBytes,
            usedPercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
        };
    } catch (err) {
        return { error: err.message };
    }
}

export function getSystemSnapshot({ dbPath } = {}) {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptimeSeconds: os.uptime(),
        processUptimeSeconds: process.uptime(),
        nodeVersion: process.version,
        cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0]?.model || 'unknown',
            usagePercent: sampleCpuUsagePercent(),
            loadAverage: os.loadavg(), // [1m, 5m, 15m]
        },
        memory: {
            totalBytes: totalMem,
            freeBytes: freeMem,
            usedBytes: usedMem,
            usedPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
            processRssBytes: process.memoryUsage().rss,
        },
        disk: diskUsage(dbPath ? path.dirname(dbPath) : '/'),
        timestamp: new Date().toISOString(),
    };
}
