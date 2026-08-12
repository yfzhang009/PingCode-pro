<template>
  <div class="libraries-page">
    <div class="page-header">
      <h2>用例库</h2>
      <p>按测试库维度查看全量用例，或按测试库 → 测试计划查看计划执行用例</p>
    </div>

    <a-spin :spinning="loading" :tip="loading ? '正在加载...' : undefined">
      <a-tabs v-model:activeKey="activeTab" size="large">
        <!-- Tab 1: 测试库维度全量用例 -->
        <a-tab-pane key="library" tab="测试库（全量用例）">
          <div class="library-grid">
            <a-card
              v-for="lib in libraries"
              :key="lib.id"
              class="library-card"
              hoverable
              @click="enterWorkspace(lib)"
            >
              <div class="lib-header">
                <div class="lib-icon" :style="{ background: lib.isFavorite ? '#faad14' : '#1890ff' }">
                  <FolderOutlined />
                </div>
                <div class="lib-title">{{ lib.title }}</div>
              </div>
              <div class="lib-meta">
                <div class="lib-code">{{ lib.code }}</div>
                <div class="lib-count">
                  <span class="count-num">{{ lib._caseCount ?? '--' }}</span>
                  <span class="count-label">条用例</span>
                </div>
              </div>
              <div class="lib-footer">
                <span class="lib-date">创建于 {{ lib.createTime?.split(' ')?.[0] || '--' }}</span>
              </div>
            </a-card>
          </div>
          <a-empty v-if="!loading && libraries.length === 0" description="暂无测试库" />
        </a-tab-pane>

        <!-- Tab 2: 测试库 → 测试计划 -->
        <a-tab-pane key="plan" tab="按测试库 → 测试计划">
          <div class="library-grid">
            <a-card
              v-for="lib in libraries"
              :key="lib.id"
              class="library-card"
              hoverable
              @click="openPlanModal(lib)"
            >
              <div class="lib-header">
                <div class="lib-icon" :style="{ background: '#722ed1' }"><ScheduleOutlined /></div>
                <div class="lib-title">{{ lib.title }}</div>
              </div>
              <div class="lib-meta">
                <div class="lib-code">{{ lib.code }}</div>
                <span class="count-num" style="font-size:14px;color:#722ed1">选择计划 →</span>
              </div>
            </a-card>
          </div>
          <a-empty v-if="!loading && libraries.length === 0" description="暂无测试库" />
        </a-tab-pane>
      </a-tabs>
    </a-spin>

    <!-- 计划选择弹窗 -->
    <a-modal
      v-model:open="planModal.open"
      :title="'选择测试计划'"
      @ok="confirmPlan"
      cancel-text="取消"
      ok-text="确定"
      :width="700"
      :confirm-loading="planModal.loading"
    >
      <a-spin :spinning="planModal.loading">
        <a-list :data-source="planModal.plans" size="small">
          <template #renderItem="{ item }">
            <a-list-item
              :class="{ 'plan-selected': planModal.selectedId === item.id }"
              @click="planModal.selectedId = item.id"
              style="cursor:pointer"
            >
              <a-list-item-meta>
                <template #title>
                  <span :style="{ fontWeight: planModal.selectedId === item.id ? 'bold' : 'normal' }">{{ item.name }}</span>
                </template>
                <template #description>
                  <a-tag v-if="item.status?.name" :color="item.status?.color || item.status?.bgColor" size="small">
                    {{ item.status.name }}
                  </a-tag>
                  <span v-if="item.assigneeName" style="margin-left:8px;color:#999;font-size:12px">{{ item.assigneeName }}</span>
                </template>
              </a-list-item-meta>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-if="!planModal.loading && planModal.plans.length === 0" description="该库暂无测试计划" />
      </a-spin>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { FolderOutlined, ScheduleOutlined } from '@ant-design/icons-vue';
import { api } from '../api';

const router = useRouter();
const activeTab = ref(localStorage.getItem('libraries_tab') || 'library');
const libraries = ref([]);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const res = await api.libraries();
    if (res.ok && res.data) {
      libraries.value = res.data;
      // 并发拉取每个库的用例总数
      const counts = await Promise.all(
        libraries.value.map(async (lib) => {
          try {
            const r = await api.testcases({ libraryId: lib.id, pageNo: 1, pageSize: 1 });
            return { id: lib.id, count: r.data?.total ?? 0 };
          } catch {
            return { id: lib.id, count: 0 };
          }
        })
      );
      const countMap = {};
      counts.forEach((c) => (countMap[c.id] = c.count));
      libraries.value.forEach((lib) => (lib._caseCount = countMap[lib.id]));
    }
  } finally {
    loading.value = false;
  }
});

function enterWorkspace(lib) {
  router.push(`/workspace/${lib.id}`);
}

// ============ 计划选择弹窗 ============
const planModal = reactive({
  open: false,
  plans: [],
  loading: false,
  selectedLib: null,
  selectedId: null,
});

async function openPlanModal(lib) {
  planModal.open = true;
  planModal.selectedLib = lib;
  planModal.selectedId = null;
  planModal.plans = [];
  planModal.loading = true;
  try {
    const res = await api.plans(lib.id, { pageNo: 1, pageSize: 200 });
    if (res.ok) {
      planModal.plans = res.data?.list || res.data || [];
    }
  } finally {
    planModal.loading = false;
  }
}

function confirmPlan() {
  if (!planModal.selectedId) {
    planModal.open = false;
    return;
  }
  const libId = planModal.selectedLib.id;
  const planId = planModal.selectedId;
  planModal.open = false;
  router.push(`/plan-workspace/${libId}/${planId}`);
}

// 持久化 tab 选择
watch(activeTab, (val) => {
  localStorage.setItem('libraries_tab', val);
});
</script>

<style scoped>
.libraries-page {
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  margin-bottom: 24px;
  text-align: center;
}
.page-header h2 {
  margin: 0 0 4px;
  font-size: 24px;
}
.page-header p {
  margin: 0;
  color: #999;
  font-size: 14px;
}
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.library-card {
  cursor: pointer;
  border-radius: 8px;
  transition: transform 0.15s, box-shadow 0.15s;
}
.library-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}
.lib-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lib-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
}
.lib-title {
  font-size: 15px;
  font-weight: 600;
}
.lib-meta {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lib-code {
  font-size: 12px;
  color: #999;
}
.lib-count {
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.count-num {
  font-size: 20px;
  font-weight: 700;
  color: #1890ff;
}
.count-label {
  font-size: 12px;
  color: #999;
}
.lib-footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}
.lib-date {
  font-size: 11px;
  color: #ccc;
}
.plan-selected {
  background: #e6f4ff !important;
  border-radius: 4px;
}
</style>
