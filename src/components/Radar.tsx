import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OsIcon } from './OsIcon';

interface Peer {
  name: string;
  ip: string;
  port: number;
  device_type: string;
  os_type?: string;
}

interface RadarProps {
  peers: Peer[];
  onSelectPeer: (peer: Peer) => void;
  onDropFiles?: (peer: Peer, paths: string[]) => void;
}

interface RadarExtraProps {
  platform?: string;
}

export const Radar: React.FC<RadarProps & RadarExtraProps> = ({ peers, onSelectPeer, onDropFiles, platform }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(130);
  const [dragOverPeer, setDragOverPeer] = useState<string | null>(null);

  // Dynamic radius based on container size
  useEffect(() => {
    const updateRadius = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setRadius(Math.min(clientWidth, clientHeight) * 0.32);
      }
    };
    updateRadius();
    const observer = new ResizeObserver(updateRadius);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="radar-container" ref={containerRef}>
      {/* Animated pulse rings */}
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="radar-circle"
          initial={{ scale: 0.3, opacity: 0.6 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{
            repeat: Infinity,
            duration: 4,
            delay: i * 1.3,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Center device */}
      <motion.div
        className="device-avatar center-device"
        animate={{
          boxShadow: [
            '0 0 20px rgba(139, 92, 246, 0.3)',
            '0 0 40px rgba(139, 92, 246, 0.6)',
            '0 0 20px rgba(139, 92, 246, 0.3)',
          ]
        }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      >
        <OsIcon
          os={platform || 'unknown'}
          type={platform === 'android' || platform === 'ios' ? 'mobile' : 'desktop'}
          size={36}
        />
      </motion.div>

      {/* Peer devices */}
      <AnimatePresence>
        {peers.map((peer, index) => {
          const angle = (index / Math.max(peers.length, 1)) * 2 * Math.PI - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          return (
            <motion.div
              key={peer.ip}
              initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                x,
                y,
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 200 }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onSelectPeer(peer)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverPeer(peer.ip);
              }}
              onDragLeave={() => setDragOverPeer(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverPeer(null);
                if (onDropFiles && e.dataTransfer.files.length > 0) {
                  const paths = Array.from(e.dataTransfer.files).map(f => (f as any).path || f.name);
                  onDropFiles(peer, paths);
                }
              }}
              className={`peer-device ${dragOverPeer === peer.ip ? 'drag-over' : ''}`}
            >
              <motion.div
                className="device-avatar peer-avatar"
                style={{ position: 'relative' }}
                animate={{
                  boxShadow: [
                    '0 0 10px rgba(59, 130, 246, 0.3)',
                    '0 0 25px rgba(59, 130, 246, 0.5)',
                    '0 0 10px rgba(59, 130, 246, 0.3)',
                  ]
                }}
                transition={{ repeat: Infinity, duration: 2.5, delay: index * 0.3 }}
              >
                <OsIcon
                  os={peer.os_type || 'unknown'}
                  type={peer.device_type}
                  size={28}
                />
                {/* OS badge */}
                {peer.os_type && peer.os_type !== 'unknown' && (
                  <div className="os-badge">
                    <OsIcon os={peer.os_type} type={peer.device_type} size={10} color="var(--text-secondary)" />
                  </div>
                )}
              </motion.div>

              {/* Connection line */}
              <svg
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${Math.abs(x) + 30}px`,
                  height: `${Math.abs(y) + 30}px`,
                  pointerEvents: 'none',
                  overflow: 'visible',
                  zIndex: -1,
                }}
              >
                <motion.line
                  x1="0"
                  y1="0"
                  x2={-x}
                  y2={-y}
                  stroke="rgba(139, 92, 246, 0.15)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1 }}
                />
              </svg>

              <motion.span
                className="peer-name"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                {peer.name}
              </motion.span>
              <span className="peer-type">
                {peer.os_type && peer.os_type !== 'unknown' ? peer.os_type : peer.device_type}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
