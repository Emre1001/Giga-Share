import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOpen, Shield, Zap, Wifi, Globe, Gauge, Share2, Tag } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: any;
  isMobile: boolean;
  onUpdate: (newSettings: any) => void;
}

export const SettingsModal: React.FC<SettingsProps> = ({ isOpen, onClose, settings, isMobile, onUpdate }) => {
  const [pathInput, setPathInput] = useState('');
  const [sendToInstalled, setSendToInstalled] = useState(false);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    const platform = osType();
    setIsWindows(platform === 'windows');
    if (platform === 'windows') {
      invoke('check_send_to').then((v: any) => setSendToInstalled(!!v)).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChangePath = async () => {
    if (isMobile) {
      return;
    }
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        onUpdate({ ...settings, download_path: selected });
      }
    } catch (e) {
      console.error("Directory select failed:", e);
    }
  };

  const handleMobilePathChange = (value: string) => {
    setPathInput(value);
  };

  const handleMobilePathSave = () => {
    if (pathInput.trim()) {
      onUpdate({ ...settings, download_path: pathInput.trim() });
      invoke("set_download_path", { path: pathInput.trim() });
    }
  };

  const handleAutostartToggle = async (checked: boolean) => {
    onUpdate({ ...settings, autostart: checked });
    try {
      const { enable, disable } = await import('@tauri-apps/plugin-autostart');
      if (checked) {
        await enable();
      } else {
        await disable();
      }
    } catch (e) {
      console.error("Autostart toggle failed:", e);
    }
  };

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
          className="glass-panel settings-panel"
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="settings-header">
            <h2>Settings</h2>
            <motion.button
              className="icon-btn"
              onClick={onClose}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <X size={20} />
            </motion.button>
          </div>

          <div className="settings-list">
            {/* ──── Device Name ──── */}
            <motion.div
              className="setting-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.01 }}
            >
              <div className="setting-label">
                <Tag size={18} color="var(--accent-purple)" />
                <div>
                  <span>Device Name</span>
                  <span className="setting-hint">Shown to other devices</span>
                </div>
              </div>
              <input
                type="text"
                value={settings.device_name || ''}
                onChange={e => onUpdate({ ...settings, device_name: e.target.value })}
                placeholder="My Device"
                className="glass-input"
                style={{ width: '100%', marginTop: '8px' }}
                maxLength={32}
              />
            </motion.div>

            <div className="settings-separator" />

            {/* ──── Online Mode Toggle ──── */}
            <motion.div
              className="setting-item setting-row online-mode-setting"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.02 }}
            >
              <div className="setting-label">
                <Globe size={18} color="var(--accent-blue)" />
                <div>
                  <span>Online Mode</span>
                  <span className="setting-hint">
                    {settings.online_mode ? 'P2P to friends worldwide' : 'LAN only'}
                  </span>
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.online_mode || false}
                  onChange={e => onUpdate({ ...settings, online_mode: e.target.checked })}
                />
                <span className="slider round"></span>
              </label>
            </motion.div>

            {/* Separator */}
            <div className="settings-separator" />

            {/* Download Path */}
            <motion.div
              className="setting-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="setting-label">
                <FolderOpen size={18} color="var(--accent-purple)" />
                <span>Download Path</span>
              </div>
              {isMobile ? (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {[
                      { label: 'Downloads', path: '/storage/emulated/0/Download' },
                      { label: 'Documents', path: '/storage/emulated/0/Documents' },
                      { label: 'DCIM', path: '/storage/emulated/0/DCIM' },
                    ].map(preset => (
                      <motion.button
                        key={preset.path}
                        className="btn-secondary"
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          opacity: (pathInput || settings.download_path) === preset.path ? 1 : 0.7,
                          border: (pathInput || settings.download_path) === preset.path
                            ? '1px solid var(--accent-purple)' : undefined,
                        }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setPathInput(preset.path);
                          onUpdate({ ...settings, download_path: preset.path });
                          invoke("set_download_path", { path: preset.path });
                        }}
                      >
                        {preset.label}
                      </motion.button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={pathInput || settings.download_path || ''}
                      onChange={e => handleMobilePathChange(e.target.value)}
                      placeholder="/storage/emulated/0/Download"
                      className="glass-input"
                      style={{ flex: 1, fontSize: '13px' }}
                    />
                    <motion.button
                      className="btn-secondary"
                      style={{ padding: '0 12px' }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleMobilePathSave}
                    >
                      Save
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="text"
                    value={settings.download_path || ''}
                    readOnly
                    className="glass-input"
                    style={{ flex: 1, textOverflow: 'ellipsis' }}
                  />
                  <motion.button
                    className="btn-secondary"
                    style={{ padding: '0 15px' }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleChangePath}
                  >
                    Browse
                  </motion.button>
                </div>
              )}
            </motion.div>

            {/* Auto-Accept */}
            <motion.div
              className="setting-item setting-row"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="setting-label">
                <Shield size={18} color="var(--accent-blue)" />
                <span>Auto-Accept Transfers</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.auto_accept || false}
                  onChange={e => onUpdate({ ...settings, auto_accept: e.target.checked })}
                />
                <span className="slider round"></span>
              </label>
            </motion.div>

            {/* ──── Speed Limits ──── */}
            <div className="settings-separator" />

            <motion.div
              className="setting-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 }}
            >
              <div className="setting-label">
                <Gauge size={18} color="var(--accent-purple)" />
                <span>Speed Limit (LAN)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={settings.speed_limit_lan_mbps || 0}
                  onChange={e => onUpdate({ ...settings, speed_limit_lan_mbps: parseFloat(e.target.value) || 0 })}
                  className="glass-input"
                  style={{ width: '80px' }}
                />
                <span className="text-secondary" style={{ fontSize: '12px' }}>Mbit/s (0 = unlimited)</span>
              </div>
            </motion.div>

            <motion.div
              className="setting-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.14 }}
            >
              <div className="setting-label">
                <Gauge size={18} color="var(--accent-blue)" />
                <span>Speed Limit (Online)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={settings.speed_limit_online_mbps || 0}
                  onChange={e => onUpdate({ ...settings, speed_limit_online_mbps: parseFloat(e.target.value) || 0 })}
                  className="glass-input"
                  style={{ width: '80px' }}
                />
                <span className="text-secondary" style={{ fontSize: '12px' }}>Mbit/s (0 = unlimited)</span>
              </div>
            </motion.div>

            <div className="settings-separator" />

            {/* Desktop-only settings */}
            {!isMobile && (
              <>
                <motion.div
                  className="setting-item setting-row"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <div className="setting-label">
                    <Zap size={18} color="var(--accent-purple)" />
                    <span>Minimize to Tray</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.minimize_to_tray || false}
                      onChange={e => onUpdate({ ...settings, minimize_to_tray: e.target.checked })}
                    />
                    <span className="slider round"></span>
                  </label>
                </motion.div>

                <motion.div
                  className="setting-item setting-row"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="setting-label">
                    <Zap size={18} color="var(--accent-blue)" />
                    <span>Start on Boot</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.autostart || false}
                      onChange={e => handleAutostartToggle(e.target.checked)}
                    />
                    <span className="slider round"></span>
                  </label>
                </motion.div>

                {/* Windows Send To */}
                {isWindows && (
                  <motion.div
                    className="setting-item setting-row"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.22 }}
                  >
                    <div className="setting-label">
                      <Share2 size={18} color="var(--accent-purple)" />
                      <div>
                        <span>Send To Menu</span>
                        <span className="setting-hint">Right-click → Send to → Giga-Share</span>
                      </div>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={sendToInstalled}
                        onChange={async (e) => {
                          try {
                            if (e.target.checked) {
                              await invoke('install_send_to');
                              setSendToInstalled(true);
                            } else {
                              await invoke('remove_send_to');
                              setSendToInstalled(false);
                            }
                          } catch (err) {
                            console.error('Send To toggle failed:', err);
                          }
                        }}
                      />
                      <span className="slider round"></span>
                    </label>
                  </motion.div>
                )}
              </>
            )}

            {/* Mobile-only: Run in Background */}
            {isMobile && (
              <motion.div
                className="setting-item setting-row"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
              >
                <div className="setting-label">
                  <Zap size={18} color="var(--accent-purple)" />
                  <div>
                    <span>Run in Background</span>
                    <span className="setting-hint">Disable battery optimization first</span>
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={settings.run_in_background || false}
                    onChange={e => onUpdate({ ...settings, run_in_background: e.target.checked })}
                  />
                  <span className="slider round"></span>
                </label>
              </motion.div>
            )}

            {/* Port */}
            <motion.div
              className="setting-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
            >
              <div className="setting-label">
                <Wifi size={18} color="var(--accent-purple)" />
                <span>Port</span>
              </div>
              <input
                type="number"
                value={settings.port || 52526}
                onChange={e => onUpdate({ ...settings, port: parseInt(e.target.value) || 52526 })}
                className="glass-input"
                style={{ width: '100px', display: 'block', marginTop: '8px' }}
              />
              <span className="setting-hint" style={{ marginTop: '4px', display: 'block', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                Restart app for port changes to take effect
              </span>
            </motion.div>
          </div>

          <motion.button
            className="btn-primary save-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
          >
            Done
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
