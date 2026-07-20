/**
 * 窗口组件
 *
 * 渲染一个可拖拽的应用窗口，模拟桌面操作系统的窗口行为。
 * 支持以下功能：
 * - 拖拽移动：通过鼠标按住标题栏拖动窗口
 * - 窗口聚焦：点击窗口任意位置将其置顶
 * - 关闭窗口：点击红色关闭按钮
 * - 边界限制：窗口不可拖出视口范围
 * - 进场动画：窗口打开时播放缩放淡入动画
 *
 * @component Window
 */

import { type FC, useRef, useState, useCallback, useEffect } from 'react';
import type { DesktopApp } from '../data/apps';

/** 组件 Props */
interface WindowProps {
  /** 关联的应用配置，决定窗口尺寸和标题 */
  app: DesktopApp;
  /** 关闭窗口的回调 */
  onClose: () => void;
  /** 聚焦窗口的回调（提升 z-index） */
  onFocus: () => void;
  /** 当前窗口的 z-index 层级值 */
  zIndex: number;
}

/**
 * Window 组件
 *
 * 窗口由标题栏和内容区两部分组成：
 * - 标题栏：可拖拽移动窗口，包含红/黄/绿控制按钮和标题文字
 * - 内容区：应用的实际内容渲染区域
 *
 * 拖拽实现原理：
 * 1. onMouseDown 记录鼠标相对于窗口左上角的偏移量
 * 2. useEffect 在 dragging 状态下监听全局 mousemove/mouseup
 * 3. mousemove 时更新窗口位置（当前鼠标坐标 - 偏移量）
 * 4. mouseup 时停止拖拽
 * 5. 位置被 clamp 在视口范围内，防止窗口被拖出屏幕
 */
const Window: FC<WindowProps> = ({ app, onClose, onFocus, zIndex }) => {
  /**
   * 窗口左上角坐标（相对于视口）
   * 初始位置使用随机偏移，避免所有窗口完全重叠
   */
  const [pos, setPos] = useState(() => ({
    x: 120 + Math.random() * 200,
    y: 60 + Math.random() * 150,
  }));

  /** 窗口尺寸，从应用配置中读取，创建后不变 */
  const [size] = useState({
    width: app.defaultWidth,
    height: app.defaultHeight,
  });

  /** 是否正在拖拽中 */
  const [dragging, setDragging] = useState(false);

  /**
   * 拖拽偏移量
   * 记录鼠标按下时，鼠标位置相对于窗口左上角的 (dx, dy)
   * 使用 useRef 避免闭包捕获旧值
   */
  const dragOffset = useRef({ x: 0, y: 0 });

  /** 窗口 DOM 引用 */
  const windowRef = useRef<HTMLDivElement>(null);

  /**
   * 标题栏鼠标按下处理
   *
   * 1. 先聚焦当前窗口（提升 z-index）
   * 2. 记录拖拽偏移量
   * 3. 开启拖拽状态
   *
   * 使用 useCallback 缓存，依赖 onFocus 和当前 pos
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onFocus();
      setDragging(true);
      dragOffset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    },
    [onFocus, pos],
  );

  /**
   * 全局拖拽事件监听
   *
   * 仅在 dragging 为 true 时注册全局 mousemove/mouseup 监听器。
   * - mousemove: 通过 当前鼠标坐标 - 偏移量 计算新的窗口位置
   * - mouseup: 停止拖拽状态
   * - 清理函数在 dragging 变化或组件卸载时移除监听器
   */
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handleMouseUp = () => setDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  /**
   * 边界限制计算
   *
   * 将窗口坐标 clamp 在 [0, 视口尺寸 - 窗口尺寸] 范围内，
   * 确保整个窗口始终可见，不会被拖出屏幕边界。
   */
  const maxX = window.innerWidth - size.width;
  const maxY = window.innerHeight - size.height;
  const clampedX = Math.max(0, Math.min(pos.x, maxX));
  const clampedY = Math.max(0, Math.min(pos.y, maxY));

  return (
    <div
      ref={windowRef}
      // window-enter: 进场动画类（缩放 + 淡入，定义在 index.css）
      className="window-enter fixed rounded-xl overflow-hidden shadow-2xl flex flex-col"
      style={{
        left: clampedX,
        top: clampedY,
        width: size.width,
        height: size.height,
        zIndex,
        // 深色毛玻璃背景
        background: 'rgba(30, 30, 42, 0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
      // 点击窗口任意位置 → 聚焦该窗口，提升 z-index
      onMouseDown={onFocus}
    >
      {/* ==================== 标题栏 ====================
          深色背景，高度 40px。
          onMouseDown 绑定在标题栏上，作为拖拽的触发区域。
          标题栏内部包含：
          - 三个 macOS 风格的控制按钮（红/黄/绿）
          - 居中的窗口标题
      */}
      <div
        className="window-titlebar flex items-center h-10 px-3 gap-2 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onMouseDown={handleMouseDown}
      >
        {/* 关闭按钮（红色）：点击关闭窗口，阻止冒泡避免触发拖拽 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-3 h-3 rounded-full flex-shrink-0 transition-colors"
          style={{ background: '#FF5F57' }}
          title="关闭"
        />

        {/* 最小化按钮（黄色）：暂无功能，预留扩展 */}
        <button
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: '#FFBD2E' }}
          title="最小化"
        />

        {/* 全屏按钮（绿色）：暂无功能，预留扩展 */}
        <button
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: '#28CA41' }}
          title="全屏"
        />

        {/* 窗口标题：半透明白色，居中显示，溢出截断 */}
        <span className="text-white/80 text-sm font-medium mx-auto truncate select-none">
          {app.title}
        </span>
      </div>

      {/* ==================== 内容区 ====================
          占据标题栏之外的全部剩余空间。
          当前为占位内容，后续各应用在此区域渲染各自的实际功能。
      */}
      <div className="flex-1 overflow-auto p-4 text-white/80 text-sm">
        <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
          {/* 占位图标 */}
          <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
            <rect
              x="8" y="10" width="48" height="40" rx="4"
              fill="white" opacity="0.15"
            />
            <rect
              x="8" y="10" width="48" height="40" rx="4"
              stroke="white" strokeWidth="1.5" opacity="0.3"
            />
          </svg>
          <span>{app.title} - 内容区域</span>
        </div>
      </div>
    </div>
  );
};

export default Window;
