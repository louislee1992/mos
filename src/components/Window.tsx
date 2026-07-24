import { type FC, useRef, useState, useCallback, useEffect } from 'react';
import type { DesktopApp } from '../data/apps';

interface WindowProps {
  app: DesktopApp;
  onClose: () => void;
  onFocus: () => void;
  zIndex: number;
}

const Window: FC<WindowProps> = ({ app, onClose, onFocus, zIndex }) => {
  const [pos, setPos] = useState(() => ({
    x: 120 + Math.random() * 200,
    y: 60 + Math.random() * 150,
  }));

  const [size] = useState({
    width: app.defaultWidth,
    height: app.defaultHeight,
  });

  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

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

  const maxX = window.innerWidth - size.width;
  const maxY = window.innerHeight - size.height;
  const clampedX = Math.max(0, Math.min(pos.x, maxX));
  const clampedY = Math.max(0, Math.min(pos.y, maxY));

  return (
    <div
      ref={windowRef}
      className="window-enter fixed overflow-hidden flex flex-col"
      style={{
        left: clampedX,
        top: clampedY,
        width: size.width,
        height: size.height,
        zIndex,
        background: '#fff',
        border: '1px solid #b0b0b0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}
      onMouseDown={onFocus}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center h-8 flex-shrink-0 select-none"
        style={{
          background: '#fff',
          borderBottom: '1px solid #e0e0e0',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* 图标 + 标题 */}
        <div className="flex items-center gap-1.5 px-2 min-w-0">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <rect x="2" y="2.5" width="5" height="5" rx="1" fill="#0078D4" />
            <rect x="9" y="2.5" width="5" height="5" rx="1" fill="#0078D4" />
            <rect x="2" y="9.5" width="5" height="5" rx="1" fill="#0078D4" />
            <rect x="9" y="9.5" width="5" height="5" rx="1" fill="#0078D4" />
          </svg>
          <span className="text-sm text-gray-700 truncate">{app.title}</span>
        </div>

        {/* 右侧窗口控制按钮 */}
        <div className="flex items-center ml-auto">
          <button
            className="w-[46px] h-full flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
            title="最小化"
          >
            <svg viewBox="0 0 10 10" width="10" height="10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="#333" strokeWidth="1" />
            </svg>
          </button>
          <button
            className="w-[46px] h-full flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
            title="最大化"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
              <rect x="1.5" y="1.5" width="7" height="7" stroke="#333" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-[46px] h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
            title="关闭"
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4 text-gray-700 text-sm bg-white">
        <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
          <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="10" width="48" height="40" rx="4" stroke="#333" strokeWidth="1.5" fill="none" />
          </svg>
          <span>{app.title} - 内容区域</span>
        </div>
      </div>
    </div>
  );
};

export default Window;
