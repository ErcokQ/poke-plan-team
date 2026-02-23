import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/vgc/builder',
  },
  {
    path: '/home',
    redirect: '/vgc/builder',
  },
  {
    path: '/:mode(vgc|singles)',
    component: () => import('@/features/layout/ModeLayout.vue'),
    children: [
      {
        path: '',
        redirect: { name: 'builder' },
      },
      {
        path: 'builder',
        name: 'builder',
        component: () => import('@/features/builder/BuilderPage.vue'),
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: () => import('@/features/analytics/AnalyticsPage.vue'),
      },
      {
        path: 'strategy',
        name: 'strategy',
        component: () => import('@/features/strategy/StrategyPage.vue'),
      },
      {
        path: 'damage-calc',
        name: 'damage-calc',
        component: () => import('@/features/damage-calc/DamageCalcPage.vue'),
      },
      {
        path: 'dex',
        name: 'dex',
        component: () => import('@/features/dex/DexPage.vue'),
      },
      {
        path: 'about',
        name: 'about',
        component: () => import('@/features/about/AboutPage.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/vgc/builder',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

export default router
