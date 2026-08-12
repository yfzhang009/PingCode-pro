// API 封装：统一调用本端后端 /api/*，由后端转发到 pingcode
import axios from 'axios';
import { message } from 'ant-design-vue';

const http = axios.create({ baseURL: '/api', timeout: 30000 });

// 响应拦截：统一处理 { ok, data, msg }
http.interceptors.response.use(
  (resp) => resp.data,
  (error) => {
    if (error.response?.status === 401) {
      // 未登录跳转登录页
      if (location.hash !== '#/login') {
        message.error('登录已过期，请重新登录');
        setTimeout(() => (location.hash = '#/login'), 800);
      }
      return Promise.reject(new Error('未登录'));
    }
    return Promise.reject(error);
  }
);

// 通用请求函数：返回 { ok, data, msg }
async function request(config) {
  return http.request(config);
}

export const api = {
  // 认证
  login: (username, password) => request({ url: '/login', method: 'post', data: { username, password } }),
  logout: () => request({ url: '/logout', method: 'post' }),
  me: () => request({ url: '/me' }),

  // 测试库
  libraries: () => request({ url: '/libraries' }),

  // 模块树
  suites: (libraryId) => request({ url: '/suites', params: { libraryId } }),
  planSuites: (libraryId, planId) => request({ url: '/plan-suites', params: { libraryId, planId } }),
  createSuite: (libraryId, payload) => request({ url: '/suites', method: 'post', data: { libraryId, ...payload } }),
  moveSuite: (libraryId, payload) => request({ url: '/suites/move', method: 'put', data: { libraryId, ...payload } }),
  updateSuite: (libraryId, id, payload) => request({ url: `/suites/${id}`, method: 'put', data: { libraryId, ...payload } }),
  deleteSuite: (libraryId, id) => request({ url: `/suites/${id}`, method: 'delete', params: { libraryId } }),

  // 用例
  testcases: (params) => request({ url: '/testcases', params }),
  testcaseDetail: (libraryId, id) => request({ url: `/testcases/${id}`, params: { libraryId } }),
  createTestcase: (libraryId, payload) => request({ url: '/testcases', method: 'post', data: { libraryId, ...payload } }),
  deleteTestcases: (libraryId, ids) => request({ url: '/testcases', method: 'delete', data: { libraryId, ids } }),
  updateTestcaseTitle: (libraryId, id, title) => request({ url: `/testcases/${id}/title`, method: 'put', data: { libraryId, title } }),
  updateTestcaseProperty: (libraryId, id, code, value) => request({ url: `/testcases/${id}/property`, method: 'put', data: { libraryId, code, value } }),
  saveTestcaseStep: (libraryId, id, step) => request({ url: `/testcases/${id}/steps`, method: 'post', data: { libraryId, step } }),

  // 缺陷 & 项目管理
  projects: () => request({ url: '/projects' }),
  workItems: (params) => request({ url: '/work-items', params }),
  getWorkItem: (workItemId, params) => request({ url: `/work-items/${workItemId}`, params }),
  getWorkItemComments: (workItemId, params) => request({ url: `/work-items/${workItemId}/comments`, params }),
  addWorkItemComment: (workItemId, data) => request({ url: `/work-items/${workItemId}/comments`, method: 'post', data }),
  getWorkItemAttachments: (workItemId) => request({ url: `/work-items/${workItemId}/attachments` }),
  getWorkItemSelectableStates: (workItemId) => request({ url: `/work-items/${workItemId}/selectable-states` }),

  // 测试计划
  plans: (libraryId, params) => request({ url: '/plans', params: { libraryId, ...params } }),
  planTree: (libraryId) => request({ url: '/plan-tree', params: { libraryId } }),
  planWorkItems: (params) => request({ url: '/plan-work-items', params }),
  planProjects: () => request({ url: '/plan-projects' }),
  workItemStates: (sysModule) => request({ url: '/work-item-states', params: { sysModule } }),
  createWorkItem: (data) => request({ url: '/work-items/create', method: 'post', data }),
  updateWorkItem: (data) => request({ url: '/work-items/update', method: 'put', data }),
  deleteWorkItems: (data) => request({ url: '/work-items/batch-remove', method: 'delete', data }),
  users: () => request({ url: '/users' }),

  // 表单属性配置 & 状态
  formProperties: (libraryId) => request({ url: '/form-properties', params: { libraryId } }),
  states: (libraryId) => request({ url: '/states', params: { libraryId } }),
  testRun: (libraryId, payload) => request({ url: '/test-run', method: 'post', data: { libraryId, ...payload } }),
  testcaseLog: (libraryId, id, testPlanId) => request({ url: '/testcase-log', params: { libraryId, id, testPlanId } }),

  // 批量导入
  parseExcel: (formData) => request({ url: '/import/parse', method: 'post', data: formData, headers: { 'Content-Type': 'multipart/form-data' } }),
  runImport: (payload) => request({ url: '/import/run', method: 'post', data: payload }),

  // 跨平台推送：接收 TestPlatform 推送的用例，直接导入 pingcode
  pushToPingcode: (payload) => request({ url: '/import/from-platform', method: 'post', data: payload }),
};
