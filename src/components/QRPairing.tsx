import React, { useState, useEffect, useRef, useCallback } from 'react';
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

type ScannerState = 'idle' | 'starting' | 'running' | 'stopping';

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
  const scannerStateRef = useRef<ScannerState>('idle');
  const scannerContainerId = 'qr-scanner-container';

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  const stopScanner = useCallback(async () => {
    if (scannerStateRef.current !== 'running' && scannerStateRef.current !== 'starting') {
      return;
    }
    const scanner = scannerRef.current;
    if (!scanner) {
      scannerStateRef.current = 'idle';
      return;
    }

    scannerStateRef.current = 'stopping';
    try {
      await scanner.stop();
    } catch (_) {
      // Camera may already be stopped
    }
    try {
      scanner.clear();
    } catch (_) {
      // DOM element may already be cleared
    }
    scannerRef.current = null;
    scannerStateRef.current = 'idle';
  }, []);

  const startScanner = useCallback(async () => {
    if (scannerStateRef.current !== 'idle') return;

    setScanError('');
    scannerStateRef.current = 'starting';

    try {
      await new Promise(r => setTimeout(r, 300));

      if (scannerStateRef.current !== 'starting') return;

      const el = document.getElementById(scannerContainerId);
      if (!el) {
        scannerStateRef.current = 'idle';
        return;
      }

      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (decodedText.startsWith('GIGA-')) {
            onScanned(decodedText);
            stopScanner();
          }
        },
        () => {}
      );

      if (scannerStateRef.current === 'starting') {
        scannerStateRef.current = 'running';
      }
    } catch (err: any) {
      scannerStateRef.current = 'idle';
      scannerRef.current = null;
      setScanError(err?.message || 'Camera access denied');
    }
  }, [onScanned, stopScanner]);

  useEffect(() => {
    if (isOpen && activeMode === 'scan') {
      startScanner();
    } else {
      stopScanner();
    }
  }, [activeMode, isOpen, startScanner, stopScanner]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  const handleClose = useCallback(async () => {
    await stopScanner();
    onClose();
  }, [stopScanner, onClose]);

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
        onClick={handleClose}
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
              onClick={handleClose}
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

          {activeMode === 'show' && (
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
          )}

          {/* Scanner container always in DOM to prevent html5-qrcode crash on unmount */}
          <div
            className="qr-scan-content"
            style={{ display: activeMode === 'scan' ? undefined : 'none' }}
          >
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
