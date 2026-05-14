import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Globe, X, FileIcon } from 'lucide-react';

interface ModePickerDialogProps {
  isOpen: boolean;
  fileCount: number;
  onSelectLan: () => void;
  onSelectOnline: () => void;
  onClose: () => void;
}

export const ModePickerDialog: React.FC<ModePickerDialogProps> = ({
  isOpen,
  fileCount,
  onSelectLan,
  onSelectOnline,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="glass-panel mode-picker-dialog"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <button className="mode-picker-close" onClick={onClose}>
              <X size={18} />
            </button>

            <div style={{ marginBottom: '6px' }}>
              <FileIcon size={28} color="var(--accent-purple)" />
            </div>
            <h2 style={{ fontSize: '17px', marginBottom: '6px' }}>
              {fileCount} file{fileCount !== 1 ? 's' : ''} ready
            </h2>
            <p className="text-secondary" style={{ marginBottom: '20px', fontSize: '13px' }}>
              Choose how to send
            </p>

            <div className="mode-picker-options">
              <motion.button
                className="mode-picker-option"
                onClick={onSelectLan}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Wifi size={28} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
                <div>
                  <span className="mode-option-label">LAN</span>
                  <span className="mode-option-hint">Fast local network transfer</span>
                </div>
              </motion.button>

              <motion.button
                className="mode-picker-option"
                onClick={onSelectOnline}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Globe size={28} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                <div>
                  <span className="mode-option-label">Online</span>
                  <span className="mode-option-hint">P2P to friends anywhere</span>
                </div>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
