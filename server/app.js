// 应用入口
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import importRouter from './routes/import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API 路由
app.use('/api', apiRouter);
app.use('/api/import', importRouter);

// 静态文件：生产环境直接托管前端构建产物
const webDist = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(webDist));
// SPA 回退
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next(); // 前端未构建时跳过
  });
});

app.listen(PORT, () => {
  console.log(`PingCase 服务已启动: http://localhost:${PORT}`);
  console.log(`前端开发模式: cd web && npm run dev`);
});
