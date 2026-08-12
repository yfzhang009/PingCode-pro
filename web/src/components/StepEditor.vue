<template>
  <div class="step-editor">
    <div class="step-header">
      <span class="step-title">用例步骤</span>
      <a-button size="small" type="primary" ghost @click="addStep">
        <PlusOutlined /> 添加步骤
      </a-button>
    </div>
    <table class="step-table">
      <thead>
        <tr>
          <th class="col-no">#</th>
          <th>步骤描述</th>
          <th>预期结果</th>
          <th class="col-op">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(step, idx) in steps" :key="idx">
          <td class="col-no">{{ idx + 1 }}</td>
          <td>
            <a-textarea
              v-model:value="step.description"
              :auto-size="{ minRows: 1, maxRows: 4 }"
              placeholder="步骤描述（Enter 换行不保存，点击下方+添加新步骤）"
              @pressEnter="onEnter($event, idx)"
            />
          </td>
          <td>
            <a-textarea
              v-model:value="step.expectedValue"
              :auto-size="{ minRows: 1, maxRows: 4 }"
              placeholder="预期结果"
              @pressEnter="onEnter($event, idx)"
            />
          </td>
          <td class="col-op">
            <a-button type="text" size="small" @click="moveUp(idx)" :disabled="idx === 0">
              <ArrowUpOutlined />
            </a-button>
            <a-button type="text" size="small" @click="moveDown(idx)" :disabled="idx === steps.length - 1">
              <ArrowDownOutlined />
            </a-button>
            <a-button type="text" size="small" danger @click="remove(idx)" :disabled="steps.length === 1">
              <DeleteOutlined />
            </a-button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { watch } from 'vue';
import { PlusOutlined, ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined } from '@ant-design/icons-vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);

// 内部 steps 直接引用 modelValue，保持双向同步
const steps = props.modelValue;

watch(
  () => props.modelValue,
  (v) => {
    if (!v || v.length === 0) {
      emit('update:modelValue', [newStep()]);
    }
  },
  { immediate: true }
);

function newStep() {
  return { position: 0, description: '', expectedValue: '', isGroup: 0 };
}

function addStep() {
  steps.push({ ...newStep(), position: steps.length + 1 });
  reindex();
}

function onEnter(e, idx) {
  // 在当前行下方插入新行，提升录入效率
  e.preventDefault();
  steps.splice(idx + 1, 0, { ...newStep() });
  reindex();
}

function remove(idx) {
  steps.splice(idx, 1);
  if (steps.length === 0) steps.push(newStep());
  reindex();
}

function moveUp(idx) {
  if (idx === 0) return;
  [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
  reindex();
}

function moveDown(idx) {
  if (idx === steps.length - 1) return;
  [steps[idx + 1], steps[idx]] = [steps[idx], steps[idx + 1]];
  reindex();
}

function reindex() {
  steps.forEach((s, i) => (s.position = i + 1));
}
</script>

<style scoped>
.step-editor { border: 1px solid #f0f0f0; border-radius: 6px; overflow: hidden; }
.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}
.step-title { font-weight: 600; }
.step-table { width: 100%; border-collapse: collapse; }
.step-table th {
  text-align: left;
  padding: 8px 12px;
  background: #fafafa;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #f0f0f0;
}
.step-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #f5f5f5;
  vertical-align: top;
}
.col-no { width: 40px; text-align: center; color: #999; }
.col-op { width: 120px; white-space: nowrap; }
.col-op :deep(.ant-btn) { padding: 2px 6px; }
</style>
