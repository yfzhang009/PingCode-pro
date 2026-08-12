<template>
  <a-layout class="layout">
    <a-layout-header class="header">
      <div class="logo">PingCase</div>
      <div class="nav">
        <router-link to="/libraries">用例库</router-link>
        <router-link to="/defects">缺陷库</router-link>
        <a-button v-if="canViewPerm" type="link" size="small" class="perm-btn" @click="showPermModal = true"><SettingOutlined /> 权限配置</a-button>
      </div>
      <div class="user-area">
        <a-dropdown placement="bottomRight">
          <span class="user-trigger">
            <UserOutlined class="user-icon" />
            <span class="username">{{ store.user?.nickname || store.user?.name || '用户' }}</span>
            <DownOutlined class="arrow" />
          </span>
          <template #overlay>
            <a-menu>
              <a-menu-item key="logout" @click="onLogout">
                <LogoutOutlined /> 退出登录
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </a-layout-header>
    <a-layout-content class="content">
      <router-view />
    </a-layout-content>

    <!-- 权限配置弹窗 -->
    <a-modal v-model:open="showPermModal" title="高级功能权限配置" :footer="null" width="520px">
      <a-form layout="vertical">
        <a-form-item label="允许查看「缺陷看板」和「缺陷分析」的用户">
          <a-select v-model:value="permUsers" mode="tags" placeholder="输入用户昵称后回车添加" style="width:100%">
          </a-select>
        </a-form-item>
        <div style="margin-top:-8px;color:#999;font-size:12px">默认仅"张远帆"。留空则所有人都不可见。删除所有标签再添加新标签即可替换。</div>
        <a-form-item style="margin-top:16px;margin-bottom:0">
          <a-button type="primary" @click="savePerm">保存</a-button>
          <a-popconfirm title="确认恢复默认配置？" @confirm="resetPerm" ok-text="确认" cancel-text="取消">
            <a-button style="margin-left:8px">恢复默认</a-button>
          </a-popconfirm>
        </a-form-item>
      </a-form>
    </a-modal>
  </a-layout>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../store/user';
import { SettingOutlined, UserOutlined, DownOutlined, LogoutOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';

const router = useRouter();
const store = useUserStore();

function onLogout() {
  store.logout();
  router.push('/login');
}

// 权限配置
const showPermModal = ref(false);
const PERM_KEY = 'defect_advanced_perm_users';
const DEFAULT_PERM = JSON.stringify(['张远帆']);
function loadPermUsers() {
  try { return JSON.parse(localStorage.getItem(PERM_KEY) || DEFAULT_PERM); } catch { return ['张远帆']; }
}
const permUsers = ref(loadPermUsers());
// 张远帆始终可见，其它用户需在授权列表中
const canViewPerm = computed(() => {
  const nickname = store.user?.nickname || store.user?.name || '';
  return nickname === '张远帆' || loadPermUsers().includes(nickname);
});
function savePerm() {
  localStorage.setItem(PERM_KEY, JSON.stringify([...permUsers.value]));
  showPermModal.value = false;
  message.success('权限配置已保存');
}
function resetPerm() {
  permUsers.value = ['张远帆'];
  savePerm();
}
</script>

<style scoped>
.layout { height: 100vh; }
.header {
  display: flex;
  align-items: center;
  background: #001529;
  padding: 0 24px;
}
.logo {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin-right: 48px;
}
.nav { flex: 1; }
.nav a {
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  margin-right: 24px;
}
.nav a.router-link-active { color: #fff; }
.perm-btn { color: rgba(255, 255, 255, 0.65) !important; padding: 0; height: auto; font-size: 14px; vertical-align: baseline; }
.perm-btn:hover { color: #fff !important; }
.user-area {
  display: flex;
  align-items: center;
}
.user-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: background 0.2s;
  color: #fff;
}
.user-trigger:hover { background: rgba(255,255,255,0.15); }
.user-icon { font-size: 15px; }
.username { font-size: 14px; }
.arrow { font-size: 10px; opacity: 0.6; }
.content { overflow: auto; }
</style>
