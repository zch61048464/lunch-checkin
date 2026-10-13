# 员工午餐打卡

iPad 上使用的员工午餐二维码登记工具。React + TypeScript + Vite + IndexedDB + PWA，无服务器、无云端，装好后可完全离线使用。

- **打卡页**：点"开始扫码"→摄像头连续识别→绿色提示 + "叮"；重复扫码显示"今日已登记"并播放不同提示音。
- **管理页**：员工管理（新增/修改/删除、生成并下载二维码图片）、每日名单、月度统计、撤销与补录、CSV 导出、JSON 备份与恢复。
- 同一员工同一天最多一笔记录，由 IndexedDB 的 `[employeeId, date]` 唯一索引保证。
- 二维码里只存员工内部 ID，所以**改名或改工号后，已打印的二维码仍然有效**。

扫码库：[jsQR](https://github.com/cozmo/jsQR) + 浏览器原生 `getUserMedia`（比依赖 BarcodeDetector 的方案更适合 iPad Safari）。

## 一、Windows 开发步骤

需要 Node.js 20 或更新版本（<https://nodejs.org>）。

```bash
npm install          # 安装依赖
npm run dev          # 开发服务器（http://localhost:5173）
npm run typecheck    # 类型检查
npm test             # 单元测试（数据库唯一约束、备份恢复、CSV 等）
npm run build        # 类型检查 + 生产构建，输出到 dist/
npm run preview      # 本地预览生产构建（含 Service Worker）
```

注意：摄像头和 Service Worker 只在 `https` 或 `localhost` 下可用。在 Windows 上用 `localhost` 可以正常测试；要用 iPad 直接连电脑测试需要 https，建议直接部署到 GitHub Pages 测试。

图标可用 `npm run icons` 重新生成（`public/` 下已有成品）。

## 二、部署到 GitHub Pages

1. 在 GitHub 新建仓库（例如 `lunch-checkin`），把本目录推上去：
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/lunch-checkin.git
   git push -u origin main
   ```
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 推送后到 **Actions** 页面等待 "Deploy to GitHub Pages" 变绿（约 1 分钟），地址是
   `https://<你的用户名>.github.io/lunch-checkin/`。

构建使用相对路径（`base: './'`），仓库叫什么名字都不用改配置。以后改了代码，`git push` 即自动重新部署。

## 三、iPad 安装与使用

1. 用 iPad 的 **Safari** 打开上面的网址（必须联网，必须是 Safari）。
2. 点分享按钮 → **添加到主屏幕** → 添加。以后从主屏幕图标打开。
3. 首次打开后保持联网等几秒，让离线缓存完成；之后断网也能用。建议装好后**关掉 Wi-Fi 打开一次**确认能进入。
4. 进入"打卡"页点 **开始扫码**，在弹窗中允许使用摄像头。
5. 在"管理"页添加员工，点"二维码"→"下载二维码图片"并打印发给员工。

### 使用提示

- **声音**：iPad 侧面静音开关请保持关闭并调高音量；程序用 `<audio>` 播放，通常不受静音拨片影响，但仍建议先点"测试提示音"确认。首次必须点过"开始扫码"后才会发声（iOS 限制）。
- **屏幕常亮**：扫码时程序会请求保持屏幕常亮；还可在 iPad「设置 → 显示与亮度 → 自动锁定」设为"永不"，并用引导式访问固定在本 App。
- **摄像头**：默认后置摄像头；若 iPad 立在台面上让员工对着前置摄像头扫，点"切换前/后摄像头"。二维码距离镜头约 10–25 cm，保持光线充足。
- **数据在哪**：全部保存在这台 iPad 的浏览器本地（IndexedDB）。**添加到主屏幕后数据更稳定**；删除主屏幕图标、清除 Safari 网站数据或重置 iPad 都会丢数据，所以请定期备份。
- **备份**："管理 → 导出与备份 → 下载备份文件"，文件进"文件"App 的下载目录；打开 Google Drive App → "+" → 上传，即可手动存到云端。也可点"分享 / 存到 Google Drive"。换设备或误操作后在同一页面选择备份文件恢复。
- **CSV**：带 UTF-8 BOM，Windows 中文/日文 Excel 双击即可正常显示。工号如 `001` 在 Excel 中可能被显示成 `1`，属于 Excel 的默认行为，数据本身没有问题。
- **更新程序**：有网络时打开 App 会自动下载新版本，关闭再打开一次即生效。数据不受影响。

## 目录结构

```
src/lib/db.ts        IndexedDB（员工、打卡、唯一索引、备份恢复）
src/lib/sound.ts     提示音（运行时合成 WAV，iOS 手势解锁）
src/lib/qr.ts        二维码内容与可打印图片
src/lib/csv.ts       CSV（BOM + CRLF）
src/pages/           打卡页、管理页
src/components/      员工 / 记录 / 导出 三个标签页
tests/               Vitest（fake-indexeddb）
```

## 已知限制

- 无法在没有真机的情况下验证 iPad 摄像头：已在桌面浏览器用模拟摄像头验证了扫码、重复识别和离线缓存，但请在真机上按上面的步骤完整走一遍。
- 管理页没有密码（按需求不做登录），谁拿到 iPad 谁就能改数据。
