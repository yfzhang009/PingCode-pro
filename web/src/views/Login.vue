<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-header">
        <h1>PingCase</h1>
        <p>pingcode 用例增强编辑器</p>
      </div>
      <a-form :model="form" @finish="onLogin" layout="vertical">
        <a-form-item name="username" :rules="[{ required: true, message: '请输入账号' }]">
          <a-input v-model:value="form.username" size="large" placeholder="pingcode 账号">
            <template #prefix><UserOutlined /></template>
          </a-input>
        </a-form-item>
        <a-form-item name="password" :rules="[{ required: true, message: '请输入密码' }]">
          <a-input-password v-model:value="form.password" size="large" placeholder="pingcode 密码">
            <template #prefix><LockOutlined /></template>
          </a-input-password>
        </a-form-item>
        <a-button type="primary" html-type="submit" size="large" block :loading="loading">
          登录
        </a-button>
      </a-form>
      <div class="login-tip">使用你的 pingcode 账号登录，数据将实时同步到 pingcode</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue';
import { useUserStore } from '../store/user';

const router = useRouter();
const store = useUserStore();
const form = ref({ username: '', password: '' });
const loading = ref(false);

async function onLogin() {
  loading.value = true;
  try {
    const res = await store.login(form.value.username, form.value.password);
    if (res.ok) {
      message.success('登录成功');
      router.push('/');
    } else {
      message.error(res.msg || '登录失败');
    }
  } catch (e) {
    message.error(e.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-card {
  width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 40px 32px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}
.login-header {
  text-align: center;
  margin-bottom: 32px;
}
.login-header h1 {
  margin: 0;
  font-size: 28px;
  color: #1890ff;
}
.login-header p {
  margin: 8px 0 0;
  color: #999;
  font-size: 13px;
}
.login-tip {
  margin-top: 16px;
  text-align: center;
  color: #bbb;
  font-size: 12px;
}
</style>
