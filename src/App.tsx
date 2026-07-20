/**
 * 应用根组件
 *
 * Web 桌面操作系统的顶层组件，负责：
 * - 全局状态管理：壁纸、窗口列表、活跃窗口、z-index 层级
 * - 布局编排：左侧任务栏 + 右侧桌面 + 浮层窗口
 * - 事件调度：打开/关闭/聚焦窗口、切换壁纸、显示桌面
 *
 * 架构设计：
 * - 状态提升 (Lifting State Up)：所有窗口状态集中在 App 层管理
 * - z-index 递增策略：每次聚焦窗口时 zIndexCounter 自增，保证最新点击的窗口在最上层
 * - useCallback 缓存回调：避免子组件不必要的重渲染
 *
 * @component App
 */

import { useState, useCallback, useRef } from 'react';
import { wallpapers, defaultWallpaperId } from './data/wallpapers';
import { desktopApps, type DesktopApp } from './data/apps';
import Desktop from './components/Desktop';
import Taskbar from './components/Taskbar';
import Window from './components/Window';
import './App.css';

/**
 * 已打开窗口的状态对象
 */
interface OpenWindow {
  /** 窗口唯一标识，与 DesktopApp.id 对应 */
  id: string;
  /** 关联的应用配置 */
  app: DesktopApp;
  /** 当前窗口的层级，数值越大越靠前 */
  zIndex: number;
}

function App() {
  // ==================== 状态定义 ====================

  /** 当前壁纸 ID，切换壁纸时更新 */
  const [wallpaperId, setWallpaperId] = useState(defaultWallpaperId);

  /** 已打开窗口列表，每个窗口包含 id、app 配置和 zIndex */
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);

  /** 当前活跃（聚焦）的窗口 ID，null 表示无窗口活跃 */
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);

  /**
   * z-index 层级计数器
   * 使用 useRef 而非 useState，因为 z-index 的递增不触发 UI 重渲染。
   * 初始值为 10，确保所有窗口都在桌面 (z=0) 之上。
   */
  const zIndexCounter = useRef(10);

  // ==================== 派生状态 ====================

  /**
   * 根据 wallpaperId 从配置列表中查找对应的壁纸对象。
   * 如果找不到（异常情况），降级使用第一个壁纸。
   */
  const currentWallpaper =
    wallpapers.find((w) => w.id === wallpaperId) ?? wallpapers[0];

  // ==================== 窗口事件处理 ====================

  /**
   * 打开（或聚焦）一个应用
   *
   * 逻辑：
   * 1. 检查该应用是否已有窗口打开
   * 2. 已打开 → 直接聚焦该窗口
   * 3. 未打开 → 创建新窗口，赋予递增后的 z-index
   *
   * useCallback 依赖 openWindows，因为需要判断是否已存在。
   */
  const openApp = useCallback(
    (appId: string) => {
      // 检查是否已打开
      const existing = openWindows.find((w) => w.id === appId);
      if (existing) {
        setActiveWindowId(appId);
        return;
      }

      // 查找应用配置
      const app = desktopApps.find((a) => a.id === appId);
      if (!app) return;

      // 创建新窗口，z-index 递增
      zIndexCounter.current += 1;
      setOpenWindows((prev) => [
        ...prev,
        { id: app.id, app, zIndex: zIndexCounter.current },
      ]);
      setActiveWindowId(appId);
    },
    [openWindows],
  );

  /**
   * 关闭一个应用窗口
   *
   * 从 openWindows 列表中移除对应窗口。
   * 如果关闭的是当前活跃窗口，将 activeWindowId 置为 null。
   */
  const closeApp = useCallback((appId: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.id !== appId));
    setActiveWindowId((active) => (active === appId ? null : active));
  }, []);

  /**
   * 聚焦一个窗口（将其提升到最上层）
   *
   * 更新该窗口的 z-index 为当前最大层级值（递增），
   * 并将其设为活跃窗口。
   */
  const focusApp = useCallback((appId: string) => {
    zIndexCounter.current += 1;
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.id === appId ? { ...w, zIndex: zIndexCounter.current } : w,
      ),
    );
    setActiveWindowId(appId);
  }, []);

  /**
   * 显示桌面（关闭所有窗口）
   *
   * 清空 openWindows 和 activeWindowId，
   * 相当于所有窗口最小化/关闭。
   */
  const showDesktop = useCallback(() => {
    setOpenWindows([]);
    setActiveWindowId(null);
  }, []);

  // ==================== 渲染 ====================

  /**
   * 布局结构：
   *
   * ┌──────┬──────────────────────────────┐
   * │      │                              │
   * │ 任   │        桌面区域              │
   * │ 务   │    (壁纸 + 图标 + 窗口)     │
   * │ 栏   │                              │
   * │      │                              │
   * └──────┴──────────────────────────────┘
   *
   * 任务栏固定 52px 宽度，桌面通过 flex-1 占满剩余空间。
   * 窗口组件使用 fixed 定位，悬浮在桌面之上。
   */
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black">
      {/* 左侧任务栏 */}
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
      />

      {/* 桌面区域（壁纸 + 图标 + 壁纸切换器） */}
      <Desktop
        currentWallpaper={currentWallpaper}
        desktopApps={desktopApps}
        onOpenApp={openApp}
        onWallpaperChange={setWallpaperId}
      />

      {/* 已打开的窗口（fixed 定位悬浮层） */}
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
