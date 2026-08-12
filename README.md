# PingCase - PingCode 用例增强编辑器

基于 Vue 3 + Express 的 PingCode 用例管理增强平台，支持测试用例编辑、测试计划执行、缺陷管理、数据分析等功能。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Vue 3 + Composition API | ^3.5 |
| 构建工具 | Vite | ^8.2 |
| UI 组件库 | Ant Design Vue | ^4.2 |
| 状态管理 | Pinia | ^4.0 |
| 路由 | Vue Router (Hash 模式) | ^4.6 |
| 图表 | ECharts | ^6.1 |
| 富文本编辑器 | Quill + vue-quill | ^1.3 / ^1.5 |
| 后端框架 | Express | ^4.21 |
| HTTP 客户端 | Axios | ^1.19 |
| 文件导入 | xlsx + multer | ^0.18 / ^1.4 |

## 项目结构

```
pingcode/
├── server/                       # 后端 (Express 代理层)
│   ├── app.js                    # 入口：端口 3000，挂载路由
│   ├── routes/
│   │   ├── api.js                # 所有业务 API 路由 + 登录认证
│   │   └── import.js             # Excel 导入相关路由
│   ├── lib/
│   │   ├── pingcode-client.js    # PingCode 远程 API 客户端（芋道框架规范）
│   │   └── session.js            # Token 持久化（文件 + 内存）
│   └── session.json              # Session 持久化文件（已 gitignore）
│
├── web/                          # 前端 (Vue 3 SPA)
│   ├── vite.config.js            # Vite 配置，代理 /api → localhost:3000
│   └── src/
│       ├── main.js               # 应用入口
│       ├── App.vue               # 根组件
│       ├── api/index.js          # Axios 实例 + 所有 API 封装
│       ├── router/index.js       # 路由配置 + 认证守卫 + 权限控制
│       ├── store/user.js         # Pinia 用户状态管理
│       ├── components/
│       │   ├── CreateCaseModal.vue
│       │   └── StepEditor.vue
│       └── views/
│           ├── Login.vue          # 登录页
│           ├── Layout.vue         # 主布局（导航栏 + 权限配置）
│           ├── Libraries.vue      # 测试库列表
│           ├── Workspace.vue      # 用例工作区（编辑、拖拽排序）
│           ├── PlanWorkspace.vue  # 测试计划执行（进度条、状态管理）
│           ├── Import.vue         # Excel 导入
│           ├── Defects.vue        # 缺陷列表（入口页）
│           ├── PlanDefects.vue    # 计划缺陷管理
│           ├── ProjectDefects.vue # 项目缺陷管理 + 看板
│           └── DefectAnalysis.vue # 缺陷分析（ECharts 多维度统计）
└── README.md
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
# 后端
cd server
npm install

# 前端
cd ../web
npm install
```

### 启动开发服务

```bash
# 终端 1：启动后端 (端口 3000)
cd server
npm run dev

# 终端 2：启动前端 (端口 5173)
cd web
npm run dev
```

浏览器访问 `http://localhost:5173`，使用 PingCode 账号登录。

### 生产构建

```bash
cd web
npm run build

cd ../server
npm start
```

后端会自动托管 `web/dist` 目录，访问 `http://localhost:3000` 即可。

## 功能模块

### 1. 认证
- 使用 PingCode 账号登录，Session 持久化到文件，重启不丢失
- 路由守卫：未登录跳转登录页

### 2. 测试用例管理
- **用例工作区**：左侧模块树 + 右侧用例列表，支持编辑、拖拽排序
- **用例详情**：查看步骤、前置条件、描述，支持富文本编辑
- **Excel 导入**：按模板批量导入用例

### 3. 测试计划执行
- 按测试计划查看用例，筛选执行状态
- **执行进度条**：顶部展示通过/受阻/失败/跳过/未执行的比例
- **执行状态标签**：带颜色标识（绿色通过、黄色受阻、红色失败），点击切换状态
- 用例详情弹窗内直接选择执行结果
- **一键全选** + 跨页勾选 + 批量执行

### 4. 缺陷管理
- 缺陷列表、筛选（状态/优先级/严重程度/处理人/日期）、保存筛选条件
- 缺陷详情抽屉：查看、编辑、评论、附件
- **缺陷看板**：按状态/优先级/严重程度统计的 Dashboard
- **缺陷分析**：ECharts 多维度统计图表（状态分布、趋势、处理人 Top10 等），模板化总结
- 权限管控：高级功能可自定义可访问用户

## 架构说明

### 数据流

```
[浏览器 Vue SPA]
    │  POST /api/login  /api/work-items  /api/testcases ...
    ▼
[Express 代理层 (localhost:3000)]
    │  注入 Authorization Bearer Token + tenant-id + principalId
    ▼
[PingCode 后端 (39.100.83.141:81/admin-api)]
```

### 认证机制

- 登录时调用 PingCode 的 `/system/auth/login`，获取 token
- Token + 用户信息持久化到 `server/session.json`
- 后续请求通过 `requireAuth` 中间件自动注入 Authorization header
- 前端 axios 拦截器在 401 时自动跳转登录页

### 权限控制

缺陷看板和缺陷分析支持自定义权限：
- 顶部导航栏"权限配置"入口（仅对有权限的用户显示）
- 配置存储于 `localStorage`，默认仅 `张远帆` 可访问
- 无权限用户不显示相关 tab 和页面入口

## API 路由列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录 |
| POST | `/api/logout` | 登出 |
| GET | `/api/me` | 当前用户信息 |
| GET | `/api/libraries` | 测试库列表 |
| GET | `/api/projects` | 项目列表 |
| GET | `/api/suites` | 模块树 |
| GET/POST/PUT | `/api/testcases` | 用例 CRUD |
| GET/POST | `/api/plans` | 测试计划 |
| GET | `/api/work-items` | 缺陷列表 |
| GET | `/api/work-items/:id` | 缺陷详情 |
| PUT | `/api/work-items/:id` | 更新缺陷 |
| POST | `/api/work-items` | 创建缺陷 |
| GET | `/api/work-items/:id/comments` | 缺陷评论 |
| POST | `/api/work-items/:id/comments` | 添加评论 |
| ... | ... | 更多接口 |

## License

Private
