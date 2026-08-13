import { type FC, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

const ImageLightbox: FC<ImageLightboxProps> = ({ src, onClose }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <motion.div
      className="image-lightbox-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <button className="image-lightbox-close" onClick={onClose} title="关闭">×</button>
      <motion.img
        className="image-lightbox-img"
        src={src}
        alt="图片预览"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
    </motion.div>
  );
};

export default ImageLightbox;
