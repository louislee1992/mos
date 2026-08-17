import { useState, useCallback, useRef, useEffect } from 'react';
import { getVersion } from './api/auth';
import { getCredentials, clearCredentials, hasSession } from './api/client';
import { getWallpaperBackground, defaultWallpaperId } from './data/wallpapers';
import { desktopApps, type DesktopApp } from './data/apps';
import { useSettings } from './hooks/useSettings';
import { useTransfers } from './hooks/useTransfers';
import { useChatSocket, chatBus } from './hooks/chatSocket';
import { listConversations } from './api/chat';
import Desktop from './components/Desktop';
import Taskbar from './components/Taskbar';
import Window from './components/Window';
import LoginScreen from './components/LoginScreen';
import AppLauncher from './components/AppLauncher';
import './App.css';

interface OpenWindow {
  id: string;
  app: DesktopApp;
  zIndex: number;
  filePath?: string;
  fileName?: string;
  initialPath?: string[];
  initialSelectName?: string;
  initialTab?: string;
}

const FILE_EDITOR_APP: DesktopApp = {
  id: 'file-editor',
  name: '',
  icon: 'file-manager',
  defaultWidth: 700,
  defaultHeight: 500,
  title: '',
};

function App() {
  const [authenticated, setAuthenticated] = useState(() => hasSession());
  const [accessKey, setAccessKey] = useState<string | null>(() => {
    const creds = getCredentials();
    return creds.accessKey || null;
  });
  const { settings, updateSettings } = useSettings(accessKey);
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState<string | null>(null);

  const { tasks, addUploadTask, addDownloadTask, addMoveTask, completeTask, failTask, updateTask, setTaskWriting, clearCompleted } = useTransfers();

  // Chat WebSocket lives at App level so messages arrive even when the chat window is closed
  useChatSocket(accessKey);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsubMsg = chatBus.subscribeMessage((msg) => {
      if (msg.sender === accessKey) return;
      if (msg.convId === chatBus.getActiveConvId()) return;
      setUnreadCounts((prev) => ({ ...prev, [msg.convId]: (prev[msg.convId] || 0) + 1 }));
    });
    const unsubActive = chatBus.subscribeActiveConv((convId) => {
      if (!convId) return;
      setUnreadCounts((prev) => {
        if (!prev[convId]) return prev;
        const next = { ...prev };
        delete next[convId];
        return next;
      });
    });
    const unsubConvs = chatBus.subscribeConversations((convs) => {
      const active = chatBus.getActiveConvId();
      const counts: Record<string, number> = {};
      for (const c of convs) {
        if (c.id === active) continue;
        const n = c.unreadCount || 0;
        if (n > 0) counts[c.id] = n;
      }
      setUnreadCounts(counts);
    });
    // Pull unread counts on WS connect so the taskbar badge appears
    // without opening the chat window
    const unsubConnected = chatBus.subscribeConnected((connected) => {
      if (!connected) return;
      listConversations()
        .then((convs) => {
          const counts: Record<string, number> = {};
          for (const c of convs) {
            const n = c.unreadCount || 0;
            if (n > 0) counts[c.id] = n;
          }
          setUnreadCounts(counts);
        })
        .catch(() => { /* ignore */ });
    });
    return () => { unsubMsg(); unsubActive(); unsubConvs(); unsubConnected(); };
  }, [accessKey]);

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const desktopBackground = getWallpaperBackground(settings);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [showLauncher, setShowLauncher] = useState(false);
  const [desktopHidden, setDesktopHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('mos-desktop-hidden');
      if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set(desktopApps.filter((a) => a.showOnDesktop === false).map((a) => a.id));
  });

  const toggleDesktopApp = useCallback((appId: string) => {
    setDesktopHidden((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      localStorage.setItem('mos-desktop-hidden', JSON.stringify([...next]));
      return next;
    });
  }, []);
  const zIndexCounter = useRef(10);

  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  useEffect(() => {
    getVersion().then((data) => {
      document.title = `MOS — 基于 MinIO 的云桌面 v${data.version}`;
    });
  }, []);

  useEffect(() => {
    const applyTheme = (t: string) => {
      if (t === 'light') {
        document.documentElement.dataset.theme = 'light';
      } else if (t === 'dark') {
        delete document.documentElement.dataset.theme;
      } else {
        const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        document.documentElement.dataset.theme = prefersLight ? 'light' : undefined;
      }
    };
    const theme = settings?.theme ?? 'system';
    applyTheme(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const listener = () => applyTheme('system');
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
  }, [settings?.theme]);

  useEffect(() => {
    if (settings?.wallpaperType === 'custom' && settings?.customWallpapers?.length) {
      const cw = settings.customWallpapers.find(w => w.id === settings.wallpaperId);
      if (cw) {
        const key = cw.key.replace('config/', '');
        const creds = getCredentials();
        fetch(`/api/config/download?key=${encodeURIComponent(key)}`, {
          headers: {
            'Authorization': 'Basic ' + btoa(`${creds.accessKey}:${creds.secretKey}`)
          },
        })
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
          })
          .then(blob => {
            const url = URL.createObjectURL(blob);
            setCustomWallpaperUrl(url);
          })
          .catch(() => setCustomWallpaperUrl(null));
      } else {
        setCustomWallpaperUrl(null);
      }
    } else {
      setCustomWallpaperUrl(null);
    }
  }, [settings?.wallpaperType, settings?.wallpaperId, settings?.customWallpapers]);

  const openApp = useCallback(
    (appId: string, initialTab?: string) => {
      const app = desktopApps.find((a) => a.id === appId);
      if (!app) return;
      const existing = openWindows.find((w) => w.id === appId);

      if (existing && app.singular) {
        setMinimizedIds((prev) => {
          const next = new Set(prev);
          next.delete(appId);
          return next;
        });
        zIndexCounter.current += 1;
        setOpenWindows((prev) =>
          prev.map((w) =>
            w.id === appId ? { ...w, zIndex: zIndexCounter.current, initialTab: initialTab ?? w.initialTab } : w,
          ),
        );
        setActiveWindowId(appId);
        return;
      }

      const windowId = app.singular ? app.id : `${app.id}-${zIndexCounter.current + 1}`;
      zIndexCounter.current += 1;
      setOpenWindows((prev) => [
        ...prev,
        { id: windowId, app, zIndex: zIndexCounter.current, initialTab },
      ]);
      setActiveWindowId(windowId);
    },
    [openWindows],
  );

  const openFile = useCallback(
    (filePath: string, fileName: string) => {
      const windowId = `editor-${filePath}`;
      const existing = openWindows.find((w) => w.id === windowId);
      if (existing) {
        setMinimizedIds((prev) => {
          const next = new Set(prev);
          next.delete(windowId);
          return next;
        });
        zIndexCounter.current += 1;
        setOpenWindows((prev) =>
          prev.map((w) =>
            w.id === windowId ? { ...w, zIndex: zIndexCounter.current } : w,
          ),
        );
        setActiveWindowId(windowId);
        return;
      }

      zIndexCounter.current += 1;
      setOpenWindows((prev) => [
        ...prev,
        {
          id: windowId,
          app: { ...FILE_EDITOR_APP, name: fileName, title: fileName },
          zIndex: zIndexCounter.current,
          filePath,
          fileName,
        },
      ]);
      setActiveWindowId(windowId);
    },
    [openWindows],
  );

  const openFileManagerAt = useCallback(
    (initialPath: string[], initialSelectName?: string) => {
      const app = desktopApps.find((a) => a.id === 'file-manager');
      if (!app) return;
      const windowId = initialSelectName
        ? `file-manager-${initialPath.join('/')}--${initialSelectName}`
        : `file-manager-${initialPath.join('/')}`;
      const existing = openWindows.find((w) => w.id === windowId);
      if (existing) {
        setMinimizedIds((prev) => {
          const next = new Set(prev);
          next.delete(windowId);
          return next;
        });
        zIndexCounter.current += 1;
        setOpenWindows((prev) =>
          prev.map((w) =>
            w.id === windowId ? { ...w, zIndex: zIndexCounter.current, initialPath, initialSelectName } : w,
          ),
        );
        setActiveWindowId(windowId);
        return;
      }
      zIndexCounter.current += 1;
      setOpenWindows((prev) => [
        ...prev,
        {
          id: windowId,
          app: { ...app, title: initialPath[initialPath.length - 1] || app.title },
          zIndex: zIndexCounter.current,
          initialPath,
          initialSelectName,
        },
      ]);
      setActiveWindowId(windowId);
    },
    [openWindows],
  );

  const closeApp = useCallback((appId: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.id !== appId));
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      next.delete(appId);
      return next;
    });
    setMaximizedId((max) => (max === appId ? null : max));
    setActiveWindowId((active) => (active === appId ? null : active));
  }, []);

  const focusApp = useCallback((appId: string) => {
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      next.delete(appId);
      return next;
    });
    zIndexCounter.current += 1;
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.id === appId ? { ...w, zIndex: zIndexCounter.current } : w,
      ),
    );
    setActiveWindowId(appId);
  }, []);

  const minimizeApp = useCallback((appId: string) => {
    setMinimizedIds((prev) => new Set(prev).add(appId));
    setMaximizedId((max) => (max === appId ? null : max));
    setActiveWindowId((active) => (active === appId ? null : active));
  }, []);

  const toggleMaximize = useCallback((appId: string) => {
    setMaximizedId((prev) => (prev === appId ? null : appId));
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      next.delete(appId);
      return next;
    });
    setActiveWindowId(appId);
  }, []);

  const showDesktop = useCallback(() => {
    setMinimizedIds((prev) => {
      const openIds = openWindows.map((w) => w.id);
      const someVisible = openIds.some((id) => !prev.has(id));
      if (someVisible) {
        return new Set(openIds);
      }
      return new Set();
    });
    setActiveWindowId(null);
    setMaximizedId(null);
  }, [openWindows]);

  const handleLogout = useCallback(() => {
    clearCredentials();
    setAccessKey(null);
    setAuthenticated(false);
    setOpenWindows([]);
    setActiveWindowId(null);
    setMinimizedIds(new Set());
    setMaximizedId(null);
    setUnreadCounts({});
  }, []);

  const handleOpenSettings = useCallback((initialTab?: string) => {
    openApp('settings', initialTab);
  }, [openApp]);

  const handleOpenSettingsTheme = useCallback(() => {
    openApp('settings', 'theme');
  }, [openApp]);

  const handleExit = useCallback(() => {
    console.log('[App] handleExit called, attempting window.close()');
    try {
      window.close();
      console.log('[App] window.close() executed');
    } catch (e) {
      console.error('[App] window.close() failed:', e);
    }
  }, []);

  if (!authenticated) {
    return (
      <LoginScreen
        onLoginSuccess={(key) => {
          setAccessKey(key);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="app-root">
      <Taskbar
        openApps={openWindows.map((w) => ({
          id: w.id,
          name: w.app.name,
          icon: w.app.icon,
        }))}
        activeAppId={activeWindowId}
        onFocusApp={focusApp}
        onCloseApp={closeApp}
        onShowDesktop={showDesktop}
        onLogout={handleLogout}
        onExit={handleExit}
        onOpenSettings={() => handleOpenSettings()}
        accessKey={accessKey}
        onToggleLauncher={() => setShowLauncher((v) => !v)}
        onClearCompleted={clearCompleted}
        onOpenChat={() => openApp('chat')}
        unreadCount={totalUnread}
        transferTasks={tasks}
      />

      <Desktop
        background={desktopBackground}
        wallpaperId={settings?.wallpaperId ?? defaultWallpaperId}
        customWallpaperUrl={customWallpaperUrl}
        desktopApps={desktopApps.filter((a) => !desktopHidden.has(a.id))}
        onOpenApp={openApp}
        onWallpaperChange={(id) => updateSettings({ wallpaperId: id })}
        onOpenSettingsTheme={handleOpenSettingsTheme}
      />

      {openWindows.filter((w) => !minimizedIds.has(w.id)).map((w) => (
        <Window
          key={w.id}
          app={w.app}
          accessKey={accessKey}
          settings={settings}
          onUpdateSettings={updateSettings}
          filePath={w.filePath}
          fileName={w.fileName}
          onClose={() => closeApp(w.id)}
          onFocus={() => focusApp(w.id)}
          onMinimize={() => minimizeApp(w.id)}
          onMaximize={() => toggleMaximize(w.id)}
          isMaximized={maximizedId === w.id}
          zIndex={w.zIndex}
          initialPath={w.initialPath}
          initialSelectName={w.initialSelectName}
          initialTab={w.initialTab}
          onOpenApp={openApp}
          onOpenFile={openFile}
          onOpenFileManagerAt={openFileManagerAt}
          onAddUploadTask={addUploadTask}
          onCompleteTask={completeTask}
          onFailTask={failTask}
          onUpdateTask={updateTask}
          onSetTaskWriting={setTaskWriting}
          onAddDownloadTask={addDownloadTask}
          onAddMoveTask={addMoveTask}
          unreadCounts={unreadCounts}
        />
      ))}

      {showLauncher && (
        <AppLauncher
          apps={desktopApps}
          hiddenDesktop={desktopHidden}
          onToggleDesktop={toggleDesktopApp}
          onOpenApp={openApp}
          onClose={() => setShowLauncher(false)}
        />
      )}
    </div>
  );
}

export default App;
