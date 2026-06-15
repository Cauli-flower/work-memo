# 工作备忘

一个**纯本地、可安装**的工作备忘录小应用（PWA）。和「温度计 / 养生」项目**完全无关**，是独立项目。

## 功能
- **任务**：标题、负责人、截止日期（自动显示「还剩 X 天 / 今天到期 / 逾期 X 天」）、可自由编辑的备注、勾选完成。
- **速记**：随手记的文本便签，可编辑、可删除。
- **设置**：导出 / 导入备份（JSON）、清空数据。

## 数据
所有数据只存在本机浏览器的 `localStorage`，不上传任何服务器。
卸载应用或清除浏览器数据会丢失，建议定期在「设置」里导出备份。

## 使用 / 安装
直接用浏览器打开 `index.html` 即可使用。

要装成 App（离线可用、桌面/手机图标）需通过 `http(s)` 访问（Service Worker 不能在 `file://` 下运行）。本地起一个静态服务即可：

```bash
cd ~/工作备忘
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
# iPhone Safari → 分享 → 添加到主屏幕；Chrome → 安装应用
```

## 文件结构
```
index.html          页面骨架
app.css             样式（靛蓝主题）
js/store.js         本地数据层（localStorage）
js/app.js           页面逻辑（任务 / 速记 / 设置 / 编辑弹层）
js/icons.js         内联 SVG 图标
manifest.json       PWA 清单
service-worker.js   离线缓存
icons/              应用图标
make_icons.py       重新生成图标（需 Pillow）
```
