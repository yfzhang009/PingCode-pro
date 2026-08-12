// pingcode API 客户端 - 所有调用 pingcode 后端的请求都从这里发出
// 基于 ruoyi-vue-pro(芋道) 框架的接口规范
import axios from 'axios';

const PINGCODE_BASE = 'http://39.100.83.141:81/admin-api';
const TENANT_ID = '1';

// 用于绕过拦截器的原始 axios 实例
const rawAxios = axios.create({ timeout: 30000 });

// 创建 axios 实例，复用 pingcode 前端的拦截器逻辑
const http = axios.create({
  baseURL: PINGCODE_BASE,
  timeout: 30000,
});

// 请求拦截器：注入 token、tenant-id、principalId
// 与 pingcode 前端 baseApi.Request 的行为保持一致
http.interceptors.request.use((config) => {
  config.headers['tenant-id'] = TENANT_ID;
  // 业务调用方通过 config.meta 传入 token 和 principalId
  const token = config.meta?.token;
  const principalId = config.meta?.principalId;
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  // principalId 是 pingcode 业务上下文(当前操作的测试库ID)，必带
  if (principalId !== undefined && principalId !== null && principalId !== '') {
    config.headers['principalId'] = String(principalId);
  }
  return config;
});

// 响应拦截器：pingcode 返回 { code, data, msg }
// code===0 表示成功，其他为业务错误
http.interceptors.response.use(
  (resp) => {
    const body = resp.data;
    // 非标准 JSON 结构(如文件流)直接返回
    if (body === null || typeof body !== 'object' || body.code === undefined) {
      return body;
    }
    if (body.code === 0) {
      // getWorkItem 对已删除/不存在的项返回 data: null
      // 但很多 POST 写操作（createSuite/createTestcase）成功时也返回 data: null
      if ((body.data === null || body.data === undefined) && resp.config.url?.includes('/work-item/get')) {
        const err = new Error('缺陷不存在');
        err.code = 404;
        throw err;
      }
      return body.data;
    }
    // 业务错误：抛出带 code 和 msg 的错误
    const err = new Error(body.msg || 'pingcode 接口返回未知错误');
    err.code = body.code;
    err.bizError = true;
    throw err;
  },
  (error) => {
    // HTTP 层错误或 pingcode 返回非 0 code
    if (error.bizError) throw error;
    // 401: token 失效
    if (error.response?.status === 401) {
      const e = new Error('登录已过期，请重新登录');
      e.code = 401;
      throw e;
    }
    throw new Error(error.response?.data?.msg || error.message || '请求 pingcode 失败');
  }
);

// ============ 认证相关 ============

// 登录：POST /system/auth/login
export async function login(username, password) {
  return http.post('/system/auth/login', {
    username,
    password,
    loginDevice: 'PC',
  });
}

// 获取当前用户信息：GET /system/user/profile/get
export async function getLoginInfo(token) {
  return http.get('/system/user/profile/get', { meta: { token } });
}

// ============ 测试库相关 ============

// 测试库列表：GET /testhub/library/list
export async function listLibraries(token) {
  return http.get('/testhub/library/list', { meta: { token } });
}

// ============ 模块树(suite)相关 ============

// 模块树：GET /testhub/suite/tree?libraryId=X
export async function getSuiteTree(token, libraryId) {
  return http.get('/testhub/suite/tree', {
    params: { libraryId },
    meta: { token, principalId: libraryId },
  });
}

// 新建模块：POST /testhub/suite/create
// type: 1=叶子模块(可放用例), 2=分组模块
// 注意：pingcode 的 TestsuiteCreateVO 要求 body 中带 libraryId
export async function createSuite(token, libraryId, payload) {
  return http.post('/testhub/suite/create', { libraryId: Number(libraryId), ...payload }, {
    meta: { token, principalId: libraryId },
  });
}

// 移动模块：POST /testhub/suite/move
export async function moveSuite(token, libraryId, payload) {
  return http.post('/testhub/suite/move', payload, {
    meta: { token, principalId: libraryId },
  });
}

// 更新模块：POST /testhub/suite/update
export async function updateSuite(token, libraryId, payload) {
  return http.post('/testhub/suite/update', payload, {
    meta: { token, principalId: libraryId },
  });
}

// 删除模块：POST /testhub/suite/delete
export async function deleteSuite(token, libraryId, id) {
  return http.post('/testhub/suite/delete', { id }, {
    meta: { token, principalId: libraryId },
  });
}

// ============ 测试用例(testcase)相关 ============

// 用例分页：POST /testhub/testcase/page?libraryId=X&pageNo=N&pageSize=M
// 搜索前需先调用 saveQuery 保存查询条件
export async function pageTestcase(token, libraryId, query, body) {
  return http.post('/testhub/testcase/page', body || {}, {
    params: {
      libraryId,
      pageNo: query.pageNo || 1,
      pageSize: query.pageSize || 20,
      ...(query.suiteId ? { suiteId: query.suiteId } : {}),
      ...(query.planId ? { testplanId: query.planId } : {}),
    },
    meta: { token, principalId: libraryId },
  });
}

// 保存查询条件：POST /testhub/testcase/save-query?libraryId=X
export async function saveTestcaseQuery(token, libraryId, body) {
  return http.post('/testhub/testcase/save-query', body || {}, {
    meta: { token, principalId: libraryId },
  });
}

// 用例详情：GET /testhub/testcase/get?id=X
export async function getTestcase(token, libraryId, id) {
  return http.get('/testhub/testcase/get', {
    params: { id },
    meta: { token, principalId: libraryId },
  });
}

// 新建用例：POST /testhub/testcase/create
// 必填：title, assignee; steps 字段名：position/description/expectedValue/isGroup
// 注意：pingcode 的 TestcaseCreateReqVO 要求 body 中带 libraryId
export async function createTestcase(token, libraryId, payload) {
  return http.post('/testhub/testcase/create', { libraryId: Number(libraryId), ...payload }, {
    meta: { token, principalId: libraryId },
  });
}

// 更新用例标题：PUT /testhub/testcase/title
export async function updateTestcaseTitle(token, libraryId, body) {
  return http.put('/testhub/testcase/title', body, {
    meta: { token, principalId: libraryId },
  });
}

// 更新用例属性（precondition 等）：PUT /testhub/testcase/property
export async function updateTestcaseProperty(token, libraryId, body) {
  return http.put('/testhub/testcase/property', body, {
    meta: { token, principalId: libraryId },
  });
}

// 保存用例步骤：POST /testhub/testcase/save-step
export async function saveTestcaseStep(token, libraryId, body) {
  return http.post('/testhub/testcase/save-step', body, {
    meta: { token, principalId: libraryId },
  });
}

// 删除用例：DELETE /testhub/testcase/batch/remove
export async function deleteTestcase(token, libraryId, ids) {
  return http.delete('/testhub/testcase/batch/remove', {
    data: { ids },
    meta: { token, principalId: libraryId },
  });
}

// 创建表单属性配置：GET /configuration/form/properties?scene=1&sysModule=testcase
// 用于前端动态渲染用例创建表单（哪些字段必填、选项等）
export async function getCreateFormProperties(token, libraryId) {
  return http.get('/configuration/form/properties', {
    params: { scene: 1, sysModule: 'testcase' },
    meta: { token, principalId: libraryId },
  });
}

// 可选状态：GET /testhub/library/states?principalId=X
export async function getLibraryStates(token, libraryId) {
  return http.get('/testhub/library/states', {
    params: { principalId: libraryId },
    meta: { token, principalId: libraryId },
  });
}

// 执行用例：POST /testhub/testcase/test-run?principalId=X
export async function testRun(token, libraryId, body) {
  return http.post('/testhub/testcase/test-run', body, {
    params: { principalId: libraryId },
    meta: { token, principalId: libraryId },
  });
}

// 用例最新执行日志：GET /testhub/testcase/get-latest-plan-log?id=X&testPlanId=Y
export async function getTestcaseLog(token, libraryId, id, testPlanId) {
  return http.get('/testhub/testcase/get-latest-plan-log', {
    params: { id, testPlanId },
    meta: { token, principalId: libraryId },
  });
}

// ============ 缺陷(work-item)相关 ============
// pingcode 中缺陷统一用 /project/work-item 模块
// typeGroup=4 表示缺陷(bug)，typeGroup=1表示需求，typeGroup=2表示任务

// 项目列表：GET /project/project/list
export async function listProjects(token) {
  return http.get('/project/project/list', { meta: { token } });
}

// 项目详情
export async function getProject(token, projectId) {
  return http.get('/project/project/query', {
    params: { id: projectId },
    meta: { token, principalId: projectId },
  });
}

// 缺陷分页：POST /project/work-item/page?projectId=X&pageNo=X&pageSize=X&addon=bug
// body: { showType:"2", order:{code:"",dir:""}, search:{keywords:"",scope:["code","title"]}, conditions:{conditions:[]} }
export async function pageWorkItem(token, projectId, query, body) {
  return http.post('/project/work-item/page', body || {}, {
    params: {
      projectId,
      pageNo: query.pageNo || 1,
      pageSize: query.pageSize || 20,
      addon: 'bug',
      ...(query.keyword ? { keyword: query.keyword } : {}),
    },
    meta: { token, principalId: projectId },
  });
}

// 缺陷详情：GET /project/work-item/get?workItemId=X&projectId=X
export async function getWorkItem(token, projectId, workItemId) {
  // pingcode 该接口不稳定(可能 500)，直接返回 page 列表中就有的字段
  // 描述字段通过 getWorkItemDescription 单独获取
  return http.get('/project/work-item/get', {
    params: { workItemId, projectId },
    meta: { token, principalId: projectId },
  });
}

// 通过 property 接口读取 description 文本
// PingCode 中 description 是 work-item 的属性，通过 property 读取
export async function getWorkItemDescription(token, projectId, workItemId) {
  const url = `${PINGCODE_BASE}/project/work-item/get`;
  try {
    const resp = await rawAxios.get(url, {
      params: { workItemId, projectId },
      headers: { 'tenant-id': TENANT_ID, 'Authorization': `Bearer ${token}`, 'principalId': String(projectId) },
      timeout: 30000,
    });
    const body = resp.data;
    if (body && body.code === 0 && body.data && body.data.description !== undefined) {
      return body.data.description;
    }
    return null;
  } catch {
    return null;
  }
}

// ============ 测试计划相关 ============

// 计划绑定的项目列表：GET /testhub/plan/list-project
export async function listPlanProjects(token) {
  return http.get('/testhub/plan/list-project', { meta: { token } });
}

// 测试计划分页：POST /testhub/plan/page
// libraryId 必须放在 body 中
export async function pagePlan(token, libraryId, body) {
  return http.post('/testhub/plan/page', { libraryId: Number(libraryId), ...body }, {
    meta: { token, principalId: libraryId },
  });
}

// 测试计划树：GET /testhub/plan/tree?libraryId=X
export async function getPlanTree(token, libraryId) {
  return http.get('/testhub/plan/tree', {
    params: { libraryId },
    meta: { token, principalId: libraryId },
  });
}

// 计划关联的工作项(缺陷)：POST /testhub/plan/work-item/page?testplanId=X
export async function pagePlanWorkItems(token, planId, body) {
  return http.post('/testhub/plan/work-item/page', body || {}, {
    params: { testplanId: planId },
    meta: { token },
  });
}

// 获取项目工作项状态映射：GET /project/work-item/states?sysModule=bug
export async function getWorkItemStates(token, sysModule) {
  return http.get('/project/work-item/states', {
    params: { sysModule: sysModule || 'bug' },
    meta: { token },
  });
}

// 创建缺陷：POST /project/work-item/create
// body: { projectId, title, typeId:1, stateId:67, assignee:630, ... }
export async function createWorkItem(token, body) {
  return http.post('/project/work-item/create', body, {
    meta: { token, principalId: body.projectId },
  });
}

// 删除缺陷：DELETE /project/work-item/batch/remove
export async function deleteWorkItems(token, body) {
  return http.delete('/project/work-item/batch/remove', {
    data: body,
    params: { principalId: body.projectId },
    meta: { token },
  });
}

// 更新缺陷标题：PUT /project/work-item/title
export async function updateWorkItemTitle(token, body) {
  return http.put('/project/work-item/title', body, {
    meta: { token, principalId: body.projectId },
  });
}

// 更新缺陷处理人：PUT /project/work-item/assignee
export async function updateWorkItemAssignee(token, body) {
  return http.put('/project/work-item/assignee', body, {
    meta: { token, principalId: body.projectId },
  });
}

// 更新缺陷自定义属性（含 description）：PUT /project/work-item/property
// body: { id, code: 'description', value: '<p>xxx</p>' }
export async function updateWorkItemProperty(token, body) {
  return http.put('/project/work-item/property', body, {
    meta: { token, principalId: body.projectId },
  });
}

// 获取用户列表（id → 昵称映射）：GET /system/user/simple-list
export async function getUserSimpleList(token) {
  return http.get('/system/user/simple-list', { meta: { token } });
}

// 缺陷评论列表：GET /project/work-item/comment?id=X&sort=-1&pageNo=1&pageSize=50
export async function getWorkItemComments(token, workItemId, query) {
  return http.get('/project/work-item/comment', {
    params: { id: workItemId, sort: -1, pageNo: query?.pageNo || 1, pageSize: query?.pageSize || 50 },
    meta: { token },
  });
}

// 添加评论：POST /project/work-item/comment
export async function addWorkItemComment(token, body) {
  return http.post('/project/work-item/comment', body, {
    meta: { token, principalId: body.projectId },
  });
}

// 缺陷附件列表：GET /project/work-item/attachment?id=X
export async function getWorkItemAttachments(token, workItemId) {
  return http.get('/project/work-item/attachment', {
    params: { id: workItemId },
    meta: { token },
  });
}

// 缺陷可选状态：GET /project/work-item/selectable-states?id=X
export async function getWorkItemSelectableStates(token, workItemId) {
  return http.get('/project/work-item/selectable-states', {
    params: { id: workItemId },
    meta: { token },
  });
}
export async function changeWorkItemState(token, body) {
  return http.put('/project/work-item/batch/state', body, {
    meta: { token, principalId: body.projectId },
  });
}
