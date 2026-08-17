import { type FC, useEffect, useRef, useState, type PointerEvent } from 'react';
import { motion } from 'framer-motion';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.1;

const ImageLightbox: FC<ImageLightboxProps> = ({ src, onClose }) => {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setView(v => {
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        if (ns === v.scale) return v;
        if (ns <= 1) return { scale: ns, x: 0, y: 0 };
        const qx = (e.clientX - cx) / v.scale;
        const qy = (e.clientY - cy) / v.scale;
        return { scale: ns, x: e.clientX - cx + v.x - qx * ns, y: e.clientY - cy + v.y - qy * ns };
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const handlePointerDown = (e: PointerEvent<HTMLImageElement>) => {
    if (view.scale <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
  };

  const handlePointerMove = (e: PointerEvent<HTMLImageElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setView(v => ({ ...v, x: d.origX + (e.clientX - d.startX), y: d.origY + (e.clientY - d.startY) }));
  };

  const handlePointerEnd = () => { dragRef.current = null; };

  return (
    <motion.div
      ref={overlayRef}
      className="image-lightbox-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <button className="image-lightbox-close" onClick={onClose} title="关闭">×</button>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          ref={imgRef}
          className="image-lightbox-img"
          src={src}
          alt="图片预览"
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />
      </motion.div>
    </motion.div>
  );
};

export default ImageLightbox;
