<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import AdminLayout from '../components/AdminLayout.vue';
import { me, changePassword } from '../api';

const username = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const success = ref('');
const error = ref('');

onMounted(async () => {
    try {
        const res = await me();
        username.value = res.data.username;
    } catch {
        // router guard already handles redirecting unauthenticated users
    }
});

async function handleChangePassword() {
    error.value = '';
    success.value = '';

    if (newPassword.value.length < 8) {
        error.value = 'New password must be at least 8 characters.';
        return;
    }
    if (newPassword.value !== confirmPassword.value) {
        error.value = 'Passwords do not match.';
        return;
    }

    loading.value = true;
    try {
        await changePassword(newPassword.value);
        success.value = 'Password changed successfully.';
        newPassword.value = '';
        confirmPassword.value = '';
    } catch (err: any) {
        error.value = err?.message || 'Failed to change password.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <AdminLayout>
        <div class="mb-6">
            <h1 class="text-xl sm:text-2xl font-bold">Settings</h1>
            <p class="text-sm text-base-content/60">Manage your admin account</p>
        </div>

        <div class="max-w-md glass rounded-lg sm:rounded-xl p-4 sm:p-5">
            <h2 class="font-semibold mb-4 flex items-center gap-2">
                <Icon icon="mdi:account-outline" class="size-5" />
                Account
            </h2>
            <p class="text-sm mb-1">
                <span class="text-base-content/50">Username:</span>
                <span class="font-mono ml-1">{{ username || '...' }}</span>
            </p>
        </div>

        <div class="max-w-md glass rounded-lg sm:rounded-xl p-4 sm:p-5 mt-6">
            <h2 class="font-semibold mb-4 flex items-center gap-2">
                <Icon icon="mdi:key-change" class="size-5" />
                Change password
            </h2>

            <div v-if="success" class="alert alert-success text-sm py-2 mb-3">
                <Icon icon="mdi:check-circle-outline" class="size-5" />
                {{ success }}
            </div>
            <div v-if="error" class="alert alert-error text-sm py-2 mb-3">
                <Icon icon="mdi:alert-circle-outline" class="size-5" />
                {{ error }}
            </div>

            <form class="flex flex-col gap-4" @submit.prevent="handleChangePassword">
                <label class="form-control">
                    <span class="label-text text-sm mb-1">New password</span>
                    <input
                        v-model="newPassword"
                        type="password"
                        class="input input-bordered w-full bg-white/5"
                        placeholder="At least 8 characters"
                        :disabled="loading"
                    />
                </label>
                <label class="form-control">
                    <span class="label-text text-sm mb-1">Confirm new password</span>
                    <input
                        v-model="confirmPassword"
                        type="password"
                        class="input input-bordered w-full bg-white/5"
                        :disabled="loading"
                    />
                </label>
                <button type="submit" class="btn btn-primary gap-2 w-full" :disabled="loading">
                    <span v-if="loading" class="loading loading-spinner loading-sm"></span>
                    <Icon v-else icon="mdi:content-save-outline" class="size-4" />
                    Save changes
                </button>
            </form>
        </div>
    </AdminLayout>
</template>
