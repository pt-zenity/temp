<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import AdminLayout from '../components/AdminLayout.vue';
import { listFiles, deleteFile } from '../api';
import type { FileRow } from '../api';
import { formatBytes, formatDate, formatRelative } from '../format';
import { useI18n } from '../../i18n';

const { t } = useI18n();
const rows = ref<FileRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const status = ref<'all' | 'active' | 'expired'>('active');
const search = ref('');
const loading = ref(true);
const error = ref('');
const deletingId = ref<string | null>(null);
const confirmId = ref<string | null>(null);

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

async function load() {
    loading.value = true;
    try {
        const res = await listFiles({ page: page.value, pageSize, status: status.value, search: search.value });
        rows.value = res.data.rows;
        total.value = res.data.total;
        error.value = '';
    } catch (err: any) {
        error.value = err?.message || t('files.errorLoad');
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(status, () => {
    page.value = 1;
    load();
});
watch(search, () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        page.value = 1;
        load();
    }, 350);
});
watch(page, load);

async function handleDelete(id: string) {
    deletingId.value = id;
    try {
        await deleteFile(id);
        confirmId.value = null;
        await load();
    } catch (err: any) {
        error.value = err?.message || t('files.errorDelete');
    } finally {
        deletingId.value = null;
    }
}

function isExpired(row: FileRow) {
    return !!row.deleted_at || new Date(row.expires_at).getTime() < Date.now();
}

const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize));
</script>

<template>
    <AdminLayout>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h1 class="text-xl sm:text-2xl font-bold">{{ t('files.title') }}</h1>
                <p class="text-sm text-base-content/60">{{ t('files.matching', { total }) }}</p>
            </div>
            <button class="btn btn-sm btn-ghost gap-2" :disabled="loading" @click="load">
                <Icon icon="mdi:refresh" class="size-4" :class="{ 'animate-spin': loading }" />
                {{ t('admin.refresh') }}
            </button>
        </div>

        <div v-if="error" class="alert alert-error mb-4">
            <Icon icon="mdi:alert-circle-outline" class="size-5" />
            {{ error }}
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
            <div class="join">
                <button
                    class="join-item btn btn-sm"
                    :class="status === 'all' ? 'btn-active' : 'btn-ghost'"
                    @click="status = 'all'"
                >
                    {{ t('files.all') }}
                </button>
                <button
                    class="join-item btn btn-sm"
                    :class="status === 'active' ? 'btn-active' : 'btn-ghost'"
                    @click="status = 'active'"
                >
                    {{ t('files.active') }}
                </button>
                <button
                    class="join-item btn btn-sm"
                    :class="status === 'expired' ? 'btn-active' : 'btn-ghost'"
                    @click="status = 'expired'"
                >
                    {{ t('files.deletedExpired') }}
                </button>
            </div>
            <label class="input input-sm input-bordered flex items-center gap-2 w-full sm:w-64 bg-white/5">
                <Icon icon="mdi:magnify" class="size-4 text-base-content/40" />
                <input v-model="search" type="text" :placeholder="t('files.searchPlaceholder')" class="grow" />
            </label>
        </div>

        <!-- Mobile card list (small screens) -->
        <div class="flex flex-col gap-3 sm:hidden">
            <div v-if="loading" class="glass rounded-lg text-center py-10">
                <span class="loading loading-spinner"></span>
            </div>
            <div v-else-if="!rows.length" class="glass rounded-lg text-center py-10 text-base-content/50">
                {{ t('files.noFilesFound') }}
            </div>
            <div v-for="row in rows" :key="row.id" class="glass glass-hover rounded-lg p-3 flex flex-col gap-2">
                <div class="flex items-start justify-between gap-2">
                    <p class="font-medium truncate flex-1" :title="row.original_name">{{ row.original_name }}</p>
                    <span v-if="row.deleted_at" class="badge badge-error badge-sm shrink-0">
                        {{ row.deleted_reason === 'manual_admin_delete' ? t('files.statusDeleted') : t('files.statusExpired') }}
                    </span>
                    <span v-else-if="isExpired(row)" class="badge badge-warning badge-sm shrink-0">{{ t('files.statusPending') }}</span>
                    <span v-else class="badge badge-success badge-sm shrink-0">{{ t('files.statusActive') }}</span>
                </div>
                <p class="text-xs text-base-content/40 font-mono truncate">{{ row.id }}</p>
                <div class="grid grid-cols-2 gap-2 text-xs text-base-content/60">
                    <p>{{ formatBytes(row.size) }}</p>
                    <p>{{ t('files.downloadsCount', { count: row.download_count }) }}</p>
                    <p :title="formatDate(row.created_at)">{{ t('files.uploadedShort') }} {{ formatRelative(row.created_at) }}</p>
                    <p :title="formatDate(row.expires_at)">{{ t('files.expiresShort') }} {{ formatRelative(row.expires_at) }}</p>
                </div>
                <p class="text-xs text-base-content/40 font-mono">{{ t('files.colUploaderIp') }}: {{ row.uploader_ip || '-' }}</p>
                <div v-if="!row.deleted_at" class="flex items-center gap-2 pt-1 border-t border-white/10 mt-1">
                    <a :href="`/f/${row.id}`" target="_blank" class="btn btn-xs btn-ghost gap-1">
                        <Icon icon="mdi:eye-outline" class="size-4" />
                        {{ t('files.view') }}
                    </a>
                    <button
                        v-if="confirmId !== row.id"
                        class="btn btn-xs btn-ghost text-error gap-1"
                        @click="confirmId = row.id"
                    >
                        <Icon icon="mdi:delete-outline" class="size-4" />
                        {{ t('files.del') }}
                    </button>
                    <template v-else>
                        <button
                            class="btn btn-xs btn-error"
                            :disabled="deletingId === row.id"
                            @click="handleDelete(row.id)"
                        >
                            <span v-if="deletingId === row.id" class="loading loading-spinner loading-xs"></span>
                            {{ t('files.confirm') }}
                        </button>
                        <button class="btn btn-xs btn-ghost" @click="confirmId = null">{{ t('files.cancel') }}</button>
                    </template>
                </div>
            </div>
        </div>

        <!-- Table (sm and up) -->
        <div class="glass rounded-lg overflow-x-auto hidden sm:block">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>{{ t('files.colName') }}</th>
                        <th>{{ t('files.colId') }}</th>
                        <th>{{ t('files.colSize') }}</th>
                        <th>{{ t('files.colUploaded') }}</th>
                        <th>{{ t('files.colExpires') }}</th>
                        <th>{{ t('files.colDownloads') }}</th>
                        <th>{{ t('files.colUploaderIp') }}</th>
                        <th>{{ t('files.colStatus') }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading">
                        <td colspan="9" class="text-center py-10">
                            <span class="loading loading-spinner"></span>
                        </td>
                    </tr>
                    <tr v-else-if="!rows.length">
                        <td colspan="9" class="text-center py-10 text-base-content/50">{{ t('files.noFilesFound') }}</td>
                    </tr>
                    <tr v-for="row in rows" :key="row.id" class="hover">
                        <td class="max-w-[200px] truncate" :title="row.original_name">{{ row.original_name }}</td>
                        <td class="font-mono text-xs">{{ row.id }}</td>
                        <td>{{ formatBytes(row.size) }}</td>
                        <td :title="formatDate(row.created_at)">{{ formatRelative(row.created_at) }}</td>
                        <td :title="formatDate(row.expires_at)">{{ formatRelative(row.expires_at) }}</td>
                        <td>{{ row.download_count }}</td>
                        <td class="font-mono text-xs">{{ row.uploader_ip || '-' }}</td>
                        <td>
                            <span v-if="row.deleted_at" class="badge badge-error badge-sm">
                                {{ row.deleted_reason === 'manual_admin_delete' ? t('files.statusDeletedAdmin') : t('files.statusExpired') }}
                            </span>
                            <span v-else-if="isExpired(row)" class="badge badge-warning badge-sm">{{ t('files.statusPendingCleanup') }}</span>
                            <span v-else class="badge badge-success badge-sm">{{ t('files.statusActive') }}</span>
                        </td>
                        <td>
                            <div v-if="!row.deleted_at" class="flex items-center gap-1">
                                <a
                                    :href="`/f/${row.id}`"
                                    target="_blank"
                                    class="btn btn-xs btn-ghost"
                                    :title="t('files.viewFile')"
                                >
                                    <Icon icon="mdi:eye-outline" class="size-4" />
                                </a>
                                <button
                                    v-if="confirmId !== row.id"
                                    class="btn btn-xs btn-ghost text-error"
                                    :title="t('files.deleteFile')"
                                    @click="confirmId = row.id"
                                >
                                    <Icon icon="mdi:delete-outline" class="size-4" />
                                </button>
                                <template v-else>
                                    <button
                                        class="btn btn-xs btn-error"
                                        :disabled="deletingId === row.id"
                                        @click="handleDelete(row.id)"
                                    >
                                        <span v-if="deletingId === row.id" class="loading loading-spinner loading-xs"></span>
                                        {{ t('files.confirm') }}
                                    </button>
                                    <button class="btn btn-xs btn-ghost" @click="confirmId = null">{{ t('files.cancel') }}</button>
                                </template>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between mt-4">
            <p class="text-sm text-base-content/50">{{ t('admin.pageOf', { page, total: totalPages() }) }}</p>
            <div class="join">
                <button class="join-item btn btn-sm" :disabled="page <= 1" @click="page--">«</button>
                <button class="join-item btn btn-sm" :disabled="page >= totalPages()" @click="page++">»</button>
            </div>
        </div>
    </AdminLayout>
</template>
