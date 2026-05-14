import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { X, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';

interface TransferViewProps {
  fileName: string;
  progress: number;
  speed: string;
  eta: string;
  history: { time: number; speed: number }[];
  isSending: boolean;
  onCancel: () => void;
}

export const TransferView: React.FC<TransferViewProps> = ({
  fileName,
  progress,
  speed,
  eta,
  history,
  isSending,
  onCancel
}) => {
  const isComplete = progress >= 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="glass-panel transfer-panel"
    >
      <div className="transfer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <motion.div
            animate={isComplete ? { scale: [1, 1.3, 1] } : { y: [0, -3, 0] }}
            transition={{ repeat: isComplete ? 0 : Infinity, duration: 1.5 }}
          >
            {isComplete ? (
              <CheckCircle2 color="#10b981" size={24} />
            ) : isSending ? (
              <ArrowUpRight color="var(--accent-purple)" size={24} />
            ) : (
              <ArrowDownLeft color="var(--accent-blue)" size={24} />
            )}
          </motion.div>
          <h2 style={{ fontSize: '20px' }}>
            {isComplete ? 'Complete!' : isSending ? 'Sending...' : 'Receiving...'}
          </h2>
        </div>
        <motion.button
          onClick={onCancel}
          className="icon-btn"
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
        >
          <X size={20} />
        </motion.button>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span className="text-secondary" style={{ fontSize: '14px' }}>{fileName}</span>
          <motion.span
            key={progress}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            style={{ fontSize: '14px', fontWeight: 'bold' }}
          >
            {progress}%
          </motion.span>
        </div>
        <div className="progress-track">
          <motion.div
            className="progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
          {!isComplete && (
            <motion.div
              className="progress-glow"
              animate={{ left: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '40px', marginBottom: '25px' }}>
        <div>
          <div className="stat-label">Speed</div>
          <motion.div
            className="stat-value"
            key={speed}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
          >
            {speed}
          </motion.div>
        </div>
        <div>
          <div className="stat-label">ETA</div>
          <div className="stat-value">{eta}</div>
        </div>
      </div>

      <motion.div
        style={{ height: '100px', width: '100%' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <defs>
              <linearGradient id="speedGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent-purple)" />
                <stop offset="100%" stopColor="var(--accent-blue)" />
              </linearGradient>
            </defs>
            <Line
              type="monotone"
              dataKey="speed"
              stroke="url(#speedGrad)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <YAxis hide domain={['auto', 'auto']} />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>
    </motion.div>
  );
};
