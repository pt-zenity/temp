<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { login } from '../api';
import { useI18n } from '../../i18n';
import LanguageSwitcher from '../../components/LanguageSwitcher.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleSubmit() {
    error.value = '';
    if (!username.value || !password.value) {
        error.value = t('login.errorRequired');
        return;
    }
    loading.value = true;
    try {
        await login(username.value, password.value);
        const redirect = (route.query.redirect as string) || '/admin';
        router.push(redirect);
    } catch (err: any) {
        error.value = err?.message || t('login.errorFailed');
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="min-h-screen flex items-center justify-center font-fira_code p-4 relative">
        <div class="absolute top-3 right-3 sm:top-4 sm:right-4">
            <LanguageSwitcher size="xs" />
        </div>
        <div class="w-full max-w-sm">
            <div class="text-center mb-6">
                <Icon icon="mdi:shield-lock-outline" class="size-10 sm:size-12 text-primary mx-auto mb-2" />
                <h1 class="text-xl sm:text-2xl font-bold">{{ t('admin.brand') }}</h1>
                <p class="text-sm text-base-content/60">{{ t('login.subtitle') }}</p>
            </div>

            <form class="glass-strong rounded-xl sm:rounded-2xl p-5 sm:p-6 flex flex-col gap-4" @submit.prevent="handleSubmit">
                <div v-if="error" class="alert alert-error text-sm py-2">
                    <Icon icon="mdi:alert-circle-outline" class="size-5" />
                    {{ error }}
                </div>

                <label class="form-control">
                    <span class="label-text text-sm mb-1">{{ t('login.username') }}</span>
                    <input
                        v-model="username"
                        type="text"
                        autocomplete="username"
                        class="input input-bordered w-full bg-white/5"
                        placeholder="admin"
                        :disabled="loading"
                    />
                </label>

                <label class="form-control">
                    <span class="label-text text-sm mb-1">{{ t('login.password') }}</span>
                    <input
                        v-model="password"
                        type="password"
                        autocomplete="current-password"
                        class="input input-bordered w-full bg-white/5"
                        placeholder="••••••••"
                        :disabled="loading"
                    />
                </label>

                <button type="submit" class="btn btn-primary w-full gap-2" :disabled="loading">
                    <span v-if="loading" class="loading loading-spinner loading-sm"></span>
                    <Icon v-else icon="mdi:login" class="size-4" />
                    {{ t('login.signIn') }}
                </button>
            </form>

            <p class="text-center text-xs text-base-content/40 mt-4">
                {{ t('login.restricted') }}
            </p>
        </div>
    </div>
</template>
