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
  onClick: () => void;
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
    <svg viewBox="0 0 64 64" fill="none" className="desktop-icon-svg">
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
    <svg viewBox="0 0 64 64" fill="none" className="desktop-icon-svg">
      <path
        d="M14 22 L16 54 C16 56 18 58 20 58 L44 58 C46 58 48 56 48 54 L50 22 Z"
        fill="#8899AA" stroke="#667788" strokeWidth="1.5"
      />
      <rect
        x="10" y="16" width="44" height="6" rx="2"
        fill="#99AABB" stroke="#778899" strokeWidth="1.5"
      />
      <rect
        x="26" y="12" width="12" height="6" rx="3"
        fill="#8899AA" stroke="#667788" strokeWidth="1"
      />
      <line x1="24" y1="26" x2="24" y2="52" stroke="#778899" strokeWidth="1" opacity="0.6" />
      <line x1="32" y1="26" x2="32" y2="52" stroke="#778899" strokeWidth="1" opacity="0.6" />
      <line x1="40" y1="26" x2="40" y2="52" stroke="#778899" strokeWidth="1" opacity="0.6" />
      <path
        d="M28 38 L32 34 L36 38 M32 34 L32 44"
        stroke="#DDEEFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"
      />
      <path
        d="M36 38 L32 34 L34 42"
        stroke="#DDEEFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"
      />
    </svg>
  ),

  settings: (
    <svg viewBox="0 0 64 64" fill="none" className="desktop-icon-svg">
      <circle cx="32" cy="32" r="8" stroke="#9ca3af" strokeWidth="2.5" fill="none" />
      <path
        d="M51.7 40a4.4 4.4 0 0 0 .88 4.85l.16.16a5.33 5.33 0 1 1-7.54 7.54l-.16-.16a4.4 4.4 0 0 0-4.85-.88 4.4 4.4 0 0 0-2.67 4.03V56a5.33 5.33 0 0 1-10.66 0v-.24a4.4 4.4 0 0 0-2.67-4.03 4.4 4.4 0 0 0-4.85.88l-.16.16a5.33 5.33 0 1 1-7.54-7.54l.16-.16A4.4 4.4 0 0 0 12.46 40a4.4 4.4 0 0 0-4.03-2.67H8a5.33 5.33 0 0 1 0-10.66h.24a4.4 4.4 0 0 0 4.03-2.67 4.4 4.4 0 0 0-.88-4.85l-.16-.16a5.33 5.33 0 1 1 7.54-7.54l.16.16A4.4 4.4 0 0 0 24 12.46a4.4 4.4 0 0 0 2.67-4.03V8a5.33 5.33 0 0 1 10.66 0v.24a4.4 4.4 0 0 0 2.67 4.03 4.4 4.4 0 0 0 4.85-.88l.16-.16a5.33 5.33 0 1 1 7.54 7.54l-.16.16A4.4 4.4 0 0 0 51.7 24a4.4 4.4 0 0 0 4.03 2.67H56a5.33 5.33 0 0 1 0 10.66h-.24a4.4 4.4 0 0 0-4.03 2.67Z"
        stroke="#9ca3af" strokeWidth="2.5" fill="none"
      />
    </svg>
  ),

  chat: (
    <svg viewBox="0 0 64 64" fill="none" className="desktop-icon-svg">
      <rect x="24" y="30" width="34" height="28" rx="6" fill="#09b83e" stroke="#079836" strokeWidth="1.2" />
      <path d="M30 54l-6 6h10l-4-6z" fill="#09b83e" stroke="#079836" strokeWidth="1" />
      <line x1="32" y1="38" x2="50" y2="38" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="44" x2="44" y2="44" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="6" y="10" width="34" height="28" rx="6" fill="#fff" stroke="#d1d5db" strokeWidth="1.2" />
      <path d="M14 34l-5 5h8l-3-5z" fill="#fff" stroke="#d1d5db" strokeWidth="1" />
      <line x1="16" y1="20" x2="30" y2="20" stroke="#09b83e" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="26" x2="36" y2="26" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),

  user: (
    <svg viewBox="0 0 24 24" fill="none" className="desktop-icon-svg">
      <circle cx="12" cy="9" r="3.5" stroke="#9ca3af" strokeWidth="1.5" fill="none" />
      <path d="M5 20C5 16 8 14 12 14C16 14 19 16 19 20" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  ),
};

/**
 * DesktopIcon 组件
 *
 * 单个桌面图标，由上方的图标容器和下方的文字标签组成。
 * - 悬停时：图标背景出现半透明高亮、轻微放大，标签背景高亮
 * - 按下时：轻微缩小反馈
 * - 单击时：触发 onClick 回调打开对应窗口
 */
const DesktopIcon: FC<DesktopIconProps> = ({ icon, label, onClick }) => {
  return (
    <div className="desktop-icon" onClick={onClick}>
      {/* 图标容器：
          - 固定 56x56 尺寸，圆角 12px
          - 悬停: 半透明白色背景 + 105% 放大
          - 按下: 缩至 95% 产生点击反馈
      */}
      <div className="desktop-icon-tile">
        {/* 图标图形容器：36x36，内部 SVG 自适应 */}
        <div className="desktop-icon-img">
          {
            /* 根据 icon 类型从映射表取 SVG；未匹配时显示默认灰色方块 */
            iconSvgs[icon] || (
              <svg viewBox="0 0 64 64" fill="none" className="desktop-icon-svg">
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
      <span className="desktop-icon-label">
        {label}
      </span>
    </div>
  );
};

export default DesktopIcon;
