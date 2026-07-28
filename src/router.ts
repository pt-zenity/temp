import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn } from './admin/api';

const routes = [
    {
        path: '/',
        name: 'upload',
        component: () => import('./views/UploadView.vue'),
    },
    {
        path: '/admin/login',
        name: 'admin-login',
        component: () => import('./admin/views/LoginView.vue'),
        meta: { public: true },
    },
    {
        path: '/admin',
        name: 'admin-dashboard',
        component: () => import('./admin/views/DashboardView.vue'),
    },
    {
        path: '/admin/files',
        name: 'admin-files',
        component: () => import('./admin/views/FilesView.vue'),
    },
    {
        path: '/admin/activity',
        name: 'admin-activity',
        component: () => import('./admin/views/ActivityView.vue'),
    },
    {
        path: '/admin/settings',
        name: 'admin-settings',
        component: () => import('./admin/views/SettingsView.vue'),
    },
    // Any other unmatched path falls back to the public upload page.
    { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
});

// Route guard: any /admin/* route (other than the login page itself)
// requires an active admin session. We optimistically check the cached
// login state first (fast, no flicker), and fall back to asking the
// backend if we don't know yet - avoids bouncing a valid session to the
// login page on a hard refresh.
router.beforeEach(async (to) => {
    const isAdminRoute = to.path.startsWith('/admin') && !to.meta.public;
    if (!isAdminRoute) return true;

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
        return { name: 'admin-login', query: { redirect: to.fullPath } };
    }
    return true;
});
