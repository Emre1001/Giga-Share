import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Copy, Check, Trash2, Edit3, Send, Users, Globe, FileIcon, QrCode, Camera } from 'lucide-react';
import { QRPairing } from './QRPairing';

export interface Friend {
  id: string;
  node_id: string;
  display_name: string;
  added_at: number;
}

interface FriendsViewProps {
  friends: Friend[];
  myFriendCode: string;
  pendingFiles?: string[];
  onAddFriend: (code: string, name: string) => void;
  onRemoveFriend: (id: string) => void;
  onRenameFriend: (id: string, newName: string) => void;
  onSelectFriend: (friend: Friend) => void;
  onCancelPending?: () => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  friends,
  myFriendCode,
  pendingFiles,
  onAddFriend,
  onRemoveFriend,
  onRenameFriend,
  onSelectFriend,
  onCancelPending,
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addName, setAddName] = useState('');
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [qrMode, setQrMode] = useState<'show' | 'scan'>('show');

  const handleCopy = () => {
    navigator.clipboard.writeText(myFriendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAdd = () => {
    if (addCode.trim() && addName.trim()) {
      onAddFriend(addCode.trim(), addName.trim());
      setAddCode('');
      setAddName('');
      setShowAddDialog(false);
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      onRenameFriend(id, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleQRScanned = (code: string) => {
    setShowQR(false);
    setAddCode(code);
    setAddName('');
    setShowAddDialog(true);
  };

  return (
    <div className="friends-container">
      {/* My Friend Code */}
      <motion.div
        className="glass-panel friend-code-card"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="friend-code-header">
          <Globe size={18} color="var(--accent-blue)" />
          <span className="friend-code-label">Your Friend Code</span>
        </div>
        <div className="friend-code-display" onClick={handleCopy}>
          <code>{myFriendCode || 'Loading...'}</code>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); setQrMode('show'); setShowQR(true); }}
              style={{ cursor: 'pointer' }}
            >
              <QrCode size={16} color="var(--accent-purple)" />
            </motion.div>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              {copied ? (
                <Check size={16} color="#10b981" />
              ) : (
                <Copy size={16} color="var(--text-secondary)" />
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Add Friend + Scan QR */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <motion.button
          className="btn-primary add-friend-btn"
          onClick={() => setShowAddDialog(!showAddDialog)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ flex: 1 }}
        >
          <UserPlus size={18} />
          Add Friend
        </motion.button>
        <motion.button
          className="btn-secondary"
          onClick={() => { setQrMode('scan'); setShowQR(true); }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          style={{ padding: '10px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <Camera size={16} />
          Scan
        </motion.button>
      </div>

      {/* Add Friend Dialog */}
      <AnimatePresence>
        {showAddDialog && (
          <motion.div
            className="glass-panel add-friend-dialog"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <input
              type="text"
              placeholder="Friend Code (GIGA-XXXX-...)"
              value={addCode}
              onChange={e => setAddCode(e.target.value)}
              className="glass-input"
              style={{ width: '100%', marginBottom: '8px' }}
            />
            <input
              type="text"
              placeholder="Display Name"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              className="glass-input"
              style={{ width: '100%', marginBottom: '12px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <motion.button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={handleAdd}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Add
              </motion.button>
              <motion.button
                className="btn-secondary"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => setShowAddDialog(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending files banner */}
      <AnimatePresence>
        {pendingFiles && pendingFiles.length > 0 && (
          <motion.div
            className="glass-panel pending-files-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileIcon size={18} color="var(--accent-purple)" />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} ready
                </span>
                <span className="text-secondary" style={{ display: 'block', fontSize: '11px' }}>
                  Tap a friend to send
                </span>
              </div>
              {onCancelPending && (
                <motion.button
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={onCancelPending}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend List */}
      <div className="friends-list">
        <AnimatePresence>
          {friends.length === 0 ? (
            <motion.div
              className="no-friends"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Users size={40} color="var(--text-secondary)" />
              <p className="text-secondary" style={{ marginTop: '12px' }}>
                No friends added yet
              </p>
              <p className="text-secondary" style={{ fontSize: '12px' }}>
                Share your code and add friends to start
              </p>
            </motion.div>
          ) : (
            friends.map((friend, i) => (
              <motion.div
                key={friend.id}
                className="friend-item"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
                layout
              >
                <div className="friend-info" onClick={() => onSelectFriend(friend)}>
                  <div className="friend-avatar-small">
                    <Users size={20} color="white" />
                  </div>
                  <div>
                    {editingId === friend.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={() => handleRename(friend.id)}
                        onKeyDown={e => e.key === 'Enter' && handleRename(friend.id)}
                        className="glass-input rename-input"
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="friend-display-name">{friend.display_name}</span>
                    )}
                    <span className="friend-node-hint">
                      {friend.node_id.substring(0, 8)}...
                    </span>
                  </div>
                </div>
                <div className="friend-actions">
                  <motion.button
                    className="friend-action-btn send-btn"
                    onClick={() => onSelectFriend(friend)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title="Send files"
                  >
                    <Send size={16} />
                  </motion.button>
                  <motion.button
                    className="friend-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(friend.id);
                      setEditName(friend.display_name);
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title="Rename"
                  >
                    <Edit3 size={14} />
                  </motion.button>
                  <motion.button
                    className="friend-action-btn delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFriend(friend.id);
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </motion.button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* QR Pairing Dialog */}
      <QRPairing
        isOpen={showQR}
        mode={qrMode}
        friendCode={myFriendCode}
        onScanned={handleQRScanned}
        onClose={() => setShowQR(false)}
      />
    </div>
  );
};
