import { createApp } from 'vue';
import VueCookies from 'vue-cookies';
import './style.css';
import App from './App.vue';
import { router } from './router';
import { getLocale } from './i18n';
import 'filepond/dist/filepond.min.css';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css';

document.documentElement.setAttribute('lang', getLocale());

createApp(App).use(VueCookies, { expires: '1h' }).use(router).mount('#app');
