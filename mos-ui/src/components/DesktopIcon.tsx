/**
 * 桌面图标组件
 *
 * 渲染桌面上的可点击图标，包含图标图形和文字标签。
 * 支持双击打开对应应用、悬停高亮、点击缩放等交互效果。
 *
 * @component DesktopIcon
 */

import { type FC } from 'react';

/** 组件 Props */
interface DesktopIconProps {
  /** 图标类型标识，对应 iconSvgs 映射表中的 key */
  icon: string;
  /** 图标下方的文字标签 */
  label: string;
  /** 双击事件回调，用于打开对应窗口 */
  onDoubleClick: () => void;
}

/**
 * 图标 SVG 映射表
 *
 * 根据图标类型返回对应的内联 SVG 图形。
 * 所有图标使用 64x64 viewBox 以保证网格对齐清晰度。
 */
const iconSvgs: Record<string, React.ReactNode> = {
  /**
   * 文件管理图标
   * 黄色文件夹造型，由主体矩形、标签折角矩形和底部横线组成
   */
  'file-manager': (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      {/* 文件夹主体 */}
      <rect
        x="6" y="10" width="52" height="42" rx="3"
        fill="#F7C948" stroke="#D4A017" strokeWidth="1.5"
      />
      {/* 文件夹标签（折角部分） */}
      <rect x="6" y="10" width="22" height="8" rx="3" fill="#FADB6B" />
      {/* 标签底部折痕线 */}
      <rect x="6" y="18" width="22" height="2" fill="#F7C948" />
    </svg>
  ),

  /**
   * 回收站图标
   * 垃圾桶造型，由桶身、桶盖、把手、竖条纹和回收箭头标志组成
   */
  'recycle-bin': (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      {/* 桶身：梯形渐变 */}
      <path
        d="M14 22 L16 54 C16 56 18 58 20 58 L44 58 C46 58 48 56 48 54 L50 22 Z"
        fill="#8899AA" stroke="#667788" strokeWidth="1.5"
      />
      {/* 桶盖 */}
      <rect
        x="10" y="16" width="44" height="6" rx="2"
        fill="#99AABB" stroke="#778899" strokeWidth="1.5"
      />
      {/* 顶部把手 */}
      <rect
        x="26" y="12" width="12" height="6" rx="3"
        fill="#8899AA" stroke="#667788" strokeWidth="1"
      />
      {/* 桶身竖向纹理线 */}
      <line
        x1="24" y1="26" x2="24" y2="52"
        stroke="#778899" strokeWidth="1" opacity="0.6"
      />
      <line
        x1="32" y1="26" x2="32" y2="52"
        stroke="#778899" strokeWidth="1" opacity="0.6"
      />
      <line
        x1="40" y1="26" x2="40" y2="52"
        stroke="#778899" strokeWidth="1" opacity="0.6"
      />
      {/* 回收循环箭头（上方弧形 + 下方箭头） */}
      <path
        d="M28 38 L32 34 L36 38 M32 34 L32 44"
        stroke="#DDEEFF" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        opacity="0.8"
      />
      <path
        d="M36 38 L32 34 L34 42"
        stroke="#DDEEFF" strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  ),
};

/**
 * DesktopIcon 组件
 *
 * 单个桌面图标，由上方的图标容器和下方的文字标签组成。
 * - 悬停时：图标背景出现半透明高亮、轻微放大，标签背景高亮
 * - 按下时：轻微缩小反馈
 * - 双击时：触发 onDoubleClick 回调打开对应窗口
 */
const DesktopIcon: FC<DesktopIconProps> = ({ icon, label, onDoubleClick }) => {
  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-pointer group"
      onDoubleClick={onDoubleClick}
      style={{ width: 80 }}
    >
      {/* 图标容器：
          - 固定 56x56 尺寸，圆角 12px
          - 悬停 (group-hover): 半透明白色背景 + 105% 放大
          - 按下 (group-active): 缩至 95% 产生点击反馈
      */}
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-150
                   group-hover:bg-white/15 group-hover:scale-105 group-active:scale-95"
      >
        {/* 图标图形容器：36x36，内部 SVG 自适应 */}
        <div className="w-9 h-9">
          {
            /* 根据 icon 类型从映射表取 SVG；未匹配时显示默认灰色方块 */
            iconSvgs[icon] || (
              <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
                <rect x="8" y="8" width="48" height="48" rx="4" fill="#667788" />
              </svg>
            )
          }
        </div>
      </div>

      {/* 图标标签：
          - 白色文字，带深色文字阴影提升在浅色壁纸上的可读性
          - 悬停时显示半透明白色背景
          - 超出 76px 时截断为省略号
      */}
      <span
        className="desktop-icon-label text-xs text-white text-center leading-tight px-1 py-0.5
                   rounded group-hover:bg-white/20 transition-colors max-w-[76px] truncate"
      >
        {label}
      </span>
    </div>
  );
};

export default DesktopIcon;
