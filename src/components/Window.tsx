import { type FC, useRef, useState, useCallback, useEffect } from 'react';
import type { DesktopApp } from '../data/apps';
import type { UserSettings } from '../types/settings';
import iconSvgs from '../data/icons';
import FileManager from './FileManager';
import RecycleBin from './RecycleBin';
import TextEditor from './TextEditor';
import Settings from './Settings';
import MyAccount from './MyAccount';

interface WindowProps {
  app: DesktopApp;
  accessKey?: string | null;
  settings?: UserSettings | null;
  onUpdateSettings?: (patch: Partial<UserSettings>) => void;
  filePath?: string;
  fileName?: string;
  initialPath?: string[];
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  isMaximized: boolean;
  zIndex: number;
  onOpenApp?: (appId: string) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  onOpenFileManagerAt?: (initialPath: string[]) => void;
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_W = 300;
const MIN_H = 200;

const Window: FC<WindowProps> = ({ app, accessKey, settings, onUpdateSettings, filePath, fileName, initialPath, onClose, onFocus, onMinimize, onMaximize, isMaximized, zIndex, onOpenApp, onOpenFile, onOpenFileManagerAt }) => {
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [pos, setPos] = useState(() => ({
    x: 120 + Math.random() * 200,
    y: 60 + Math.random() * 150,
  }));

  const [size, setSize] = useState({
    width: app.defaultWidth,
    height: app.defaultHeight,
  });

  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<ResizeDir | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onFocus();
      if (isMaximized) return;
      setDragging(true);
      dragOffset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    },
    [onFocus, pos, isMaximized],
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

  const handleResizeStart = useCallback((e: React.MouseEvent, dir: ResizeDir) => {
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    dragStart.current = { x: e.clientX, y: e.clientY };
    setResizing(dir);
  }, [onFocus]);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      dragStart.current = { x: e.clientX, y: e.clientY };

      setSize((prev) => {
        let w = prev.width;
        let h = prev.height;
        if (resizing.includes('e')) w = Math.max(MIN_W, prev.width + dx);
        if (resizing.includes('w')) w = Math.max(MIN_W, prev.width - dx);
        if (resizing.includes('s')) h = Math.max(MIN_H, prev.height + dy);
        if (resizing.includes('n')) h = Math.max(MIN_H, prev.height - dy);
        return { width: w, height: h };
      });

      setPos((prev) => {
        if (resizing.includes('w')) {
          return { x: prev.x + dx, y: prev.y };
        }
        if (resizing.includes('n')) {
          return { x: prev.x, y: prev.y + dy };
        }
        return prev;
      });
    };
    const handleMouseUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const taskbarWidth = 52;
  const clampedX = isMaximized
    ? taskbarWidth
    : Math.max(taskbarWidth - size.width + 80, Math.min(pos.x, window.innerWidth - 80));
  const clampedY = isMaximized
    ? 0
    : Math.max(0, Math.min(pos.y, window.innerHeight - 30));
  const displayWidth = isMaximized ? `calc(100vw - ${taskbarWidth}px)` : size.width;
  const displayHeight = isMaximized ? '100vh' : size.height;

  return (
    <div
      ref={windowRef}
      className="window-frame window-enter"
      style={{
        left: clampedX,
        top: clampedY,
        width: displayWidth,
        height: displayHeight,
        zIndex,
        background: '#1e1e2e',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: isMaximized ? 'none' : '0 8px 32px rgba(0,0,0,0.5)',
      }}
      onMouseDown={onFocus}
    >
      <div
        className="window-titlebar"
        style={{
          background: '#252538',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          cursor: dragging ? 'grabbing' : 'default',
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="window-titlebar-left">
          <span style={{ display: 'flex', alignItems: 'center', width: 16, height: 16, flexShrink: 0 }}>
            {iconSvgs[app.id === 'file-editor' ? 'file' : app.icon] || (
              <svg viewBox="0 0 64 64" fill="none" style={{ width: '100%', height: '100%' }}>
                <rect x="8" y="8" width="48" height="48" rx="4" fill="#667788" />
              </svg>
            )}
          </span>
          <span className="window-title-text">
            {isDirty ? '● ' : ''}{app.title}
          </span>
        </div>

        <div className="window-titlebar-actions">
          <button
            onMouseDown={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
            className="window-titlebar-btn"
            title="最小化"
          >
            <svg viewBox="0 0 10 10" width="10" height="10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="#c8c8d4" strokeWidth="1" />
            </svg>
          </button>
          <button
            onMouseDown={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
            className="window-titlebar-btn"
            title={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? (
              <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
                <rect x="0.5" y="2.5" width="7" height="7" stroke="#c8c8d4" strokeWidth="1" />
                <path d="M2.5 0.5H9.5V7.5" stroke="#c8c8d4" strokeWidth="1" fill="none" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
                <rect x="1.5" y="1.5" width="7" height="7" stroke="#c8c8d4" strokeWidth="1" />
              </svg>
            )}
          </button>
          <button
            onMouseDown={(e) => {
              e.stopPropagation();
              if (app.id === 'file-editor' && isDirty) {
                setShowCloseConfirm(true);
              } else {
                onClose();
              }
            }}
            className="window-titlebar-btn window-titlebar-btn-close"
            title="关闭"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="window-body">
        {app.id === 'file-manager' ? (
          <FileManager onOpenApp={onOpenApp} onOpenFile={onOpenFile} onOpenFileManagerAt={onOpenFileManagerAt} initialPath={initialPath} />
        ) : app.id === 'recycle-bin' ? (
          <RecycleBin />
        ) : app.id === 'settings' ? (
          <Settings />
        ) : app.id === 'my-account' ? (
          <MyAccount
            accessKey={accessKey ?? null}
            settings={settings ?? null}
            onUpdateSettings={onUpdateSettings ?? (() => {})}
          />
        ) : app.id === 'settings' ? (
          <Settings />
        ) : app.id === 'file-editor' && filePath && fileName ? (
          <TextEditor
            filePath={filePath}
            fileName={fileName}
            onDirtyChange={setIsDirty}
            onCloseRequest={() => {
              if (isDirty) {
                setShowCloseConfirm(true);
              } else {
                onClose();
              }
            }}
          />
        ) : (
          <div className="window-placeholder">
            <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
              <rect x="8" y="10" width="48" height="40" rx="4" stroke="#c8c8d4" strokeWidth="1.5" fill="none" opacity="0.3" />
            </svg>
            <span>{app.title} - 内容区域</span>
          </div>
        )}
      </div>

      {showCloseConfirm && (
        <div className="fm-modal-overlay" onClick={() => setShowCloseConfirm(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">确认关闭</div>
            <div className="fm-modal-body">
              <p>文件有未保存的更改，确定要关闭吗？</p>
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setShowCloseConfirm(false)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={() => { setShowCloseConfirm(false); onClose(); }} className="fm-modal-btn fm-modal-btn-danger">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* resize handles */}
      {!isMaximized && (
        <>
          <div className="win-resize win-resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
          <div className="win-resize win-resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
          <div className="win-resize win-resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
          <div className="win-resize win-resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
          <div className="win-resize win-resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <div className="win-resize win-resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
          <div className="win-resize win-resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
          <div className="win-resize win-resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
        </>
      )}
    </div>
  );
};

export default Window;
