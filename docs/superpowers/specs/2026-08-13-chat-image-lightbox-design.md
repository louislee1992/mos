# 聊天图片点击查看大图（ImageLightbox）设计文档

日期：2026-08-13

## 背景

聊天界面中，用户发送的图片（截图消息，`type === 'image'`）以缩略图形式展示（`.message-image`，`ChatView.tsx:99`），CSS 已设置 `cursor: pointer` 但点击无任何效果。需要实现点击图片查看大图。

用户最初建议使用 v-viewer 插件，但 v-viewer 是 Vue.js 插件，本项目前端为 React 19 + Vite，无法使用。经确认采用自研轻量灯箱方案，零新增依赖。

## 功能范围

- 仅针对 `type === 'image'` 的消息图片（`.message-image`）
- 文件消息（`type === 'file'`）不在本次范围内
- 点击缩略图 → 全屏灯箱显示原图（复用消息内容中已有的 MinIO 预签名 URL，无后端改动）

## 设计

### 新增组件 `mos-ui/src/components/ImageLightbox.tsx`

- Props: `src: string; onClose: () => void`
- 使用 framer-motion（项目已有依赖）的 `AnimatePresence` + `motion.div` 做遮罩与图片的淡入淡出动画
- 遮罩：`position: fixed; inset: 0`、半透明黑背景、高 z-index（高于聊天窗口，如 9999）
- 图片：居中显示，`max-width: 90vw; max-height: 90vh; object-fit: contain`
- 关闭交互：
  - 点击遮罩（图片以外的区域）关闭
  - 点击图片本身关闭
  - 按 ESC 关闭（`useEffect` 注册 `keydown` 监听，卸载时清理）
- 右上角关闭按钮（×），便于触屏/无键盘用户

### 修改 `mos-ui/src/components/ChatView.tsx`

- 新增 state：`const [viewImage, setViewImage] = useState<string | null>(null)`
- 第 99 行图片渲染加 `onClick={() => setViewImage(msg.content)}`
- 在组件根节点末尾（消息列表之后、与现有 `showAddMembers` 弹窗平级）用 `AnimatePresence` 包裹条件渲染（保证退出动画可播放）：

```tsx
<AnimatePresence>
  {viewImage && <ImageLightbox src={viewImage} onClose={() => setViewImage(null)} />}
</AnimatePresence>
```

- `ImageLightbox` 根节点为 `motion.div`，带 `initial/animate/exit` 动画属性；进入动画由 initial→animate 完成，退出动画由 AnimatePresence 驱动

### 修改 `mos-ui/src/index.css`

- 新增样式：`.image-lightbox-overlay`、`.image-lightbox-img`、`.image-lightbox-close`
- 复用现有设计变量（`--bg-modal`、`--text-primary` 等）保持暗色主题一致
- 遮罩背景：`rgba(0, 0, 0, 0.75)`

### 不改动

- 后端（图片 URL 已可用）
- 消息数据结构
- 其他消息类型渲染逻辑

## 验证

- 启动前后端，两个账号互发截图消息
- 点击图片 → 灯箱打开、图片按原始比例放大显示
- ESC / 点击遮罩 / 点击图片 / 点击 × 按钮均能关闭
- 确认聊天其他功能（文本、文件、表情发送）无回归
