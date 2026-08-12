import { createRouter, createWebHashHistory } from 'vue-router';
import { useUserStore } from '../store/user';

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue') },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    redirect: '/libraries',
    children: [
      { path: 'libraries', name: 'Libraries', component: () => import('../views/Libraries.vue') },
      { path: 'workspace/:libraryId', name: 'Workspace', component: () => import('../views/Workspace.vue'), props: true },
      { path: 'plan-workspace/:libraryId/:planId?', name: 'PlanWorkspace', component: () => import('../views/PlanWorkspace.vue'), props: true },
      { path: 'import/:libraryId', name: 'Import', component: () => import('../views/Import.vue'), props: true },
      { path: 'defects', name: 'Defects', component: () => import('../views/Defects.vue') },
      { path: 'plan-defects/:libraryId', name: 'PlanDefects', component: () => import('../views/PlanDefects.vue'), props: true },
      { path: 'project-defects/:libraryId', name: 'ProjectDefects', component: () => import('../views/ProjectDefects.vue'), props: true },
      { path: 'defect-analysis/:libraryId', name: 'DefectAnalysis', component: () => import('../views/DefectAnalysis.vue'), props: true },
    ],
  },
];

const router = createRouter({ history: createWebHashHistory(), routes });

// 路由守卫：未登录跳登录页
router.beforeEach(async (to) => {
  if (to.path === '/login') return true;
  const store = useUserStore();
  if (!store.user) {
    await store.fetchMe();
  }
  if (!store.user) {
    return '/login';
  }
  // 缺陷分析页权限检查
  if (to.name === 'DefectAnalysis') {
    const nickname = store.user?.nickname || store.user?.name || '';
    const PERM_KEY = 'defect_advanced_perm_users';
    const DEFAULT_PERM = JSON.stringify(['张远帆']);
    let permUsers;
    try { permUsers = JSON.parse(localStorage.getItem(PERM_KEY) || DEFAULT_PERM); } catch { permUsers = ['张远帆']; }
    if (!permUsers.includes(nickname)) {
      return false; // 阻止导航
    }
  }
  return true;
});

export default router;
