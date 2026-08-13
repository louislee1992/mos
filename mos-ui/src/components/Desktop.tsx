/**
 * 桌面组件
 *
 * 渲染操作系统的主桌面区域，包括：
 * - 全屏壁纸背景（通过 CSS background 实现）
 * - 桌面图标网格（文件管理、回收站等）
 * - 壁纸切换面板（通过右键菜单触发）
 *
 * @component Desktop
 */

import { type FC, useState, useEffect } from 'react';
import { wallpapers } from '../data/wallpapers';
import DesktopIcon from './DesktopIcon';
import type { DesktopApp } from '../data/apps';

/** 组件 Props */
interface DesktopProps {
  /** 背景 CSS 字符串 */
  background: string;
  /** 当前选中的壁纸 ID */
  wallpaperId?: string;
  /** 自定义壁纸图片 URL */
  customWallpaperUrl?: string | null;
  /** 桌面上的应用程序列表 */
  desktopApps: DesktopApp[];
  /** 打开应用的统一回调，传入 appId */
  onOpenApp: (appId: string) => void;
  /** 切换壁纸的回调，传入新的 wallpaper.id */
  onWallpaperChange: (id: string) => void;
  /** 打开设置窗体并选中主题壁纸 Tab */
  onOpenSettingsTheme?: () => void;
}

/**
 * Desktop 组件
 *
 * 占据任务栏右侧的全部剩余空间。作为窗口管理系统的底层画布，
 * 通过 flex: 1 自适应填充。壁纸通过 CSS background 属性渲染，
 * 不需要额外的 img 元素。
 */
const Desktop: FC<DesktopProps> = ({
  background,
  wallpaperId,
  customWallpaperUrl,
  desktopApps,
  onOpenApp,
  onWallpaperChange,
  onOpenSettingsTheme,
}) => {
  /** 控制壁纸选择面板的显示/隐藏 */
  const [showPicker, setShowPicker] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  useEffect(() => {
    if (!ctxMenu.visible) return;
    const close = () => setCtxMenu(c => ({ ...c, visible: false }));
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [ctxMenu.visible]);

  return (
    <div
      className="desktop-area"
      style={{ background }}
      onContextMenu={(e) => {
        e.preventDefault();
        const menuW = 200;
        const menuH = 40;
        let sx = e.clientX;
        let sy = e.clientY;
        if (sx + menuW > window.innerWidth) sx = e.clientX - menuW;
        if (sy + menuH > window.innerHeight) sy = e.clientY - menuH;
        setCtxMenu({ x: sx, y: sy, visible: true });
      }}
    >
      {customWallpaperUrl && (
        <img
          src={customWallpaperUrl}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', zIndex: 0, pointerEvents: 'none',
          }}
          alt="自定义壁纸"
        />
      )}
      {/* ==================== 桌面图标区 ====================
          排列在左上角，纵向列表布局，间距为 20px。
          遍历 desktopApps 数组，每个 app 渲染一个 DesktopIcon 组件。
          双击时调用 onOpenApp(app.id) 打开/聚焦对应窗口。
      */}
      <div className="desktop-icons">
        {desktopApps.map((app) => (
          <DesktopIcon
            key={app.id}
            icon={app.icon}
            label={app.name}
            onClick={() => onOpenApp(app.id)}
          />
        ))}
      </div>

      {/* ==================== 壁纸切换面板 ====================
          固定在桌面底部居中位置。
          毛玻璃效果背景，内含所有壁纸的缩略色块。
          点击色块后切换壁纸并自动关闭面板。
      */}
      {showPicker && (
        <div
          className="desktop-pagination"
          style={{
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {wallpapers.map((wp) => (
            <button
              key={wp.id}
              onClick={() => {
                onWallpaperChange(wp.id);
                setShowPicker(false);
              }}
              className="wallpaper-dot"
              style={{
                // 色块背景使用壁纸的 CSS 渐变
                background: wp.background,
                // 当前选中壁纸：白色粗边框 + 发光阴影
                borderColor:
                  wp.id === wallpaperId
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.2)',
                boxShadow:
                  wp.id === wallpaperId
                    ? '0 0 8px rgba(255,255,255,0.4)'
                    : 'none',
              }}
              title={wp.name}
            />
          ))}
        </div>
      )}

      {/* 壁纸选择器提示文字 */}
      {showPicker && (
        <p className="desktop-pagination-hint">
          右键桌面空白处可关闭壁纸选择 — 点击色块切换壁纸
        </p>
      )}

      {ctxMenu.visible && (
        <div className="fm-ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y, position: 'fixed' }}>
          <button className="fm-ctxmenu-item" onClick={() => {
            setCtxMenu(c => ({ ...c, visible: false }));
            onOpenSettingsTheme?.();
          }}>
            <span className="fm-ctxmenu-icon">
              <svg viewBox="0 0 64 64" fill="none" width="14" height="14">
                <path d="M32 40a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="3" fill="none" />
                <path d="M51.7 40a4.4 4.4 0 0 0 .88 4.85l.16.16a5.33 5.33 0 1 1-7.54 7.54l-.16-.16a4.4 4.4 0 0 0-4.85-.88 4.4 4.4 0 0 0-2.67 4.03V56a5.33 5.33 0 0 1-10.66 0v-.24a4.4 4.4 0 0 0-2.67-4.03 4.4 4.4 0 0 0-4.85.88l-.16.16a5.33 5.33 0 1 1-7.54-7.54l.16-.16A4.4 4.4 0 0 0 12.46 40a4.4 4.4 0 0 0-4.03-2.67H8a5.33 5.33 0 0 1 0-10.66h.24a4.4 4.4 0 0 0 4.03-2.67 4.4 4.4 0 0 0-.88-4.85l-.16-.16a5.33 5.33 0 1 1 7.54-7.54l.16.16A4.4 4.4 0 0 0 24 12.46a4.4 4.4 0 0 0 2.67-4.03V8a5.33 5.33 0 0 1 10.66 0v.24a4.4 4.4 0 0 0 2.67 4.03 4.4 4.4 0 0 0 4.85-.88l.16-.16a5.33 5.33 0 1 1 7.54 7.54l-.16.16A4.4 4.4 0 0 0 51.7 24a4.4 4.4 0 0 0 4.03 2.67H56a5.33 5.33 0 0 1 0 10.66h-.24a4.4 4.4 0 0 0-4.03 2.67Z" stroke="currentColor" strokeWidth="3" fill="none" />
              </svg>
            </span>
            <span>更换主题壁纸</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Desktop;
