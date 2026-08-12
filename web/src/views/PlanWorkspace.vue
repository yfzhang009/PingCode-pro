<template>
  <div class="plan-workspace">
    <!-- 顶部 -->
    <div class="ws-header">
      <a-button type="text" @click="$router.push('/libraries')">
        <ArrowLeftOutlined /> 返回测试库列表
      </a-button>
      <div class="ws-title">{{ libraryTitle || '加载中...' }}</div>
      <a-divider type="vertical" />
      <div class="ws-title">{{ planTitle || '' }}</div>
      <div class="ws-progress-bar" v-if="allPlanCases.length">
        <div class="progress-segments">
          <div
            class="progress-seg"
            v-for="s in execProgress"
            :key="s.color"
            :style="{ width: s.percent + '%', background: s.color }"
            :title="`${s.label}: ${s.count} 条`"
          ></div>
        </div>
        <div class="progress-legend">
          <span v-for="s in execProgress" :key="s.color" class="legend-item">
            <i class="legend-dot" :style="{ background: s.color }"></i>
            {{ s.label }}{{ s.count }}
          </span>
        </div>
      </div>
      <div class="ws-actions">
        <a-tag color="purple">执行计划</a-tag>
      </div>
    </div>

    <div class="ws-body">
      <!-- 左侧：模块树 -->
      <div class="ws-left">
        <div class="tree-toolbar">
          <span>模块树</span>
        </div>
        <a-spin :spinning="treeLoading">
          <a-tree
            v-if="treeData.length"
            :tree-data="treeData"
            :field-names="{ title: 'name', key: 'id', children: 'children' }"
            v-model:selectedKeys="selectedKeys"
            v-model:expandedKeys="expandedKeys"
            block-node
            @select="onSelectSuite"
          >
            <template #title="node">
              <span class="node-name">{{ node.name }}</span>
              <span v-if="node.count !== undefined" class="node-count">({{ node.count }})</span>
            </template>
          </a-tree>
          <a-empty v-else description="暂无模块" />
        </a-spin>
      </div>

      <!-- 右侧：用例列表 -->
      <div class="ws-right">
        <div class="list-toolbar">
          <a-input-search
            v-model:value="keyword"
            placeholder="搜索标题/编码"
            allow-clear
            style="width: 260px"
            @search="onFilterChange"
          />
          <a-select
            v-model:value="filters.execStatus"
            placeholder="执行状态"
            allow-clear
            style="width: 130px"
            :options="execStateOptions"
            @change="onFilterChange"
          />
          <a-select
            v-model:value="filters.maintainer"
            placeholder="维护人"
            allow-clear
            show-search
            :filter-option="filterUserOption"
            style="width: 130px"
            :options="maintainerOptions"
            @change="onFilterChange"
          />
          <span class="total">共 {{ total }} 条</span>
          <a-button size="small" @click="selectAllCurrent">一键全选{{ selectedRowKeys.length ? ` (${selectedRowKeys.length})` : '' }}</a-button>
          <a-button size="small" @click="batchStatusModal.open = true">批量执行{{ selectedRowKeys.length ? `(${selectedRowKeys.length})` : '' }}</a-button>
        </div>
        <a-table
          :columns="columns"
          :data-source="cases"
          row-key="id"
          :pagination="pagination"
          :loading="casesLoading"
          :row-selection="{ selectedRowKeys, onSelect: onSelectRow, onSelectAll: onSelectAllPage }"
          :resizable="true"
          @resizeColumn="onResizeColumn"
          @change="onTableChange"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'title'">
              <a @click="onViewDetail(record)">{{ record.title }}</a>
            </template>
            <template v-if="column.key === 'maintainer'">
              {{ record._maintainerName }}
            </template>
            <template v-if="column.key === 'execStatus'">
              <a-popover trigger="click" placement="bottomLeft" :open="openStatusPop === record.id" @openChange="(v) => openStatusPop = v ? record.id : null">
                <template #content>
                  <div class="status-pop-menu">
                    <div
                      v-for="opt in execStateOptions"
                      :key="opt.value"
                      class="status-pop-item"
                      @click="openStatusPop = null; onChangeStatus(record, opt.value)"
                    >
                      <i class="status-dot" :style="{ background: execStateColor(opt.value) }"></i>
                      {{ opt.label }}
                    </div>
                  </div>
                </template>
                <a-tag
                  :color="execStateColor(record.executedStatus != null ? String(record.executedStatus) : '0')"
                  style="cursor:pointer;margin:0"
                >{{ execStateLabel(record.executedStatus != null ? record.executedStatus : 0) }}</a-tag>
              </a-popover>
            </template>
            <template v-if="column.key === 'importantLevel'">
              <a-tag v-if="record.importantLevel">{{ formatOption(record.importantLevel, importantLevels) }}</a-tag>
            </template>
            <template v-if="column.key === 'testType'">
              {{ record.testType === 2 ? '自动' : '手工' }}
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- 批量执行弹窗 -->
    <a-modal v-model:open="batchStatusModal.open" title="批量执行" @ok="onBatchRun" ok-text="执行">
      <a-form>
        <a-form-item label="目标状态">
          <a-select v-model:value="batchStatusModal.status" :options="execStateOptions" style="width: 200px" />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="batchStatusModal.remark" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 用例详情弹窗 -->
    <a-modal v-model:open="detailModal.open" title="用例详情" width="800px" :footer="null">
      <a-spin :spinning="detailModal.loading">
        <a-descriptions bordered size="small" :column="2">
          <a-descriptions-item label="标题">{{ detailModal.data?.title }}</a-descriptions-item>
          <a-descriptions-item label="编码">{{ detailModal.data?.code }}</a-descriptions-item>
          <a-descriptions-item label="重要程度">
            <a-tag v-if="detailModal.data?.importantLevel">{{ formatOption(detailModal.data.importantLevel, importantLevels) }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="测试类型">{{ detailModal.data?.testType === 2 ? '自动' : '手工' }}</a-descriptions-item>
          <a-descriptions-item label="维护人">{{ detailModal.data?._maintainerName || detailModal.data?.maintainerName || '-' }}</a-descriptions-item>
          <a-descriptions-item label="执行人">{{ detailModal.data?._executorName || '-' }}</a-descriptions-item>
          <a-descriptions-item label="更新时间">{{ detailModal.data?.updateTime?.date || '-' }}</a-descriptions-item>
          <a-descriptions-item label="描述" :span="2">{{ stripHtml(detailModal.data?.description) || '-' }}</a-descriptions-item>
          <a-descriptions-item label="前置条件" :span="2">{{ stripHtml(detailModal.data?.precondition) || '-' }}</a-descriptions-item>
        </a-descriptions>
        <div style="margin-top:16px; display:flex; align-items:center; gap:12px">
          <span style="font-weight:500">执行结果：</span>
          <a-radio-group v-model:value="detailExecStatus" :options="execStateOptions" option-type="button" button-style="solid" />
          <a-button type="primary" size="small" :loading="detailExecSaving" @click="onDetailExec">确定</a-button>
        </div>
        <div style="margin-top:16px">
          <h4>测试步骤</h4>
          <a-table
            :columns="stepColumns"
            :data-source="detailModal.steps"
            :pagination="false"
            size="small"
            style="margin-top:8px"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'position'">{{ index + 1 }}</template>
              <template v-if="column.key === 'description'">{{ record.description || record.name || '-' }}</template>
              <template v-if="column.key === 'expectedValue'">{{ record.expectedValue || record.result || '-' }}</template>
            </template>
          </a-table>
        </div>
      </a-spin>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import { api } from '../api';

const route = useRoute();
const libraryId = computed(() => Number(route.params.libraryId));
const planId = computed(() => Number(route.params.planId));

// ============ 计划信息 ============
const planTitle = ref('');

async function loadPlanInfo() {
  try {
    // 从计划列表中找到当前计划名称
    const res = await api.plans(libraryId.value, { pageNo: 1, pageSize: 200 });
    if (res.ok) {
      const list = res.data?.list || res.data || [];
      const plan = list.find(p => p.id === planId.value);
      if (plan) planTitle.value = plan.name;
    }
  } catch { /* ignore */ }
}

// ============ 模块树 ============
const treeData = ref([]);
const treeLoading = ref(false);
const selectedSuiteId = ref(null);
const selectedKeys = ref([]);
const expandedKeys = ref([]);

function normalizeTree(nodes) {
  if (!nodes) return [];
  return nodes.map(n => ({
    id: String(n.id),
    name: n.name,
    count: n.count,
    children: n.children ? normalizeTree(n.children) : [],
  }));
}

async function loadTree() {
  treeLoading.value = true;
  try {
    const res = await api.planSuites(libraryId.value, planId.value);
    if (res.ok && res.data) {
      treeData.value = normalizeTree(res.data);
      // 默认展开前两级
      const collectKeys = (nodes, depth) => {
        const keys = [];
        for (const n of nodes) {
          if (depth < 2) keys.push(n.id);
          if (n.children && depth < 2) keys.push(...collectKeys(n.children, depth + 1));
        }
        return keys;
      };
      expandedKeys.value = collectKeys(treeData.value, 0);
    }
  } finally {
    treeLoading.value = false;
  }
}

// ============ 库信息 ============
const libraryTitle = ref('');

async function loadTitle() {
  try {
    const res = await api.libraries();
    if (res.ok && res.data) {
      const lib = res.data.find(l => l.id === libraryId.value);
      if (lib) libraryTitle.value = lib.title;
    }
  } catch { /* ignore */ }
}

// ============ 用例列表 ============
const cases = ref([]);
const total = ref(0);
const casesLoading = ref(false);
const keyword = ref('');
const selectedRowKeys = ref([]);
const allPlanCases = ref([]);  // 缓存全量数据

const filters = reactive({
  execStatus: undefined,
  maintainer: undefined,
});

const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total) => `共 ${total} 条`,
});
const openStatusPop = ref(null);

const columns = ref([
  { title: '标题', key: 'title', width: 280, resizable: true },
  { title: '编码', dataIndex: 'code', width: 140, resizable: true },
  { title: '执行状态', key: 'execStatus', width: 140, resizable: true },
  { title: '维护人', key: 'maintainer', width: 100, resizable: true },
  { title: '测试类型', key: 'testType', width: 80, resizable: true },
  { title: '重要程度', key: 'importantLevel', width: 100, resizable: true },
  { title: '更新时间', dataIndex: 'updateTime', width: 140, resizable: true, customRender: ({ text }) => text?.date || '-' },
]);

// 拉取全量数据（只在 planId/suiteId 变化时调用）
async function loadAllCases() {
  casesLoading.value = true;
  try {
    const params = {
      libraryId: libraryId.value,
      pageNo: 1,
      pageSize: 10000,
    };
    if (planId.value && !Number.isNaN(planId.value)) params.planId = planId.value;
    if (selectedSuiteId.value) params.suiteId = selectedSuiteId.value;
    const res = await api.testcases(params);
    if (res.ok) {
      allPlanCases.value = (res.data?.list || []).map(c => ({
        ...c,
        _maintainerName: userMap.value[c.assignee] || c.maintainerName || '-',
      }));
    }
  } finally {
    casesLoading.value = false;
  }
}

// 纯前端筛选+分页+刷新表格
function applyFilters() {
  let list = [...allPlanCases.value];

  // 执行状态筛选
  if (filters.execStatus) {
    const statusVal = Number(filters.execStatus);
    list = list.filter(c => c.executedStatus === statusVal);
  }
  // 维护人筛选
  if (filters.maintainer) {
    const uid = Number(filters.maintainer);
    list = list.filter(c => c.assignee === uid);
  }
  // 关键词搜索
  if (keyword.value) {
    const kw = keyword.value.toLowerCase();
    list = list.filter(c =>
      (c.title || '').toLowerCase().includes(kw) ||
      (c.code || '').toLowerCase().includes(kw)
    );
  }

  total.value = list.length;
  pagination.value.total = total.value;

  // 防止页码溢出
  const lastPage = Math.max(1, Math.ceil(list.length / pagination.value.pageSize));
  if (pagination.value.current > lastPage) {
    pagination.value.current = lastPage;
  }
  const start = (pagination.value.current - 1) * pagination.value.pageSize;
  cases.value = list.slice(start, start + pagination.value.pageSize);
}

function onFilterChange() {
  pagination.value.current = 1;
  applyFilters();
}

function onTableChange(pag) {
  pagination.value.current = pag.current;
  pagination.value.pageSize = pag.pageSize;
  applyFilters();
}

function onResizeColumn(w, col) {
  col.width = w;
}

function onSelectSuite(keys) {
  const id = keys[0];
  selectedSuiteId.value = id ? Number(id) : null;
  pagination.value.current = 1;
  selectedRowKeys.value = [];
  loadAllCases().then(applyFilters);
}

// 执行人通过详情接口获取，不在列表中展示
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').trim();
}
const importantLevels = ref([]);
const userMap = ref({});

// 执行进度统计（基于全量数据）
const execProgress = computed(() => {
  const total = allPlanCases.value.length;
  if (!total) return [];
  const groups = { 1: '通过', 2: '受阻', 3: '失败', 4: '跳过', 0: '未执行' };
  const colors = { 1: '#52c41a', 2: '#faad14', 3: '#ff4d4f', 4: '#d9d9d9', 0: '#bfbfbf' };
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 0: 0 };
  for (const c of allPlanCases.value) {
    const s = c.executedStatus;
    if (counts[s] !== undefined) counts[s]++;
    else counts[0]++;
  }
  // 按顺序：通过 → 受阻 → 失败 → 跳过 → 未执行
  return [1, 2, 3, 4, 0].map(k => ({
    label: groups[k],
    color: colors[k],
    count: counts[k],
    percent: Math.round((counts[k] / total) * 100) || 0,
  }));
});

const execStateOptions = [
  { value: '0', label: '未执行' },
  { value: '1', label: '通过' },
  { value: '2', label: '受阻' },
  { value: '3', label: '失败' },
  { value: '4', label: '跳过' },
];

function execStateColor(val) {
  const map = { 1: '#52c41a', 2: '#faad14', 3: '#ff4d4f', 4: '#d9d9d9', 0: '#bfbfbf' };
  return map[Number(val)] ?? '#bfbfbf';
}

function execStateLabel(val) {
  const map = { 1: '通过', 2: '受阻', 3: '失败', 4: '跳过', 0: '未执行' };
  return map[Number(val)] ?? '未执行';
}

function formatOption(val, options) {
  const opt = (options || []).find(o => o.id === val);
  return opt?.text || opt?.label || val || '-';
}

function filterUserOption(input, option) {
  return (option.label || '').toLowerCase().includes((input || '').toLowerCase());
}

const importantLevelOptions = computed(() =>
  importantLevels.value.map(o => ({ value: o.id, label: o.text || o.label || o.name }))
);
const maintainerOptions = computed(() =>
  Object.entries(userMap.value).map(([id, name]) => ({ value: Number(id), label: name }))
);

async function loadMeta() {
  try {
    const propsRes = await api.formProperties(libraryId.value);
    if (propsRes.ok && propsRes.data?.properties) {
      const imp = propsRes.data.properties.find((p) => p.code === 'importantLevel');
      if (imp?.options) importantLevels.value = imp.options;
    }
  } catch { /* ignore */ }

  try {
    const usersRes = await api.users();
    if (usersRes.ok && usersRes.data) {
      usersRes.data.forEach((u) => { userMap.value[u.id] = u.nickname; });
    }
  } catch { /* ignore */ }
}

// ============ 执行状态变更 ============
async function onChangeStatus(record, val) {
  try {
    const status = Number(val);
    const res = await api.testRun(libraryId.value, {
      id: record.id,
      planId: String(planId.value),
      status: String(status),
      remark: '',
      steps: record.steps || record.testSteps || [],
      libraryId: libraryId.value,
      fileIds: [],
    });
    if (res.ok) {
      record.executedStatus = status;
      message.success('状态已更新');
    }
  } catch { /* ignore */ }
}

// ============ 批量执行 ============
const batchStatusModal = reactive({ open: false, status: '1', remark: '' });

async function onBatchRun() {
  if (!selectedRowKeys.value.length) { message.warning('请选择用例'); return; }
  for (const id of selectedRowKeys.value) {
    const record = cases.value.find(c => c.id === id);
    if (!record) continue;
    try {
      await api.testRun(libraryId.value, {
        id: record.id,
        planId: String(planId.value),
        status: batchStatusModal.status,
        remark: batchStatusModal.remark || '',
        steps: record.steps || record.testSteps || [],
        libraryId: libraryId.value,
        fileIds: [],
      });
      record.executedStatus = Number(batchStatusModal.status);
    } catch { /* ignore */ }
  }
  message.success('批量执行完成');
  batchStatusModal.open = false;
}

// 一键全选当前节点下的所有用例
function selectAllCurrent() {
  const allIds = allPlanCases.value.map(c => c.id);
  // 如果当前已全选，则取消全选
  if (selectedRowKeys.value.length === allIds.length) {
    selectedRowKeys.value = [];
  } else {
    selectedRowKeys.value = allIds;
  }
}

// 跨页选中：单条勾选/取消时手动维护 selectedRowKeys
function onSelectRow(record, selected) {
  const id = record.id;
  if (selected) {
    if (!selectedRowKeys.value.includes(id)) {
      selectedRowKeys.value = [...selectedRowKeys.value, id];
    }
  } else {
    selectedRowKeys.value = selectedRowKeys.value.filter(k => k !== id);
  }
}

// 跨页选中：当前页全选/全不选
function onSelectAllPage(selected, selectedRows, changeRows) {
  const changeIds = changeRows.map(r => r.id);
  if (selected) {
    const set = new Set([...selectedRowKeys.value, ...changeIds]);
    selectedRowKeys.value = [...set];
  } else {
    selectedRowKeys.value = selectedRowKeys.value.filter(k => !changeIds.includes(k));
  }
}

// ============ 用例详情 ============
const stepColumns = [
  { title: '序号', key: 'position', width: 60 },
  { title: '步骤描述', key: 'description' },
  { title: '预期结果', key: 'expectedValue', width: 200 },
];
const detailModal = reactive({ open: false, loading: false, data: null, steps: [] });

async function onViewDetail(record) {
  detailModal.open = true;
  detailModal.loading = true;
  detailModal.data = record;
  detailModal.steps = [];
  detailExecStatus.value = record.executedStatus != null ? String(record.executedStatus) : '1';
  try {
    // 并行拉取用例详情和执行人信息
    const [res, logRes] = await Promise.all([
      api.testcaseDetail(libraryId.value, record.id),
      api.testcaseLog(libraryId.value, record.id, planId.value),
    ]);
    if (res.ok && res.data) {
      const detail = res.data;
      let executorName = null;
      if (logRes.ok && logRes.data) {
        const userId = logRes.data.executor;
        executorName = userId ? (userMap.value[userId] || userId) : (logRes.data.executorName || null);
      }
      detailModal.data = { ...record, ...detail, _maintainerName: record._maintainerName, _executorName: executorName };
      const steps = detail.steps || detail.testSteps || [];
      detailModal.steps = steps;
    }
  } catch { /* ignore */ }
  detailModal.loading = false;
}

const detailExecStatus = ref('1');
const detailExecSaving = ref(false);

async function onDetailExec() {
  if (!detailModal.data) return;
  detailExecSaving.value = true;
  try {
    const record = detailModal.data;
    const status = Number(detailExecStatus.value);
    const res = await api.testRun(libraryId.value, {
      id: record.id,
      planId: String(planId.value),
      status: String(status),
      remark: '',
      steps: record.steps || record.testSteps || [],
      libraryId: libraryId.value,
      fileIds: [],
    });
    if (res.ok) {
      // 同步更新列表中对应用例的状态
      const item = allPlanCases.value.find(c => c.id === record.id);
      if (item) item.executedStatus = status;
      message.success('执行状态已更新');
      detailModal.open = false;
    }
  } catch { /* ignore */ }
  detailExecSaving.value = false;
}

// ============ 生命周期 ============
onMounted(async () => {
  await Promise.all([loadTitle(), loadPlanInfo(), loadTree(), loadMeta()]);
  // 初始化加载全量用例（不限定 suiteId）
  loadAllCases().then(applyFilters);
});
</script>

<style scoped>
.plan-workspace { display: flex; flex-direction: column; height: 100vh; }
.ws-header { display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.ws-title { font-size: 16px; font-weight: 600; }
.ws-actions { margin-left: auto; }
.ws-progress-bar { flex: 1; max-width: 500px; margin-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.progress-segments { display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 1px; }
.progress-seg { min-width: 2px; transition: width 0.3s; }
.progress-legend { display: flex; gap: 12px; font-size: 12px; }
.legend-item { display: flex; align-items: center; gap: 3px; color: #666; white-space: nowrap; }
.legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.ws-body { flex: 1; display: flex; overflow: hidden; }
.ws-left {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}
.tree-toolbar { padding: 8px 12px; font-weight: 600; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.ws-left :deep(.ant-spin) { flex: 1; overflow: auto; padding: 8px; }
.ws-left :deep(.ant-spin-container) { height: 100%; }
.ws-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 12px; }
.list-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; flex-shrink: 0; }
.ws-right :deep(.ant-table-wrapper) { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.ws-right :deep(.ant-table-wrapper .ant-spin-nested-loading) { flex: 1; overflow: hidden; }
.ws-right :deep(.ant-table-wrapper .ant-spin-container) { height: 100%; display: flex; flex-direction: column; }
.ws-right :deep(.ant-table-wrapper .ant-table) { flex: 1; overflow: auto; }
.ws-right :deep(.ant-table-wrapper .ant-pagination) { margin: 12px 0 0; flex-shrink: 0; }
.total { color: #999; font-size: 13px; white-space: nowrap; }

.node-name { font-size: 13px; }
.node-count { font-size: 11px; color: #999; margin-left: 4px; }

.status-pop-menu { min-width: 80px; }
.status-pop-item { padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; border-radius: 4px; font-size: 13px; }
.status-pop-item:hover { background: #f0f0f0; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
</style>
