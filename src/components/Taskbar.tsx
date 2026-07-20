/**
 * 任务栏组件
 *
 * 渲染桌面左侧垂直任务栏，包含三个逻辑分区：
 * - 顶部：桌面按钮 + 全部应用按钮（导航区）
 * - 中间：已打开窗口列表（动态区，自动填充）
 * - 底部：文件任务 | 系统通知 | 用户中心 | 系统设置（系统功能区）
 *
 * 使用毛玻璃背景 + 半透明深色配色，与桌面壁纸融为一体。
 *
 * @component Taskbar
 */

import { type FC } from 'react';

/** 已打开窗口的任务栏显示数据 */
interface TaskbarApp {
  /** 窗口唯一标识 */
  id: string;
  /** 窗口显示名称 */
  name: string;
  /** 图标类型标识，与 TaskIcon 映射表对应 */
  icon: string;
}

/** 组件 Props */
interface TaskbarProps {
  /** 当前已打开的应用窗口列表 */
  openApps: TaskbarApp[];
  /** 当前活跃（聚焦）的应用 ID，null 表示无活跃窗口 */
  activeAppId: string | null;
  /** 聚焦某个窗口的回调 */
  onFocusApp: (id: string) => void;
  /** 关闭某个窗口的回调 */
  onCloseApp: (id: string) => void;
  /** 显示桌面（关闭所有窗口）的回调 */
  onShowDesktop: () => void;
}

/**
 * 任务栏按钮图标组件
 *
 * 根据 type 参数返回对应的内联 SVG 图标。
 * 支持 active 状态切换图标颜色：
 * - active: 纯白色，表示当前活跃窗口
 * - 非 active: 半透明白色，表示非活跃窗口
 *
 * 使用两个颜色变量控制：
 * - color: 主色调，用于图标主体描边/填充
 * - dimmed: 次要色调，用于图标辅助元素
 */
const TaskIcon: FC<{ type: string; active?: boolean }> = ({
  type,
  active,
}) => {
  /** 主色：活跃态纯白，非活跃态 65% 透明度 */
  const color = active ? 'white' : 'rgba(255,255,255,0.65)';
  /** 次要色：45% 透明度，用于辅助装饰线条 */
  const dimmed = 'rgba(255,255,255,0.45)';

  switch (type) {
    /**
     * 桌面图标
     * 显示器造型：屏幕矩形 + 底座横线 + 支架竖线
     */
    case 'desktop':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
          {/* 屏幕 */}
          <rect
            x="3" y="3" width="18" height="13" rx="1.5"
            stroke={color} strokeWidth="1.6" fill="none"
          />
          {/* 底座横杆 */}
          <line
            x1="7" y1="18" x2="17" y2="18"
            stroke={color} strokeWidth="1.5" strokeLinecap="round"
          />
          {/* 支架竖线 */}
          <line
            x1="12" y1="16" x2="12" y2="21"
            stroke={color} strokeWidth="1.2" strokeLinecap="round"
          />
          {/* 底座小横杆 */}
          <line
            x1="9" y1="21" x2="15" y2="21"
            stroke={color} strokeWidth="1.2" strokeLinecap="round"
          />
        </svg>
      );

    /**
     * 全部应用图标
     * 2x2 网格布局，表示应用列表
     */
    case 'apps':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
          <rect
            x="3" y="3" width="7.5" height="7.5" rx="1.5"
            stroke={color} strokeWidth="1.5"
          />
          <rect
            x="13.5" y="3" width="7.5" height="7.5" rx="1.5"
            stroke={color} strokeWidth="1.5"
          />
          <rect
            x="3" y="13.5" width="7.5" height="7.5" rx="1.5"
            stroke={color} strokeWidth="1.5"
          />
          <rect
            x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"
            stroke={color} strokeWidth="1.5"
          />
        </svg>
      );

    /**
     * 文件管理图标（文件夹）
     * 经典文件夹侧视造型
     */
    case 'file-manager':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path
            d="M3 7C3 5.9 3.9 5 5 5H9.5L11.5 7H19C20.1 7 21 7.9 21 9V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z"
            fill={color} opacity="0.85"
          />
        </svg>
      );

    /**
     * 回收站图标（垃圾桶）
     * 垃圾桶侧视 + 回收箭头符号
     */
    case 'recycle-bin':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          {/* 桶身：梯形 */}
          <path
            d="M4 6H20L18.5 20C18.4 21 17.5 22 16.5 22H7.5C6.5 22 5.6 21 5.5 20L4 6Z"
            stroke={color} strokeWidth="1.5" fill="none"
          />
          {/* 桶盖横线 */}
          <line
            x1="8" y1="6" x2="16" y2="6"
            stroke={dimmed} strokeWidth="1.2"
          />
          {/* 顶部把手 */}
          <path d="M9 3H15L16 6H8L9 3Z" fill={dimmed} />
          {/* 竖向条纹 */}
          <line
            x1="10" y1="10" x2="10" y2="17"
            stroke={dimmed} strokeWidth="1"
          />
          <line
            x1="14" y1="10" x2="14" y2="17"
            stroke={dimmed} strokeWidth="1"
          />
        </svg>
      );

    /**
     * 文件任务图标（剪贴板/待办）
     * 矩形板 + 三条横线表示待办列表
     */
    case 'file-tasks':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          {/* 面板主体 */}
          <rect
            x="4" y="4" width="16" height="16" rx="2"
            stroke={color} strokeWidth="1.5" fill="none"
          />
          {/* 横线 1 */}
          <line
            x1="8" y1="9" x2="16" y2="9"
            stroke={dimmed} strokeWidth="1.2" strokeLinecap="round"
          />
          {/* 横线 2 */}
          <line
            x1="8" y1="12" x2="16" y2="12"
            stroke={dimmed} strokeWidth="1.2" strokeLinecap="round"
          />
          {/* 横线 3（较短） */}
          <line
            x1="8" y1="15" x2="12" y2="15"
            stroke={dimmed} strokeWidth="1.2" strokeLinecap="round"
          />
        </svg>
      );

    /**
     * 系统通知图标（铃铛）
     * 经典铃铛造型，右上角无数字角标
     */
    case 'notifications':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          {/* 铃铛主体 */}
          <path
            d="M12 3C10.5 3 9 4.1 9 5.5V6C6.5 6.8 5 9 5 11.5V16L3 18V19H21V18L19 16V11.5C19 9 17.5 6.8 15 6V5.5C15 4.1 13.5 3 12 3Z"
            stroke={color} strokeWidth="1.5" fill="none"
          />
          {/* 铃铛底部小球 */}
          <path
            d="M10 20C10 21.1 10.9 22 12 22C13.1 22 14 21.1 14 20"
            stroke={color} strokeWidth="1.5" strokeLinecap="round"
          />
        </svg>
      );

    /**
     * 用户中心图标（人物）
     * 圆形头像 + 半弧形身体
     */
    case 'user':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          {/* 头部圆形 */}
          <circle
            cx="12" cy="9" r="3.5"
            stroke={color} strokeWidth="1.5" fill="none"
          />
          {/* 身体弧线 */}
          <path
            d="M5 20C5 16 8 14 12 14C16 14 19 16 19 20"
            stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"
          />
        </svg>
      );

    /**
     * 系统设置图标（齿轮）
     * 中心圆 + 8 条辐射线
     */
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          {/* 中心圆 */}
          <circle
            cx="12" cy="12" r="2.5"
            stroke={color} strokeWidth="1.5" fill="none"
          />
          {/* 八方向辐射线条 */}
          <path
            d="M12 2V4M12 20V22M2 12H4M20 12H22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M4.93 19.07L6.34 17.66M17.66 6.34L19.07 4.93"
            stroke={dimmed} strokeWidth="1.5" strokeLinecap="round"
          />
        </svg>
      );

    /** 未知类型：显示灰色占位方块 */
    default:
      return <div className="w-5 h-5 rounded bg-white/20" />;
  }
};

/**
 * Taskbar 组件
 *
 * 左侧垂直任务栏，固定宽度 52px，充满视口高度。
 *
 * 布局结构（从上到下）：
 * ┌─────────────────┐
 * │  桌面按钮        │  ← 点击关闭所有窗口
 * │  全部应用按钮    │  ← 预留，暂无功能
 * │  ─── 分隔线 ───  │
 * │  窗口1           │  ← 已打开窗口列表
 * │  窗口2           │     动态渲染，可聚焦/关闭
 * │  窗口3           │
 * │  (弹性空白区)   │  ← flex-1 自动填充
 * │  ─── 分隔线 ───  │
 * │  文件任务        │
 * │  系统通知        │  ← 系统功能区
 * │  用户中心        │
 * │  系统设置        │
 * └─────────────────┘
 */
const Taskbar: FC<TaskbarProps> = ({
  openApps,
  activeAppId,
  onFocusApp,
  onCloseApp,
  onShowDesktop,
}) => {
  /**
   * 底部功能区按钮配置
   * 固定四个按钮：文件任务、系统通知、用户中心、系统设置
   */
  const bottomItems = [
    { id: 'file-tasks', name: '文件任务', icon: 'file-tasks' },
    { id: 'notifications', name: '系统通知', icon: 'notifications' },
    { id: 'user', name: '用户中心', icon: 'user' },
    { id: 'settings', name: '系统设置', icon: 'settings' },
  ];

  return (
    <div
      className="h-full flex flex-col items-center py-3 gap-1 flex-shrink-0 z-[100]"
      style={{
        width: 52,
        background: 'rgba(22, 22, 32, 0.85)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* ==================== 顶部导航区 ==================== */}

      {/* 桌面按钮：点击后关闭所有窗口，回到桌面 */}
      <button
        onClick={onShowDesktop}
        className="taskbar-btn w-10 h-10 rounded-lg flex items-center justify-center
                   hover:bg-white/10 active:scale-90"
        title="显示桌面"
      >
        <TaskIcon type="desktop" />
      </button>

      {/* 全部应用按钮：预留功能入口 */}
      <button
        className="taskbar-btn w-10 h-10 rounded-lg flex items-center justify-center
                   hover:bg-white/10 active:scale-90"
        title="全部应用"
      >
        <TaskIcon type="apps" />
      </button>

      {/* 导航区与窗口区分隔线 */}
      <div
        className="w-8 h-px my-1.5"
        style={{ background: 'rgba(255,255,255,0.12)' }}
      />

      {/* ==================== 中间窗口区 ====================
          占据剩余全部空间（flex-1），垂直排列已打开窗口。
          每个窗口按钮包含：
          - 图标按钮：点击可聚焦该窗口
          - 活跃指示条：仅活跃窗口显示左侧蓝色竖条
          - 悬停关闭按钮：鼠标悬停时右上角显示红色 X 按钮
      */}
      <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto py-1 w-full">
        {openApps.map((app) => (
          <div key={app.id} className="relative group">
            {/* 窗口图标按钮 */}
            <button
              onClick={() => onFocusApp(app.id)}
              className="taskbar-btn w-10 h-10 rounded-lg flex items-center justify-center
                         hover:bg-white/10 active:scale-90 relative"
              title={app.name}
              style={{
                background:
                  activeAppId === app.id
                    ? 'rgba(255,255,255,0.15)'
                    : 'transparent',
              }}
            >
              <TaskIcon type={app.icon} active={activeAppId === app.id} />

              {/* 活跃窗口指示条：左侧 2.5px 宽蓝色竖线 */}
              {activeAppId === app.id && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                  style={{
                    width: 2.5,
                    height: 22,
                    background: '#60A5FA',
                  }}
                />
              )}
            </button>

            {/* 悬停关闭按钮：
                - 默认隐藏 (opacity-0)
                - 父容器悬停时显示 (group-hover:opacity-100)
                - 阻止事件冒泡以免触发聚焦
            */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseApp(app.id);
              }}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center
                         opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(255,50,50,0.9)' }}
              title={`关闭 ${app.name}`}
            >
              {/* X 形关闭图标 */}
              <svg viewBox="0 0 12 12" width="8" height="8">
                <line
                  x1="3" y1="3" x2="9" y2="9"
                  stroke="white" strokeWidth="1.5" strokeLinecap="round"
                />
                <line
                  x1="9" y1="3" x2="3" y2="9"
                  stroke="white" strokeWidth="1.5" strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* 窗口区与功能区分隔线 */}
      <div
        className="w-8 h-px my-1.5"
        style={{ background: 'rgba(255,255,255,0.12)' }}
      />

      {/* ==================== 底部功能区 ====================
          四个系统按钮垂直排列，暂无实际功能。
          每个按钮使用 taskbar-btn 类获得统一的过渡效果。
      */}
      {bottomItems.map((item) => (
        <button
          key={item.id}
          className="taskbar-btn w-10 h-10 rounded-lg flex items-center justify-center
                     hover:bg-white/10 active:scale-90"
          title={item.name}
        >
          <TaskIcon type={item.icon} />
        </button>
      ))}
    </div>
  );
};

export default Taskbar;
