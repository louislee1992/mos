/**
 * 桌面应用配置文件
 *
 * 定义桌面上可用的应用程序，包括文件管理、回收站等。
 * 每个应用包含图标类型、窗口默认尺寸等元数据。
 *
 * @module apps
 */

/** 桌面应用对象，描述一个可通过桌面图标打开的应用 */
export interface DesktopApp {
  /** 唯一标识符，用于状态管理和窗口匹配 */
  id: string;
  /** 应用显示名称（中文） */
  name: string;
  /**
   * 图标类型标识，对应 DesktopIcon 和 TaskIcon 组件中的 SVG 图标映射。
   * 可选值: 'file-manager' | 'recycle-bin' 等
   */
  icon: string;
  /** 打开窗口时的默认宽度（像素） */
  defaultWidth: number;
  /** 打开窗口时的默认高度（像素） */
  defaultHeight: number;
  /** 窗口标题栏显示的文字 */
  title: string;
  /** 是否在桌面显示图标，默认 true */
  showOnDesktop?: boolean;
  /** 是否仅允许打开一个窗口，默认 false（可重复打开） */
  singular?: boolean;
}

/** 桌面上所有可用的应用程序列表 */
export const desktopApps: DesktopApp[] = [
  {
    id: 'file-manager',
    name: '文件管理',
    icon: 'file-manager',
    defaultWidth: 800,
    defaultHeight: 520,
    title: '文件管理',
  },
  {
    id: 'recycle-bin',
    name: '回收站',
    icon: 'recycle-bin',
    defaultWidth: 800,
    defaultHeight: 520,
    title: '回收站',
    singular: true,
  },
  {
    id: 'settings',
    name: '系统设置',
    icon: 'settings',
    defaultWidth: 660,
    defaultHeight: 480,
    title: '系统设置',
    singular: true,
  },
  {
    id: 'chat',
    name: '聊天',
    icon: 'chat',
    defaultWidth: 860,
    defaultHeight: 600,
    title: '聊天',
    singular: true,
  },
  {
    id: 'my-account',
    name: '我的账号',
    icon: 'user',
    defaultWidth: 800,
    defaultHeight: 520,
    title: '我的账号',
    showOnDesktop: false,
    singular: true,
  },
];
