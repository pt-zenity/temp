<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { logout } from '../api';
import { useI18n } from '../../i18n';
import LanguageSwitcher from '../../components/LanguageSwitcher.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const loggingOut = ref(false);
const sidebarOpen = ref(false);

const navItems = computed(() => [
    { name: 'admin-dashboard', label: t('admin.nav.dashboard'), icon: 'mdi:view-dashboard-outline', path: '/admin' },
    { name: 'admin-files', label: t('admin.nav.files'), icon: 'mdi:file-multiple-outline', path: '/admin/files' },
    { name: 'admin-activity', label: t('admin.nav.activity'), icon: 'mdi:history', path: '/admin/activity' },
    { name: 'admin-settings', label: t('admin.nav.settings'), icon: 'mdi:cog-outline', path: '/admin/settings' },
]);

async function handleLogout() {
    loggingOut.value = true;
    try {
        await logout();
    } catch {
        // ignore - we're navigating away regardless
    } finally {
        router.push({ name: 'admin-login' });
    }
}
</script>

<template>
    <div class="min-h-screen font-fira_code flex">
        <!-- Mobile overlay -->
        <div
            v-if="sidebarOpen"
            class="fixed inset-0 bg-black/60 z-30 lg:hidden"
            @click="sidebarOpen = false"
        ></div>

        <!-- Sidebar -->
        <aside
            class="glass-strong fixed lg:sticky lg:top-0 inset-y-0 left-0 z-40 w-64 sm:w-60 lg:h-screen border-r-0 lg:rounded-none flex flex-col transition-transform duration-200"
            :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
        >
            <div class="p-4 border-b border-white/10 flex items-start justify-between gap-2">
                <div>
                    <RouterLink to="/admin" class="flex items-center gap-2">
                        <Icon icon="mdi:shield-lock-outline" class="size-6 text-primary" />
                        <span class="text-lg font-bold">{{ t('admin.brand') }}</span>
                    </RouterLink>
                    <p class="text-xs text-base-content/50 mt-1">{{ t('admin.productionLabel') }}</p>
                </div>
                <LanguageSwitcher size="xs" />
            </div>

            <nav class="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
                <RouterLink
                    v-for="item in navItems"
                    :key="item.name"
                    :to="item.path"
                    class="glass-hover flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
                    :class="
                        route.name === item.name
                            ? 'bg-primary/80 text-primary-content'
                            : 'text-base-content/80'
                    "
                    @click="sidebarOpen = false"
                >
                    <Icon :icon="item.icon" class="size-5" />
                    {{ item.label }}
                </RouterLink>
            </nav>

            <div class="p-3 border-t border-white/10 flex flex-col gap-2">
                <RouterLink
                    to="/"
                    target="_blank"
                    class="glass-hover flex items-center gap-2 px-3 py-2 rounded-md text-sm text-base-content/60"
                >
                    <Icon icon="mdi:open-in-new" class="size-4" />
                    {{ t('admin.viewPublicSite') }}
                </RouterLink>
                <button
                    class="btn btn-sm btn-error btn-outline gap-2"
                    :disabled="loggingOut"
                    @click="handleLogout"
                >
                    <Icon icon="mdi:logout" class="size-4" />
                    {{ t('admin.logout') }}
                </button>
            </div>
        </aside>

        <!-- Main content -->
        <div class="flex-1 min-w-0 flex flex-col">
            <header class="glass-subtle lg:hidden sticky top-0 z-20 flex items-center gap-3 p-3">
                <button class="btn btn-sm btn-ghost" @click="sidebarOpen = true">
                    <Icon icon="mdi:menu" class="size-5" />
                </button>
                <span class="font-bold">{{ t('admin.brand') }}</span>
                <div class="ml-auto">
                    <LanguageSwitcher size="xs" />
                </div>
            </header>
            <main class="flex-1 p-3 sm:p-4 lg:p-8 overflow-x-hidden">
                <slot />
            </main>
        </div>
    </div>
</template>
