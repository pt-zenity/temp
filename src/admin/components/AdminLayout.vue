<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { logout } from '../api';

const route = useRoute();
const router = useRouter();
const loggingOut = ref(false);
const sidebarOpen = ref(false);

const navItems = [
    { name: 'admin-dashboard', label: 'Dashboard', icon: 'mdi:view-dashboard-outline', path: '/admin' },
    { name: 'admin-files', label: 'Files', icon: 'mdi:file-multiple-outline', path: '/admin/files' },
    { name: 'admin-activity', label: 'Activity Log', icon: 'mdi:history', path: '/admin/activity' },
    { name: 'admin-settings', label: 'Settings', icon: 'mdi:cog-outline', path: '/admin/settings' },
];

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
    <div class="min-h-screen bg-base-100 font-fira_code flex">
        <!-- Mobile overlay -->
        <div
            v-if="sidebarOpen"
            class="fixed inset-0 bg-black/60 z-30 lg:hidden"
            @click="sidebarOpen = false"
        ></div>

        <!-- Sidebar -->
        <aside
            class="fixed lg:static inset-y-0 left-0 z-40 w-60 bg-base-200 border-r border-base-300 flex flex-col transition-transform duration-200"
            :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
        >
            <div class="p-4 border-b border-base-300">
                <RouterLink to="/admin" class="flex items-center gap-2">
                    <Icon icon="mdi:shield-lock-outline" class="size-6 text-primary" />
                    <span class="text-lg font-bold">/tmp/fup admin</span>
                </RouterLink>
                <p class="text-xs text-base-content/50 mt-1">tempfile.xyz production</p>
            </div>

            <nav class="flex-1 p-3 flex flex-col gap-1">
                <RouterLink
                    v-for="item in navItems"
                    :key="item.name"
                    :to="item.path"
                    class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
                    :class="
                        route.name === item.name
                            ? 'bg-primary text-primary-content'
                            : 'hover:bg-base-300 text-base-content/80'
                    "
                    @click="sidebarOpen = false"
                >
                    <Icon :icon="item.icon" class="size-5" />
                    {{ item.label }}
                </RouterLink>
            </nav>

            <div class="p-3 border-t border-base-300 flex flex-col gap-2">
                <RouterLink
                    to="/"
                    target="_blank"
                    class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-base-content/60 hover:bg-base-300"
                >
                    <Icon icon="mdi:open-in-new" class="size-4" />
                    View public site
                </RouterLink>
                <button
                    class="btn btn-sm btn-error btn-outline gap-2"
                    :disabled="loggingOut"
                    @click="handleLogout"
                >
                    <Icon icon="mdi:logout" class="size-4" />
                    Logout
                </button>
            </div>
        </aside>

        <!-- Main content -->
        <div class="flex-1 min-w-0 flex flex-col">
            <header class="lg:hidden flex items-center gap-3 p-3 border-b border-base-300 bg-base-200">
                <button class="btn btn-sm btn-ghost" @click="sidebarOpen = true">
                    <Icon icon="mdi:menu" class="size-5" />
                </button>
                <span class="font-bold">/tmp/fup admin</span>
            </header>
            <main class="flex-1 p-4 lg:p-8 overflow-x-hidden">
                <slot />
            </main>
        </div>
    </div>
</template>
