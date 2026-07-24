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
