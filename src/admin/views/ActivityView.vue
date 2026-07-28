<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import AdminLayout from '../components/AdminLayout.vue';
import { listActivity } from '../api';
import type { ActivityRow } from '../api';
import { formatDate, formatRelative } from '../format';

const rows = ref<ActivityRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 30;
const loading = ref(true);
const error = ref('');

async function load() {
    loading.value = true;
    try {
        const res = await listActivity({ page: page.value, pageSize });
        rows.value = res.data.rows;
        total.value = res.data.total;
        error.value = '';
    } catch (err: any) {
        error.value = err?.message || 'Failed to load activity log.';
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(page, load);

const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize));

const actionMeta: Record<string, { icon: string; color: string; label: string }> = {
    login_success: { icon: 'mdi:login', color: 'text-success', label: 'Login succeeded' },
    login_failed: { icon: 'mdi:alert-outline', color: 'text-error', label: 'Login failed' },
    logout: { icon: 'mdi:logout', color: 'text-base-content/60', label: 'Logout' },
    password_changed: { icon: 'mdi:key-change', color: 'text-warning', label: 'Password changed' },
    file_uploaded: { icon: 'mdi:cloud-upload-outline', color: 'text-info', label: 'File uploaded' },
    file_deleted: { icon: 'mdi:delete-outline', color: 'text-error', label: 'File deleted' },
};

function meta(action: string) {
    return actionMeta[action] || { icon: 'mdi:information-outline', color: 'text-base-content/60', label: action };
}
</script>

<template>
    <AdminLayout>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h1 class="text-xl sm:text-2xl font-bold">Activity Log</h1>
                <p class="text-sm text-base-content/60">{{ total }} recorded event(s)</p>
            </div>
            <button class="btn btn-sm btn-ghost gap-2" :disabled="loading" @click="load">
                <Icon icon="mdi:refresh" class="size-4" :class="{ 'animate-spin': loading }" />
                Refresh
            </button>
        </div>

        <div v-if="error" class="alert alert-error mb-4">
            <Icon icon="mdi:alert-circle-outline" class="size-5" />
            {{ error }}
        </div>

        <div class="glass rounded-lg divide-y divide-white/10">
            <div v-if="loading" class="text-center py-10">
                <span class="loading loading-spinner"></span>
            </div>
            <div v-else-if="!rows.length" class="text-center py-10 text-base-content/50">No activity recorded yet.</div>
            <div
                v-for="row in rows"
                :key="row.id"
                class="flex flex-col sm:flex-row items-start gap-2 sm:gap-3 p-3 text-sm"
            >
                <div class="flex items-start gap-3 flex-1 min-w-0">
                    <Icon :icon="meta(row.action).icon" class="size-5 shrink-0 mt-0.5" :class="meta(row.action).color" />
                    <div class="flex-1 min-w-0">
                        <p>
                            <span class="font-semibold">{{ row.actor }}</span>
                            <span class="text-base-content/70"> {{ meta(row.action).label.toLowerCase() }}</span>
                            <span v-if="row.detail" class="text-base-content/50"> — {{ row.detail }}</span>
                        </p>
                        <p class="text-xs text-base-content/40 font-mono break-all">
                            {{ formatDate(row.created_at) }} · {{ row.ip || 'unknown ip' }}
                            <span v-if="row.target">· target: {{ row.target }}</span>
                        </p>
                    </div>
                </div>
                <span class="text-xs text-base-content/40 whitespace-nowrap sm:ml-2">{{ formatRelative(row.created_at) }}</span>
            </div>
        </div>

        <div class="flex items-center justify-between mt-4">
            <p class="text-sm text-base-content/50">Page {{ page }} of {{ totalPages() }}</p>
            <div class="join">
                <button class="join-item btn btn-sm" :disabled="page <= 1" @click="page--">«</button>
                <button class="join-item btn btn-sm" :disabled="page >= totalPages()" @click="page++">»</button>
            </div>
        </div>
    </AdminLayout>
</template>
