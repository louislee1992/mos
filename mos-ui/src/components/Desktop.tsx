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

import { type FC, useState } from 'react';
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
}) => {
  /** 控制壁纸选择面板的显示/隐藏 */
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div
      className="desktop-area"
      style={{ background }}
      onContextMenu={(e) => {
        // 阻止浏览器默认右键菜单，切换壁纸选择器
        e.preventDefault();
        setShowPicker(!showPicker);
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
            onDoubleClick={() => onOpenApp(app.id)}
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
    </div>
  );
};

export default Desktop;
