# Win10 风格界面重设计

## 概述

将整个应用 UI 从 macOS 风格（左侧垂直任务栏、圆角毛玻璃窗口、暗色登录）改造为 Windows 10 风格（底部横向任务栏、直角白底窗口、锁屏风格登录）。

## 1. 登录界面 → Win10 锁屏风格

### 布局
- 全屏壁纸 background（不模糊）作为底图
- 半透明暗色遮罩覆盖
- 居中偏上：`HH:mm` 大号时间 + `YYYY年M月D日 dddd` 日期
- 点击任意处或按回车 → 登录表单从下方滑入
- 表单卡片：毛玻璃背景，包含应用标题 "mos"、三个输入框（Endpoint / Access Key / Secret Key）、"连接" 按钮

### 交互
- Framer Motion: 遮罩渐显 300ms，表单 slide-up + fade 300ms
- Secret Key 输入框右侧眼睛图标，点击切换 `type="password"` / `type="text"`
- 输入框 focus 态：蓝色下划线指示（`focus:border-b-blue-500`）
- 连接中：按钮显示 spinner + "验证中..."，禁用交互
- 错误：红色提示条从上方滑入

### 技术
- 移除所有 inline style，改用 Tailwind CSS 类
- 移除 onFocus/onBlur JS → `focus:` 变体
- `new Date()` + `setInterval(1s)` 驱动时钟

## 2. 任务栏 → Win10 底部风格

### 布局
- 底部横向，`h-12` (48px)，`w-full`
- 三区域 flex 布局：`justify-between`
- Acrylic 背景 (`rgba(30,30,30,0.85)` + `backdrop-filter: blur(20px)`)
- 顶部 1px `rgba(255,255,255,0.15)` border

### 左侧
- 开始按钮：四格方块 SVG 图标，悬停 `bg-white/10`
- 搜索图标（后续扩展）

### 中间
- 已打开应用横向排列，`gap-1`
- 每个应用：图标按钮 + 底部 3px 蓝色指示条（仅活跃窗口显示）
- 悬停 tooltip 显示应用名

### 右侧
- 时钟：`HH:mm` 格式，`text-xs`，`setInterval(1min)` 更新
- 用户按钮：人物图标 → 弹出菜单（切换账号 / 退出），菜单从右上方弹出
- 右下角 4px 宽竖条 → 显示桌面按钮

### 技术
- 重写 Taskbar.tsx，移除垂直布局逻辑
- 移除不再需要的 TaskIcon 类型（desktop, apps, file-tasks, notifications, settings）
- 保留 user icon，新增 start、search icon

## 3. 窗口外框 → Win10 风格

### 标题栏 (h-8, 32px)
- 背景：激活窗口 `#fff`，非激活窗口后续扩展
- 底部 1px `#e0e0e0` 边框
- 左侧：应用图标 (16px) + 标题文字 (`text-sm`, `text-gray-700`)
- 右侧：最小化 / 最大化 / 关闭 按钮组
  - 每个按钮 46px 宽，`h-full`
  - 悬停：`bg-gray-100`，关闭按钮悬停 `bg-red-500` (文字变白)
  - 图标：最小化 = 横线，最大化 = 方框，关闭 = X

### 窗口整体
- 直角（移除 `rounded-xl`）
- 1px `#c0c0c0` 边框
- 投影：`0 8px 32px rgba(0,0,0,0.18)`
- 内容区：白底
- 进场动画保持 `windowOpen` keyframes

### 技术
- 修改 Window.tsx
- 移除 macOS 红黄绿圆点
- 新增 Win10 风格按钮组

## 4. 布局变更

### App.tsx
- 当前：`flex` 横向，Taskbar 在左侧
- 改为：`flex-col` 纵向，Taskbar 在底部
- Desktop 在 Taskbar 上方，占据剩余空间

### 需要修改的文件
- `src/components/LoginScreen.tsx` — 重写
- `src/components/Taskbar.tsx` — 重写
- `src/components/Window.tsx` — 修改标题栏
- `src/App.tsx` — 调整 flex 方向
- `src/App.css` — 更新样式（可选）
