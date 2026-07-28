<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    label: string;
    percent: number;
    detail?: string;
}>();

const barColor = computed(() => {
    if (props.percent >= 90) return 'bg-error';
    if (props.percent >= 70) return 'bg-warning';
    return 'bg-success';
});
</script>

<template>
    <div>
        <div class="flex items-center justify-between text-sm mb-1">
            <span class="text-base-content/70">{{ label }}</span>
            <span class="font-mono">{{ percent.toFixed(1) }}%</span>
        </div>
        <div class="w-full h-2 rounded-full bg-base-300 overflow-hidden">
            <div
                class="h-full rounded-full transition-all duration-500"
                :class="barColor"
                :style="{ width: `${Math.min(100, Math.max(0, percent))}%` }"
            ></div>
        </div>
        <p v-if="detail" class="text-xs text-base-content/50 mt-1">{{ detail }}</p>
    </div>
</template>
