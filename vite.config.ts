import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    server: {
        proxy: {
            // Proxy API + file view/download routes to the self-hosted
            // backend (see server/) during development. In production,
            // nginx performs the equivalent proxying (see
            // deploy/nginx-tempfile.xyz.conf).
            '/api': 'http://localhost:3001',
            '/f': 'http://localhost:3001',
            '/dl': 'http://localhost:3001',
        },
    },
});
