import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { isDesktopMode } from './lib/appMode'

const EditGameView = () => import('./views/EditGameView.vue')
const GameView = () => import('./views/GameView.vue')
const HomeView = () => import('./views/HomeView.vue')
const JournalView = () => import('./views/JournalView.vue')
const LibraryView = () => import('./views/LibraryView.vue')
const SettingsView = () => import('./views/SettingsView.vue')
const TrophiesView = () => import('./views/TrophiesView.vue')

export const router = createRouter({
  history: isDesktopMode ? createWebHashHistory() : createWebHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    return {
      left: 0,
      top: 0,
    }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/library',
      name: 'library',
      component: LibraryView,
    },
    {
      path: '/journal',
      name: 'journal',
      component: JournalView,
    },
    {
      path: '/game/:gameId',
      name: 'game',
      component: GameView,
      props: true,
    },
    {
      path: '/edit',
      name: 'add-game',
      component: EditGameView,
    },
    {
      path: '/edit/:gameId',
      name: 'edit-game',
      component: EditGameView,
      props: true,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/trophies',
      name: 'trophies',
      component: TrophiesView,
    },
  ],
})
