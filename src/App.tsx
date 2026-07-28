import { useState, useCallback, useRef, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { getWallpaperBackground, defaultWallpaperId } from './data/wallpapers';
import { desktopApps, type DesktopApp } from './data/apps';
import { useSettings } from './hooks/useSettings';
import Desktop from './components/Desktop';
import Taskbar from './components/Taskbar';
import Window from './components/Window';
import LoginScreen from './components/LoginScreen';
import './App.css';

interface OpenWindow {
  id: string;
  app: DesktopApp;
  zIndex: number;
  filePath?: string;
  fileName?: string;
  initialPath?: string[];
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
  const [authenticated, setAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const { settings, updateSettings } = useSettings(accessKey);
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState<string | null>(null);

  const desktopBackground = getWallpaperBackground(settings);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const zIndexCounter = useRef(10);

  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  useEffect(() => {
    invoke<string>('get_app_version').then((v) => {
      getCurrentWindow().setTitle(`MOS — 基于 MinIO 的云桌面 v${v}`);
    });
  }, []);

  useEffect(() => {
    if (settings?.wallpaperType === 'custom' && settings?.customWallpapers?.length) {
      const cw = settings.customWallpapers.find(w => w.id === settings.wallpaperId);
      if (cw) {
        invoke<number[]>('read_config_file', { key: cw.key.replace('config/', '') })
          .then(data => {
            const blob = new Blob([new Uint8Array(data)]);
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
    (appId: string) => {
      const existing = openWindows.find((w) => w.id === appId);
      if (existing) {
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
        return;
      }

      const app = desktopApps.find((a) => a.id === appId);
      if (!app) return;

      zIndexCounter.current += 1;
      setOpenWindows((prev) => [
        ...prev,
        { id: app.id, app, zIndex: zIndexCounter.current },
      ]);
      setActiveWindowId(appId);
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
    (initialPath: string[]) => {
      const app = desktopApps.find((a) => a.id === 'file-manager');
      if (!app) return;
      const windowId = `file-manager-${initialPath.join('/')}`;
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
            w.id === windowId ? { ...w, zIndex: zIndexCounter.current, initialPath } : w,
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
    console.log('[App] handleLogout called');
    setAuthenticated(false);
    setOpenWindows([]);
    setActiveWindowId(null);
    setMinimizedIds(new Set());
    setMaximizedId(null);
  }, []);

  const handleOpenSettings = useCallback(() => {
    openApp('settings');
  }, [openApp]);

  const handleOpenMyAccount = useCallback(() => {
    openApp('my-account');
  }, [openApp]);

  const handleExit = useCallback(() => {
    console.log('[App] handleExit called, attempting getCurrentWindow().close()');
    try {
      getCurrentWindow().close();
      console.log('[App] getCurrentWindow().close() executed');
    } catch (e) {
      console.error('[App] getCurrentWindow().close() failed:', e);
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
        onOpenSettings={handleOpenSettings}
        onOpenMyAccount={handleOpenMyAccount}
        accessKey={accessKey}
      />

      <Desktop
        background={desktopBackground}
        wallpaperId={settings?.wallpaperId ?? defaultWallpaperId}
        customWallpaperUrl={customWallpaperUrl}
        desktopApps={desktopApps}
        onOpenApp={openApp}
        onWallpaperChange={(id) => updateSettings({ wallpaperId: id })}
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
          onOpenApp={openApp}
          onOpenFile={openFile}
          onOpenFileManagerAt={openFileManagerAt}
        />
      ))}
    </div>
  );
}

export default App;
