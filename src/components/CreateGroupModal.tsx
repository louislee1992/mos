import { type FC, useState } from 'react';
import type { UserProfile } from '../types/chat';

interface Props {
  profiles: UserProfile[]; currentUserKey: string;
  onCreate: (name: string, memberKeys: string[]) => void; onClose: () => void;
}

const CreateGroupModal: FC<Props> = ({ profiles, currentUserKey, onCreate, onClose }) => {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const others = profiles.filter(p => p.accessKey !== currentUserKey);

  return (
    <div className="fm-modal-overlay" onClick={onClose}>
      <div className="fm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="fm-modal-header">新建群聊</div>
        <div className="fm-modal-body">
          <input className="fm-modal-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="请输入群聊名称" autoFocus style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {others.length === 0
              ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>暂无可添加的用户</div>
              : others.map(p => (
                  <label key={p.accessKey} className="chat-member-check">
                    <input type="checkbox" checked={selected.has(p.accessKey)}
                      onChange={() => setSelected(prev => { const n = new Set(prev); n.has(p.accessKey) ? n.delete(p.accessKey) : n.add(p.accessKey); return n; })} />
                    <span>{p.nickname}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 8 }}>{p.accessKey}</span>
                  </label>
                ))
            }
          </div>
        </div>
        <div className="fm-modal-footer">
          <button onClick={onClose} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
          <button onClick={() => { const n = name.trim(); if (!n || selected.size === 0) return; onCreate(n, [...selected]); onClose(); }}
            className="fm-modal-btn fm-modal-btn-ok" disabled={!name.trim() || selected.size === 0}>创建</button>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupModal;
