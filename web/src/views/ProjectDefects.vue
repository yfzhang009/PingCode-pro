<template>
  <div class="workspace">
    <div class="ws-header">
      <a-button type="text" @click="$router.push('/defects')">
        <ArrowLeftOutlined /> 返回缺陷库
      </a-button>
      <div class="ws-title">{{ projectTitle }} - 全量缺陷</div>
      <div class="ws-actions">
        <a-button v-if="canViewAdvanced" @click="$router.push({ name: 'DefectAnalysis', params: { libraryId: projectId } })">
          <BarChartOutlined /> 缺陷分析
        </a-button>
        <a-button type="primary" @click="showCreateModal = true">
          <PlusOutlined /> 新建缺陷
        </a-button>
      </div>
    </div>

    <!-- 缺陷看板 -->
    <div class="dashboard" v-if="canViewAdvanced">
      <div class="dash-header">
        <span class="dash-title">缺陷看板</span>
        <a-button type="link" size="small" @click="dashExpanded = !dashExpanded">
          {{ dashExpanded ? '收起' : '展开' }} <ArrowUpOutlined v-if="dashExpanded" />
          <ArrowDownOutlined v-else />
        </a-button>
      </div>
      <div class="dash-body" v-show="dashExpanded">
        <div class="dash-cards">
          <div class="dash-card" v-for="c in dashCards" :key="c.label">
            <div class="dash-card-num" :style="{ color: c.color }">{{ c.value }}</div>
            <div class="dash-card-label">{{ c.label }}</div>
          </div>
        </div>
        <div class="dash-charts">
          <div class="dash-chart">
            <div class="chart-title">按状态分布</div>
            <div class="bar-list">
              <div class="bar-row" v-for="s in dashByState" :key="s.name">
                <span class="bar-label">{{ s.name }}</span>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: s.pct + '%', background: s.color }"></div>
                </div>
                <span class="bar-num">{{ s.count }}</span>
              </div>
            </div>
          </div>
          <div class="dash-chart">
            <div class="chart-title">按优先级分布</div>
            <div class="bar-list">
              <div class="bar-row" v-for="p in dashByPriority" :key="p.name">
                <span class="bar-label">{{ p.name }}</span>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: p.pct + '%', background: p.color }"></div>
                </div>
                <span class="bar-num">{{ p.count }}</span>
              </div>
            </div>
          </div>
          <div class="dash-chart">
            <div class="chart-title">按严重程度分布</div>
            <div class="bar-list">
              <div class="bar-row" v-for="s in dashBySeverity" :key="s.name">
                <span class="bar-label">{{ s.name }}</span>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: s.pct + '%', background: s.color }"></div>
                </div>
                <span class="bar-num">{{ s.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <a-input-search v-model:value="keyword" placeholder="标题搜索" allow-clear style="width:200px" @search="loadBugs(1)" />
      <a-select v-model:value="filterState" placeholder="状态" allow-clear mode="multiple" max-tag-count="2" style="width:180px" @change="loadBugs(1)">
        <a-select-option v-for="s in stateOptions" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
      </a-select>
      <a-select v-model:value="filterAssignee" placeholder="处理人" allow-clear mode="multiple" show-search option-filter-prop="label" style="width:200px" @change="loadBugs(1)">
        <a-select-option v-for="(name,id) in userMap" :key="id" :value="Number(id)" :label="name">{{ name }}</a-select-option>
      </a-select>
      <a-select v-model:value="filterCreator" placeholder="创建人" allow-clear show-search option-filter-prop="label" mode="multiple" max-tag-count="2" style="width:200px" @change="loadBugs(1)">
        <a-select-option v-for="(name,id) in userMap" :key="id" :value="Number(id)" :label="name">{{ name }}</a-select-option>
      </a-select>
      <a-select v-model:value="filterPriority" placeholder="优先级" allow-clear mode="multiple" max-tag-count="2" style="width:140px" @change="loadBugs(1)">
        <a-select-option v-for="(label,id) in DEFAULT_PRIORITY_OPTIONS" :key="id" :value="id">{{ label }}</a-select-option>
      </a-select>
      <a-select v-model:value="filterSeverity" placeholder="严重程度" allow-clear mode="multiple" max-tag-count="2" style="width:150px" @change="loadBugs(1)">
        <a-select-option v-for="(label,id) in DEFAULT_SEVERITY_OPTIONS" :key="id" :value="id">{{ label }}</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filterDateRange" style="width:240px" @change="loadBugs(1)" />
      <a-button @click="clearFilters">清空筛选</a-button>
      <a-button type="dashed" @click="showSaveModal = true"><SaveOutlined /> 保存筛选</a-button>
      <span class="filter-count" v-if="bugTotal > 0">
        筛选结果：<strong>{{ bugs.length }}</strong> 条（共 {{ bugTotal }} 条）
      </span>
    </div>

    <!-- 已保存的筛选标签 -->
    <div class="saved-filters" v-if="savedFilters.length > 0">
      <span class="saved-label">已保存筛选：</span>
      <a-tag
        v-for="f in savedFilters" :key="f.name"
        :color="activeFilterName === f.name ? 'blue' : undefined"
        style="cursor:pointer;margin-bottom:4px"
        @click="applyFilter(f)"
        @contextmenu.prevent="onContextMenu($event, f)"
        closable
        @close="deleteFilter(f.name)"
      >{{ f.name }}</a-tag>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="context-menu-item" @click="editSavedFilter(contextMenu.filter)">修改条件</div>
      <div class="context-menu-item danger" @click="deleteFilter(contextMenu.filter.name)">删除</div>
    </div>

    <div class="bug-content">
      <a-table :columns="bugColumns" :data-source="bugs" row-key="id" :pagination="bugPagination" :loading="bugLoading" @change="onBugTableChange" size="middle">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <a @click="onViewDetail(record)">{{ record.title }}</a>
          </template>
          <template v-if="column.key === 'state'">
            <span>{{ stateMap[record.stateId] || record.stateId }}</span>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 缺陷详情抽屉 -->
    <a-drawer :open="detailVisible" title="缺陷详情" placement="right" :width="640" @close="detailVisible = false">
      <template v-if="detailBug">
        <a-descriptions bordered size="small" :column="2">
          <a-descriptions-item label="标题" :span="2">
            <span v-if="!editing">{{ detailBug.title }}</span>
            <a-input v-else v-model:value="editForm.title" />
          </a-descriptions-item>
          <a-descriptions-item label="编号">{{ detailBug.code }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <span v-if="!editing">{{ stateMap[detailBug.stateId] || detailBug.stateId }}</span>
            <a-select v-else v-model:value="editForm.stateId" style="width:120px">
              <a-select-option v-for="s in stateOptions" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="严重程度">{{ severityLabel(detailBug.severity) }}</a-descriptions-item>
          <a-descriptions-item label="优先级">{{ priorityLabel(detailBug.priority) }}</a-descriptions-item>
          <a-descriptions-item label="创建者">{{ userMap[detailBug.creator] || detailBug.creator }}</a-descriptions-item>
          <a-descriptions-item label="处理人">
            <span v-if="!editing">{{ detailBug.assignee ? (userMap[detailBug.assignee] || detailBug.assignee) : '(未分配)' }}</span>
            <a-select v-else v-model:value="editForm.assignee" style="width:140px" show-search allow-clear placeholder="选择处理人" option-filter-prop="label">
              <a-select-option v-for="(name,id) in userMap" :key="id" :value="String(id)" :label="name">{{ name }}</a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detailBug.createTime?.date }}</a-descriptions-item>
          <a-descriptions-item label="更新时间">{{ detailBug.updateTime?.date }}</a-descriptions-item>
          <a-descriptions-item label="描述" :span="2">
            <div v-if="!editing" v-html="detailBug.description || '无'"></div>
            <QuillEditor v-else v-model:content="editForm.description" contentType="html" style="height:200px" />
          </a-descriptions-item>
        </a-descriptions>
        <div style="margin-top:16px;display:flex;gap:8px">
          <a-button v-if="!editing" type="primary" @click="startEdit">编辑</a-button>
          <template v-if="editing">
            <a-button type="primary" :loading="saving" @click="onSaveEdit">保存</a-button>
            <a-button @click="cancelEdit">取消</a-button>
          </template>
        </div>

        <!-- 附件 -->
        <div v-if="detailBug._attachments && detailBug._attachments.length > 0" style="margin-top:16px">
          <div style="font-weight:600;margin-bottom:8px">附件 ({{ detailBug._attachments.length }})</div>
          <div v-for="att in detailBug._attachments" :key="att.id" style="padding:4px 0">
            <a :href="att.url" target="_blank">{{ att.name || att.fileName || '附件' }}</a>
            <span style="color:#999;font-size:12px;margin-left:8px">{{ formatFileSize(att.size) }}</span>
          </div>
        </div>

        <!-- 评论 -->
        <div v-if="detailBug._comments" style="margin-top:16px">
          <div style="font-weight:600;margin-bottom:8px">评论 ({{ detailBug._commentTotal || 0 }})</div>
          <a-list :data-source="detailBug._comments" size="small" v-if="detailBug._comments.length > 0">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta>
                  <template #avatar>
                    <a-avatar :src="item.avatar" size="small">{{ (item.userName || '').charAt(0) }}</a-avatar>
                  </template>
                  <template #title>
                    <span style="font-weight:500">{{ item.userName }}</span>
                    <span style="color:#999;font-size:12px;margin-left:8px">{{ formatTime(item.createTime) }}</span>
                  </template>
                  <template #description>
                    <div v-html="item.content"></div>
                  </template>
                </a-list-item-meta>
              </a-list-item>
            </template>
          </a-list>
          <div v-else style="color:#999;font-size:13px">暂无评论</div>
        </div>
      </template>
      <a-empty v-else description="暂无数据" />
    </a-drawer>

    <!-- 新建缺陷弹窗 -->
    <a-modal v-model:open="showCreateModal" title="新建缺陷" :confirm-loading="creating" @ok="onCreateBug" width="560px">
      <a-form layout="vertical" :model="createForm">
        <a-form-item label="缺陷标题" required>
          <a-input v-model:value="createForm.title" placeholder="请输入缺陷标题" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="createForm.stateId" placeholder="选择状态">
            <a-select-option v-for="s in stateOptions" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="处理人">
          <a-input v-model:value="createForm.assignee" placeholder="处理人ID（可留空）" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="createForm.description" placeholder="缺陷描述（可选）" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
    <!-- 保存筛选弹窗 -->
    <a-modal v-model:open="showSaveModal" title="保存筛选条件" :confirm-loading="savingFilter" @ok="saveFilter" width="400px">
      <a-form layout="vertical">
        <a-form-item label="筛选名称" required>
          <a-input v-model:value="newFilterName" placeholder="如：我的缺陷、未处理bug" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeftOutlined, PlusOutlined, SaveOutlined, ArrowUpOutlined, ArrowDownOutlined, BarChartOutlined } from '@ant-design/icons-vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import { api } from '../api';
import { message } from 'ant-design-vue';
import { useUserStore } from '../store/user';
import dayjs from 'dayjs';

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const projectId = computed(() => Number(route.params.libraryId));
const projectTitle = ref('');

// 高级功能权限
const PERM_KEY = 'defect_advanced_perm_users';
const DEFAULT_PERM = JSON.stringify(['张远帆']);
function loadPermUsers() {
  try { return JSON.parse(localStorage.getItem(PERM_KEY) || DEFAULT_PERM); } catch { return ['张远帆']; }
}
const canViewAdvanced = computed(() => {
  const nickname = store.user?.nickname || store.user?.name || '';
  return loadPermUsers().includes(nickname);
});

const keyword = ref('');
const bugs = ref([]);
const bugTotal = ref(0);
const bugLoading = ref(false);
const bugPagination = ref({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });
const stateMap = ref({});
const stateOptions = ref([]);
const stateTypeMap = ref({});   // stateId -> PingCode type: 1=开始 2=进行中 3=完成 4=终止
const userMap = ref({});

// 筛选条件
const filterState = ref([]);
const filterAssignee = ref([]);
const filterCreator = ref([]);
const filterPriority = ref([]);
const filterSeverity = ref([]);
const filterDateRange = ref([]);

// 看板
const dashExpanded = ref(true);
const dashCards = computed(() => {
  const total = bugs.value.length;
  // 使用 PingCode 状态 type: 1=开始, 2=进行中, 3=完成, 4=终止
  // 未关闭 = type 1 或 2（含未知type兜底）
  const openCount = bugs.value.filter(b => {
    const t = stateTypeMap.value[b.stateId];
    return t === 1 || t === 2 || t === undefined;
  }).length;
  // 已关闭 = type 3 或 4（完成/终止）
  const closedCount = total - openCount;
  const assignedCount = bugs.value.filter(b => b.assignee).length;
  return [
    { label: '缺陷总数', value: total, color: '#1677ff' },
    { label: '未关闭', value: openCount, color: '#fa8c16' },
    { label: '已关闭', value: closedCount, color: '#52c41a' },
    { label: '已分配', value: assignedCount, color: '#722ed1' },
  ];
});
const dashByState = computed(() => {
  const map = {};
  bugs.value.forEach(b => {
    const name = stateMap.value[b.stateId] || '未知';
    map[name] = (map[name] || 0) + 1;
  });
  const colors = ['#1677ff','#52c41a','#fa8c16','#f5222d','#722ed1','#13c2c2','#eb2f96','#a0d911'];
  return Object.entries(map).map(([name, count], i) => ({
    name, count,
    pct: bugs.value.length ? Math.round(count / bugs.value.length * 100) : 0,
    color: colors[i % colors.length],
  })).sort((a,b) => b.count - a.count);
});
const dashByPriority = computed(() => {
  const map = {};
  bugs.value.forEach(b => {
    const name = priorityLabel(b.priority);
    map[name] = (map[name] || 0) + 1;
  });
  const colorMap = { '最高': '#cf1322', '较高': '#f5222d', '普通': '#fa8c16', '较低': '#1677ff', '最低': '#52c41a' };
  return Object.entries(map).map(([name, count]) => ({
    name, count,
    pct: bugs.value.length ? Math.round(count / bugs.value.length * 100) : 0,
    color: colorMap[name] || '#999',
  }));
});
const dashBySeverity = computed(() => {
  const map = {};
  bugs.value.forEach(b => {
    const name = severityLabel(b.severity);
    map[name] = (map[name] || 0) + 1;
  });
  const colorMap = { '致命': '#cf1322', '严重': '#f5222d', '一般': '#fa8c16', '建议': '#1677ff' };
  return Object.entries(map).map(([name, count]) => ({
    name, count,
    pct: bugs.value.length ? Math.round(count / bugs.value.length * 100) : 0,
    color: colorMap[name] || '#999',
  }));
});

// 保存筛选条件
const showSaveModal = ref(false);
const savingFilter = ref(false);
const newFilterName = ref('');
const activeFilterName = ref('');
const contextMenu = ref({ visible: false, x: 0, y: 0, filter: null });
const STORAGE_KEY_PREFIX = 'defect_filter_';
const filterStorageKey = computed(() => STORAGE_KEY_PREFIX + projectId.value);
const savedFilters = ref(loadSavedFilters());

function loadSavedFilters() {
  try {
    return JSON.parse(localStorage.getItem(filterStorageKey.value) || '[]');
  } catch { return []; }
}

function getCurrentFilter() {
  const dr = filterDateRange.value;
  const f = {};
  if (keyword.value) f.keyword = keyword.value;
  if (filterState.value && filterState.value.length > 0) f.state = filterState.value;
  if (filterAssignee.value && filterAssignee.value.length > 0) f.assignee = filterAssignee.value;
  if (filterCreator.value) f.creator = filterCreator.value;
  if (filterPriority.value && filterPriority.value.length > 0) f.priority = filterPriority.value;
  if (filterSeverity.value && filterSeverity.value.length > 0) f.severity = filterSeverity.value;
  if (dr && dr.length === 2 && dr[0] && dr[1]) f.dateRange = [dr[0].toISOString(), dr[1].toISOString()];
  return f;
}

function saveFilter() {
  const name = newFilterName.value.trim();
  if (!name) { message.warning('请输入筛选名称'); return; }
  const exists = savedFilters.value.find(f => f.name === name);
  const newFilter = { name, ...getCurrentFilter() };
  if (exists) {
    Object.assign(exists, newFilter);
  } else {
    savedFilters.value.push(newFilter);
  }
  localStorage.setItem(filterStorageKey.value, JSON.stringify(savedFilters.value));
  activeFilterName.value = name;
  newFilterName.value = '';
  showSaveModal.value = false;
  message.success('筛选条件已保存');
}

function applyFilter(f) {
  clearFilters(false);
  if (f.keyword) keyword.value = f.keyword;
  if (f.state) filterState.value = f.state;
  if (f.assignee) filterAssignee.value = f.assignee;
  if (f.creator) filterCreator.value = f.creator;
  if (f.priority) filterPriority.value = f.priority;
  if (f.severity) filterSeverity.value = f.severity;
  if (f.dateRange && f.dateRange.length === 2 && f.dateRange[0] && f.dateRange[1]) {
    filterDateRange.value = [dayjs(f.dateRange[0]), dayjs(f.dateRange[1])];
  }
  activeFilterName.value = f.name;
  loadBugs(1);
}

function deleteFilter(name) {
  savedFilters.value = savedFilters.value.filter(f => f.name !== name);
  localStorage.setItem(filterStorageKey.value, JSON.stringify(savedFilters.value));
  if (activeFilterName.value === name) activeFilterName.value = '';
  closeContextMenu();
}

function onContextMenu(e, f) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, filter: f };
}

function closeContextMenu() {
  contextMenu.value = { visible: false, x: 0, y: 0, filter: null };
}

function editSavedFilter(f) {
  applyFilter(f);
  closeContextMenu();
  // 标记为编辑模式：点击"保存筛选"时默认填充已有名称
  newFilterName.value = f.name;
  showSaveModal.value = true;
}

const priorityMap = { Urgent: '紧急', High: '高', Medium: '中', Low: '低' };
const severityMap = { Critical: '致命', Major: '严重', Moderate: '一般', Minor: '轻微' };

// PingCode 自定义字段选项映射（Snowflake ID → 中文名称）
const DEFAULT_PRIORITY_OPTIONS = {
  '1922881408940388354': '最高', '1922881408940388355': '较高',
  '1922881408940388356': '普通', '1922881408940388357': '较低', '1922881408940388358': '最低',
};
const DEFAULT_SEVERITY_OPTIONS = {
  '1922881408944582656': '严重', '1922881408944582657': '一般',
  '1922881408940388359': '致命', '1922881408944582658': '建议',
};

function priorityLabel(id) {
  if (!id) return '-';
  const key = String(id);
  if (priorityMap[key]) return priorityMap[key];
  return DEFAULT_PRIORITY_OPTIONS[key] || key;
}
function severityLabel(id) {
  if (!id) return '-';
  const key = String(id);
  if (severityMap[key]) return severityMap[key];
  return DEFAULT_SEVERITY_OPTIONS[key] || key;
}

const bugColumns = [
  { title: '标题', key: 'title', dataIndex: 'title', ellipsis: true },
  { title: '编号', dataIndex: 'code', width: 150 },
  { title: '状态', key: 'state', width: 80 },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80, customRender: ({ text }) => priorityLabel(text) },
  { title: '严重程度', dataIndex: 'severity', width: 90, customRender: ({ text }) => severityLabel(text) },
  { title: '创建者', dataIndex: 'creator', width: 100, customRender: ({ text }) => userMap.value[text] || text },
  { title: '处理人', dataIndex: 'assignee', width: 100, customRender: ({ text }) => text ? (userMap.value[text] || text) : '-' },
  { title: '创建时间', dataIndex: 'createTime', width: 180, customRender: ({ text }) => text?.date || '-' },
];

// 详情抽屉
const detailVisible = ref(false);
const detailBug = ref(null);
const editing = ref(false);
const saving = ref(false);
const editForm = ref({ title: '', stateId: 67, assignee: '', description: '' });

// 全局点击关闭右键菜单
onMounted(() => document.addEventListener('click', closeContextMenu));
onUnmounted(() => document.removeEventListener('click', closeContextMenu));

// 新建缺陷
const showCreateModal = ref(false);
const creating = ref(false);
const createForm = ref({ title: '', stateId: 67, assignee: '', description: '' });

onMounted(async () => {
  const pres = await api.projects();
  if (pres.ok) {
    const p = pres.data.find((x) => x.id === projectId.value);
    if (p) projectTitle.value = p.title || p.name || p.code;
  }
  try {
    const sr = await api.workItemStates('bug');
    if (sr.ok) {
      stateOptions.value = sr.data || [];
      sr.data.forEach((s) => {
        stateMap.value[s.id] = s.name;
        stateTypeMap.value[s.id] = s.type;
      });
    }
  } catch (_) {}
  // 拉取用户映射
  try {
    const ur = await api.users();
    if (ur.ok && ur.data) {
      ur.data.forEach((u) => { userMap.value[u.id] = u.nickname; });
    }
  } catch (_) {}
  loadBugs(1);
});

async function loadBugs(page) {
  bugLoading.value = true;
  try {
    if (page) bugPagination.value.current = page;
    // 一次性拉取全部数据到前端，再做筛选
    const params = { projectId: projectId.value, pageNo: 1, pageSize: 10000 };
    if (keyword.value) params.keyword = keyword.value;
    const res = await api.workItems(params);
    if (res.ok) {
      let list = res.data?.list || [];
      const apiTotal = res.data?.total ?? 0;
      // 前端筛选（pingcode page 接口不支持这些筛选字段）
      if (filterState.value && filterState.value.length > 0) list = list.filter((x) => filterState.value.includes(x.stateId));
      if (filterAssignee.value && filterAssignee.value.length > 0) list = list.filter((x) => filterAssignee.value.some(v => String(v) === String(x.assignee)));
      if (filterCreator.value && filterCreator.value.length > 0) list = list.filter((x) => filterCreator.value.some(v => String(v) === String(x.creator)));
      if (filterPriority.value && filterPriority.value.length > 0) list = list.filter((x) => filterPriority.value.includes(x.priority));
      if (filterSeverity.value && filterSeverity.value.length > 0) list = list.filter((x) => filterSeverity.value.includes(x.severity));
      if (filterDateRange.value && filterDateRange.value.length === 2) {
        const [start, end] = filterDateRange.value;
        if (start && end) {
          const s = start.startOf('day').valueOf();
          const e = end.endOf('day').valueOf();
          list = list.filter((x) => {
            const ts = x.createTime?.dateValue || 0;
            return ts >= s && ts <= e;
          });
        }
      }
      // keyword 已在服务端过滤过，但做一次二次保障
      if (keyword.value) list = list.filter((x) => x.title?.includes(keyword.value));
      bugs.value = list;
      bugTotal.value = apiTotal;
      bugPagination.value.total = list.length;
    }
  } finally { bugLoading.value = false; }
}

function clearFilters(reload = true) {
  filterState.value = [];
  filterAssignee.value = [];
  filterCreator.value = [];
  filterPriority.value = [];
  filterSeverity.value = [];
  filterDateRange.value = [];
  keyword.value = '';
  activeFilterName.value = '';
  if (reload) loadBugs(1);
}

function onBugTableChange(pag) {
  bugPagination.value.current = pag.current;
  bugPagination.value.pageSize = pag.pageSize;
  loadBugs();
}

function onViewDetail(record) {
  detailBug.value = record;
  detailVisible.value = true;
  editing.value = false;
  // 调详情接口拉取完整描述
  api.getWorkItem(record.id, { projectId: projectId.value }).then((res) => {
    if (res.ok && res.data) {
      detailBug.value = { ...detailBug.value, description: res.data.description, assignee: res.data.assignee, creator: res.data.creator };
    }
  });
  // 拉取评论
  api.getWorkItemComments(record.id).then((res) => {
    if (res.ok && res.data) {
      detailBug.value = { ...detailBug.value, _comments: res.data.list || [], _commentTotal: res.data.total || 0 };
    }
  });
  // 拉取附件
  api.getWorkItemAttachments(record.id).then((res) => {
    if (res.ok && res.data) {
      detailBug.value = { ...detailBug.value, _attachments: res.data || [] };
    }
  });
}

function startEdit() {
  editForm.value = { title: detailBug.value.title, stateId: detailBug.value.stateId, assignee: String(detailBug.value.assignee || ''), description: detailBug.value.description || '' };
  editing.value = true;
}

function cancelEdit() { editing.value = false; }

async function onSaveEdit() {
  saving.value = true;
  const pid = projectId.value;
  const bug = detailBug.value;
  const fm = editForm.value;
  const changes = [];

  try {
    // 逐个字段保存
    if (fm.title !== bug.title) {
      const r = await api.updateWorkItem({ id: bug.id, field: 'title', value: fm.title, projectId: pid });
      if (!r.ok) throw new Error('标题更新失败: ' + r.msg);
      changes.push('标题');
      bug.title = fm.title;
    }
    if (fm.assignee !== (bug.assignee || '')) {
      const r = await api.updateWorkItem({ id: bug.id, field: 'assignee', value: fm.assignee || '', projectId: pid });
      if (!r.ok) throw new Error('处理人更新失败: ' + r.msg);
      changes.push('处理人');
      bug.assignee = fm.assignee || null;
    }
    if (fm.stateId !== bug.stateId) {
      const r = await api.updateWorkItem({ id: bug.id, field: 'state', stateId: fm.stateId, projectId: pid });
      if (!r.ok) throw new Error('状态更新失败: ' + r.msg);
      changes.push('状态');
      bug.stateId = fm.stateId;
    }
    if (fm.description !== (bug.description || '')) {
      const r = await api.updateWorkItem({ id: bug.id, field: 'description', value: fm.description, projectId: pid });
      if (!r.ok) throw new Error('描述更新失败: ' + r.msg);
      changes.push('描述');
      bug.description = fm.description;
    }

    if (changes.length === 0) { message.info('无变更'); } else {
      message.success(changes.join('、') + ' 已保存，同步到 pingcode');
    }
    editing.value = false;
    loadBugs();
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally { saving.value = false; }
}

async function onCreateBug() {
  if (!createForm.value.title.trim()) { message.warning('请输入缺陷标题'); return; }
  creating.value = true;
  try {
    const body = { projectId: projectId.value, title: createForm.value.title.trim(), typeId: 1, stateId: createForm.value.stateId || 67, assignee: createForm.value.assignee.trim() || undefined, description: createForm.value.description.trim() || undefined };
    const res = await api.createWorkItem(body);
    if (res.ok) {
      message.success('缺陷创建成功，已同步到 pingcode');
      showCreateModal.value = false;
      createForm.value = { title: '', stateId: 67, assignee: '', description: '' };
      loadBugs();
    } else { message.error(res.msg || '创建失败'); }
  } catch (e) { message.error('创建失败: ' + (e.response?.data?.msg || e.message)); }
  finally { creating.value = false; }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = Number(bytes);
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(1) + ' ' + units[i];
}

function formatTime(t) {
  if (!t) return '';
  return dayjs(t).format('YYYY-MM-DD HH:mm');
}
</script>

<style scoped>
.workspace { height: 100%; display: flex; flex-direction: column; background: #fff; }
.ws-header { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; gap: 16px; }
.ws-title { flex: 1; font-weight: 600; font-size: 16px; }
.ws-actions { display: flex; gap: 8px; }
.dashboard {
  margin: 0 16px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
}
.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}
.dash-title { font-weight: 600; font-size: 14px; }
.dash-body { padding: 16px; }
.dash-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.dash-card {
  text-align: center;
  padding: 16px 12px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fff;
}
.dash-card-num { font-size: 28px; font-weight: 700; line-height: 1.2; }
.dash-card-label { font-size: 12px; color: #999; margin-top: 4px; }
.dash-charts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.dash-chart { min-width: 0; }
.chart-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: #555; }
.bar-list { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 52px; font-size: 12px; color: #666; text-align: right; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { flex: 1; height: 14px; background: #f5f5f5; border-radius: 7px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 7px; transition: width 0.4s ease; min-width: 2px; }
.bar-num { width: 32px; font-size: 12px; color: #999; text-align: left; flex-shrink: 0; }
.filter-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #f0f0f0; background: #fafafa; flex-wrap: wrap; }
.filter-count { font-size: 13px; color: #999; margin-left: auto; white-space: nowrap; }
.filter-count strong { color: #333; }
.saved-filters { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-bottom: 1px solid #f0f0f0; background: #fff; flex-wrap: wrap; }
.saved-label { font-size: 12px; color: #999; white-space: nowrap; }
.context-menu {
  position: fixed;
  z-index: 1050;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.15);
  padding: 4px 0;
  min-width: 120px;
}
.context-menu-item {
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  line-height: 22px;
}
.context-menu-item:hover { background: #f5f5f5; }
.context-menu-item.danger { color: #ff4d4f; }
.context-menu-item.danger:hover { background: #fff1f0; }
.bug-content { flex: 1; padding: 16px; overflow: auto; }
</style>
