<template>
  <!-- 跨平台推送确认弹窗 -->
  <a-modal
    v-model:open="pushModalOpen"
    title="从 TestPlatform 导入用例到 PingCode"
    :ok-text="'确认导入 (' + pushCases.length + ' 条)'"
    cancel-text="取消"
    @ok="onPushConfirm"
    :confirm-loading="pushLoading"
    width="780px"
    :destroy-on-close="true"
  >
    <!-- 选择目标测试库、指派人、目标模块 -->
    <a-space direction="vertical" style="width:100%; margin-bottom:12px;">
      <a-row :gutter="16">
        <a-col :span="8">
          <div style="margin-bottom:4px;color:#666;font-size:12px;">目标测试库</div>
          <a-select
            v-model:value="pushLibraryId"
            placeholder="请选择测试库"
            style="width:100%;"
            :loading="pushLibLoading"
            @change="onLibChange"
          >
            <a-select-option v-for="lib in pushLibs" :key="lib.id" :value="lib.id">
              {{ lib.title || lib.name }}
            </a-select-option>
          </a-select>
        </a-col>
        <a-col :span="8">
          <div style="margin-bottom:4px;color:#666;font-size:12px;">指派人</div>
          <a-select
            v-model:value="pushAssignee"
            placeholder="请选择指派人"
            style="width:100%;"
            :loading="pushUserLoading"
            show-search
            option-filter-prop="label"
          >
            <a-select-option v-for="u in pushUsers" :key="u.id" :value="u.id" :label="u.nickname || u.name">
              {{ u.nickname || u.name }}
            </a-select-option>
          </a-select>
        </a-col>
        <a-col :span="8">
          <div style="margin-bottom:4px;color:#666;font-size:12px;">目标模块（可选）</div>
          <a-tree-select
            v-model:value="pushParentSuiteId"
            :tree-data="pushSuiteTree"
            :field-names="{ label:'name', value:'id', children:'children' }"
            placeholder="默认导入到根目录下"
            style="width:100%;"
            allow-clear
            tree-default-expand-all
            :loading="pushTreeLoading"
            :dropdown-style="{ maxHeight: 300, overflow: 'auto' }"
          />
        </a-col>
      </a-row>
    </a-space>

    <p style="color: #86909C; font-size:12px;">
      收到 {{ pushCases.length }} 条用例
      <template v-if="pushParentSuiteId"> — 将导入到选中模块下</template>
      <template v-else> — 用例自带的模块路径将作为子节点创建在根目录下</template>
    </p>

    <a-table
      v-if="pushCases.length > 0"
      :data-source="pushCases"
      :columns="pushColumns"
      size="small"
      :pagination="false"
      :scroll="{ y: 280 }"
      style="margin-top: 8px;"
    />
  </a-modal>
  <router-view />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import { api } from './api';

// ===== 跨平台推送 (TestPlatform → PingCode iframe) =====
const pushModalOpen = ref(false);
const pushLoading = ref(false);
const pushLibLoading = ref(false);
const pushUserLoading = ref(false);
const pushTreeLoading = ref(false);
const pushCases = ref([]);
const pushLibraryId = ref(null);
const pushAssignee = ref(null);
const pushParentSuiteId = ref(null);
const pushLibs = ref([]);
const pushUsers = ref([]);
const pushSuiteTree = ref([]);

const pushColumns = [
  { title: '#', dataIndex: 'rowNo', width: 50 },
  { title: '用例标题', dataIndex: 'title', ellipsis: true },
  { title: '原模块路径', dataIndex: 'suiteName', ellipsis: true, width: 160 },
  { title: '优先级', dataIndex: 'priorityName', width: 70 },
  { title: '类型', dataIndex: 'testTypeName', width: 80 },
];

/** 切换测试库时重新拉取模块树 */
async function onLibChange(libId) {
  pushParentSuiteId.value = null;
  pushSuiteTree.value = [];
  if (!libId) return;
  pushTreeLoading.value = true;
  try {
    const res = await api.suites(libId);
    pushSuiteTree.value = res?.data || [];
  } catch (_) {
    pushSuiteTree.value = [];
  } finally {
    pushTreeLoading.value = false;
  }
}

/** 弹窗前初始化：拉取测试库列表 + 用户列表 */
async function initPushModal(data) {
  pushCases.value = data.cases;
  pushLibraryId.value = data.libraryId || null;
  pushAssignee.value = data.assignee || null;
  pushParentSuiteId.value = null;
  pushSuiteTree.value = [];

  // 并行拉取库列表和用户列表
  pushLibLoading.value = true;
  pushUserLoading.value = true;
  try {
    const [libRes, userRes] = await Promise.allSettled([
      api.libraries(),
      api.users(),
    ]);
    if (libRes.status === 'fulfilled') {
      pushLibs.value = (libRes.value?.data || []);
      if (!pushLibraryId.value && pushLibs.value.length > 0) {
        pushLibraryId.value = pushLibs.value[0].id;
      }
      // 默认选中的库加载模块树
      if (pushLibraryId.value) await onLibChange(pushLibraryId.value);
    }
    if (userRes.status === 'fulfilled') {
      pushUsers.value = (userRes.value?.data || []);
      try {
        const meRes = await api.me();
        const currentUser = meRes?.data?.user;
        if (currentUser) {
          const match = pushUsers.value.find((u) =>
            (u.nickname || u.name) === (currentUser.nickname || currentUser.name));
          if (match && !pushAssignee.value) pushAssignee.value = match.id;
          else if (!pushAssignee.value) {
            const byId = pushUsers.value.find((u) => u.id === currentUser.id);
            if (byId) pushAssignee.value = byId.id;
          }
        }
      } catch (_) { /* ignore */ }
    }
  } finally {
    pushLibLoading.value = false;
    pushUserLoading.value = false;
  }

  pushModalOpen.value = true;
}

/** 监听宿主 (TestPlatform) 通过 postMessage 推送的用例 */
function handlePlatformMessage(event) {
  const origin = event.origin;
  if (!origin.includes('localhost:517') && !origin.includes('127.0.0.1:517')) return;

  const { type, data } = event.data || {};
  if (type !== 'PUSH_CASES') return;

  if (!data || !Array.isArray(data.cases) || data.cases.length === 0) {
    message.warning('收到空的用例推送');
    return;
  }

  initPushModal(data);
}

/** 确认导入 */
async function onPushConfirm() {
  if (!pushLibraryId.value) { message.warning('请选择目标测试库'); return; }
  if (!pushAssignee.value) { message.warning('请选择指派人'); return; }

  pushLoading.value = true;
  try {
    const res = await api.pushToPingcode({
      libraryId: pushLibraryId.value,
      assignee: pushAssignee.value,
      cases: pushCases.value,
      parentSuiteId: pushParentSuiteId.value || undefined,
    });
    const result = res?.data || res;
    const okCount = result?.success ?? result?.results?.filter((r) => r.ok)?.length ?? 0;
    const failCount = result?.results?.filter((r) => !r.ok)?.length ?? 0;
    message.success(`导入完成：成功 ${okCount} 条` + (failCount > 0 ? `，失败 ${failCount} 条` : ''));
    pushModalOpen.value = false;

    window.parent.postMessage({
      type: 'PUSH_CASES_RESULT',
      data: { ok: true, total: pushCases.value.length, success: okCount, results: result?.results },
    }, '*');
  } catch (e) {
    message.error('导入失败: ' + (e.message || '未知错误'));
    window.parent.postMessage({
      type: 'PUSH_CASES_RESULT',
      data: { ok: false, msg: e.message },
    }, '*');
  } finally {
    pushLoading.value = false;
  }
}

onMounted(() => { window.addEventListener('message', handlePlatformMessage); });
onUnmounted(() => { window.removeEventListener('message', handlePlatformMessage); });
</script>
