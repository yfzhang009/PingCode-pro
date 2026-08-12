<template>
  <div class="workspace">
    <div class="ws-header">
      <a-button type="text" @click="$router.push('/defects')">
        <ArrowLeftOutlined /> 返回缺陷库
      </a-button>
      <div class="ws-title">测试计划缺陷：{{ libraryTitle }}</div>
    </div>
    <div class="defects-body">
      <div class="left-panel">
        <div class="plan-title">测试计划</div>
        <a-spin :spinning="planLoading">
          <a-list :data-source="plans" size="small" :pagination="{ pageSize: 20 }">
            <template #renderItem="{ item }">
              <a-list-item :class="{ selected: selectedPlanId === item.id }" @click="onSelectPlan(item)" style="cursor:pointer">
                <a-list-item-meta>
                  <template #title>{{ item.name || '未命名计划' }}</template>
                  <template #description>
                    <a-tag v-if="item.status?.name" :color="item.status?.color">{{ item.status.name }}</a-tag>
                    <span v-if="item.assigneeName" style="font-size:12px;color:#999">{{ item.assigneeName }}</span>
                  </template>
                </a-list-item-meta>
              </a-list-item>
            </template>
          </a-list>
          <a-empty v-if="plans.length === 0" description="该库暂无测试计划" />
        </a-spin>
      </div>
      <div class="right-panel">
        <div class="bug-header" v-if="selectedPlanId">
          <span>关联缺陷</span>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="total">共 {{ bugTotal }} 条</span>
            <a-button type="primary" size="small" @click="showCreateModal = true" v-if="planProjectId">
              <PlusOutlined /> 新建缺陷
            </a-button>
          </div>
        </div>
        <!-- 筛选栏 -->
        <div class="filter-bar" v-if="selectedPlanId">
          <a-input-search v-model:value="keyword" placeholder="标题搜索" allow-clear style="width:180px" @search="loadBugs(1)" />
          <a-select v-model:value="filterState" placeholder="状态" allow-clear mode="multiple" max-tag-count="2" style="width:160px" @change="loadBugs(1)">
            <a-select-option v-for="s in stateOptions" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
          </a-select>
          <a-select v-model:value="filterAssignee" placeholder="处理人" allow-clear mode="multiple" show-search option-filter-prop="label" style="width:180px" @change="loadBugs(1)">
            <a-select-option v-for="(name,id) in userMap" :key="id" :value="Number(id)" :label="name">{{ name }}</a-select-option>
          </a-select>
          <a-select v-model:value="filterCreator" placeholder="创建人" allow-clear show-search option-filter-prop="label" mode="multiple" max-tag-count="2" style="width:200px" @change="loadBugs(1)">
            <a-select-option v-for="(name,id) in userMap" :key="id" :value="Number(id)" :label="name">{{ name }}</a-select-option>
          </a-select>
          <a-select v-model:value="filterPriority" placeholder="优先级" allow-clear mode="multiple" max-tag-count="2" style="width:130px" @change="loadBugs(1)">
            <a-select-option v-for="(label,id) in DEFAULT_PRIORITY_OPTIONS" :key="id" :value="id">{{ label }}</a-select-option>
          </a-select>
          <a-select v-model:value="filterSeverity" placeholder="严重程度" allow-clear mode="multiple" max-tag-count="2" style="width:140px" @change="loadBugs(1)">
            <a-select-option v-for="(label,id) in DEFAULT_SEVERITY_OPTIONS" :key="id" :value="id">{{ label }}</a-select-option>
          </a-select>
          <a-range-picker v-model:value="filterDateRange" style="width:230px" @change="loadBugs(1)" />
          <a-button size="small" @click="clearFilters">清空</a-button>
          <a-button type="dashed" size="small" @click="showSaveModal = true"><SaveOutlined /> 保存</a-button>
          <span class="filter-count" v-if="bugTotal > 0">
            筛选结果：<strong>{{ bugs.length }}</strong> 条（共 {{ bugTotal }} 条）
          </span>
        </div>
        <!-- 已保存的筛选标签 -->
        <div class="saved-filters" v-if="savedFilters.length > 0" style="padding-left:0">
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
        <a-empty v-if="!selectedPlanId" description="请先选择一个测试计划" />
        <a-table
          v-if="selectedPlanId"
          :columns="bugColumns"
          :data-source="bugs"
          row-key="id"
          :pagination="bugPagination"
          :loading="bugLoading"
          @change="onBugTableChange"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'title'">
              <a @click="onViewDetail(record)">{{ record.title }}</a>
            </template>
          </template>
        </a-table>
      </div>
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
    <a-modal v-model:open="showCreateModal" title="新建缺陷（同步至该计划关联项目）" :confirm-loading="creating" @ok="onCreateBug" width="560px">
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
import { useRoute } from 'vue-router';
import { ArrowLeftOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons-vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import { api } from '../api';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

const route = useRoute();
const libraryId = computed(() => Number(route.params.libraryId));

const libraryTitle = ref('');
const plans = ref([]);
const planLoading = ref(false);
const selectedPlanId = ref(null);
const planProjectId = ref(null);
const bugs = ref([]);
const bugTotal = ref(0);
const bugLoading = ref(false);
const bugPagination = ref({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });
const stateMap = ref({});
const stateOptions = ref([]);
const userMap = ref({});

// 筛选
const keyword = ref('');
const filterState = ref([]);
const filterAssignee = ref([]);
const filterCreator = ref([]);
const filterPriority = ref([]);
const filterSeverity = ref([]);
const filterDateRange = ref([]);

// 保存筛选条件
const showSaveModal = ref(false);
const savingFilter = ref(false);
const newFilterName = ref('');
const activeFilterName = ref('');
const STORAGE_KEY_PREFIX = 'plandefect_filter_';
const filterStorageKey = computed(() => STORAGE_KEY_PREFIX + libraryId.value);
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
  if (filterCreator.value && filterCreator.value.length > 0) f.creator = filterCreator.value;
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

const contextMenu = ref({ visible: false, x: 0, y: 0, filter: null });
function onContextMenu(e, f) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, filter: f };
}
function closeContextMenu() {
  contextMenu.value = { visible: false, x: 0, y: 0, filter: null };
}
function editSavedFilter(f) {
  applyFilter(f);
  closeContextMenu();
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
  { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
  { title: '编号', dataIndex: 'code', width: 140 },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80, customRender: ({ text }) => priorityLabel(text) },
  { title: '严重程度', dataIndex: 'severity', width: 90, customRender: ({ text }) => severityLabel(text) },
  { title: '创建者', dataIndex: 'creator', width: 100, customRender: ({ text }) => userMap.value[text] || text },
  { title: '处理人', dataIndex: 'assignee', width: 100, customRender: ({ text }) => text ? (userMap.value[text] || text) : '-' },
  { title: '状态', key: 'state', width: 100, customRender: ({ record }) => stateMap.value[record.stateId] || record.stateId || '-' },
  { title: '创建时间', dataIndex: 'createTime', width: 160, customRender: ({ text }) => text?.date || '-' },
];

// 详情抽屉
const detailVisible = ref(false);
const detailBug = ref(null);
const editing = ref(false);
const saving = ref(false);
const editForm = ref({ title: '', stateId: 67, assignee: '', description: '' });

// 新建缺陷
const showCreateModal = ref(false);
const creating = ref(false);
const createForm = ref({ title: '', stateId: 67, assignee: '', description: '' });

onMounted(async () => {
  const lRes = await api.libraries();
  if (lRes.ok) {
    const lib = lRes.data.find((l) => l.id === libraryId.value);
    if (lib) libraryTitle.value = lib.title;
  }
  try {
    const sRes = await api.workItemStates('bug');
    if (sRes.ok) {
      stateOptions.value = sRes.data || [];
      sRes.data.forEach((s) => { stateMap.value[s.id] = s.name; });
    }
  } catch (_) {}
  // 拉取用户映射
  try {
    const ur = await api.users();
    if (ur.ok && ur.data) {
      ur.data.forEach((u) => { userMap.value[u.id] = u.nickname; });
    }
  } catch (_) {}
  planLoading.value = true;
  try {
    const res = await api.plans(libraryId.value, { pageNo: 1, pageSize: 200 });
    if (res.ok) plans.value = res.data?.list || [];
  } finally { planLoading.value = false; }
});

// 右键菜单全局点击关闭
onMounted(() => document.addEventListener('click', closeContextMenu));
onUnmounted(() => document.removeEventListener('click', closeContextMenu));

async function onSelectPlan(plan) {
  selectedPlanId.value = plan.id;
  planProjectId.value = plan.projectId || null;
  loadBugs(1);
}

async function loadBugs(page) {
  bugLoading.value = true;
  try {
    if (page) bugPagination.value.current = page;
    const res = await api.planWorkItems({ planId: selectedPlanId.value, pageNo: 1, pageSize: 1000 });
    if (res.ok) {
      let list = res.data?.list || [];
      const apiTotal = res.data?.total ?? 0;
      // 前端筛选
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
  api.getWorkItem(record.id, { projectId: planProjectId.value || 8 }).then((res) => {
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
  const pid = planProjectId.value;
  const bug = detailBug.value;
  const fm = editForm.value;
  const changes = [];

  try {
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
    // description 走替换模式（删除+重新创建）
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
  if (!planProjectId.value) { message.warning('未找到关联项目'); return; }
  creating.value = true;
  try {
    const body = { projectId: planProjectId.value, title: createForm.value.title.trim(), typeId: 1, stateId: createForm.value.stateId || 67, assignee: createForm.value.assignee.trim() || undefined, description: createForm.value.description.trim() || undefined };
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
.ws-title { font-weight: 600; font-size: 16px; }
.defects-body { flex: 1; display: flex; overflow: hidden; }
.left-panel { width: 280px; border-right: 1px solid #f0f0f0; overflow: auto; padding: 12px; }
.plan-title { font-weight: 600; margin-bottom: 8px; padding: 4px 0; }
.left-panel :deep(.ant-list-item) { padding: 8px 12px; border-radius: 4px; }
.left-panel :deep(.ant-list-item.selected) { background: #e6f7ff; }
.right-panel { flex: 1; padding: 16px; overflow: auto; }
.bug-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-weight: 600; }
.total { color: #999; font-size: 13px; }
.filter-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.filter-count { font-size: 13px; color: #999; margin-left: auto; white-space: nowrap; }
.filter-count strong { color: #333; }
.saved-filters { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.saved-label { font-size: 12px; color: #999; white-space: nowrap; }
</style>
