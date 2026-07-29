// Minimal, dependency-free i18n composable. Supports nested message keys
// ("dashboard.title") and "{placeholder}" interpolation. Locale choice is
// persisted to localStorage and defaults to the browser's language when
// it's Indonesian, otherwise English.

import { computed, ref } from 'vue';
import { messages, type MessagesShape } from './messages';

export type Locale = 'en' | 'id';

const STORAGE_KEY = 'tmpfup_locale';

function detectDefaultLocale(): Locale {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'id') return stored;
    } catch {
        // localStorage unavailable (e.g. privacy mode) - fall through to detection.
    }
    const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
    return nav.toLowerCase().startsWith('id') ? 'id' : 'en';
}

const locale = ref<Locale>(detectDefaultLocale());

export function setLocale(next: Locale) {
    locale.value = next;
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        // ignore - non-fatal if storage isn't available
    }
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('lang', next);
    }
}

export function getLocale(): Locale {
    return locale.value;
}

function resolve(dict: any, path: string): unknown {
    return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        const value = params[key];
        return value === undefined ? match : String(value);
    });
}

export function translate(key: string, params?: Record<string, string | number>): string {
    const dict = messages[locale.value] as MessagesShape;
    const fallbackDict = messages.en as MessagesShape;
    const value = resolve(dict, key) ?? resolve(fallbackDict, key);
    if (typeof value !== 'string') return key;
    return interpolate(value, params);
}

export function useI18n() {
    return {
        locale: computed(() => locale.value),
        setLocale,
        t: translate,
    };
}
