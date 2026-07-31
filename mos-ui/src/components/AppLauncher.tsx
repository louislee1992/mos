import { type FC, useState, useEffect, useRef } from 'react';
import type { DesktopApp } from '../data/apps';
import iconSvgs from '../data/icons';

interface AppLauncherProps {
  apps: DesktopApp[];
  onOpenApp: (appId: string) => void;
  onClose: () => void;
}

const AppLauncher: FC<AppLauncherProps> = ({ apps, onOpenApp, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

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
          {filtered.map((app) => (
            <button
              key={app.id}
              className="launcher-item"
              onClick={() => { onOpenApp(app.id); onClose(); }}
            >
              <div className="launcher-item-icon">
                {iconSvgs[app.icon] || (
                  <svg viewBox="0 0 64 64" fill="none" style={{ width: '100%', height: '100%' }}>
                    <rect x="8" y="8" width="48" height="48" rx="4" fill="#667788" />
                  </svg>
                )}
              </div>
              <span className="launcher-item-label">{app.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="launcher-empty">未找到匹配的应用</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppLauncher;
