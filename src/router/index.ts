import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

export interface FootLink {
  to: string
  num: string
  label: string
}

declare module 'vue-router' {
  interface RouteMeta {
    num?: string
    label?: string
    prev?: FootLink
    next?: FootLink
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    // Campaign aliases. Each one renders the home page but is recorded as its
    // own path in analytics, so traffic is attributable per channel even on
    // plans where UTM filtering is unavailable. Referrers are unreliable here:
    // the LinkedIn and Instagram in-app browsers usually send none.
    alias: ['/li', '/ig', '/x', '/wa', '/mail'],
    component: () => import('../views/Portfolio.vue'),
    meta: {
      num: '00',
      label: 'Home',
    },
  },
  {
    path: '/education',
    name: 'education',
    component: () => import('../views/Education.vue'),
    meta: {
      num: '01',
      label: 'Education',
      prev: { to: '/', num: '00', label: 'Home' },
      next: { to: '/experience', num: '02', label: 'Experience' },
    },
  },
  {
    path: '/experience',
    name: 'experience',
    component: () => import('../views/Experience.vue'),
    meta: {
      num: '02',
      label: 'Experience',
      prev: { to: '/education', num: '01', label: 'Education' },
      next: { to: '/projects', num: '03', label: 'Projects' },
    },
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('../views/Projects.vue'),
    meta: {
      num: '03',
      label: 'Projects',
      prev: { to: '/experience', num: '02', label: 'Experience' },
      next: { to: '/leadership', num: '04', label: 'Leadership' },
    },
  },
  {
    path: '/leadership',
    name: 'leadership',
    component: () => import('../views/Leadership.vue'),
    meta: {
      num: '04',
      label: 'Leadership',
      prev: { to: '/projects', num: '03', label: 'Projects' },
      next: { to: '/recognition', num: '05', label: 'Recognition' },
    },
  },
  {
    path: '/recognition',
    name: 'recognition',
    component: () => import('../views/Recognition.vue'),
    meta: {
      num: '05',
      label: 'Recognition',
      prev: { to: '/leadership', num: '04', label: 'Leadership' },
    },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, saved) {
    if (saved) return saved
    return { top: 0 }
  },
})

export default router
