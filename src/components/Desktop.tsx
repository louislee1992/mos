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
import { type Wallpaper, wallpapers } from '../data/wallpapers';
import DesktopIcon from './DesktopIcon';
import type { DesktopApp } from '../data/apps';

/** 组件 Props */
interface DesktopProps {
  /** 当前选中的壁纸对象 */
  currentWallpaper: Wallpaper;
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
  currentWallpaper,
  desktopApps,
  onOpenApp,
  onWallpaperChange,
}) => {
  /** 控制壁纸选择面板的显示/隐藏 */
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div
      className="flex-1 relative overflow-hidden"
      style={{ background: currentWallpaper.background }}
      onContextMenu={(e) => {
        // 阻止浏览器默认右键菜单，切换壁纸选择器
        e.preventDefault();
        setShowPicker(!showPicker);
      }}
    >
      {/* ==================== 桌面图标区 ====================
          排列在左上角，纵向列表布局，间距为 20px。
          遍历 desktopApps 数组，每个 app 渲染一个 DesktopIcon 组件。
          双击时调用 onOpenApp(app.id) 打开/聚焦对应窗口。
      */}
      <div className="absolute top-6 left-6 flex flex-col gap-5">
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
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 p-2 rounded-xl z-50"
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
              className="w-10 h-6 rounded-md border-2 transition-all hover:scale-110 cursor-pointer flex-shrink-0"
              style={{
                // 色块背景使用壁纸的 CSS 渐变
                background: wp.background,
                // 当前选中壁纸：白色粗边框 + 发光阴影
                borderColor:
                  wp.id === currentWallpaper.id
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.2)',
                boxShadow:
                  wp.id === currentWallpaper.id
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
        <p className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white/50 text-xs">
          右键桌面空白处可关闭壁纸选择 — 点击色块切换壁纸
        </p>
      )}
    </div>
  );
};

export default Desktop;
