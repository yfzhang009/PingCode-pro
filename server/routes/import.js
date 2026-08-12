// 批量导入路由：Excel 解析 + 批量创建用例到 pingcode（支持自动创建模块）
import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import * as pc from '../lib/pingcode-client.js';
import { getToken } from '../lib/session.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 中间件：校验登录
function requireAuth(req, res, next) {
  const token = getToken();
  if (!token) return res.status(401).json({ ok: false, msg: '未登录' });
  req.token = token;
  next();
}

// ============== 导入模板 & 解析 ==============

router.get('/template', (req, res) => {
  const headers = ['模块名称', '用例标题', '前置条件', '步骤描述', '预期结果', '优先级', '重要程度', '测试类型'];
  const sample = [
    ['工作台/登录', '登录功能-正常登录', '用户已注册', '输入正确的账号密码点击登录', '登录成功跳转首页', '普通', 'P1', '功能测试'],
    ['工作台/登录', '登录功能-密码错误', '用户已注册', '输入错误密码点击登录', '提示密码错误', '较高', 'P0', '功能测试'],
    ['工作台/个人中心', '修改密码', '用户已登录', '进入个人中心点击修改密码', '密码修改成功', '普通', 'P1', '功能测试'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 40 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '用例导入');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="testcase-import-template.xlsx"');
  res.send(buf);
});

router.post('/parse', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, msg: '请上传文件' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const cases = rows.map((row, idx) => ({
      rowNo: idx + 2,
      suiteName: String(row['模块名称'] || '').trim(),
      title: String(row['用例标题'] || '').trim(),
      precondition: String(row['前置条件'] || '').trim(),
      stepDescription: String(row['步骤描述'] || '').trim(),
      expectedValue: String(row['预期结果'] || '').trim(),
      priorityName: String(row['优先级'] || '').trim(),
      importantLevelName: String(row['重要程度'] || '').trim(),
      testTypeName: String(row['测试类型'] || '').trim(),
    }));
    const errors = [];
    cases.forEach((c) => {
      if (!c.title) errors.push({ rowNo: c.rowNo, msg: '用例标题不能为空' });
      if (!c.stepDescription) errors.push({ rowNo: c.rowNo, msg: '步骤描述不能为空' });
    });
    res.json({ ok: true, data: { cases, errors } });
  } catch (e) {
    res.json({ ok: false, msg: 'Excel 解析失败: ' + e.message });
  }
});

// ============== 递归在树中查找 ==============

function registerTreeToCache(nodes, parentId, cache) {
  if (!nodes) return;
  for (const n of nodes) {
    const key = `${parentId}:${n.name}`;
    cache[key] = n.id;
    if (n.children && n.children.length) {
      registerTreeToCache(n.children, n.id, cache);
    }
  }
}

/** 从树中找出「全部用例」根节点（parentId===0 的节点） */
function getRootSuiteId(tree) {
  if (!tree?.length) return null;
  const root = tree.find((n) => n.parentId === 0) || tree[0];
  return root?.id || null;
}

// ============== 核心导入逻辑 ==============

/**
 * 批量导入用例到 pingcode
 * @param {string} token
 * @param {number} libraryId
 * @param {number} assignee
 * @param {Array} cases - 用例数组
 * @param {number|null} parentSuiteId - 指定目标模块；不传则创建在「全部用例」根目录下
 */
async function doBatchImport(token, libraryId, assignee, cases, parentSuiteId) {
  const normalized = cases.map((c, idx) => ({ ...c, rowNo: c.rowNo || idx + 1 }));

  // 1. 拉取表单属性配置，构建 文本→ID 映射
  let importantLevelMap = {};
  let priorityMap = {};
  try {
    const fpData = await pc.getCreateFormProperties(token, libraryId);
    const props = fpData?.properties || [];
    const impProp = props.find((p) => p.code === 'importantLevel');
    if (impProp?.options) impProp.options.forEach((o) => { importantLevelMap[o.text] = o.id; });
    const priProp = props.find((p) => p.code === 'priority');
    if (priProp?.options) priProp.options.forEach((o) => { priorityMap[o.text] = o.id; });
  } catch (_) { /* 属性加载失败不阻塞 */ }

  // 2. 收集所有模块名去重
  const suiteNames = [...new Set(normalized.map((c) => c.suiteName).filter(Boolean))];

  // 3. 获取整棵树，预填缓存 + 推断根节点
  let fullTree = null;
  const suiteCache = {};
  try {
    fullTree = await pc.getSuiteTree(token, libraryId);
    registerTreeToCache(fullTree, parentSuiteId || null, suiteCache);
  } catch (_) { /* 获取树失败不阻塞 */ }

  // 确定起始父节点：参数指定 > 树的根节点
  const rootId = parentSuiteId || getRootSuiteId(fullTree);

  // 4. 为每条模块路径创建层级，构建 path→suiteId 映射
  const suiteMap = {};
  for (const path of suiteNames) {
    const segments = path.split('/').map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) continue;

    let currentParentId = rootId;
    for (let i = 0; i < segments.length; i++) {
      const segName = segments[i];
      const isLast = i === segments.length - 1;
      const cacheKey = `${currentParentId}:${segName}`;

      let nodeId = suiteCache[cacheKey];
      if (!nodeId) {
        try {
          const created = await pc.createSuite(token, libraryId, {
            name: segName,
            parentId: currentParentId,
            afterId: null,
            sort: 1,
            type: isLast ? 1 : 2,
          });
          nodeId = created?.id;
          if (nodeId) suiteCache[cacheKey] = nodeId;
          else console.log(`[import] createSuite returned no id: parentId=${currentParentId} name=${segName}`);
        } catch (e) {
          console.log(`[import] 创建模块异常: parentId=${currentParentId} name=${segName}`, e.message);
          break;
        }
      }

      if (!nodeId) break;

      currentParentId = nodeId;
      if (isLast) suiteMap[path] = nodeId;
    }
  }

  // 5. 逐条创建用例
  const results = [];
  for (const c of normalized) {
    const suiteId = suiteMap[c.suiteName] || null;
    const stepLines = (c.stepDescription || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const expectedLines = (c.expectedValue || '').split('\n').map((s) => s.trim());
    const steps = stepLines.map((desc, idx) => ({
      position: idx + 1,
      description: desc,
      expectedValue: expectedLines[idx] || '',
      isGroup: 0,
    }));
    try {
      const data = await pc.createTestcase(token, libraryId, {
        libraryId: Number(libraryId),
        suiteId: suiteId ? Number(suiteId) : null,
        title: c.title,
        assignee: Number(assignee),
        precondition: c.precondition || '',
        importantLevel: importantLevelMap[c.importantLevelName] || undefined,
        priority: priorityMap[c.priorityName] || undefined,
        testType: c.testTypeName === '自动' ? 2 : 1,
        steps,
      });
      results.push({ rowNo: c.rowNo, title: c.title, ok: true, id: data?.id });
    } catch (e) {
      results.push({ rowNo: c.rowNo, title: c.title, ok: false, msg: e.message });
    }
  }
  return { results, total: normalized.length, success: results.filter((r) => r.ok).length };
}

// ============== 路由 ==============

// 通过 Excel 批量导入
router.post('/run', requireAuth, async (req, res) => {
  const { libraryId, assignee, cases, parentSuiteId } = req.body || {};
  if (!libraryId || !assignee || !Array.isArray(cases)) {
    return res.json({ ok: false, msg: '参数不完整' });
  }
  try {
    const result = await doBatchImport(req.token, libraryId, assignee, cases, parentSuiteId);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.json({ ok: false, msg: '导入失败: ' + e.message });
  }
});

// 跨平台导入：从 TestPlatform 推送的 JSON 用例
router.post('/from-platform', requireAuth, async (req, res) => {
  const { libraryId, assignee, cases, parentSuiteId } = req.body || {};
  if (!libraryId || !assignee || !Array.isArray(cases)) {
    return res.json({ ok: false, msg: '参数不完整：libraryId、assignee、cases 为必填' });
  }
  try {
    const result = await doBatchImport(req.token, libraryId, assignee, cases, parentSuiteId);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.json({ ok: false, msg: '导入失败: ' + e.message });
  }
});

export default router;
