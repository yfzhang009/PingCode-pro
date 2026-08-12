<template>
  <div class="defects-page">
    <div class="page-header">
      <h2>缺陷库</h2>
    </div>
    <p>按项目维度查看全量缺陷，或按测试库 → 测试计划查看计划关联缺陷</p>

    <a-spin :spinning="loading" :tip="loading ? '正在加载...' : undefined">
      <a-tabs v-model:activeKey="activeTab" size="large">
        <!-- Tab 1: 项目维度全量缺陷 -->
        <a-tab-pane key="project" tab="项目维度（全量缺陷）">
          <div class="library-grid">
            <a-card
              v-for="proj in projects"
              :key="proj.id"
              class="proj-card"
              hoverable
              @click="enterProject(proj)"
            >
              <div class="lib-header">
                <div class="lib-icon" style="background: #f5222d"><BugOutlined /></div>
                <div class="lib-title">{{ proj.title || proj.name || proj.code }}</div>
              </div>
              <div class="lib-meta">
                <div class="lib-code">{{ proj.code }}</div>
                <div class="lib-count">
                  <span class="count-num">{{ proj._bugCount ?? '--' }}</span>
                  <span class="count-label">条缺陷</span>
                </div>
              </div>
            </a-card>
          </div>
          <a-empty v-if="!loading && projects.length === 0" description="暂无项目" />
        </a-tab-pane>

        <!-- Tab 2: 测试库 → 测试计划维度 -->
        <a-tab-pane key="plan" tab="按测试库 → 测试计划">
          <div class="library-grid">
            <a-card
              v-for="lib in libraries"
              :key="lib.id"
              class="proj-card"
              hoverable
              @click="enterLibrary(lib)"
            >
              <div class="lib-header">
                <div class="lib-icon" :style="{ background: '#1890ff' }"><FolderOutlined /></div>
                <div class="lib-title">{{ lib.title }}</div>
              </div>
              <div class="lib-meta">
                <div class="lib-code">{{ lib.code }}</div>
                <span class="count-num" style="font-size:14px;color:#999">查看计划 →</span>
              </div>
            </a-card>
          </div>
          <a-empty v-if="!loading && libraries.length === 0" />
        </a-tab-pane>
      </a-tabs>
    </a-spin>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { BugOutlined, FolderOutlined } from '@ant-design/icons-vue';
import { api } from '../api';

const router = useRouter();
const activeTab = ref(localStorage.getItem('defects_tab') || 'project');
const projects = ref([]);
const libraries = ref([]);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    // 并发加载：项目列表 + 测试库列表
    const [projRes, libRes] = await Promise.all([
      api.projects(),
      api.libraries(),
    ]);
    if (projRes.ok && projRes.data) {
      projects.value = projRes.data;
      const counts = await Promise.all(
        projects.value.map(async (proj) => {
          try {
            const r = await api.workItems({
              projectId: proj.id, pageNo: 1, pageSize: 1,
            });
            return { id: proj.id, count: r.data?.total ?? 0 };
          } catch {
            return { id: proj.id, count: 0 };
          }
        })
      );
      const countMap = {};
      counts.forEach((c) => (countMap[c.id] = c.count));
      projects.value.forEach((p) => (p._bugCount = countMap[p.id]));
    }
    if (libRes.ok && libRes.data) {
      libraries.value = libRes.data;
    }
  } finally {
    loading.value = false;
  }
});

function enterProject(proj) {
  router.push(`/project-defects/${proj.id}`);
}

function enterLibrary(lib) {
  router.push(`/plan-defects/${lib.id}`);
}

// 持久化 tab 选择
watch(activeTab, (val) => {
  localStorage.setItem('defects_tab', val);
});
</script>

<style scoped>
.defects-page {
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  margin-bottom: 24px;
  text-align: center;
}
.page-header h2 { margin: 0 0 4px; font-size: 24px; }
.page-header p { margin: 0; color: #999; font-size: 14px; }
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  padding-top: 16px;
}
.proj-card {
  cursor: pointer;
  border-radius: 8px;
  transition: transform 0.15s, box-shadow 0.15s;
}
.proj-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}
.lib-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.lib-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  flex-shrink: 0;
}
.lib-title {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lib-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lib-code {
  color: #999;
  font-size: 12px;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
}
.lib-count {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.count-num {
  font-size: 22px;
  font-weight: 700;
  color: #f5222d;
}
.count-label { font-size: 12px; color: #999; }
</style>
