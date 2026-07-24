# Win10 风格界面重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将应用 UI 从 macOS 风格改造为 Windows 10 风格：锁屏登录界面、底部横向任务栏、Win10 直角白底窗口。

**Architecture:** 四个文件按依赖顺序修改——先改独立的 LoginScreen 和 Window，再改 Taskbar，最后调整 App.tsx 布局方向。所有组件使用 Tailwind CSS 类替代 inline style。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Framer Motion, Tauri 2

## Global Constraints

- 所有 inline style 迁移到 Tailwind CSS 类
- 移除 JS onFocus/onBlur 事件，用 CSS `focus:` 变体
- 保持现有 Tauri `invoke('verify_credentials')` 调用流程不变
- 保持现有 App.tsx 的状态管理逻辑不变

---

### Task 1: 重写 LoginScreen.tsx — Win10 锁屏风格

**Files:**
- Modify: `src/components/LoginScreen.tsx` (full rewrite)

**Interfaces:**
- Produces: `LoginScreen` FC, props `{ onLoginSuccess: () => void }` (unchanged from current)

- [ ] **Step 1: 替换 LoginScreen.tsx 完整内容**

```tsx
import { type FC, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

function getTimeString(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function getDateString(): string {
  const now = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

const LoginScreen: FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [showForm, setShowForm] = useState(false);
  const [timeStr, setTimeStr] = useState(getTimeString);
  const [dateStr] = useState(getDateString);
  const [endpoint, setEndpoint] = useState('http://');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTimeStr(getTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showForm && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setShowForm(true);
      }
      if (showForm && e.key === 'Escape') {
        setShowForm(false);
        setError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForm]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('verify_credentials', {
          endpoint: endpoint.trim(),
          accessKey: accessKey.trim(),
          secretKey: secretKey.trim(),
        });
        onLoginSuccess();
      } catch (err) {
        setError(typeof err === 'string' ? err : '连接失败，请检查凭证和地址');
      } finally {
        setLoading(false);
      }
    },
    [endpoint, accessKey, secretKey, onLoginSuccess],
  );

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      onClick={() => !showForm && setShowForm(true)}
    >
      {/* 锁屏层：时间 + 日期 */}
      <AnimatePresence>
        {!showForm && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30, transition: { duration: 0.3 } }}
          >
            <h1 className="text-[80px] font-light text-white tracking-tight leading-none mb-1">
              {timeStr}
            </h1>
            <p className="text-white/70 text-lg">{dateStr}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 登录表单层 */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex flex-col gap-5 p-10 rounded-xl w-[400px]"
              style={{
                background: 'rgba(22,22,42,0.9)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              }}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* 头像 */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20">
                  <svg viewBox="0 0 24 24" fill="none" width="40" height="40">
                    <circle cx="12" cy="9" r="4" stroke="white" strokeWidth="1.5" fill="none" />
                    <path d="M4 21C4 17 7.5 14.5 12 14.5C16.5 14.5 20 17 20 21"
                      stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white">mos</h2>
              </div>

              {/* 表单 */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:9000"
                  className="w-full px-3 py-2.5 rounded-md text-sm text-white outline-none bg-white/8
                             border border-white/10 focus:border-blue-400/60 focus:bg-white/12 transition-colors"
                />
                <input
                  type="text"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Access Key"
                  className="w-full px-3 py-2.5 rounded-md text-sm text-white outline-none bg-white/8
                             border border-white/10 focus:border-blue-400/60 focus:bg-white/12 transition-colors"
                />
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Secret Key"
                    className="w-full px-3 py-2.5 pr-10 rounded-md text-sm text-white outline-none bg-white/8
                               border border-white/10 focus:border-blue-400/60 focus:bg-white/12 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white/80 transition-colors"
                    tabIndex={-1}
                  >
                    {showSecret ? (
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 4C5 4 1.5 10 1.5 10S5 16 10 16s8.5-6 8.5-6S15 4 10 4Z" />
                        <circle cx="10" cy="10" r="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 4C5 4 1.5 10 1.5 10S5 16 10 16s8.5-6 8.5-6S15 4 10 4Z" />
                        <circle cx="10" cy="10" r="3" />
                        <line x1="3" y1="3" x2="17" y2="17" />
                      </svg>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      className="text-sm px-3 py-2 rounded-md bg-red-500/15 border border-red-400/25 text-red-300"
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 py-2.5 rounded-md text-sm font-medium text-white
                             bg-gradient-to-br from-blue-500 to-purple-500
                             hover:from-blue-400 hover:to-purple-400
                             disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading && (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                  {loading ? '验证中...' : '连接'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoginScreen;
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginScreen.tsx
git commit -m "refactor: rewrite LoginScreen in Win10 lock screen style"
```

---

### Task 2: 修改 Window.tsx — Win10 风格标题栏

**Files:**
- Modify: `src/components/Window.tsx`

**Interfaces:**
- Consumes: `DesktopApp` from `../data/apps` (unchanged)
- Produces: `Window` FC, props `{ app: DesktopApp; onClose: () => void; onFocus: () => void; zIndex: number }` (unchanged)

- [ ] **Step 1: 修改窗口容器和标题栏样式**

将文件内容替换为 Win10 风格版本：

```tsx
import { type FC, useRef, useState, useCallback, useEffect } from 'react';
import type { DesktopApp } from '../data/apps';

interface WindowProps {
  app: DesktopApp;
  onClose: () => void;
  onFocus: () => void;
  zIndex: number;
}

const Window: FC<WindowProps> = ({ app, onClose, onFocus, zIndex }) => {
  const [pos, setPos] = useState(() => ({
    x: 120 + Math.random() * 200,
    y: 60 + Math.random() * 150,
  }));

  const [size] = useState({
    width: app.defaultWidth,
    height: app.defaultHeight,
  });

  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onFocus();
      setDragging(true);
      dragOffset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    },
    [onFocus, pos],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const maxX = window.innerWidth - size.width;
  const maxY = window.innerHeight - size.height;
  const clampedX = Math.max(0, Math.min(pos.x, maxX));
  const clampedY = Math.max(0, Math.min(pos.y, maxY));

  return (
    <div
      ref={windowRef}
      className="window-enter fixed overflow-hidden flex flex-col"
      style={{
        left: clampedX,
        top: clampedY,
        width: size.width,
        height: size.height,
        zIndex,
        background: '#fff',
        border: '1px solid #b0b0b0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}
      onMouseDown={onFocus}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center h-8 flex-shrink-0 select-none"
        style={{
          background: '#fff',
          borderBottom: '1px solid #e0e0e0',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* 图标 + 标题 */}
        <div className="flex items-center gap-1.5 px-2 min-w-0">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <rect x="2" y="2.5" width="5" height="5" rx="1" fill="#0078D4" />
            <rect x="9" y="2.5" width="5" height="5" rx="1" fill="#0078D4" />
            <rect x="2" y="9.5" width="5" height="5" rx="1" fill="#0078D4" />
            <rect x="9" y="9.5" width="5" height="5" rx="1" fill="#0078D4" />
          </svg>
          <span className="text-sm text-gray-700 truncate">{app.title}</span>
        </div>

        {/* 右侧窗口控制按钮 */}
        <div className="flex items-center ml-auto">
          <button
            className="w-[46px] h-full flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
            title="最小化"
          >
            <svg viewBox="0 0 10 10" width="10" height="10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="#333" strokeWidth="1" />
            </svg>
          </button>
          <button
            className="w-[46px] h-full flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
            title="最大化"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
              <rect x="1.5" y="1.5" width="7" height="7" stroke="#333" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-[46px] h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
            title="关闭"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4 text-gray-700 text-sm bg-white">
        <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
          <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="10" width="48" height="40" rx="4" stroke="#333" strokeWidth="1.5" fill="none" />
          </svg>
          <span>{app.title} - 内容区域</span>
        </div>
      </div>
    </div>
  );
};

export default Window;
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/components/Window.tsx
git commit -m "refactor: restyle Window titlebar to Win10 look"
```

---

### Task 3: 重写 Taskbar.tsx — Win10 底部横向任务栏

**Files:**
- Modify: `src/components/Taskbar.tsx` (full rewrite)

**Interfaces:**
- Produces: `Taskbar` FC, props unchanged from current App.tsx usage (same callbacks, same shape)

- [ ] **Step 1: 替换 Taskbar.tsx 完整内容**

```tsx
import { type FC, useState, useRef, useEffect } from 'react';

interface TaskbarApp {
  id: string;
  name: string;
  icon: string;
}

interface TaskbarProps {
  openApps: TaskbarApp[];
  activeAppId: string | null;
  onFocusApp: (id: string) => void;
  onCloseApp: (id: string) => void;
  onShowDesktop: () => void;
  onLogout: () => void;
  onExit: () => void;
}

const AppIcon: FC<{ type: string; size?: number }> = ({ type, size = 22 }) => {
  switch (type) {
    case 'file-manager':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path d="M3 7C3 5.9 3.9 5 5 5H9.5L11.5 7H19C20.1 7 21 7.9 21 9V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z"
            fill="#F7C948" />
        </svg>
      );
    case 'recycle-bin':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <path d="M4 6H20L18.5 20C18.4 21 17.5 22 16.5 22H7.5C6.5 22 5.6 21 5.5 20L4 6Z"
            stroke="#8899AA" strokeWidth="1.5" fill="none" />
          <line x1="8" y1="6" x2="16" y2="6" stroke="#778899" strokeWidth="1.2" />
          <path d="M9 3H15L16 6H8L9 3Z" fill="#99AABB" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <rect x="4" y="5" width="16" height="14" rx="2" stroke="white" strokeWidth="1.5" fill="none" opacity="0.8" />
        </svg>
      );
  }
};

function getTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

const Taskbar: FC<TaskbarProps> = ({
  openApps,
  activeAppId,
  onFocusApp,
  onCloseApp,
  onShowDesktop,
  onLogout,
  onExit,
}) => {
  const [timeStr, setTimeStr] = useState(getTimeString);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setTimeStr(getTimeString()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const taskbarBg = 'rgba(30,30,30,0.88)';

  return (
    <div
      className="h-12 w-full flex items-center flex-shrink-0 z-[100] select-none"
      style={{
        background: taskbarBg,
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      {/* ======== 左侧：开始 + 搜索 ======== */}
      <div className="flex items-center h-full">
        <button
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
          title="开始"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <rect x="1" y="1.5" width="6" height="6" rx="0.5" fill="white" opacity="0.9" />
            <rect x="9" y="1.5" width="6" height="6" rx="0.5" fill="white" opacity="0.9" />
            <rect x="1" y="9.5" width="6" height="6" rx="0.5" fill="white" opacity="0.9" />
            <rect x="9" y="9.5" width="6" height="6" rx="0.5" fill="white" opacity="0.9" />
          </svg>
        </button>
        <button
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
          title="搜索"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="white" strokeWidth="1.2" opacity="0.8" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          </svg>
        </button>
      </div>

      {/* ======== 中间：运行中的应用 ======== */}
      <div className="flex-1 flex items-center justify-center gap-0.5 h-full px-2">
        {openApps.map((app) => {
          const isActive = activeAppId === app.id;
          return (
            <button
              key={app.id}
              onClick={() => onFocusApp(app.id)}
              className="relative w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
              title={app.name}
              style={{
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
              }}
            >
              <AppIcon type={app.icon} size={20} />
              {isActive && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full"
                  style={{ width: 24, height: 3, background: '#60A5FA' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ======== 右侧：时钟 + 用户 + 显示桌面 ======== */}
      <div className="flex items-center h-full">
        {/* 时钟 */}
        <div className="text-white/70 text-xs px-2 text-center leading-tight">
          {timeStr}
        </div>

        {/* 用户菜单 */}
        <div className="relative h-full" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
            title="用户"
            style={{ background: menuOpen ? 'rgba(255,255,255,0.12)' : 'transparent' }}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <circle cx="8" cy="5.5" r="3" stroke="white" strokeWidth="1.2" fill="none" opacity="0.8" />
              <path d="M2 14C2 10.5 4.5 9 8 9C11.5 9 14 10.5 14 14"
                stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.8" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 bottom-full mb-2 py-1.5 w-36 rounded-lg z-[200]"
              style={{
                background: 'rgba(22,22,32,0.96)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <button
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                切换账号
              </button>
              <button
                onClick={() => { setMenuOpen(false); onExit(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-300 hover:bg-white/10 hover:text-red-200 transition-colors"
              >
                退出
              </button>
            </div>
          )}
        </div>

        {/* 显示桌面竖条 */}
        <button
          onClick={onShowDesktop}
          className="h-full flex items-center cursor-pointer hover:bg-white/5 transition-colors"
          title="显示桌面"
          style={{ width: 4 }}
        >
          <div className="h-full w-full" style={{ borderLeft: '1px solid rgba(255,255,255,0.25)' }} />
        </button>
      </div>
    </div>
  );
};

export default Taskbar;
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/components/Taskbar.tsx
git commit -m "refactor: rewrite Taskbar in Win10 bottom-docked style"
```

---

### Task 4: 修改 App.tsx — 布局方向调整

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `App` FC (no prop changes)

- [ ] **Step 1: 修改 App.tsx 布局方向**

将第 83 行：
```tsx
<div className="flex h-screen w-screen overflow-hidden bg-black">
```
改为：
```tsx
<div className="flex flex-col h-screen w-screen overflow-hidden bg-black">
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: switch app layout from row to column for bottom taskbar"
```
