<template>
  <div class="import-page">
    <div class="ws-header">
      <a-button type="text" @click="$router.push(`/workspace/${libraryId}`)">
        <ArrowLeftOutlined /> 返回工作台
      </a-button>
      <div class="ws-title">
        批量导入用例到「{{ parentName }}」模块
      </div>
    </div>

    <div class="import-body">
      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #message>
          导入到「<strong>{{ parentName }}</strong>」下
        </template>
        <template #description>
          Excel 中「模块名称」列会自动匹配已有子模块，匹配不到的模块将在导入时自动创建。
        </template>
      </a-alert>

      <a-row :gutter="16" style="margin-bottom:16px">
        <a-col :span="8">
          <a-card title="第1步：下载模板" size="small">
            <a-button type="primary" ghost @click="downloadTemplate">
              <DownloadOutlined /> 下载导入模板
            </a-button>
            <div class="step-tip">模板含：模块名称、用例标题、前置条件、步骤描述、预期结果、优先级、重要程度、测试类型</div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card title="第2步：上传并预览" size="small">
            <a-upload
              :before-upload="beforeUpload"
              :show-upload-list="false"
              accept=".xlsx,.xls"
            >
              <a-button :loading="parsing">
                <UploadOutlined /> 选择 Excel 文件
              </a-button>
            </a-upload>
            <div class="step-tip">支持 .xlsx / .xls 格式，上传后自动解析校验</div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card title="第3步：确认导入" size="small">
            <a-form layout="vertical" size="small">
              <a-form-item label="维护人（必填）">
                <a-select
                  v-model:value="assignee"
                  style="width:100%"
                  show-search
                  allow-clear
                  placeholder="选择维护人"
                  option-filter-prop="label"
                >
                  <a-select-option v-for="(name,id) in userMap" :key="id" :value="Number(id)" :label="name">
                    {{ name }}
                  </a-select-option>
                </a-select>
              </a-form-item>
              <a-button
                type="primary"
                :loading="importing"
                :disabled="!parsedCases.length"
                @click="runImport"
              >
                一键导入到 pingcode
              </a-button>
            </a-form>
          </a-card>
        </a-col>
      </a-row>

      <!-- 模块自动创建预览 -->
      <a-card v-if="modulePreview.length" title="模块匹配预览" size="small" style="margin-bottom:16px">
        <a-table
          :data-source="modulePreview"
          :columns="modulePreviewColumns"
          row-key="suiteName"
          size="small"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag v-if="record.exists" color="green">已匹配</a-tag>
              <a-tag v-else color="blue">将自动创建</a-tag>
            </template>
          </template>
        </a-table>
      </a-card>

      <!-- 预览校验 -->
      <a-card v-if="parsedCases.length" size="small">
        <template #title>
          预览（共 {{ parsedCases.length }} 条）
          <a-tag v-if="parseErrors.length" color="red">{{ parseErrors.length }} 条校验错误</a-tag>
          <a-tag v-else color="green">校验通过</a-tag>
        </template>
        <a-table
          :data-source="parsedCases"
          :columns="previewColumns"
          row-key="rowNo"
          size="small"
          :pagination="{ pageSize: 20 }"
          :scroll="{ y: 400 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'rowNo'">{{ record.rowNo }}</template>
            <template v-if="column.key === 'status'">
              <a-tag v-if="record._error" color="red">{{ record._error }}</a-tag>
              <a-tag v-else color="green">OK</a-tag>
            </template>
          </template>
        </a-table>
      </a-card>

      <!-- 导入结果 -->
      <a-modal
        v-model:open="resultOpen"
        title="导入结果"
        :footer="null"
        width="700px"
      >
        <a-result
          v-if="importResult"
          :status="importResult.success === importResult.total ? 'success' : 'warning'"
          :title="`成功 ${importResult.success} / 共 ${importResult.total} 条`"
        >
          <template #extra>
            <a-button type="primary" @click="onFinish">返回工作台</a-button>
          </template>
          <a-table
            :data-source="importResult.results"
            :columns="resultColumns"
            size="small"
            :pagination="{ pageSize: 10 }"
            row-key="rowNo"
          />
        </a-result>
      </a-modal>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ArrowLeftOutlined, DownloadOutlined, UploadOutlined,
} from '@ant-design/icons-vue';
import { api } from '../api';
import { useUserStore } from '../store/user';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const libraryId = computed(() => Number(route.params.libraryId));
const parentSuiteId = computed(() => route.query.parentSuiteId ? Number(route.query.parentSuiteId) : null);
const parentName = computed(() => route.query.parentName || `#${parentSuiteId.value}`);

const treeData = ref([]);
const childSuites = ref([]); // 目标模块下的直接子模块
const assignee = ref(userStore.user?.id || null); // 默认当前登录用户
const userMap = ref({}); // id -> nickname 映射
const parsing = ref(false);
const parsedCases = ref([]);
const parseErrors = ref([]);
const importing = ref(false);
const resultOpen = ref(false);
const importResult = ref(null);

const previewColumns = [
  { title: '行', key: 'rowNo', width: 60 },
  { title: '模块', dataIndex: 'suiteName', width: 120, ellipsis: true },
  { title: '标题', dataIndex: 'title', ellipsis: true },
  { title: '前置条件', dataIndex: 'precondition', ellipsis: true },
  { title: '步骤', dataIndex: 'stepDescription', ellipsis: true },
  { title: '预期', dataIndex: 'expectedValue', ellipsis: true },
  { title: '状态', key: 'status', width: 100 },
];

const resultColumns = [
  { title: '行', dataIndex: 'rowNo', width: 60 },
  { title: '标题', dataIndex: 'title', ellipsis: true },
  { title: '结果', key: 'ok', width: 80, customRender: ({ record }) => (record.ok ? '成功' : '失败') },
  { title: '说明', dataIndex: 'msg', ellipsis: true },
];

const modulePreviewColumns = [
  { title: 'Excel 模块名', dataIndex: 'suiteName' },
  { title: '状态', key: 'status', width: 150 },
  { title: '说明', key: 'desc', customRender: ({ record }) => (record.exists ? `匹配到已有模块「${record.suiteName}」` : '将在目标模块下自动创建') },
];

const modulePreview = ref([]);

// 收集指定节点下的所有直接子模块名称
function collectChildNames(nodes) {
  if (!nodes) return [];
  return nodes.map((n) => n.name).filter(Boolean);
}

async function loadTree() {
  const res = await api.suites(libraryId.value);
  if (res.ok) {
    treeData.value = res.data || [];
    if (parentSuiteId.value) {
      // 找到目标节点，获取其直接子模块列表
      const target = findNodeById(treeData.value, parentSuiteId.value);
      childSuites.value = target ? collectChildNames(target.children || []) : [];
    }
  }
}

// 递归查找节点
function findNodeById(nodes, id) {
  if (!nodes) return null;
  for (const n of nodes) {
    if (Number(n.id) === Number(id)) return n;
    const found = findNodeById(n.children, id);
    if (found) return found;
  }
  return null;
}

async function downloadTemplate() {
  window.open('/api/import/template', '_blank');
}

async function beforeUpload(file) {
  parsing.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.parseExcel(fd);
    if (res.ok) {
      parsedCases.value = res.data.cases;
      parseErrors.value = res.data.errors;
      parsedCases.value.forEach((c) => {
        const err = res.data.errors.find((e) => e.rowNo === c.rowNo);
        if (err) c._error = err.msg;
      });
      // 构建模块预览：自动匹配子模块
      const names = [...new Set(parsedCases.value.map((c) => c.suiteName).filter(Boolean))];
      modulePreview.value = names.map((name) => ({
        suiteName: name,
        exists: childSuites.value.includes(name),
      }));
      message.success(`解析完成，共 ${parsedCases.value.length} 条用例`);
    } else {
      message.error(res.msg || '解析失败');
    }
  } catch (e) {
    message.error(e.message || '解析失败');
  } finally {
    parsing.value = false;
  }
  return false;
}

async function runImport() {
  if (!assignee.value) {
    message.warning('请填写维护人ID');
    return;
  }
  if (parseErrors.value.length) {
    message.warning('存在校验错误，请先修正 Excel');
    return;
  }
  importing.value = true;
  try {
    const res = await api.runImport({
      libraryId: libraryId.value,
      assignee: assignee.value,
      cases: parsedCases.value,
      parentSuiteId: parentSuiteId.value,
    });
    if (res.ok) {
      importResult.value = res.data;
      resultOpen.value = true;
    } else {
      message.error(res.msg || '导入失败');
    }
  } catch (e) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function onFinish() {
  resultOpen.value = false;
  router.push(`/workspace/${libraryId.value}`);
}

onMounted(async () => {
  await loadTree();
  // 拉取用户列表供维护人选择
  try {
    const ur = await api.users();
    if (ur.ok && ur.data) {
      ur.data.forEach((u) => { userMap.value[u.id] = u.nickname; });
    }
  } catch (_) {}
});
</script>

<style scoped>
.import-page { height: 100%; background: #fff; display: flex; flex-direction: column; }
.ws-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  gap: 16px;
}
.ws-title { font-weight: 600; font-size: 16px; }
.import-body { flex: 1; padding: 16px; overflow: auto; }
.step-tip { color: #999; font-size: 12px; margin-top: 8px; }
</style>
