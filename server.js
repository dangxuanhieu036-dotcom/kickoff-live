// 旺季营销启动会 · 现场互动大屏服务
// 单文件服务：静态页面 + 提交接口 + SSE 实时推送 + 抽奖 + Excel 导出
const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');

// ---- 参数：支持 --port / --host 与 PORT/HOST 环境变量 ----
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const PORT = Number(argValue('--port') || process.env.PORT || 3000);
const HOST = argValue('--host') || process.env.HOST || '0.0.0.0';

const DATA_FILE = path.join(__dirname, 'data.json');

// ---- 数据存储（JSON 文件，重启不丢） ----
function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { entries: d.entries || [], winners: d.winners || [] };
  } catch {
    return { entries: [], winners: [] };
  }
}
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ entries, winners }, null, 2), 'utf8');
}
let { entries, winners } = loadData();

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 手机扫码进入的是提交表单；大屏页在 /screen
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/screen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));

// ---- SSE 实时推送 ----
const sseClients = new Set();
function broadcast(type, payload) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { /* ignore */ }
  }
}
app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});
// 心跳，防止代理断开
setInterval(() => broadcast('ping', { t: Date.now() }), 25000);

function publicState() {
  return {
    count: entries.length,
    totalTarget: entries.reduce((s, e) => s + e.target, 0),
    entries: entries.map((e) => ({ id: e.id, name: e.name, target: e.target })),
    winners: winners.map((w) => ({ id: w.id, name: w.name, target: w.target })),
  };
}
app.get('/api/state', (req, res) => res.json(publicState()));

// ---- 提交申报 ----
app.post('/api/submit', (req, res) => {
  const { name, workplace, sessions, target } = req.body || {};
  const t = Number(target);
  if (!name || !String(name).trim()) return res.status(400).json({ error: '请填写姓名' });
  if (!workplace || !String(workplace).trim()) return res.status(400).json({ error: '请填写职场' });
  if (!sessions || !String(sessions).trim()) return res.status(400).json({ error: '请填写计划参加平台场次' });
  if (!Number.isFinite(t) || t <= 0) return res.status(400).json({ error: '请填写有效的目标保费（万元）' });

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name).trim().slice(0, 30),
    workplace: String(workplace).trim().slice(0, 50),
    sessions: String(sessions).trim().slice(0, 20),
    target: Math.round(t * 100) / 100,
    ts: new Date().toISOString(),
  };
  entries.push(entry);
  saveData();
  broadcast('entry', { entry: { id: entry.id, name: entry.name, target: entry.target }, ...publicState() });
  res.json({ ok: true });
});

// ---- 抽奖：从尚未中奖的申报人中随机抽取 ----
app.post('/api/draw', (req, res) => {
  const wonIds = new Set(winners.map((w) => w.id));
  const pool = entries.filter((e) => !wonIds.has(e.id));
  if (pool.length === 0) return res.status(409).json({ error: '没有可抽取的申报人员' });
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const winner = { id: pick.id, name: pick.name, workplace: pick.workplace, sessions: pick.sessions, target: pick.target, ts: new Date().toISOString() };
  winners.push(winner);
  saveData();
  broadcast('winner', { winner: { id: winner.id, name: winner.name, target: winner.target }, winners: publicState().winners });
  res.json({ ok: true, winner: { name: winner.name } });
});

// ---- Excel 导出 ----
async function sendXlsx(res, filename, columns, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.columns = columns;
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  await wb.xlsx.write(res);
  res.end();
}
const fmtTime = (iso) => new Date(iso).toLocaleString('zh-CN', { hour12: false });

app.get('/api/export/declarations.xlsx', (req, res) =>
  sendXlsx(
    res,
    '目标申报名单.xlsx',
    [
      { header: '序号', key: 'i', width: 8 },
      { header: '姓名', key: 'name', width: 16 },
      { header: '职场', key: 'workplace', width: 24 },
      { header: '计划参加平台场次(10.10-10.20)', key: 'sessions', width: 30 },
      { header: '目标保费（万元）', key: 'target', width: 18 },
      { header: '提交时间', key: 'ts', width: 22 },
    ],
    entries.map((e, i) => ({ i: i + 1, name: e.name, workplace: e.workplace, sessions: e.sessions, target: e.target, ts: fmtTime(e.ts) }))
  ).catch((err) => res.status(500).json({ error: String(err) }))
);

app.get('/api/export/winners.xlsx', (req, res) =>
  sendXlsx(
    res,
    '中奖人员名单.xlsx',
    [
      { header: '序号', key: 'i', width: 8 },
      { header: '姓名', key: 'name', width: 16 },
      { header: '职场', key: 'workplace', width: 24 },
      { header: '目标保费（万元）', key: 'target', width: 18 },
      { header: '中奖时间', key: 'ts', width: 22 },
    ],
    winners.map((w, i) => ({ i: i + 1, name: w.name, workplace: w.workplace, target: w.target, ts: fmtTime(w.ts) }))
  ).catch((err) => res.status(500).json({ error: String(err) }))
);

// ---- 大屏二维码：指向提交表单 ----
app.get('/api/qr', async (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const dataUrl = await QRCode.toDataURL(origin + '/', { width: 640, margin: 2, color: { dark: '#0b3d2e', light: '#ffffff' } });
  res.json({ dataUrl, url: origin + '/' });
});

app.listen(PORT, HOST, () => {
  console.log(`启动会互动大屏已运行： http://localhost:${PORT}/screen （大屏）  http://localhost:${PORT}/ （手机表单）`);
});
