<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { Icon } from '@iconify/vue';
import AdminLayout from '../components/AdminLayout.vue';
import StatCard from '../components/StatCard.vue';
import UsageBar from '../components/UsageBar.vue';
import TrendChart from '../components/TrendChart.vue';
import { getStats, getSystem, getS3Usage } from '../api';
import type { StatsData, SystemData, S3UsageData } from '../api';
import { formatBytes, formatUptime } from '../format';
import { useI18n } from '../../i18n';

const { t } = useI18n();
const stats = ref<StatsData | null>(null);
const system = ref<SystemData | null>(null);
const s3Usage = ref<S3UsageData | null>(null);
const loading = ref(true);
const error = ref('');
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function loadAll() {
    try {
        const [statsRes, systemRes, s3Res] = await Promise.all([getStats(), getSystem(), getS3Usage()]);
        stats.value = statsRes.data;
        system.value = systemRes.data;
        s3Usage.value = s3Res.data;
        error.value = '';
    } catch (err: any) {
        error.value = err?.message || t('dashboard.errorLoad');
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    loadAll();
    // Refresh every 10s so CPU/memory/upload counters feel "live" without
    // hammering the server.
    refreshTimer = setInterval(loadAll, 10_000);
});
onBeforeUnmount(() => {
    if (refreshTimer) clearInterval(refreshTimer);
});

function typeIcon(category: string) {
    const map: Record<string, string> = {
        image: 'mdi:file-image-outline',
        video: 'mdi:file-video-outline',
        audio: 'mdi:file-music-outline',
        text: 'mdi:file-document-outline',
        pdf: 'mdi:file-pdf-box',
        archive: 'mdi:folder-zip-outline',
        other: 'mdi:file-question-outline',
    };
    return map[category] || map.other;
}

function typeLabel(category: string) {
    return t(`dashboard.category.${category}`) !== `dashboard.category.${category}`
        ? t(`dashboard.category.${category}`)
        : category;
}
</script>

<template>
    <AdminLayout>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h1 class="text-xl sm:text-2xl font-bold">{{ t('dashboard.title') }}</h1>
                <p class="text-sm text-base-content/60">{{ t('dashboard.subtitle') }}</p>
            </div>
            <button class="btn btn-sm btn-ghost gap-2" :disabled="loading" @click="loadAll">
                <Icon icon="mdi:refresh" class="size-4" :class="{ 'animate-spin': loading }" />
                {{ t('admin.refresh') }}
            </button>
        </div>

        <div v-if="error" class="alert alert-error mb-4">
            <Icon icon="mdi:alert-circle-outline" class="size-5" />
            {{ error }}
        </div>

        <div v-if="loading && !stats" class="flex justify-center py-20">
            <span class="loading loading-spinner loading-lg"></span>
        </div>

        <template v-else-if="stats && system && s3Usage">
            <!-- Top stat cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <StatCard
                    :label="t('dashboard.activeFiles')"
                    :value="stats.activeCount"
                    :sublabel="formatBytes(stats.activeBytes)"
                    icon="mdi:file-multiple-outline"
                    color="primary"
                />
                <StatCard
                    :label="t('dashboard.totalUploads')"
                    :value="stats.totalUploads"
                    :sublabel="formatBytes(stats.totalBytesAllTime) + ' ' + t('dashboard.totalSuffix')"
                    icon="mdi:cloud-upload-outline"
                    color="info"
                />
                <StatCard
                    :label="t('dashboard.uploads24h')"
                    :value="stats.uploads24h"
                    :sublabel="formatBytes(stats.bytes24h)"
                    icon="mdi:clock-fast"
                    color="success"
                />
                <StatCard
                    :label="t('dashboard.totalDownloads')"
                    :value="stats.totalDownloads"
                    :sublabel="t('dashboard.acrossAllFiles')"
                    icon="mdi:download-outline"
                    color="warning"
                />
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
                <!-- Trend chart -->
                <div class="lg:col-span-2 glass rounded-lg sm:rounded-xl p-3 sm:p-4">
                    <h2 class="font-semibold mb-3 flex items-center gap-2">
                        <Icon icon="mdi:chart-line" class="size-5" />
                        {{ t('dashboard.uploadTrend') }}
                    </h2>
                    <TrendChart
                        v-if="stats.daily.length"
                        :labels="stats.daily.map((d) => d.day.slice(5))"
                        :counts="stats.daily.map((d) => d.count)"
                        :bytes="stats.daily.map((d) => d.bytes)"
                    />
                    <p v-else class="text-sm text-base-content/50 py-16 text-center">{{ t('dashboard.noUploadsYet') }}</p>
                </div>

                <!-- File type breakdown -->
                <div class="glass rounded-lg sm:rounded-xl p-3 sm:p-4">
                    <h2 class="font-semibold mb-3 flex items-center gap-2">
                        <Icon icon="mdi:chart-donut" class="size-5" />
                        {{ t('dashboard.filesByType') }}
                    </h2>
                    <div v-if="stats.byType.length" class="flex flex-col gap-3">
                        <div v-for="typeRow in stats.byType" :key="typeRow.category" class="flex items-center gap-3">
                            <Icon :icon="typeIcon(typeRow.category)" class="size-5 text-base-content/60 shrink-0" />
                            <span class="text-sm flex-1">{{ typeLabel(typeRow.category) }}</span>
                            <span class="badge badge-neutral">{{ typeRow.count }}</span>
                        </div>
                    </div>
                    <p v-else class="text-sm text-base-content/50 py-16 text-center">{{ t('dashboard.noDataYet') }}</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <!-- System health -->
                <div class="glass rounded-lg sm:rounded-xl p-3 sm:p-4">
                    <h2 class="font-semibold mb-4 flex items-center gap-2 flex-wrap">
                        <Icon icon="mdi:server-outline" class="size-5" />
                        {{ t('dashboard.systemHealth') }}
                        <span class="badge badge-success badge-sm ml-auto">{{ system.hostname }}</span>
                    </h2>
                    <div class="flex flex-col gap-4">
                        <UsageBar
                            :label="t('dashboard.cpu')"
                            :percent="system.cpu.usagePercent"
                            :detail="`${system.cpu.cores} ${t('dashboard.cores')} · ${system.cpu.model}`"
                        />
                        <UsageBar
                            :label="t('dashboard.memory')"
                            :percent="system.memory.usedPercent"
                            :detail="`${formatBytes(system.memory.usedBytes)} / ${formatBytes(system.memory.totalBytes)}`"
                        />
                        <UsageBar
                            v-if="system.disk.usedPercent !== undefined"
                            :label="t('dashboard.disk')"
                            :percent="system.disk.usedPercent"
                            :detail="`${formatBytes(system.disk.usedBytes || 0)} / ${formatBytes(system.disk.totalBytes || 0)}`"
                        />
                        <div class="grid grid-cols-2 gap-3 text-sm mt-2">
                            <div>
                                <p class="text-base-content/50 text-xs">{{ t('dashboard.systemUptime') }}</p>
                                <p class="font-mono">{{ formatUptime(system.uptimeSeconds) }}</p>
                            </div>
                            <div>
                                <p class="text-base-content/50 text-xs">{{ t('dashboard.backendUptime') }}</p>
                                <p class="font-mono">{{ formatUptime(system.processUptimeSeconds) }}</p>
                            </div>
                            <div>
                                <p class="text-base-content/50 text-xs">{{ t('dashboard.nodeVersion') }}</p>
                                <p class="font-mono">{{ system.nodeVersion }}</p>
                            </div>
                            <div>
                                <p class="text-base-content/50 text-xs">{{ t('dashboard.loadAverage') }}</p>
                                <p class="font-mono">{{ system.cpu.loadAverage.map((n) => n.toFixed(2)).join(' / ') }}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- S3 bucket usage -->
                <div class="glass rounded-lg sm:rounded-xl p-3 sm:p-4">
                    <h2 class="font-semibold mb-4 flex items-center gap-2 flex-wrap">
                        <Icon icon="mdi:bucket-outline" class="size-5" />
                        {{ t('dashboard.s3Storage') }}
                        <span class="badge badge-info badge-sm ml-auto">{{ t('dashboard.live') }}</span>
                    </h2>
                    <div class="flex flex-col gap-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <StatCard
                                :label="t('dashboard.objectsInBucket')"
                                :value="s3Usage.objectCount"
                                icon="mdi:file-outline"
                                color="info"
                            />
                            <StatCard
                                :label="t('dashboard.bytesUsed')"
                                :value="formatBytes(s3Usage.totalBytes)"
                                icon="mdi:harddisk"
                                color="primary"
                            />
                        </div>
                        <div class="text-sm glass-subtle rounded-md p-3 font-mono break-all">
                            <p><span class="text-base-content/50">{{ t('dashboard.bucket') }}</span> {{ s3Usage.bucket }}</p>
                            <p>
                                <span class="text-base-content/50">{{ t('dashboard.prefix') }}</span>
                                {{ s3Usage.prefix || t('dashboard.none') }}
                            </p>
                        </div>
                        <p class="text-xs text-base-content/40">
                            {{ t('dashboard.s3Note') }}
                        </p>
                    </div>
                </div>
            </div>
        </template>
    </AdminLayout>
</template>
