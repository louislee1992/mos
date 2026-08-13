# 灯箱图片滚轮缩放与拖拽平移设计文档

日期：2026-08-13

## 背景

聊天图片灯箱（`ImageLightbox`，2026-08-13 已上线）当前只支持查看原图与关闭。用户需要：鼠标滚轮缩放（0.5x–5x，光标中心）、按住拖动平移图片。

## 交互决策（已与用户确认）

- 单击图片：无操作（`stopPropagation`，不冒泡关闭）
- 关闭方式：点遮罩 / 点 × 按钮 / ESC（与现状一致）
- 缩放范围 0.5x–5x，以鼠标光标位置为中心
- 拖拽平移仅在 `scale > 1` 时生效

## 设计

### 实现方式

原生 Pointer Events + React state 控制 `transform: translate(x, y) scale(s)`。不用 framer-motion 的 drag（光标中心缩放数学与 click 冒泡控制更直观），零新增依赖。

### 修改文件

- `mos-ui/src/components/ImageLightbox.tsx`（主要改动）
- `mos-ui/src/index.css`（光标样式）
- `ChatView.tsx` 不改动

### ImageLightbox 结构调整

现状：framer-motion 入场动画（scale 0.9→1）直接写在 `motion.img` 上，会与交互 transform 冲突。

新结构：

```
motion.div.image-lightbox-overlay  ← 遮罩淡入淡出；onClick 关闭；挂原生 wheel 监听
├── button.image-lightbox-close    ← × 关闭
└── motion.div                     ← 入场/出场动画（scale 0.9→1 + opacity）
    └── img.image-lightbox-img     ← 纯 img；交互 transform；draggable={false}
```

### 交互实现

**滚轮缩放（光标中心）**
- `useEffect` 在 overlay 上挂原生 `wheel` 监听（`{ passive: false }`）— React 的 onWheel 是 passive，无法 preventDefault（否则背后消息列表会滚动）
- `deltaY < 0` 放大 ×1.1，否则缩小 ÷1.1，clamp 到 [0.5, 5]
- 数学：光标下图像点不动。`imagePoint = (cursor - imageCenter - pos) / scale`，缩放后 `pos' = cursor - imageCenter - imagePoint * scale'`（坐标以视口为基准）

**拖拽平移**
- img 上 `pointerdown` → `setPointerCapture`，记录起点与 pos 起点
- `pointermove`（仅 `scale > 1`）→ `pos = 起点 + 位移`；`pointerup`/`pointercancel` 释放
- `draggable={false}` 防止浏览器原生图片拖拽
- img `onClick={e => e.stopPropagation()}` — 单击图片不冒泡到遮罩，不关闭

**状态**
- `scale: number`（初始 1）、`pos: {x, y}`（初始 {0,0}）
- 关闭即卸载，状态自然重置，重开为 1x 居中

### CSS（index.css 追加/修改）

```css
.image-lightbox-img { cursor: grab; user-select: none; }
.image-lightbox-img:active { cursor: grabbing; }
```

### 不改动

- 后端、ChatView、消息数据结构
- ESC/遮罩/× 关闭逻辑

## 验证

- `npm run lint` + `npm run build` 通过
- 用户人工验证：滚轮缩放（光标中心、范围 0.5x–5x）、放大后拖动平移、单击图片不关闭、点遮罩/×/ESC 关闭、关闭重开复位 1x 居中、背后聊天列表不随滚轮滚动
