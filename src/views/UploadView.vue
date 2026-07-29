<script setup lang="ts">
import { computed, inject, onMounted, reactive, watch } from 'vue';
import { customAlphabet } from 'nanoid';
import { filesize } from 'filesize';
import type { VueCookies } from 'vue-cookies';
import vueFilePond from 'vue-filepond';
import { Icon } from '@iconify/vue';

// @ts-ignore
import FilePondPluginImagePreview from 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.esm.js';
// @ts-ignore
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size/dist/filepond-plugin-file-validate-size.esm.js';

import Title from '../components/Title.vue';
import FileCard from '../components/FileCard.vue';
import { useI18n } from '../i18n';

const { t } = useI18n();
const FilePond = vueFilePond(FilePondPluginImagePreview, FilePondPluginFileValidateSize);
const cookies = inject<VueCookies>('$cookies')!;
const nanoid = customAlphabet('0123456789abcdef', 8);

// Self-hosted backend (see /server) enforces the real limit server-side via
// MAX_FILE_SIZE_BYTES in its .env. Passing a raw byte count here (rather
// than a "50GB" string) avoids FilePond's string parser applying a
// 1000-based multiplier that would silently under-report the real limit.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 * 1024; // 53,687,091,200 bytes (50 GiB)

// Same-origin API path. Nginx proxies /api/* and /f/* to the Node backend
// (see deploy/nginx-tempfile.xyz.conf), so this works both in dev
// (via Vite's proxy, see vite.config.ts) and in production.
const UPLOAD_ENDPOINT = '/api/upload';
const files = reactive<
    {
        url: string;
        fileName: string;
        fileSize: unknown;
        fileType: string;
        expiredAt: string;
    }[]
>([]);

const processFile = (_: any, progress: any) => {
    const serverId: any = JSON.parse(progress.serverId);

    const expiredAt = new Date();
    expiredAt.setHours(expiredAt.getHours() + 1);

    files.push({
        fileName: progress.filename,
        fileSize: filesize(progress.fileSize, { base: 10 }),
        fileType: progress.fileType,
        url: serverId.data.url,
        expiredAt: expiredAt.toISOString(),
    });
};

onMounted(() => {
    cookies.keys().forEach((key) => {
        if (!key.match(/^file\_[0-9a-f]+$/)) return;

        files.push(cookies.get(key));
    });

    watch(files, () => {
        const index = files.length - 1;
        const id = nanoid();

        cookies.set(`file_${id}`, files[index]);
    });
});

// FilePond's label-idle accepts an HTML string; recompute it reactively so
// switching languages updates the dropzone text without a page reload.
const dropLabel = computed(
    () => `${t('upload.dropLabelPrefix')} <span class="filepond--label-action"> ${t('upload.browse')} </span>`,
);
</script>

<template>
    <div>
        <Title />
        <div
            class="columns-1 md:columns-2 gap-3 sm:gap-4"
            :class="{ 'md:columns-1': files.length >= 5, 'md:columns-2': files.length <= 5 }"
        >
            <div class="glass glass-hover rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4">
                <div class="border-2 h-auto rounded-md sm:rounded-lg border-dashed border-white/20">
                    <FilePond
                        name="file"
                        ref="pond"
                        :credits="false"
                        :label-idle="dropLabel"
                        :allow-multiple="true"
                        :allow-browse="true"
                        :allow-remove="true"
                        :allow-revert="false"
                        :max-file-size="MAX_FILE_SIZE_BYTES"
                        accepted-file-types="*"
                        :server="UPLOAD_ENDPOINT"
                        :instant-upload="false"
                        @processfile="processFile"
                        class="p-6 sm:p-10 md:p-12"
                    />
                </div>
            </div>
            <div class="glass glass-hover font-fira_code rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col gap-2">
                <FileCard v-if="files.length" v-for="file in files" v-bind="file" />
                <p v-if="files.length" class="text-xs py-2 border-t border-dashed border-white/15">
                    {{ t('upload.cookieNotice') }}
                </p>
                <div
                    v-if="!files.length"
                    class="h-full flex flex-col gap-2 py-8 sm:py-6 align-middle items-center justify-center border-2 border-dashed border-white/15 rounded-md sm:rounded-lg"
                >
                    <Icon class="size-10 sm:size-12" icon="mdi:file-outline" />
                    {{ t('upload.emptyState') }}
                </div>
            </div>
        </div>
    </div>
</template>

<style>
.filepond--root {
    font-family: 'Fira Code', monospace !important;
}
.filepond--panel-root {
    background-color: rgba(255, 255, 255, 0.04) !important;
}
.filepond--drop-label {
    color: #ffffff !important;
}
</style>
