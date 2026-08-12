<template>
  <div class="analysis-page">
    <!-- 顶部 -->
    <div class="an-header">
      <a-button type="text" @click="$router.back()">
        <ArrowLeftOutlined /> 返回
      </a-button>
      <div class="an-title">缺陷质量分析 — {{ projectTitle }}</div>
    </div>

    <a-spin :spinning="loading">
      <!-- 总结卡片 -->
      <div class="summary-cards" v-if="!loading && bugs.length > 0">
        <div class="summary-card" v-for="s in summaryCards" :key="s.label">
          <div class="sc-num" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="sc-label">{{ s.label }}</div>
        </div>
      </div>

      <!-- 模板化总结 -->
      <div class="conclusion" v-if="!loading && bugs.length > 0">
        <div class="conclusion-title">分析结论</div>
        <div class="conclusion-text">{{ conclusionText }}</div>
      </div>

      <!-- 图表网格 -->
      <div class="chart-grid" v-if="!loading && bugs.length > 0">
        <div class="chart-box"><div class="chart-title">状态分布</div><div ref="chartState" class="chart"></div></div>
        <div class="chart-box"><div class="chart-title">优先级分布</div><div ref="chartPriority" class="chart"></div></div>
        <div class="chart-box"><div class="chart-title">严重程度分布</div><div ref="chartSeverity" class="chart"></div></div>
        <div class="chart-box"><div class="chart-title">创建趋势（近30天）</div><div ref="chartCreateTrend" class="chart"></div></div>
        <div class="chart-box"><div class="chart-title">关闭趋势（近30天）</div><div ref="chartCloseTrend" class="chart"></div></div>
        <div class="chart-box"><div class="chart-title">处理人 Top10</div><div ref="chartAssignee" class="chart"></div></div>
        <div class="chart-box"><div class="chart-title">创建人 Top10</div><div ref="chartCreator" class="chart"></div></div>
        <div class="chart-box"><div class="chart-title">缺陷收敛趋势（未关闭存量）</div><div ref="chartConvergence" class="chart"></div></div>
        <div class="chart-box full-width"><div class="chart-title">修复周期分布（天）</div><div ref="chartCycle" class="chart chart-tall"></div></div>
      </div>

      <a-empty v-if="!loading && bugs.length === 0" description="暂无缺陷数据" />
    </a-spin>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import * as echarts from 'echarts';
import { api } from '../api';
import dayjs from 'dayjs';

const route = useRoute();
const projectId = computed(() => Number(route.params.libraryId));
const projectTitle = ref('');
const loading = ref(false);

const bugs = ref([]);
const stateMap = ref({});
const userMap = ref({});

// 映射
const PRIORITY_MAP = {
  '1922881408940388354': '最高', '1922881408940388355': '较高',
  '1922881408940388356': '普通', '1922881408940388357': '较低', '1922881408940388358': '最低',
};
const SEVERITY_MAP = {
  '1922881408944582656': '严重', '1922881408944582657': '一般',
  '1922881408940388359': '致命', '1922881408944582658': '建议',
};
function pLabel(id) {
  const k = String(id || '');
  const legacy = { Urgent: '紧急', High: '高', Medium: '中', Low: '低' };
  return PRIORITY_MAP[k] || legacy[k] || k || '-';
}
function sLabel(id) {
  const k = String(id || '');
  const legacy = { Critical: '致命', Major: '严重', Moderate: '一般', Minor: '轻微' };
  return SEVERITY_MAP[k] || legacy[k] || k || '-';
}

function userName(id) { return userMap.value[id] || id || '-'; }

// ========= 数据加载 =========
onMounted(async () => {
  loading.value = true;
  try {
    // 项目标题
    const pres = await api.projects();
    if (pres.ok) {
      const p = pres.data.find(x => x.id === projectId.value);
      if (p) projectTitle.value = p.title || p.name || p.code;
    }
    // 状态映射
    try {
      const sr = await api.workItemStates('bug');
      if (sr.ok) sr.data.forEach(s => { stateMap.value[s.id] = s.name; });
    } catch (_) {}
    // 用户映射
    try {
      const ur = await api.users();
      if (ur.ok && ur.data) ur.data.forEach(u => { userMap.value[u.id] = u.nickname; });
    } catch (_) {}
    // 缺陷数据
    const res = await api.workItems({ projectId: projectId.value, pageNo: 1, pageSize: 10000 });
    if (res.ok) bugs.value = res.data?.list || [];
  } finally {
    loading.value = false;
    await nextTick();
    renderAllCharts();
  }
});

// ========= 图表演示 refs =========
const chartState = ref(null);
const chartPriority = ref(null);
const chartSeverity = ref(null);
const chartCreateTrend = ref(null);
const chartCloseTrend = ref(null);
const chartAssignee = ref(null);
const chartCreator = ref(null);
const chartConvergence = ref(null);
const chartCycle = ref(null);

const allCharts = [];

function makeChart(domRef) {
  if (!domRef.value) return null;
  const c = echarts.init(domRef.value);
  allCharts.push(c);
  return c;
}

function renderAllCharts() {
  if (bugs.value.length === 0) return;
  allCharts.forEach(c => c.dispose());
  allCharts.length = 0;

  renderStateChart();
  renderPriorityChart();
  renderSeverityChart();
  renderCreateTrendChart();
  renderCloseTrendChart();
  renderAssigneeChart();
  renderCreatorChart();
  renderConvergenceChart();
  renderCycleChart();
}

// ---- 状态分布 ----
function renderStateChart() {
  const map = {};
  bugs.value.forEach(b => {
    const name = stateMap.value[b.stateId] || '未知';
    map[name] = (map[name] || 0) + 1;
  });
  const data = Object.entries(map).sort((a,b) => b[1] - a[1]);
  const c = makeChart(chartState);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['40%','70%'],
      data: data.map(([name, value]) => ({ name, value })),
      label: { formatter: '{b}\n{d}%' },
    }],
  });
}

// ---- 优先级分布 ----
function renderPriorityChart() {
  const map = {};
  bugs.value.forEach(b => {
    const name = pLabel(b.priority);
    map[name] = (map[name] || 0) + 1;
  });
  const order = ['最高','较高','普通','较低','最低'];
  const data = order.filter(k => map[k]).map(k => ({ name: k, value: map[k] }));
  const colors = { 最高:'#cf1322', 较高:'#f5222d', 普通:'#fa8c16', 较低:'#1677ff', 最低:'#52c41a' };
  const c = makeChart(chartPriority);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: data.map(d => d.name) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: data.map(d => ({ value: d.value, itemStyle: { color: colors[d.name] || '#999' } })),
    }],
  });
}

// ---- 严重程度分布 ----
function renderSeverityChart() {
  const map = {};
  bugs.value.forEach(b => {
    const name = sLabel(b.severity);
    map[name] = (map[name] || 0) + 1;
  });
  const order = ['致命','严重','一般','建议'];
  const data = order.filter(k => map[k]).map(k => ({ name: k, value: map[k] }));
  const colors = { 致命:'#cf1322', 严重:'#f5222d', 一般:'#fa8c16', 建议:'#1677ff' };
  const c = makeChart(chartSeverity);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['40%','70%'],
      data: data.map(d => ({ name: d.name, value: d.value, itemStyle: { color: colors[d.name] } })),
      label: { formatter: '{b}\n{d}%' },
    }],
  });
}

// ---- 创建趋势（近30天）----
function renderCreateTrendChart() {
  const now = dayjs();
  const dates = [];
  for (let i = 29; i >= 0; i--) dates.push(now.subtract(i, 'day').format('MM-DD'));
  const counts = new Array(30).fill(0);
  bugs.value.forEach(b => {
    if (b.createTime?.date) {
      const d = dayjs(b.createTime.date).format('MM-DD');
      const idx = dates.indexOf(d);
      if (idx >= 0) counts[idx]++;
    }
  });
  const c = makeChart(chartCreateTrend);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'line', data: counts, smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#1677ff' } }],
  });
}

// ---- 关闭趋势（近30天）----
function renderCloseTrendChart() {
  const now = dayjs();
  const dates = [];
  for (let i = 29; i >= 0; i--) dates.push(now.subtract(i, 'day').format('MM-DD'));
  const counts = new Array(30).fill(0);
  bugs.value.forEach(b => {
    if (b.completedAt?.date) {
      const d = dayjs(b.completedAt.date).format('MM-DD');
      const idx = dates.indexOf(d);
      if (idx >= 0) counts[idx]++;
    }
  });
  const c = makeChart(chartCloseTrend);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'line', data: counts, smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#52c41a' } }],
  });
}

// ---- 处理人 Top10 ----
function renderAssigneeChart() {
  const map = {};
  bugs.value.forEach(b => {
    if (!b.assignee) return;
    const name = userName(b.assignee);
    map[name] = (map[name] || 0) + 1;
  });
  const data = Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, 10);
  const c = makeChart(chartAssignee);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.map(d => d[0]).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: data.map(d => d[1]).reverse(), itemStyle: { color: '#722ed1' } }],
  });
}

// ---- 创建人 Top10 ----
function renderCreatorChart() {
  const map = {};
  bugs.value.forEach(b => {
    const name = userName(b.creator);
    map[name] = (map[name] || 0) + 1;
  });
  const data = Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, 10);
  const c = makeChart(chartCreator);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.map(d => d[0]).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: data.map(d => d[1]).reverse(), itemStyle: { color: '#13c2c2' } }],
  });
}

// ---- 修复周期分布 ----
function renderCycleChart() {
  const ranges = ['<1天','1-3天','3-7天','7-14天','14-30天','>30天'];
  const buckets = new Array(ranges.length).fill(0);
  bugs.value.forEach(b => {
    if (!b.completedAt?.dateValue || !b.createTime?.dateValue) return;
    const days = Math.floor((b.completedAt.dateValue - b.createTime.dateValue) / 86400000);
    if (days < 1) buckets[0]++;
    else if (days <= 3) buckets[1]++;
    else if (days <= 7) buckets[2]++;
    else if (days <= 14) buckets[3]++;
    else if (days <= 30) buckets[4]++;
    else buckets[5]++;
  });
  const c = makeChart(chartCycle);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ranges },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: buckets.map((v, i) => {
        const colors = ['#52c41a','#73d13d','#fa8c16','#f5222d','#cf1322','#8c8c8c'];
        return { value: v, itemStyle: { color: colors[i] } };
      }),
    }],
  });
}

// ---- 缺陷收敛趋势（未关闭存量）----
// 每个时间点 = 截至该日累计创建 - 累计关闭，反映缺陷是否收敛
function renderConvergenceChart() {
  const now = dayjs();
  const dates = [];
  for (let i = 29; i >= 0; i--) dates.push(now.subtract(i, 'day').format('YYYY-MM-DD'));

  // 初始化存量 = 截至第一天前所有未关闭的缺陷
  const firstDay = dayjs(dates[0]).startOf('day');
  let backlog = bugs.value.filter(b => {
    if (!b.createTime?.dateValue) return false;
    if (b.createTime.dateValue >= firstDay.valueOf()) return false;
    // 在该日之前创建，且在该日之前未关闭
    if (b.completedAt?.dateValue && b.completedAt.dateValue < firstDay.valueOf()) return false;
    return true;
  }).length;

  const counts = [];
  dates.forEach(d => {
    const dayStart = dayjs(d).startOf('day').valueOf();
    const dayEnd = dayjs(d).endOf('day').valueOf();
    // 当天新创建
    const created = bugs.value.filter(b => {
      const t = b.createTime?.dateValue;
      return t && t >= dayStart && t <= dayEnd;
    }).length;
    // 当天关闭
    const closed = bugs.value.filter(b => {
      const t = b.completedAt?.dateValue;
      return t && t >= dayStart && t <= dayEnd;
    }).length;
    backlog += created - closed;
    counts.push(Math.max(0, backlog));
  });

  const c = makeChart(chartConvergence);
  if (!c) return;
  c.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: dates.map(d => dayjs(d).format('MM-DD')), axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'line',
      data: counts,
      smooth: true,
      areaStyle: { opacity: 0.15 },
      itemStyle: { color: '#fa8c16' },
      markLine: {
        silent: true,
        data: [{ type: 'average', name: '平均' }],
        lineStyle: { type: 'dashed', color: '#999' },
        label: { formatter: '平均 {c}' },
      },
    }],
  });
}

// ========= 总结卡片 =========
const summaryCards = computed(() => {
  const total = bugs.value.length;
  const closed = bugs.value.filter(b => b.completedAt?.dateValue).length;
  const fatal = bugs.value.filter(b => sLabel(b.severity) === '致命').length;
  const urgent = bugs.value.filter(b => pLabel(b.priority) === '最高' || pLabel(b.priority) === '较高').length;
  const cycleDays = bugs.value
    .filter(b => b.completedAt?.dateValue && b.createTime?.dateValue)
    .map(b => Math.ceil((b.completedAt.dateValue - b.createTime.dateValue) / 86400000));
  const avgCycle = cycleDays.length ? Math.round(cycleDays.reduce((a,b) => a + b, 0) / cycleDays.length) : '-';
  return [
    { label: '缺陷总数', value: total, color: '#1677ff' },
    { label: '已关闭', value: `${closed} (${total ? Math.round(closed/total*100) : 0}%)`, color: '#52c41a' },
    { label: '致命&高优', value: `${fatal} / ${urgent}`, color: '#f5222d' },
    { label: '平均修复周期', value: avgCycle === '-' ? '-' : `${avgCycle}天`, color: '#fa8c16' },
  ];
});

const conclusionText = computed(() => {
  const total = bugs.value.length;
  const closed = bugs.value.filter(b => b.completedAt?.dateValue).length;
  const closedPct = total ? Math.round(closed / total * 100) : 0;
  const fatal = bugs.value.filter(b => sLabel(b.severity) === '致命').length;
  const urgent = bugs.value.filter(b => pLabel(b.priority) === '最高' || pLabel(b.priority) === '较高').length;
  const unassigned = bugs.value.filter(b => !b.assignee).length;

  // 处理人 Top 3
  const assignMap = {};
  bugs.value.filter(b => b.assignee).forEach(b => {
    const n = userName(b.assignee);
    assignMap[n] = (assignMap[n] || 0) + 1;
  });
  const topAssign = Object.entries(assignMap).sort((a,b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

  // 创建人 Top 3
  const createMap = {};
  bugs.value.forEach(b => {
    const n = userName(b.creator);
    createMap[n] = (createMap[n] || 0) + 1;
  });
  const topCreate = Object.entries(createMap).sort((a,b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

  const cycleDays = bugs.value
    .filter(b => b.completedAt?.dateValue && b.createTime?.dateValue)
    .map(b => Math.ceil((b.completedAt.dateValue - b.createTime.dateValue) / 86400000));
  const avgCycle = cycleDays.length ? Math.round(cycleDays.reduce((a,b) => a + b, 0) / cycleDays.length) : null;

  const parts = [];
  parts.push(`该项目共 ${total} 条缺陷，已关闭 ${closed} 条，关闭率 ${closedPct}%。`);
  if (fatal > 0) parts.push(`致命缺陷 ${fatal} 条，需重点关注。`);
  if (urgent > 0) parts.push(`高优先级缺陷 ${urgent} 条。`);
  if (unassigned > 0) parts.push(`未分配处理人的缺陷 ${unassigned} 条。`);
  if (topAssign.length > 0) parts.push(`缺陷主要集中在处理人：${topAssign.join('、')}。`);
  if (topCreate.length > 0) parts.push(`提交最多的是：${topCreate.join('、')}。`);
  if (avgCycle !== null) parts.push(`平均修复周期约 ${avgCycle} 天。`);
  if (closedPct < 60) parts.push(`建议：关闭率偏低，需要加快缺陷修复和验证节奏。`);
  if (fatal > 3) parts.push(`建议：致命缺陷较多，建议组织专项攻坚。`);

  return parts.join('');
});

// ========= 窗口 resize =========
function onResize() { allCharts.forEach(c => c.resize()); }
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  allCharts.forEach(c => c.dispose());
});
</script>

<style scoped>
.analysis-page { height: 100%; display: flex; flex-direction: column; background: #f5f5f5; overflow: auto; }
.an-header { display: flex; align-items: center; padding: 12px 20px; background: #fff; border-bottom: 1px solid #e8e8e8; gap: 12px; flex-shrink: 0; }
.an-title { font-weight: 600; font-size: 18px; }
.summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px; }
.summary-card { background: #fff; border-radius: 8px; padding: 20px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.sc-num { font-size: 28px; font-weight: 700; line-height: 1.3; }
.sc-label { font-size: 13px; color: #999; margin-top: 4px; }
.conclusion { margin: 0 20px 20px; padding: 16px 20px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; }
.conclusion-title { font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #ad6800; }
.conclusion-text { font-size: 13px; color: #595959; line-height: 1.8; }
.chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 20px 24px; }
.chart-box { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.chart-box.full-width { grid-column: 1 / -1; }
.chart-title { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 10px; }
.chart { width: 100%; height: 260px; }
.chart-tall { height: 300px; }
</style>
