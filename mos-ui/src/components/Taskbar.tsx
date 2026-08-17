/**
 * 任务栏组件
 *
 * 渲染桌面左侧垂直任务栏，包含三个逻辑分区：
 * - 顶部：桌面按钮 + 全部应用按钮（导航区）
 * - 中间：已打开窗口列表（动态区，自动填充）
 * - 底部：文件任务 | 系统通知 | 用户中心 | 系统设置（系统功能区）
 *
 * 使用毛玻璃背景 + 半透明深色配色，与桌面壁纸融为一体。
 *
 * @component Taskbar
 */

import { type FC, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TransferTask } from '../hooks/useTransfers';
import TransferPanel from './TransferPanel';

/** 已打开窗口的任务栏显示数据 */
interface TaskbarApp {
  /** 窗口唯一标识 */
  id: string;
  /** 窗口显示名称 */
  name: string;
  /** 图标类型标识，与 TaskIcon 映射表对应 */
  icon: string;
}

/** 组件 Props */
interface TaskbarProps {
  /** 当前已打开的应用窗口列表 */
  openApps: TaskbarApp[];
  /** 当前活跃（聚焦）的应用 ID，null 表示无活跃窗口 */
  activeAppId: string | null;
  /** 聚焦某个窗口的回调 */
  onFocusApp: (id: string) => void;
  /** 关闭某个窗口的回调 */
  onCloseApp: (id: string) => void;
  /** 显示桌面（关闭所有窗口）的回调 */
  onShowDesktop: () => void;
  /** 注销当前账号，返回登录界面 */
  onLogout: () => void;
  /** 退出应用程序 */
  onExit: () => void;
  /** 打开设置窗口 */
  onOpenSettings: () => void;
  /** 当前登录的 accessKey */
  accessKey: string | null;
  /** 切换应用启动器 */
  onToggleLauncher?: () => void;
  /** 清除已完成的传输任务 */
  onClearCompleted: () => void;
  /** 打开聊天窗口 */
  onOpenChat: () => void;
  /** 未读聊天消息总数 */
  unreadCount: number;
  /** 文件传输任务列表 */
  transferTasks: TransferTask[];
}

/**
 * 任务栏按钮图标组件
 *
 * 根据 type 参数返回对应的内联 SVG 图标。
 * 支持 active 状态切换图标颜色。
 */
const TaskIcon: FC<{ type: string; active?: boolean }> = ({
  type,
  active,
}) => {
  const color = active ? 'var(--taskbar-icon)' : 'var(--taskbar-icon-dimmed)';
  const dimmed = 'var(--taskbar-icon-dimmed)';

  switch (type) {
    case 'desktop':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
          <rect x="3" y="3" width="18" height="13" rx="1.5" stroke={color} strokeWidth="1.6" fill="none" />
          <line x1="7" y1="18" x2="17" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="16" x2="12" y2="21" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="9" y1="21" x2="15" y2="21" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'apps':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.5" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.5" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.5" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.5" />
        </svg>
      );

    case 'file-manager':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path d="M3 7C3 5.9 3.9 5 5 5H9.5L11.5 7H19C20.1 7 21 7.9 21 9V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z" fill={color} opacity="0.85" />
        </svg>
      );

    case 'recycle-bin':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path d="M4 6H20L18.5 20C18.4 21 17.5 22 16.5 22H7.5C6.5 22 5.6 21 5.5 20L4 6Z" stroke={color} strokeWidth="1.5" fill="none" />
          <line x1="8" y1="6" x2="16" y2="6" stroke={dimmed} strokeWidth="1.2" />
          <path d="M9 3H15L16 6H8L9 3Z" fill={dimmed} />
          <line x1="10" y1="10" x2="10" y2="17" stroke={dimmed} strokeWidth="1" />
          <line x1="14" y1="10" x2="14" y2="17" stroke={dimmed} strokeWidth="1" />
        </svg>
      );

    case 'file-tasks':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <rect x="4" y="4" width="16" height="16" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
          <line x1="8" y1="9" x2="16" y2="9" stroke={dimmed} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="8" y1="12" x2="16" y2="12" stroke={dimmed} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="8" y1="15" x2="12" y2="15" stroke={dimmed} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'notifications':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path d="M12 3C10.5 3 9 4.1 9 5.5V6C6.5 6.8 5 9 5 11.5V16L3 18V19H21V18L19 16V11.5C19 9 17.5 6.8 15 6V5.5C15 4.1 13.5 3 12 3Z" stroke={color} strokeWidth="1.5" fill="none" />
          <path d="M10 20C10 21.1 10.9 22 12 22C13.1 22 14 21.1 14 20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'user':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <circle cx="12" cy="9" r="3.5" stroke={color} strokeWidth="1.5" fill="none" />
          <path d="M5 20C5 16 8 14 12 14C16 14 19 16 19 20" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 'chat':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <rect x="9" y="11" width="13" height="10.5" rx="2.5" fill={active ? '#09b83e' : 'none'} stroke={active ? '#079836' : color} strokeWidth="1.2" />
          <line x1="12" y1="14.5" x2="19" y2="14.5" stroke={active ? '#fff' : color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="17" x2="17" y2="17" stroke={active ? '#fff' : dimmed} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="2" y="3.5" width="13" height="10.5" rx="2.5" fill="none" stroke={color} strokeWidth="1.2" />
          <line x1="5.5" y1="7.5" x2="11" y2="7.5" stroke={dimmed} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5.5" y1="10" x2="13" y2="10" stroke={dimmed} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'settings':
      return (
        <svg viewBox="0 0 64 64" fill="none" width="20" height="20">
          <path d="M32 40a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke={color} strokeWidth="2.5" fill="none" />
          <path d="M51.7 40a4.4 4.4 0 0 0 .88 4.85l.16.16a5.33 5.33 0 1 1-7.54 7.54l-.16-.16a4.4 4.4 0 0 0-4.85-.88 4.4 4.4 0 0 0-2.67 4.03V56a5.33 5.33 0 0 1-10.66 0v-.24a4.4 4.4 0 0 0-2.67-4.03 4.4 4.4 0 0 0-4.85.88l-.16.16a5.33 5.33 0 1 1-7.54-7.54l.16-.16A4.4 4.4 0 0 0 12.46 40a4.4 4.4 0 0 0-4.03-2.67H8a5.33 5.33 0 0 1 0-10.66h.24a4.4 4.4 0 0 0 4.03-2.67 4.4 4.4 0 0 0-.88-4.85l-.16-.16a5.33 5.33 0 1 1 7.54-7.54l.16.16A4.4 4.4 0 0 0 24 12.46a4.4 4.4 0 0 0 2.67-4.03V8a5.33 5.33 0 0 1 10.66 0v.24a4.4 4.4 0 0 0 2.67 4.03 4.4 4.4 0 0 0 4.85-.88l.16-.16a5.33 5.33 0 1 1 7.54 7.54l-.16.16A4.4 4.4 0 0 0 51.7 24a4.4 4.4 0 0 0 4.03 2.67H56a5.33 5.33 0 0 1 0 10.66h-.24a4.4 4.4 0 0 0-4.03 2.67Z" stroke={color} strokeWidth="2.5" fill="none" />
        </svg>
      );

    default:
      return <div className="taskbar-icon-fallback" />;
  }
};

const Taskbar: FC<TaskbarProps> = ({
  openApps,
  activeAppId,
  onFocusApp,
  onCloseApp,
  onShowDesktop,
  onLogout,
  onOpenSettings,
  onToggleLauncher,
  onClearCompleted,
  accessKey,
  onOpenChat,
  unreadCount,
  transferTasks,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [transferAnchor, setTransferAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const transferWrapRef = useRef<HTMLDivElement>(null);
  const transferBtnRef = useRef<HTMLButtonElement>(null);

  const transferringCount = transferTasks.filter((t) => t.status === 'transferring').length;
  const doneCount = transferTasks.filter((t) => t.status === 'completed' || t.status === 'failed').length;
  const transferTotal = transferTasks.length;
  const transferTitle = transferTotal > 0
    ? `文件任务 — 进行中 ${transferringCount}，已完成 ${doneCount}/${transferTotal}`
    : '文件任务';

  const toggleTransfers = () => {
    setTransferAnchor((prev) => {
      if (prev) return null;
      const rect = transferBtnRef.current?.getBoundingClientRect();
      if (!rect) return { left: 68, bottom: 100 };
      return { left: rect.right + 8, bottom: window.innerHeight - rect.bottom };
    });
  };

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

  useEffect(() => {
    if (!transferAnchor) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (transferWrapRef.current && transferWrapRef.current.contains(t)) return;
      if (t instanceof Element && t.closest('.transfer-panel')) return;
      setTransferAnchor(null);
    };
    const handleResize = () => setTransferAnchor(null);
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', handleResize);
    };
  }, [transferAnchor]);

  return (
    <div
      className="taskbar"
      style={{
        width: 52,
        background: 'var(--bg-taskbar)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--border-light)',
      }}
    >
      {/* 顶部导航区 */}
      <button onClick={onShowDesktop} className="taskbar-btn" title="显示桌面">
        <TaskIcon type="desktop" />
      </button>

      <button onClick={onToggleLauncher} className="taskbar-btn" title="全部应用">
        <TaskIcon type="apps" />
      </button>

      <div className="taskbar-divider" style={{ background: 'var(--border-default)' }} />

      {/* 中间窗口区 */}
      <div className="taskbar-window-list">
        {openApps.map((app) => (
          <div key={app.id} className="taskbar-window-wrapper">
            <button
              onClick={() => onFocusApp(app.id)}
              className="taskbar-btn"
              title={app.name}
              style={{
                background: activeAppId === app.id ? 'var(--bg-surface-active)' : 'transparent',
              }}
            >
              <TaskIcon type={app.icon} active={activeAppId === app.id} />
              {activeAppId === app.id && (
                <div
                  className="taskbar-active-indicator"
                  style={{ width: 2.5, height: 22, background: 'var(--accent-hover)' }}
                />
              )}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onCloseApp(app.id); }}
              className="taskbar-window-close"
              title={`关闭 ${app.name}`}
            >
              <svg viewBox="0 0 12 12" width="8" height="8">
                <line x1="3" y1="3" x2="9" y2="9" stroke="var(--taskbar-icon)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="3" x2="3" y2="9" stroke="var(--taskbar-icon)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="taskbar-divider" style={{ background: 'var(--border-default)' }} />

      {/* 底部功能区 */}
      <div className="taskbar-badge-wrapper" ref={transferWrapRef}>
        <button
          ref={transferBtnRef}
          onClick={toggleTransfers}
          className="taskbar-btn"
          title={transferTitle}
          style={{ background: transferAnchor ? 'var(--bg-surface-active)' : 'transparent' }}
        >
          <TaskIcon type="file-tasks" />
        </button>
        {transferringCount > 0 && (
          <span className="taskbar-badge">{transferringCount > 99 ? '99+' : transferringCount}</span>
        )}
        {transferAnchor &&
          createPortal(
            <TransferPanel
              tasks={transferTasks}
              onClose={() => setTransferAnchor(null)}
              onClearCompleted={onClearCompleted}
              style={{
                position: 'fixed',
                left: transferAnchor.left,
                bottom: transferAnchor.bottom,
              }}
            />,
            document.body,
          )}
      </div>
      <button className="taskbar-btn" title="系统通知">
        <TaskIcon type="notifications" />
      </button>

      {/* 聊天入口（常驻，未读消息角标） */}
      <div className="taskbar-badge-wrapper">
        <button onClick={onOpenChat} className="taskbar-btn" title="聊天">
          <TaskIcon type="chat" />
        </button>
        {unreadCount > 0 && (
          <span className="taskbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </div>

      {/* 用户菜单 */}
      <div className="taskbar-user-wrapper" ref={menuRef}>
        <button
          onClick={() => { console.log('[Taskbar] user button clicked, toggling menu'); setMenuOpen((v) => !v); }}
          className="taskbar-btn"
          title="用户中心"
          style={{ background: menuOpen ? 'var(--bg-surface-active)' : 'transparent' }}
        >
          <TaskIcon type="user" />
        </button>

        {menuOpen && (
          <div
            className="taskbar-dropdown"
            style={{
              background: 'var(--bg-modal)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px 12px 12px',
                borderBottom: '1px solid var(--border-default)',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'var(--accent-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                  <circle cx="12" cy="9" r="3.5" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
                  <path d="M5 20C5 16 8 14 12 14c4 0 7 2 7 6" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  textAlign: 'center',
                  wordBreak: 'break-all',
                  maxWidth: 180,
                }}
              >
                {accessKey ?? '—'}
              </span>
            </div>
            <button
              onClick={() => { setMenuOpen(false); onOpenSettings(); }}
              className="taskbar-dropdown-item"
            >
              <svg viewBox="0 0 64 64" fill="none" className="taskbar-dropdown-item-icon">
                <path d="M32 40a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="3" fill="none" />
                <path d="M51.7 40a4.4 4.4 0 0 0 .88 4.85l.16.16a5.33 5.33 0 1 1-7.54 7.54l-.16-.16a4.4 4.4 0 0 0-4.85-.88 4.4 4.4 0 0 0-2.67 4.03V56a5.33 5.33 0 0 1-10.66 0v-.24a4.4 4.4 0 0 0-2.67-4.03 4.4 4.4 0 0 0-4.85.88l-.16.16a5.33 5.33 0 1 1-7.54-7.54l.16-.16A4.4 4.4 0 0 0 12.46 40a4.4 4.4 0 0 0-4.03-2.67H8a5.33 5.33 0 0 1 0-10.66h.24a4.4 4.4 0 0 0 4.03-2.67 4.4 4.4 0 0 0-.88-4.85l-.16-.16a5.33 5.33 0 1 1 7.54-7.54l.16.16A4.4 4.4 0 0 0 24 12.46a4.4 4.4 0 0 0 2.67-4.03V8a5.33 5.33 0 0 1 10.66 0v.24a4.4 4.4 0 0 0 2.67 4.03 4.4 4.4 0 0 0 4.85-.88l.16-.16a5.33 5.33 0 1 1 7.54 7.54l-.16.16A4.4 4.4 0 0 0 51.7 24a4.4 4.4 0 0 0 4.03 2.67H56a5.33 5.33 0 0 1 0 10.66h-.24a4.4 4.4 0 0 0-4.03 2.67Z" stroke="currentColor" strokeWidth="3" fill="none" />
              </svg>
              系统设置
            </button>
            <button
              onClick={() => { setMenuOpen(false); onLogout(); }}
              className="taskbar-dropdown-item"
            >
              <svg viewBox="0 0 24 24" fill="none" className="taskbar-dropdown-item-icon">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              退出登录
            </button>
            {/*<button*/}
            {/*  onClick={() => { console.log('[Taskbar] 退出 clicked, calling onExit'); setMenuOpen(false); onExit(); }}*/}
            {/*  className="taskbar-dropdown-item-danger"*/}
            {/*>*/}
            {/*  退出*/}
            {/*</button>*/}
          </div>
        )}
      </div>
    </div>
  );
};

export default Taskbar;
