<script setup lang="ts">
import { Icon } from '@iconify/vue';

defineProps<{
    label: string;
    value: string | number;
    icon: string;
    sublabel?: string;
    color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
}>();
</script>

<template>
    <div class="bg-base-200 rounded-lg p-4 flex items-start gap-3">
        <div
            class="rounded-md p-2 shrink-0"
            :class="{
                'bg-primary/20 text-primary': !color || color === 'primary',
                'bg-success/20 text-success': color === 'success',
                'bg-warning/20 text-warning': color === 'warning',
                'bg-error/20 text-error': color === 'error',
                'bg-info/20 text-info': color === 'info',
            }"
        >
            <Icon :icon="icon" class="size-6" />
        </div>
        <div class="min-w-0">
            <p class="text-xs text-base-content/60 truncate">{{ label }}</p>
            <p class="text-xl font-bold truncate">{{ value }}</p>
            <p v-if="sublabel" class="text-xs text-base-content/50 truncate">{{ sublabel }}</p>
        </div>
    </div>
</template>
