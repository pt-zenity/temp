<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import Chart from 'chart.js/auto';

const props = defineProps<{
    labels: string[];
    counts: number[];
    bytes: number[];
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

function render() {
    if (!canvasEl.value) return;
    chart?.destroy();
    chart = new Chart(canvasEl.value, {
        type: 'line',
        data: {
            labels: props.labels,
            datasets: [
                {
                    label: 'Uploads',
                    data: props.counts,
                    borderColor: '#36d399',
                    backgroundColor: 'rgba(54, 211, 153, 0.15)',
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: '#9ca3af' },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { display: false },
                },
            },
        },
    });
}

onMounted(render);
onBeforeUnmount(() => chart?.destroy());
watch(() => [props.labels, props.counts], render, { deep: true });
</script>

<template>
    <div class="relative h-64">
        <canvas ref="canvasEl"></canvas>
    </div>
</template>
