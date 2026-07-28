import type { UserSettings } from '../types/settings';

/**
 * 壁纸配置文件
 *
 * 定义系统中所有可用的桌面壁纸，包括唯一标识、显示名称和 CSS 背景样式。
 * 壁纸通过 CSS 渐变实现，无需外部图片资源。
 *
 * @module wallpapers
 */

/** 单个壁纸对象 */
export interface Wallpaper {
  /** 唯一标识符，用于状态管理和匹配 */
  id: string;
  /** 壁纸显示名称，用于 UI 提示 */
  name: string;
  /** CSS background 属性值，支持渐变或纯色 */
  background: string;
  /** 可选的缩略图路径（目前未使用，预留扩展） */
  thumbnail?: string;
}

/** 系统中所有可用的壁纸列表 */
export const wallpapers: Wallpaper[] = [
  {
    id: 'monterey',
    name: 'Monterey',
    background:
      'linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 50%, #533483 70%, #e94560 100%)',
  },
  {
    id: 'bloom',
    name: 'Bloom',
    background: 'linear-gradient(160deg, #0093E9 0%, #80D0C7 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    background:
      'linear-gradient(to top, #ff512f 0%, #f09819 30%, #ffd89b 100%)',
  },
  {
    id: 'forest',
    name: 'Forest',
    background:
      'linear-gradient(to top, #0ba360 0%, #3cba92 50%, #a8e6cf 100%)',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background:
      'linear-gradient(135deg, #0c0c1d 0%, #1a1a3e 40%, #2d2d5e 100%)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    background:
      'linear-gradient(135deg, #0f0c29 0%, #302b63 30%, #24243e 60%, #00b4db 100%)',
  },
  {
    id: 'rose',
    name: 'Rose',
    background:
      'linear-gradient(to right, #ff758c 0%, #ff7eb3 50%, #fad0c4 100%)',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background:
      'linear-gradient(180deg, #006994 0%, #003d5c 40%, #001a33 100%)',
  },
];

/** 系统默认壁纸 ID，首次加载时使用 */
export const defaultWallpaperId = 'monterey';

/**
 * 根据用户设置解析 CSS background 字符串
 *
 * - preset：从预设壁纸列表中查找
 * - solid：使用纯色
 * - custom：目前回退到预设壁纸（后续任务实现自定义上传）
 */
export function getWallpaperBackground(
  settings: UserSettings | null | undefined,
): string {
  if (!settings || settings.wallpaperType === 'preset') {
    const wp = wallpapers.find(
      (w) => w.id === (settings?.wallpaperId ?? defaultWallpaperId),
    );
    return wp?.background ?? wallpapers[0].background;
  }
  if (settings.wallpaperType === 'solid') {
    return settings.solidColor || '#1a1a2e';
  }
  const wp = wallpapers.find(
    (w) => w.id === (settings.wallpaperId ?? defaultWallpaperId),
  );
  return wp?.background ?? wallpapers[0].background;
}
