import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, QrCode, Copy, Check } from 'lucide-react';

interface QRPairingProps {
  isOpen: boolean;
  mode: 'show' | 'scan';
  friendCode: string;
  onScanned: (code: string) => void;
  onClose: () => void;
}

export const QRPairing: React.FC<QRPairingProps> = ({
  isOpen,
  mode,
  friendCode,
  onScanned,
  onClose,
}) => {
  const [activeMode, setActiveMode] = useState<'show' | 'scan'>(mode);
  const [scanError, setScanError] = useState('');
  const [copied, setCopied] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner-container';

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeMode === 'scan') {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [activeMode, isOpen]);

  const startScanner = async () => {
    setScanError('');
    try {
      // Small delay for DOM to render
      await new Promise(r => setTimeout(r, 300));

      const el = document.getElementById(scannerContainerId);
      if (!el) return;

      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          // Check if it's a valid friend code
          if (decodedText.startsWith('GIGA-')) {
            onScanned(decodedText);
            stopScanner();
          }
        },
        () => {} // ignore errors during scanning
      );
    } catch (err: any) {
      setScanError(err?.message || 'Camera access denied');
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear();
      scannerRef.current = null;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(friendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="glass-panel qr-dialog"
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="qr-header">
            <h2 style={{ fontSize: '16px' }}>
              {activeMode === 'show' ? 'Your QR Code' : 'Scan QR Code'}
            </h2>
            <motion.button
              className="icon-btn"
              onClick={onClose}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <X size={18} />
            </motion.button>
          </div>

          {/* Mode tabs */}
          <div className="qr-tabs">
            <button
              className={`qr-tab ${activeMode === 'show' ? 'active' : ''}`}
              onClick={() => setActiveMode('show')}
            >
              <QrCode size={16} />
              Show
            </button>
            <button
              className={`qr-tab ${activeMode === 'scan' ? 'active' : ''}`}
              onClick={() => setActiveMode('scan')}
            >
              <Camera size={16} />
              Scan
            </button>
          </div>

          {activeMode === 'show' ? (
            <div className="qr-show-content">
              <div className="qr-code-wrapper">
                {friendCode ? (
                  <QRCodeSVG
                    value={friendCode}
                    size={200}
                    bgColor="transparent"
                    fgColor="#ffffff"
                    level="M"
                    includeMargin={false}
                  />
                ) : (
                  <p className="text-secondary">Loading friend code...</p>
                )}
              </div>
              <p className="text-secondary" style={{ fontSize: '12px', marginTop: '12px', textAlign: 'center' }}>
                Let others scan this to add you
              </p>
              <motion.button
                className="btn-secondary"
                style={{ marginTop: '10px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', margin: '10px auto 0' }}
                onClick={handleCopy}
                whileTap={{ scale: 0.95 }}
              >
                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Code'}
              </motion.button>
            </div>
          ) : (
            <div className="qr-scan-content">
              <div
                id={scannerContainerId}
                className="qr-scanner-viewport"
              />
              {scanError && (
                <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px', textAlign: 'center' }}>
                  {scanError}
                </p>
              )}
              <p className="text-secondary" style={{ fontSize: '12px', marginTop: '10px', textAlign: 'center' }}>
                Point camera at a friend's QR code
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
