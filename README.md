# 旺季营销启动会 · 现场互动大屏

一次性轻量网页：大屏投影 + 手机扫码申报 + 实时同步 + 抽奖 + Excel 导出。

## 使用方式

- **大屏页（主持人投影）**：`/screen`
- **手机申报页（扫码进入）**：`/`
- 主持人控制条在大屏右下角（鼠标移过去显现）：抽奖、导出申报名单、导出中奖名单

## 本地运行

```bash
npm install
npm run dev          # 默认 3000 端口；npm run dev -- --port 8080 可换端口
```

## 部署到 Render（免费，约 3 分钟）

1. 打开 https://render.com ，用 GitHub 账号一键登录。
2. 右上角 **New + → Web Service**，选择本仓库。
3. 配置如下（其他保持默认）：
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: **Free**
4. 点 **Deploy Web Service**，等 1–2 分钟，得到公开网址 `https://xxx.onrender.com`。
5. 主持人电脑打开 `https://xxx.onrender.com/screen` 投影即可——页面上的二维码会自动指向公开网址，手机微信扫码直接申报。

> 注意：Render 免费实例闲置 15 分钟会休眠，首次打开需等约 30–60 秒唤醒。建议开会前 10 分钟主持人先打开一次大屏页，之后会议期间持续有人访问就不会休眠。
> Render 免费实例重启后 `data.json` 会被重置，对一次性会议无影响；中奖后及时点「导出中奖名单」留存。

## 修改活动标题

编辑 `public/config.js` 里的 `title` / `subtitle` 即可，两个页面同时生效。
