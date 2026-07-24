import { useState, useCallback, useRef } from 'react';
import { wallpapers, defaultWallpaperId } from './data/wallpapers';
import { desktopApps, type DesktopApp } from './data/apps';
import Desktop from './components/Desktop';
import Taskbar from './components/Taskbar';
import Window from './components/Window';
import LoginScreen from './components/LoginScreen';
import './App.css';

interface OpenWindow {
  id: string;
  app: DesktopApp;
  zIndex: number;
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [wallpaperId, setWallpaperId] = useState(defaultWallpaperId);
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const zIndexCounter = useRef(10);

  const currentWallpaper =
    wallpapers.find((w) => w.id === wallpaperId) ?? wallpapers[0];

  const openApp = useCallback(
    (appId: string) => {
      const existing = openWindows.find((w) => w.id === appId);
      if (existing) {
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

  const closeApp = useCallback((appId: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.id !== appId));
    setActiveWindowId((active) => (active === appId ? null : active));
  }, []);

  const focusApp = useCallback((appId: string) => {
    zIndexCounter.current += 1;
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.id === appId ? { ...w, zIndex: zIndexCounter.current } : w,
      ),
    );
    setActiveWindowId(appId);
  }, []);

  const showDesktop = useCallback(() => {
    setOpenWindows([]);
    setActiveWindowId(null);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthenticated(false);
    setOpenWindows([]);
    setActiveWindowId(null);
  }, []);

  const handleExit = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  }, []);

  if (!authenticated) {
    return <LoginScreen onLoginSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black">
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
      />

      <Desktop
        currentWallpaper={currentWallpaper}
        desktopApps={desktopApps}
        onOpenApp={openApp}
        onWallpaperChange={setWallpaperId}
      />

      {openWindows.map((w) => (
        <Window
          key={w.id}
          app={w.app}
          onClose={() => closeApp(w.id)}
          onFocus={() => focusApp(w.id)}
          zIndex={w.zIndex}
        />
      ))}
    </div>
  );
}

export default App;
