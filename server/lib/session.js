// 会话管理：将 pingcode token 持久化到本地文件，避免重启后需要重新登录
// 这是一个极简实现，适用于单用户/小团队内部工具场景
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', 'session.json');

// 读取持久化的会话
export function loadSession() {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 保存会话到磁盘
export function saveSession(session) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
}

// 清除会话
export function clearSession() {
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}

// 获取当前 token（优先内存，其次磁盘）
let memSession = loadSession();
export function getToken() {
  return memSession?.accessToken || null;
}
export function setSession(session) {
  memSession = session;
  saveSession(session);
}
export function getSessionUser() {
  return memSession?.user || null;
}
