<script setup lang="ts">
import { useI18n } from '../i18n';

const { locale, setLocale } = useI18n();

const props = withDefaults(
    defineProps<{
        size?: 'sm' | 'xs';
    }>(),
    { size: 'sm' },
);
</script>

<template>
    <div class="join glass-hover rounded-md" role="group" aria-label="Language switcher">
        <button
            type="button"
            class="join-item btn btn-ghost"
            :class="[props.size === 'xs' ? 'btn-xs' : 'btn-sm', locale === 'en' ? 'btn-active' : '']"
            @click="setLocale('en')"
        >
            EN
        </button>
        <button
            type="button"
            class="join-item btn btn-ghost"
            :class="[props.size === 'xs' ? 'btn-xs' : 'btn-sm', locale === 'id' ? 'btn-active' : '']"
            @click="setLocale('id')"
        >
            ID
        </button>
    </div>
</template>
