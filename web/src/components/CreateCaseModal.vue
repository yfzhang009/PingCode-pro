<template>
  <a-modal
    :open="open"
    title="新建用例"
    width="900px"
    :destroy-on-close="true"
    @update:open="onUpdateOpen"
    @ok="onSubmit"
    :confirm-loading="submitting"
    okText="保存到 pingcode"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="用例标题" required>
            <a-input v-model:value="form.title" placeholder="请输入用例标题" />
          </a-form-item>
        </a-col>
        <a-col :span="6">
          <a-form-item label="所属模块">
            <a-tree-select
              v-model:value="form.suiteId"
              :tree-data="suiteOptions"
              :field-names="{ value: 'id', label: 'name', children: 'children' }"
              allow-clear
              placeholder="选择模块（可不选）"
              tree-default-expand-all
            />
          </a-form-item>
        </a-col>
        <a-col :span="6">
          <a-form-item label="维护人" required>
            <a-input-number v-model:value="form.assignee" style="width:100%" placeholder="用户ID" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="前置条件">
            <a-textarea v-model:value="form.precondition" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="前置条件（选填）" />
          </a-form-item>
        </a-col>
        <a-col :span="4">
          <a-form-item label="重要程度">
            <a-select v-model:value="form.importantLevel" allow-clear placeholder="P0-P4">
              <a-select-option v-for="o in importantLevels" :key="o.id" :value="o.id">{{ o.text }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :span="4">
          <a-form-item label="测试类型">
            <a-select v-model:value="form.testType" allow-clear placeholder="手工/自动">
              <a-select-option :value="1">手工</a-select-option>
              <a-select-option :value="2">自动</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :span="4">
          <a-form-item label="优先级">
            <a-select v-model:value="form.priority" allow-clear placeholder="优先级">
              <a-select-option v-for="o in priorities" :key="o.id" :value="o.id">{{ o.text }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
      </a-row>
      <a-form-item label="用例步骤">
        <StepEditor v-model="form.steps" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { message } from 'ant-design-vue';
import StepEditor from './StepEditor.vue';
import { api } from '../api';

const props = defineProps({
  open: { type: Boolean, default: false },
  libraryId: { type: [Number, String], required: true },
  suiteTree: { type: Array, default: () => [] },
  defaultSuiteId: { type: [Number, String], default: null },
  defaultAssignee: { type: [Number, String], default: null },
});
const emit = defineEmits(['update:open', 'created']);

// 重要程度/优先级选项（从 pingcode 属性配置接口动态获取）
const importantLevels = ref([]);
const priorities = ref([]);

const suiteOptions = computed(() => props.suiteTree || []);

const form = ref({});

// 重置表单
function resetForm() {
  form.value = {
    title: '',
    suiteId: props.defaultSuiteId || null,
    assignee: props.defaultAssignee || null,
    precondition: '',
    importantLevel: null,
    testType: 1,
    priority: null,
    steps: [{ position: 1, description: '', expectedValue: '', isGroup: 0 }],
  };
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      resetForm();
      loadFormProperties();
    }
  }
);

async function loadFormProperties() {
  try {
    const res = await api.formProperties(props.libraryId);
    if (res.ok && res.data?.properties) {
      // 从属性配置中提取重要程度和优先级的选项
      const impProp = res.data.properties.find((p) => p.code === 'importantLevel');
      if (impProp?.options) importantLevels.value = impProp.options;
      const priProp = res.data.properties.find((p) => p.code === 'priority');
      if (priProp?.options) priorities.value = priProp.options;
    }
  } catch (e) {
    // 属性加载失败不阻塞创建
    console.warn('加载表单属性失败', e);
  }
}

function onUpdateOpen(v) {
  emit('update:open', v);
}

const submitting = ref(false);
async function onSubmit() {
  if (!form.value.title?.trim()) {
    message.warning('请输入用例标题');
    return;
  }
  if (!form.value.assignee) {
    message.warning('请输入维护人');
    return;
  }
  const steps = (form.value.steps || [])
    .filter((s) => s.description?.trim() || s.expectedValue?.trim())
    .map((s, i) => ({
      position: i + 1,
      description: s.description?.trim() || '',
      expectedValue: s.expectedValue?.trim() || '',
      isGroup: 0,
    }));
  if (steps.length === 0) {
    message.warning('请至少填写一个步骤');
    return;
  }
  submitting.value = true;
  try {
    const res = await api.createTestcase(props.libraryId, {
      title: form.value.title.trim(),
      suiteId: form.value.suiteId || null,
      assignee: Number(form.value.assignee),
      precondition: form.value.precondition || '',
      importantLevel: form.value.importantLevel || undefined,
      testType: form.value.testType || undefined,
      priority: form.value.priority || undefined,
      steps,
    });
    if (res.ok) {
      message.success('用例已保存到 pingcode');
      emit('created', res.data);
      emit('update:open', false);
    } else {
      message.error(res.msg || '保存失败');
    }
  } catch (e) {
    message.error(e.message || '保存失败');
  } finally {
    submitting.value = false;
  }
}
</script>
