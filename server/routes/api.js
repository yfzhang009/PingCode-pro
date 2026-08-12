// API 路由：所有前端请求入口，转发到 pingcode
import { Router } from 'express';
import * as pc from '../lib/pingcode-client.js';
import { getToken, setSession, clearSession, getSessionUser } from '../lib/session.js';

const router = Router();

// 中间件：校验登录状态
function requireAuth(req, res, next) {
  const token = getToken();
  if (!token) {
    return res.status(401).json({ ok: false, msg: '未登录或登录已过期' });
  }
  req.token = token;
  next();
}

// ============ 认证 ============

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ ok: false, msg: '请输入账号和密码' });
  }
  try {
    const loginData = await pc.login(username, password);
    // 登录成功后拉取用户信息，一起持久化
    const userInfo = await pc.getLoginInfo(loginData.accessToken);
    setSession({
      accessToken: loginData.accessToken,
      refreshToken: loginData.refreshToken,
      expiresTime: loginData.expiresTime,
      user: userInfo,
    });
    res.json({ ok: true, data: { user: userInfo } });
  } catch (e) {
    res.json({ ok: false, msg: e.message || '登录失败' });
  }
});

// 登出
router.post('/logout', (req, res) => {
  clearSession();
  res.json({ ok: true });
});

// 当前用户
router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, data: { user: getSessionUser() } });
});

// ============ 测试库 ============

router.get('/libraries', requireAuth, async (req, res) => {
  try {
    const data = await pc.listLibraries(req.token);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// ============ 模块树 ============

router.get('/suites', requireAuth, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const data = await pc.getSuiteTree(req.token, libraryId);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 计划维度模块树：拉全量树 + 计划全量用例，过滤节点 count 为计划内用例数
router.get('/plan-suites', requireAuth, async (req, res) => {
  try {
    const { libraryId, planId } = req.query;
    const [treeData, casesData] = await Promise.all([
      pc.getSuiteTree(req.token, libraryId),
      pc.pageTestcase(req.token, libraryId,
        { pageNo: 1, pageSize: 10000, planId: Number(planId) },
        { order: { code: 'createTime', dir: '-1' }, search: { keywords: '', scope: ['code', 'title'] }, conditions: { conditions: [] }, principalId: String(libraryId), planId: Number(planId) },
      ),
    ]);
    // 拿到计划内所有用例的 suiteId 分布
    const suiteCountMap = {};
    const list = casesData?.list || [];
    for (const c of list) {
      const sid = c.suiteId;
      if (sid != null) suiteCountMap[sid] = (suiteCountMap[sid] || 0) + 1;
    }
    // 递归过滤树：只保留有该计划用例的节点，count 替换为计划内用例数
    function filterTree(nodes) {
      if (!nodes) return [];
      const result = [];
      for (const n of nodes) {
        const childFiltered = filterTree(n.children);
        const selfCount = suiteCountMap[n.id] || 0;
        const childTotal = childFiltered.reduce((sum, c) => sum + (c.count || 0), 0);
        if (selfCount > 0 || childTotal > 0) {
          result.push({
            ...n,
            count: selfCount + childTotal,
            children: childFiltered,
          });
        }
      }
      return result;
    }
    const filtered = filterTree(treeData || []);
    res.json({ ok: true, data: filtered });
  } catch (e) {
    console.log('[plan-suites] error:', e.message);
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

router.post('/suites', requireAuth, async (req, res) => {
  try {
    const { libraryId, ...payload } = req.body;
    const data = await pc.createSuite(req.token, libraryId, payload);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

router.delete('/suites/:id', requireAuth, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const data = await pc.deleteSuite(req.token, libraryId, Number(req.params.id));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 移动模块
router.put('/suites/move', requireAuth, async (req, res) => {
  try {
    const { libraryId, ...payload } = req.body;
    const data = await pc.moveSuite(req.token, libraryId, payload);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 更新模块
router.put('/suites/:id', requireAuth, async (req, res) => {
  try {
    const { libraryId, ...payload } = req.body;
    const data = await pc.updateSuite(req.token, libraryId, { id: Number(req.params.id), ...payload });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// ============ 用例 ============

router.get('/testcases', requireAuth, async (req, res) => {
  try {
    const { libraryId, pageNo, pageSize, keyword, suiteId, planId, execStatus, importantLevel, maintainer } = req.query;
    const pageQuery = {
      pageNo: Number(pageNo || 1),
      pageSize: Number(pageSize || 20),
      ...(suiteId ? { suiteId } : {}),
      ...(planId ? { planId } : {}),
    };

// 构建请求 body
    const makeBody = (kw) => ({
      order: { code: 'createTime', dir: '-1' },
      search: { keywords: kw, scope: ['code', 'title'] },
      conditions: { conditions: [] },
      principalId: String(libraryId),
      ...(planId ? { planId: Number(planId) } : {}),
    });

    if (keyword) {
      try {
        await pc.saveTestcaseQuery(req.token, libraryId, makeBody(''));
      } catch (sqErr) {
        console.log('[api] save-query 失败:', sqErr.message);
      }
      const data = await pc.pageTestcase(req.token, libraryId, pageQuery, makeBody(keyword));
      res.json({ ok: true, data });
    } else {
      const data = await pc.pageTestcase(req.token, libraryId, pageQuery, makeBody(''));
      res.json({ ok: true, data });
    }
  } catch (e) {
    console.log('[api] testcases 错误:', e.message);
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

router.get('/testcases/:id', requireAuth, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const data = await pc.getTestcase(req.token, libraryId, Number(req.params.id));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 保存用例步骤
router.post('/testcases/:id/steps', requireAuth, async (req, res) => {
  try {
    const { libraryId, step } = req.body;
    const data = await pc.saveTestcaseStep(req.token, libraryId, {
      ...step,
      testcaseId: Number(req.params.id),
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

router.post('/testcases', requireAuth, async (req, res) => {
  try {
    const { libraryId, ...payload } = req.body;
    const data = await pc.createTestcase(req.token, libraryId, payload);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 更新用例标题
router.put('/testcases/:id/title', requireAuth, async (req, res) => {
  try {
    const { libraryId, title } = req.body;
    const data = await pc.updateTestcaseTitle(req.token, libraryId, { id: Number(req.params.id), title });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 更新用例属性（precondition 等）
router.put('/testcases/:id/property', requireAuth, async (req, res) => {
  try {
    const { libraryId, code, value } = req.body;
    const data = await pc.updateTestcaseProperty(req.token, libraryId, { id: Number(req.params.id), code, value });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

router.delete('/testcases', requireAuth, async (req, res) => {
  try {
    const { libraryId, ids } = req.body;
    const data = await pc.deleteTestcase(req.token, libraryId, ids);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 创建用例的表单属性配置（前端动态渲染表单用）
router.get('/form-properties', requireAuth, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const data = await pc.getCreateFormProperties(req.token, libraryId);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 测试库可选状态
router.get('/states', requireAuth, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const data = await pc.getLibraryStates(req.token, libraryId);
    res.json({ ok: true, data });
  } catch (e) {
    // PingCode 不支持此接口时返回空数据
    res.json({ ok: true, data: [] });
  }
});

// 执行用例（修改执行状态）
router.post('/test-run', requireAuth, async (req, res) => {
  try {
    const { libraryId, ...payload } = req.body;
    const data = await pc.testRun(req.token, libraryId, payload);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 用例执行日志：GET /api/testcase-log?libraryId=X&id=Y&testPlanId=Z
router.get('/testcase-log', requireAuth, async (req, res) => {
  try {
    const { libraryId, id, testPlanId } = req.query;
    const data = await pc.getTestcaseLog(req.token, libraryId, Number(id), testPlanId);
    res.json({ ok: true, data });
  } catch (e) {
    // 未执行过的用例无日志，返回 null 也正常
    if (e.code === 404 || (e.message && e.message.includes('不存在'))) {
      return res.json({ ok: true, data: null });
    }
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// ============ 项目 & 缺陷 ============

router.get('/projects', requireAuth, async (req, res) => {
  try {
    const data = await pc.listProjects(req.token);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

router.get('/work-items', requireAuth, async (req, res) => {
  try {
    const { projectId, pageNo, pageSize, keyword, planId } = req.query;
    const body = {
      showType: '2',
      order: { code: '', dir: '' },
      search: { keywords: keyword || '', scope: ['code', 'title'] },
      conditions: { conditions: [] },
    };
    const data = await pc.pageWorkItem(req.token, projectId, {
      pageNo: Number(pageNo || 1),
      pageSize: Number(pageSize || 100),
      ...(keyword ? { keyword } : {}),
    }, body);
    // pageWorkItem 内部响应拦截器已提取 data，直接返回即可
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

router.get('/work-items/:id', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const data = await pc.getWorkItem(req.token, projectId, Number(req.params.id));
    res.json({ ok: true, data });
  } catch (e) {
    // pingcode get 接口可能 500，尝试降级获取 description
    if (e.bizError && e.code === 500) {
      try {
        const desc = await pc.getWorkItemDescription(req.token, projectId, Number(req.params.id));
        res.json({ ok: true, data: { description: desc || '' } });
      } catch (_) {
        res.json({ ok: true, data: { description: '' } });
      }
      return;
    }
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// ============ 测试计划 ============

router.get('/plans', requireAuth, async (req, res) => {
  try {
    const { libraryId, pageNo, pageSize } = req.query;
    const data = await pc.pagePlan(req.token, libraryId, {
      pageNo: Number(pageNo || 1),
      pageSize: Number(pageSize || 20),
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 测试计划树：GET /api/plan-tree?libraryId=X
router.get('/plan-tree', requireAuth, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const data = await pc.getPlanTree(req.token, libraryId);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 计划关联缺陷：GET /api/plan-work-items?planId=X&pageNo=X&pageSize=X
router.get('/plan-work-items', requireAuth, async (req, res) => {
  try {
    const { planId, pageNo, pageSize, keyword } = req.query;
    const body = {};
    if (keyword) body.keyword = keyword;
    const data = await pc.pagePlanWorkItems(req.token, planId, {
      pageNo: Number(pageNo || 1),
      pageSize: Number(pageSize || 100),
      ...body,
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 测试计划维度 → 列出所有有计划的测试库：GET /api/plan-projects
router.get('/plan-projects', requireAuth, async (req, res) => {
  try {
    const data = await pc.listPlanProjects(req.token);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 工作项状态映射：GET /api/work-item-states?sysModule=bug
router.get('/work-item-states', requireAuth, async (req, res) => {
  try {
    const sysModule = req.query.sysModule || 'bug';
    const data = await pc.getWorkItemStates(req.token, sysModule);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 创建缺陷：POST /api/work-items/create
router.post('/work-items/create', requireAuth, async (req, res) => {
  try {
    const data = await pc.createWorkItem(req.token, req.body);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 更新缺陷：PUT /api/work-items/update
// body: { id, field, value, projectId, stateId, ...extraFields }
router.put('/work-items/update', requireAuth, async (req, res) => {
  try {
    const { id, field, value, stateId, projectId } = req.body;
    let data;

    switch (field) {
      case 'title':
        data = await pc.updateWorkItemTitle(req.token, { id, title: value, projectId });
        break;
      case 'assignee':
        data = await pc.updateWorkItemAssignee(req.token, { id, assignee: value, projectId });
        break;
      case 'state':
        data = await pc.changeWorkItemState(req.token, { ids: [id], stateId, projectId });
        break;
      case 'description':
        data = await pc.updateWorkItemProperty(req.token, { id, code: 'description', value, projectId });
        break;
      default:
        return res.status(400).json({ ok: false, msg: '不支持的操作: ' + field });
    }
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 删除缺陷：DELETE /api/work-items/batch-remove
router.delete('/work-items/batch-remove', requireAuth, async (req, res) => {
  try {
    const data = await pc.deleteWorkItems(req.token, req.body);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 获取用户列表：GET /api/users
router.get('/users', requireAuth, async (req, res) => {
  try {
    const data = await pc.getUserSimpleList(req.token);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 缺陷评论列表：GET /api/work-items/:id/comments
router.get('/work-items/:id/comments', requireAuth, async (req, res) => {
  try {
    const data = await pc.getWorkItemComments(req.token, Number(req.params.id), req.query);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 添加评论：POST /api/work-items/:id/comments
router.post('/work-items/:id/comments', requireAuth, async (req, res) => {
  try {
    const data = await pc.addWorkItemComment(req.token, req.body);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 缺陷附件列表：GET /api/work-items/:id/attachments
router.get('/work-items/:id/attachments', requireAuth, async (req, res) => {
  try {
    const data = await pc.getWorkItemAttachments(req.token, Number(req.params.id));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

// 缺陷可选状态：GET /api/work-items/:id/selectable-states
router.get('/work-items/:id/selectable-states', requireAuth, async (req, res) => {
  try {
    const data = await pc.getWorkItemSelectableStates(req.token, Number(req.params.id));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.code === 401 ? 401 : 500).json({ ok: false, msg: e.message });
  }
});

export default router;
