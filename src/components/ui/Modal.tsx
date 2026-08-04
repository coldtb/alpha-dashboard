import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="drawer-backdrop" 
        style={{ display: 'block', opacity: 0.7 }} 
        onClick={onClose} 
      />
      <div 
        className="drawer" 
        style={{ display: 'block', right: 0 }}
      >
        <button 
          className="drawer-close" 
          onClick={onClose} 
          aria-label="Close details"
          style={{ cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
        <div style={{ padding: '2rem 1.5rem', height: '100%', overflowY: 'auto' }}>
          {title && (
            <h2 
              className="grid-section-title" 
              style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}
            >
              {title}
            </h2>
          )}
          {children}
        </div>
      </div>
    </>
  );
};
