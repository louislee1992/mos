import { type FC, useState, useEffect, useRef } from 'react';
import type { DesktopApp } from '../data/apps';
import iconSvgs from '../data/icons';

interface AppLauncherProps {
  apps: DesktopApp[];
  hiddenDesktop: Set<string>;
  onToggleDesktop: (appId: string) => void;
  onOpenApp: (appId: string) => void;
  onClose: () => void;
}

const AppLauncher: FC<AppLauncherProps> = ({ apps, hiddenDesktop, onToggleDesktop, onOpenApp, onClose }) => {
  const [query, setQuery] = useState('');
  const [contextAppId, setContextAppId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextAppId) {
          setContextAppId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, contextAppId]);

  useEffect(() => {
    if (!contextAppId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextAppId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextAppId]);

  const filtered = query.trim()
    ? apps.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    : apps;

  return (
    <div className="launcher-overlay" onMouseDown={onClose}>
      <div className="launcher-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="launcher-search">
          <svg className="launcher-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="launcher-search-input"
            placeholder="搜索应用..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="launcher-grid">
          {filtered.map((app) => {
            const isOnDesktop = !hiddenDesktop.has(app.id);

            return (
              <div key={app.id} className="launcher-item-wrapper">
                <button
                  className="launcher-item"
                  onClick={() => { onOpenApp(app.id); onClose(); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextAppId(isOnDesktop ? app.id : app.id);
                  }}
                >
                  <div className="launcher-item-icon">
                    {iconSvgs[app.icon] || (
                      <svg viewBox="0 0 64 64" fill="none" style={{ width: '100%', height: '100%' }}>
                        <rect x="8" y="8" width="48" height="48" rx="4" fill="#667788" />
                      </svg>
                    )}
                  </div>
                  <span className="launcher-item-label">{app.name}</span>
                  {isOnDesktop && (
                    <span className="launcher-item-badge" title="已在桌面">
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                        <path d="M3 8l3 3 7-7" stroke="#09b83e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>

                {contextAppId === app.id && (
                  <div className="launcher-context-menu" ref={menuRef}>
                    <button
                      className="launcher-context-item"
                      onClick={() => { onToggleDesktop(app.id); setContextAppId(null); }}
                    >
                      {isOnDesktop ? '从桌面移除' : '添加到桌面'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="launcher-empty">未找到匹配的应用</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppLauncher;
