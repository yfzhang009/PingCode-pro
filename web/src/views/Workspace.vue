<template>
  <div class="workspace">
    <!-- 顶部：返回 + 库信息 + 批量导入入口 -->
    <div class="ws-header">
      <a-button type="text" @click="$router.push('/libraries')">
        <ArrowLeftOutlined /> 返回测试库列表
      </a-button>
      <div class="ws-title">{{ libraryTitle || '加载中...' }}</div>
      <div class="ws-actions">
        <a-button type="primary" @click="showCreate = true">
          <PlusOutlined /> 新建用例
        </a-button>
        <a-button v-if="selectedSuiteId" @click="$router.push(`/import/${libraryId}?parentSuiteId=${selectedSuiteId}&parentName=${selectedSuiteName}`)">
          <UploadOutlined /> 批量导入
        </a-button>
      </div>
    </div>

    <div class="ws-body">
      <!-- 左侧：模块树 -->
      <div class="ws-left">
        <div class="tree-toolbar">
          <span>模块</span>
          <a-button size="small" type="text" @click="onAddRootSuite">
            <PlusOutlined />
          </a-button>
        </div>
        <a-spin :spinning="treeLoading">
          <a-tree
            v-if="treeData.length"
            :tree-data="treeData"
            :field-names="{ title: 'name', key: 'id', children: 'children' }"
            v-model:selectedKeys="selectedKeys"
            v-model:expandedKeys="expandedKeys"
            block-node
            draggable
            :allow-drop="() => true"
            @select="onSelectSuite"
            @drop="onDrop"
          >
            <template #title="node">
              <template v-if="node.isPlaceholder">
                <span class="placeholder-node" />
              </template>
              <template v-else>
                <span class="node-name">{{ node.name }}</span>
                <span class="node-count" v-if="node.count !== undefined">({{ node.count }})</span>
                <span class="node-ops">
                  <a-button v-if="node.id !== rootSuiteId" type="text" size="small" @click.stop="onImportToSuite(node)">
                    <UploadOutlined />
                  </a-button>
                  <a-button type="text" size="small" @click.stop="onAddChildSuite(node)">
                    <PlusOutlined />
                  </a-button>
                  <a-button type="text" size="small" v-if="node.id !== rootSuiteId" danger @click.stop="onDeleteSuite(node)">
                    <DeleteOutlined />
                  </a-button>
                </span>
              </template>
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
            placeholder="搜索用例标题"
            allow-clear
            style="width: 260px"
            @search="onFilterChange"
          />
          <a-select
            v-model:value="filters.importantLevel"
            placeholder="重要程度"
            allow-clear
            style="width: 130px"
            :options="importantLevelOptions"
            @change="onFilterChange"
          />
          <a-select
            v-model:value="filters.creator"
            placeholder="创建人"
            allow-clear
            show-search
            :filter-option="filterUserOption"
            style="width: 130px"
            :options="creatorOptions"
            @change="onFilterChange"
          />
          <span class="total">共 {{ total }} 条</span>
          <a-button v-if="selectedRowKeys.length" danger size="small" @click="onBatchDelete">批量删除({{ selectedRowKeys.length }})</a-button>
        </div>
        <a-table
          :columns="columns"
          :data-source="cases"
          row-key="id"
          :pagination="pagination"
          :loading="casesLoading"
          :row-selection="{ selectedRowKeys, onChange: (keys) => selectedRowKeys = keys }"
          :resizable="true"
          @resizeColumn="onResizeColumn"
          @change="onTableChange"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'title'">
              <a @click="onViewDetail(record)">{{ record.title }}</a>
            </template>
            <template v-if="column.key === 'creator'">
              {{ userMap[record.creator] || record.creator || '-' }}
            </template>
            <template v-if="column.key === 'importantLevel'">
              <a-tag v-if="record.importantLevel">{{ formatOption(record.importantLevel, importantLevels) }}</a-tag>
            </template>
            <template v-if="column.key === 'testType'">
              {{ record.testType === 2 ? '自动' : '手工' }}
            </template>
            <template v-if="column.key === 'op'">
              <a-button type="link" size="small" danger @click="onDeleteCase(record)">删除</a-button>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <CreateCaseModal
      v-model:open="showCreate"
      :library-id="libraryId"
      :suite-tree="treeData"
      :default-suite-id="selectedSuiteId"
      :default-assignee="userId"
      @created="onCaseCreated"
    />

    <!-- 新建模块弹窗 -->
    <a-modal
      v-model:open="suiteModal.open"
      :title="suiteModal.title"
      @ok="onSubmitSuite"
      :confirm-loading="suiteModal.loading"
    >
      <a-form layout="vertical">
        <a-form-item label="模块名称" required>
          <a-input v-model:value="suiteModal.name" placeholder="请输入模块名称" />
        </a-form-item>
        <a-form-item label="模块类型">
          <a-radio-group v-model:value="suiteModal.type">
            <a-radio :value="2">分组模块</a-radio>
            <a-radio :value="1">叶子模块</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 用例详情抽屉 -->
    <a-drawer
      :open="detailVisible"
      title="用例详情"
      placement="right"
      :width="640"
      @close="detailVisible = false"
    >
      <template v-if="detailCase">
        <a-descriptions bordered size="small" :column="2">
          <a-descriptions-item label="标题" :span="2">
            <a-typography-paragraph
              :content="detailCase.title"
              :editable="{ onChange: onTitleChange }"
              style="margin-bottom: 0"
            />
          </a-descriptions-item>
          <a-descriptions-item label="编码">{{ detailCase.code }}</a-descriptions-item>
          <a-descriptions-item label="测试库">{{ detailCase.libraryName }}</a-descriptions-item>
          <a-descriptions-item label="创建者">{{ userMap[detailCase.creator] || detailCase.creator }}</a-descriptions-item>
          <a-descriptions-item label="更新时间">{{ detailCase.updateTime?.date }}</a-descriptions-item>
          <a-descriptions-item label="前置条件" :span="2">
            <a-typography-paragraph
              :content="editingPrecondition"
              :editable="{ onChange: onPreconditionChange }"
              style="margin-bottom: 0"
            />
          </a-descriptions-item>
          <a-descriptions-item label="描述" :span="2">{{ cleanHtml(detailCase.description || '') || '无' }}</a-descriptions-item>
        </a-descriptions>

        <h4 style="margin: 16px 0 8px">用例步骤</h4>
        <a-table
          :data-source="detailCase.steps || []"
          row-key="id"
          size="small"
          :pagination="false"
          :columns="stepColumns"
        />
      </template>
      <a-spin v-else :spinning="detailLoading" tip="加载中..." />
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import {
  ArrowLeftOutlined, PlusOutlined, UploadOutlined, DeleteOutlined,
} from '@ant-design/icons-vue';
import { api } from '../api';
import { useUserStore } from '../store/user';
import CreateCaseModal from '../components/CreateCaseModal.vue';

const route = useRoute();
const router = useRouter();
const libraryId = computed(() => Number(route.params.libraryId));
const userStore = useUserStore();
const userId = computed(() => userStore.user?.id || null);

// ============ 模块树 ============
const treeData = ref([]);
const treeLoading = ref(false);
const selectedKeys = ref([]);
const expandedKeys = ref([]);
const selectedSuiteId = ref(null);
const selectedSuiteName = computed(() => {
  if (!selectedSuiteId.value) return libraryTitle.value || '全部用例';
  const node = findNodeById(treeData.value, selectedSuiteId.value);
  return node ? node.name : (libraryTitle.value || '全部用例');
});
const rootSuiteId = ref(null);
const libraryTitle = ref('');
const suiteParentMap = ref({}); // id -> parentId 映射表

// 规范化树数据：给所有空节点塞占位子节点，确保 antdv 允许拖入内部
const PLACEHOLDER_KEY = '__pingcase_placeholder__';
function normalizeTree(nodes) {
  for (const n of nodes) {
    if (!n.children || n.children.length === 0) {
      n.children = [{ id: PLACEHOLDER_KEY, name: '', isPlaceholder: true }];
    } else {
      normalizeTree(n.children);
    }
  }
}

function buildParentMap(nodes, parentId = null) {
  for (const n of nodes) {
    if (n.isPlaceholder) continue;
    suiteParentMap.value[n.id] = parentId;
    if (n.children && n.children.length > 0) {
      buildParentMap(n.children, n.id);
    }
  }
}

async function loadTree() {
  treeLoading.value = true;
  try {
    const res = await api.suites(libraryId.value);
    if (res.ok) {
      const raw = res.data || [];
      normalizeTree(raw);
      treeData.value = raw;
      suiteParentMap.value = {};
      if (treeData.value.length > 0) {
        rootSuiteId.value = treeData.value[0].id;
        buildParentMap(treeData.value, null);
        // 默认全部折叠，仅选中根节点
        selectedKeys.value = [treeData.value[0].id];
        selectedSuiteId.value = null; // 选中根节点 = 显示全部用例
      }
    }
  } finally {
    treeLoading.value = false;
  }
}

function onSelectSuite(keys) {
  selectedSuiteId.value = keys[0] || null;
  loadCases(1);
}

// ============ 拖拽移动模块 ============
async function onDrop(info) {
  const { dragNode, node, dropToGap, dropPosition } = info;

  // key 通过 field-names 映射到了 dataRef.id，直接使用 key 即可
  const dragId = Number(dragNode.key);
  const targetId = Number(node.key);
  const targetParentId = suiteParentMap.value[targetId];

  // 不允许拖到自己身上
  if (dragId === targetId) return;

  try {
    const prevSiblingId = dropToGap && dropPosition === -1
      ? getPrevSiblingId(treeData.value, targetId, targetParentId)
      : null;

    const res = await api.moveSuite(libraryId.value, {
      id: dragId,
      parentId: dropToGap
        ? (targetParentId || rootSuiteId.value)
        : targetId,
      afterId: dropToGap && dropPosition === -1
        ? prevSiblingId
        : dropToGap ? targetId
        : null,
    });
    if (res.ok) {
      message.success('模块已移动');
      await loadTree();
    } else {
      message.error(res.msg || '移动失败');
    }
  } catch (e) {
    message.error(e.message || '移动失败');
  }
}

// 获取前一个兄弟节点的 id
function getPrevSiblingId(nodes, childId, parentId) {
  const siblings = parentId === rootSuiteId.value
    ? nodes
    : nodes.find((n) => Number(n.id) === Number(parentId))?.children || [];
  const idx = siblings.findIndex((c) => Number(c.id) === Number(childId));
  return idx > 0 ? Number(siblings[idx - 1].id) : null;
}

// 导入用例到指定模块
function onImportToSuite(node) {
  router.push({ path: `/import/${libraryId.value}`, query: { parentSuiteId: node.id, parentName: node.name } });
}

// 递归在树中查找节点
function findNodeById(nodes, id) {
  if (!nodes || !id) return null;
  for (const n of nodes) {
    if (Number(n.id) === Number(id)) return n;
    const found = findNodeById(n.children, id);
    if (found) return found;
  }
  return null;
}

// ============ 用例列表 ============
const cases = ref([]);
const total = ref(0);
const keyword = ref('');
const selectedRowKeys = ref([]);
const casesLoading = ref(false);
const allCases = ref([]); // 缓存全量数据
const pagination = ref({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });

const filters = reactive({
  importantLevel: undefined,
  creator: undefined,
});

const importantLevels = ref([]);
const priorities = ref([]);
const userMap = ref({});

const importantLevelOptions = computed(() =>
  importantLevels.value.map(o => ({ value: o.id, label: o.text || o.label || o.name }))
);
const creatorOptions = computed(() =>
  Object.entries(userMap.value).map(([id, name]) => ({ value: Number(id), label: name }))
);

function filterUserOption(input, option) {
  return (option.label || '').toLowerCase().includes((input || '').toLowerCase());
}

const columns = ref([
  { title: '标题', key: 'title', dataIndex: 'title', width: 200, resizable: true },
  { title: '编码', dataIndex: 'code', width: 110, resizable: true },
  { title: '重要程度', key: 'importantLevel', width: 100, resizable: true },
  { title: '创建人', key: 'creator', width: 100, resizable: true },
  { title: '类型', key: 'testType', width: 80, resizable: true },
  { title: '更新时间', dataIndex: 'updateTime', width: 160, resizable: true, customRender: ({ text }) => text?.date || '-' },
  { title: '操作', key: 'op', width: 80 },
]);

async function loadCases(page) {
  casesLoading.value = true;
  try {
    if (page) pagination.value.current = page;
    const params = {
      libraryId: libraryId.value,
      // 拉全量数据，筛选在前端做
      pageNo: 1,
      pageSize: 10000,
    };
    if (selectedSuiteId.value && selectedSuiteId.value !== rootSuiteId.value) {
      params.suiteId = selectedSuiteId.value;
    }
    const res = await api.testcases(params);
    if (res.ok) {
      allCases.value = (res.data?.list || []).map(c => ({
        ...c,
        // 确保 creator 是数字
        creator: Number(c.creator),
      }));
      applyFilters();
    }
  } finally {
    casesLoading.value = false;
  }
}

function applyFilters() {
  let list = [...allCases.value];

  if (keyword.value) {
    const kw = keyword.value.toLowerCase();
    list = list.filter(c => (c.title || '').toLowerCase().includes(kw));
  }
  if (filters.importantLevel) {
    const lvl = Number(filters.importantLevel);
    list = list.filter(c => c.importantLevel === lvl);
  }
  if (filters.creator) {
    const uid = Number(filters.creator);
    list = list.filter(c => c.creator === uid);
  }

  total.value = list.length;
  pagination.value.total = total.value;

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

async function loadFormProperties() {
  const res = await api.formProperties(libraryId.value);
  if (res.ok && res.data?.properties) {
    const imp = res.data.properties.find((p) => p.code === 'importantLevel');
    if (imp?.options) importantLevels.value = imp.options;
    const pri = res.data.properties.find((p) => p.code === 'priority');
    if (pri?.options) priorities.value = pri.options;
  }
  // 加载用户列表（用于创建人筛选）
  try {
    const usersRes = await api.users();
    if (usersRes.ok && usersRes.data) {
      usersRes.data.forEach((u) => { userMap.value[u.id] = u.nickname; });
    }
  } catch { /* ignore */ }
}

function formatOption(value, options) {
  const o = options.find((x) => String(x.id) === String(value));
  return o?.text || value;
}

function cleanHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

// ============ 新建用例 ============
const showCreate = ref(false);
function onCaseCreated() {
  loadCases();
}

// ============ 模块增删 ============
const suiteModal = ref({ open: false, title: '', name: '', type: 2, parentId: null, loading: false });

function onAddRootSuite() {
  suiteModal.value = {
    open: true, title: '新建一级模块', name: '', type: 2,
    parentId: rootSuiteId.value, loading: false,
  };
}

function onAddChildSuite(node) {
  suiteModal.value = {
    open: true, title: `在「${node.name}」下新建模块`, name: '', type: 1,
    parentId: node.id, loading: false,
  };
}

async function onSubmitSuite() {
  if (!suiteModal.value.name.trim()) {
    message.warning('请输入模块名称');
    return;
  }
  suiteModal.value.loading = true;
  try {
    const res = await api.createSuite(libraryId.value, {
      name: suiteModal.value.name.trim(),
      parentId: suiteModal.value.parentId,
      afterId: null,
      sort: 1,
      type: suiteModal.value.type,
    });
    if (res.ok) {
      message.success('模块已创建');
      suiteModal.value.open = false;
      await loadTree();
    } else {
      message.error(res.msg || '创建失败');
    }
  } catch (e) {
    message.error(e.message);
  } finally {
    suiteModal.value.loading = false;
  }
}

function onDeleteSuite(node) {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除模块「${node.name}」及其所有子模块吗？`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      const res = await api.deleteSuite(libraryId.value, node.id);
      if (res.ok) {
        message.success('已删除');
        loadTree();
      } else {
        message.error(res.msg || '删除失败');
      }
    },
  });
}

// ============ 查看用例详情 ============
const detailVisible = ref(false);
const detailLoading = ref(false);
const detailCase = ref(null);

const stepColumns = computed(() => [
  { title: '#', dataIndex: 'position', width: 50 },
  { title: '步骤描述', dataIndex: 'description', customRender: ({ text, record }) => h(EditableCell, { value: text, onSave: (val) => onStepChange(record, 'description', val) }) },
  { title: '预期结果', dataIndex: 'expectedValue', customRender: ({ text, record }) => h(EditableCell, { value: text, onSave: (val) => onStepChange(record, 'expectedValue', val) }) },
]);

async function onViewDetail(record) {
  detailVisible.value = true;
  detailCase.value = null;
  detailLoading.value = true;
  try {
    const res = await api.testcaseDetail(libraryId.value, record.id);
    if (res.ok) {
      detailCase.value = res.data;
      editingPrecondition.value = cleanHtml(res.data?.precondition || '') || '无';
    }
  } finally {
    detailLoading.value = false;
  }
}

const editingTitle = ref(false);
async function onTitleChange(newTitle) {
  if (editingTitle.value) return;
  if (!newTitle || newTitle === detailCase.value.title) return;
  editingTitle.value = true;
  try {
    const res = await api.updateTestcaseTitle(libraryId.value, detailCase.value.id, newTitle);
    if (res.ok) {
      detailCase.value.title = newTitle;
      message.success('标题已更新');
      // 同步更新列表中的标题
      const idx = cases.value.findIndex(c => c.id === detailCase.value.id);
      if (idx !== -1) cases.value[idx].title = newTitle;
    }
  } catch (e) {
    message.error('更新失败: ' + (e.message || '未知错误'));
  } finally {
    editingTitle.value = false;
  }
}

const editingPrecondition = ref('');
const preconditionSaving = ref(false);

async function onPreconditionChange(newVal) {
  if (!detailCase.value || preconditionSaving.value) return;
  if (newVal === cleanHtml(detailCase.value.precondition || '')) return;
  preconditionSaving.value = true;
  editingPrecondition.value = newVal;
  try {
    const res = await api.updateTestcaseProperty(libraryId.value, detailCase.value.id, 'precondition', newVal);
    if (res.ok) {
      detailCase.value.precondition = newVal;
      message.success('前置条件已更新');
    } else {
      message.error(res.msg || '更新失败');
      editingPrecondition.value = cleanHtml(detailCase.value.precondition || '') || '无';
    }
  } catch (e) {
    message.error('更新失败: ' + (e.message || '未知错误'));
    editingPrecondition.value = cleanHtml(detailCase.value.precondition || '') || '无';
  } finally {
    preconditionSaving.value = false;
  }
}

// ============ 编辑步骤 ============
const EditableCell = {
  props: ['value', 'onSave'],
  emits: ['save'],
  setup(props, { emit }) {
    const editing = ref(false);
    const text = ref(props.value || '');
    function toggle() {
      editing.value = !editing.value;
      if (editing.value) text.value = props.value || '';
    }
    function save() {
      editing.value = false;
      if (text.value !== props.value) {
        props.onSave?.(text.value);
      }
    }
    return () => {
      if (editing.value) {
        return h('div', { style: 'display:flex;gap:4px' }, [
          h('input', {
            value: text.value,
            style: 'flex:1;border:1px solid #d9d9d9;border-radius:4px;padding:2px 6px;font-size:13px',
            onInput: (e) => { text.value = e.target.value; },
            onKeydown: (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') editing.value = false; },
          }),
          h('a', { style: 'cursor:pointer;white-space:nowrap;font-size:12px', onClick: save }, '保存'),
        ]);
      }
      return h('div', { style: 'cursor:pointer;min-height:22px', onClick: toggle }, props.value || h('span', { style: 'color:#ccc' }, '点击编辑'));
    };
  },
};

async function onStepChange(step, field, value) {
  const payload = {
    id: step.id,
    testcaseId: detailCase.value.id,
    groupId: step.groupId || null,
    isGroup: step.isGroup || 0,
    description: field === 'description' ? value : step.description,
    expectedValue: field === 'expectedValue' ? value : step.expectedValue,
    position: step.position,
    testSteps: step.testSteps || [],
  };
  try {
    const res = await api.saveTestcaseStep(libraryId.value, detailCase.value.id, payload);
    if (res.ok) {
      step[field] = value;
      message.success('步骤已更新');
    }
  } catch (e) {
    message.error('保存失败: ' + (e.message || '未知错误'));
  }
}

// ============ 删除用例 ============
function onDeleteCase(record) {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除用例「${record.title}」吗？`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      const res = await api.deleteTestcases(libraryId.value, [record.id]);
      if (res.ok) {
        message.success('已删除');
        selectedRowKeys.value = selectedRowKeys.value.filter(k => k !== record.id);
        loadCases();
      } else {
        message.error(res.msg || '删除失败');
      }
    },
  });
}

function onBatchDelete() {
  Modal.confirm({
    title: '批量删除',
    content: `确定删除选中的 ${selectedRowKeys.value.length} 条用例吗？`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      const res = await api.deleteTestcases(libraryId.value, selectedRowKeys.value);
      if (res.ok) {
        message.success(`已删除 ${selectedRowKeys.value.length} 条用例`);
        selectedRowKeys.value = [];
        loadCases();
      } else {
        message.error(res.msg || '删除失败');
      }
    },
  });
}

onMounted(async () => {
  await loadTitle();
  await loadTree();
  await loadCases(1);
  loadFormProperties();
  // 加载用户映射（id→姓名）
  try {
    const ur = await api.users();
    if (ur.ok && ur.data) {
      ur.data.forEach((u) => { userMap.value[u.id] = u.nickname; });
    }
  } catch (_) {}
});

async function loadTitle() {
  try {
    const res = await api.libraries();
    if (res.ok && res.data) {
      const lib = res.data.find((l) => l.id === libraryId.value);
      if (lib) libraryTitle.value = lib.title;
    }
  } catch {}
}
</script>

<style scoped>
.workspace { height: 100%; display: flex; flex-direction: column; background: #fff; }
.ws-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  gap: 16px;
}
.ws-title { flex: 1; font-weight: 600; font-size: 16px; }
.ws-actions { display: flex; gap: 8px; }
.ws-body { flex: 1; display: flex; overflow: hidden; }
.ws-left {
  width: 280px;
  border-right: 1px solid #f0f0f0;
  overflow: auto;
  padding: 8px 0;
}
.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 8px;
  font-weight: 600;
}
.node-name { margin-right: 4px; }
.node-count { color: #999; font-size: 12px; }
.node-ops { display: none; float: right; }
.ws-left :deep(.ant-tree-node-content-wrapper:hover) .node-ops { display: inline; }
.ws-right { flex: 1; padding: 16px; overflow: auto; }
.list-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.total { color: #999; font-size: 13px; }
.ws-left :deep(.ant-tree-treenode:has(.placeholder-node)) { display: none; }
</style>
