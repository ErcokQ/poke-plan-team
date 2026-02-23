<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  labels: string[]
  values: number[]
  title: string
  color: string
}>()

const data = computed<ChartData<'bar'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      label: props.title,
      data: props.values,
      backgroundColor: props.color,
      borderRadius: 6,
    },
  ],
}))

const options: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { color: '#d1d5db' },
      grid: { color: 'rgba(255,255,255,0.08)' },
    },
    x: {
      ticks: { color: '#d1d5db' },
      grid: { display: false },
    },
  },
}
</script>

<template>
  <div class="h-56 rounded-xl border border-gray-700 bg-st-black/50 p-2">
    <Bar :data="data" :options="options" />
  </div>
</template>
