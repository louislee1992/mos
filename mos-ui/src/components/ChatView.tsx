import { type FC, useState, useRef, useEffect, useMemo, Fragment } from 'react';
import type { ChatMessage, ConversationMeta, UserProfile } from '../types/chat';
import type { ShareRecord } from '../types/share';
import { saveShare } from '../api/share';
import { saveChatFileToVfs } from '../api/chat';
import EmojiPicker from './EmojiPicker';
import ShareFileModal from './ShareFileModal';
import SaveToModal from './SaveToModal';
import { AnimatePresence } from 'framer-motion';
import ImageLightbox from './ImageLightbox';

interface ChatViewProps {
  convId: string; conversations: ConversationMeta[];
  messages: ChatMessage[]; loading: boolean;
  currentUserKey: string; allProfiles: UserProfile[]; myProfile: UserProfile;
  onlineAccessKeys: string[];
  shares: ShareRecord[];
  onShareFile: (vfsPath: string, days: number) => void;
  onToast: (msg: string) => void;
  onSendMessage: (convId: string, content: string, msgType: string, fileName?: string, fileSize?: number) => void;
  onAddMembers: (convId: string, memberKeys: string[]) => void;
  onUploadFile: (convId: string, file: File) => Promise<string | null>;
  onCaptureScreenshot: () => Promise<string | null>;
  onDownloadFile: (s3Key: string, filename: string) => Promise<void>;
}

const avatarColor = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 45%)`;
};

const FILE_TTL_MS = 30 * 86400000;

const ChatView: FC<ChatViewProps> = ({
  convId, conversations, messages, loading, currentUserKey,
  allProfiles, myProfile, onlineAccessKeys, shares, onShareFile, onToast,
  onSendMessage, onAddMembers,
  onUploadFile, onCaptureScreenshot, onDownloadFile,
}) => {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [saveTo, setSaveTo] = useState<{ fileName: string; onConfirm: (destPath: string) => Promise<void> } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conv = conversations.find(c => c.id === convId);
  const isGroup = conv?.type === 'group';
  const onlineSet = useMemo(() => new Set(onlineAccessKeys), [onlineAccessKeys]);

  const renderMessageAvatar = (key: string, name: string) => {
    const online = onlineSet.has(key);
    return (
      <div
        className={`message-avatar${online ? ' message-avatar-online' : ''}`}
        style={online ? { background: avatarColor(key) } : undefined}
      >
        {name.charAt(0).toUpperCase()}
        <span className={`chat-online-dot${online ? ' chat-online-dot-active' : ''}`} />
      </div>
    );
  };
  const convName = conv ? (isGroup ? (conv.name || '群聊') :
    (allProfiles.find(p => p.accessKey === conv.members.find(m => m !== currentUserKey))?.nickname || '用户')) : '';

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = () => { const t = input.trim(); if (!t) return; onSendMessage(convId, t, 'text'); setInput(''); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleEmoji = (emoji: string) => { setInput(p => p + emoji); setShowEmoji(false); textareaRef.current?.focus(); };

  const handleFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const s3k = await onUploadFile(convId, file);
    if (s3k) onSendMessage(convId, s3k, 'file', file.name, file.size);
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmSaveTo = async (destPath: string) => {
    if (!saveTo) return;
    try {
      await saveTo.onConfirm(destPath);
      onToast(`已转存到 ${destPath || '根目录'}`);
      window.dispatchEvent(new Event('vfs-changed'));
      setSaveTo(null);
    } catch (e) {
      onToast(`转存失败: ${e}`);
    }
  };

  const fmtSize = (n: number) => {
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  };

  const handleScreenshot = async () => { const u = await onCaptureScreenshot(); if (u) onSendMessage(convId, u, 'image'); };

  const handleAdd = () => { if (selectedMembers.size === 0) return; onAddMembers(convId, [...selectedMembers]); setSelectedMembers(new Set()); setShowAddMembers(false); };

  const fmt = (ts: number) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

  const sameDay = (a: number, b: number) => {
    const da = new Date(a); const db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    if (sameDay(ts, Date.now())) return '今天';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (sameDay(ts, y.getTime())) return '昨天';
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="chat-view">
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-avatar chat-avatar-sm">{convName.charAt(0).toUpperCase()}</div>
          <div><div className="chat-header-name">{convName}</div>
            {isGroup && conv && <div className="chat-header-members">{conv.members.length} 人</div>}</div>
        </div>
        {!isGroup && (
          <button className="chat-icon-btn" onClick={() => setShowAddMembers(true)} title="升级为群聊">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 14c0-3 2-4.5 4-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="11" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.5 8h4M11.5 5.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M10 14c0-2 1.5-3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="message-list">
        {loading && <div className="message-loading">加载中...</div>}
        {messages.map((msg, i) => {
          const isSelf = msg.sender === currentUserKey;
          const showDate = i === 0 || !sameDay(messages[i - 1].timestamp, msg.timestamp);
          const fileExpired = msg.type === 'file' && Date.now() - msg.timestamp > FILE_TTL_MS;
          const fileRemaining = msg.type === 'file'
            ? Math.max(0, Math.ceil((msg.timestamp + FILE_TTL_MS - Date.now()) / 86400000))
            : 0;
          if (msg.type === 'system') {
            return (
              <Fragment key={msg.id}>
                {showDate && <div className="message-date">{fmtDate(msg.timestamp)}</div>}
                <div className="message-item message-item-system">
                  <div className="message-system">{msg.content}</div>
                </div>
              </Fragment>
            );
          }
          if (msg.type === 'share') {
            const share = shares.find(s => s.shareId === msg.content);
            const expired = !share || share.expiresAt < Date.now();
            return (
              <Fragment key={msg.id}>
                {showDate && <div className="message-date">{fmtDate(msg.timestamp)}</div>}
                <div className={`message-item${isSelf ? ' message-item-self' : ''}`}>
                {renderMessageAvatar(msg.sender, isSelf ? myProfile.nickname : msg.senderName)}
                <div className="message-body">
                  <div className={`message-share${expired ? ' message-share-expired' : ''}`}>
                    <svg viewBox="0 0 16 16" width="18" height="18" fill="none" className="message-share-icon">
                      <path d="M4 1h5l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
                      <path d="M9 1v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8" />
                    </svg>
                    <div className="message-share-info">
                      <div className="message-share-name">{share?.name || msg.fileName || '文件'}</div>
                      <div className="message-share-meta">
                        {share ? fmtSize(share.size) : ''}
                        {expired ? ' · 已失效' : share ? ` · 剩余 ${Math.max(0, Math.ceil((share.expiresAt - Date.now()) / 86400000))} 天` : ''}
                      </div>
                    </div>
                    {!isSelf && !expired && share?.url && (
                      <div className="message-share-actions">
                        <a className="message-share-btn" href={share.url} target="_blank" rel="noreferrer">下载</a>
                        <button className="message-share-btn" onClick={() => setSaveTo({ fileName: share.name, onConfirm: async (dest) => { await saveShare(share.shareId, dest); } })}>转存</button>
                      </div>
                    )}
                  </div>
                  <div className="message-time">{fmt(msg.timestamp)}</div>
                </div>
                </div>
              </Fragment>
            );
          }
          return (
            <Fragment key={msg.id}>
              {showDate && <div className="message-date">{fmtDate(msg.timestamp)}</div>}
              <div className={`message-item${isSelf ? ' message-item-self' : ''}`}>
              {renderMessageAvatar(msg.sender, isSelf ? myProfile.nickname : msg.senderName)}
              <div className="message-body">
                <div className={`message-bubble${isSelf ? ' message-bubble-self' : ''}`}>
                  {msg.type === 'image' ? <img src={msg.content} alt="截图" className="message-image" onClick={() => setViewImage(msg.content)} />
                   : msg.type === 'file' ? (
                    <div className={`message-share${fileExpired ? ' message-share-expired' : ''}`}>
                      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" className="message-share-icon">
                        <path d="M4 1h5l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8"/>
                        <path d="M9 1v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8"/>
                      </svg>
                      <div className="message-share-info">
                        <div className="message-share-name">{msg.fileName || '文件'}</div>
                        <div className="message-share-meta">
                          {fmtSize(msg.fileSize)}
                          {fileExpired ? ' · 已失效' : ` · 剩余 ${fileRemaining} 天`}
                        </div>
                      </div>
                      {!isSelf && !fileExpired && (
                        <div className="message-share-actions">
                          <button
                            className="message-share-btn"
                            disabled={downloadingKey === msg.id}
                            onClick={async () => {
                              setDownloadingKey(msg.id);
                              try {
                                await onDownloadFile(msg.content, msg.fileName || 'file');
                              } finally {
                                setDownloadingKey(null);
                              }
                            }}
                          >
                            {downloadingKey === msg.id ? '下载中…' : '下载'}
                          </button>
                          <button className="message-share-btn" onClick={() => setSaveTo({ fileName: msg.fileName || '文件', onConfirm: async (dest) => { await saveChatFileToVfs(msg.content, dest); } })}>转存</button>
                        </div>
                      )}
                    </div>
                   ) : msg.type === 'emoji' ? <span style={{ fontSize: '2rem' }}>{msg.content}</span>
                   : <div className="message-text">{msg.content}</div>}
                </div>
                <div className="message-time">{fmt(msg.timestamp)}</div>
              </div>
              </div>
            </Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-area">
        <textarea ref={textareaRef} className="message-input" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows={2} />
        {showEmoji && <EmojiPicker onSelect={handleEmoji} onClose={() => setShowEmoji(false)} />}
        <div className="message-input-row">
          <div className="message-input-toolbar">
            <button className="chat-icon-btn" onClick={() => setShowEmoji(!showEmoji)} title="表情">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><circle cx="5.5" cy="7" r="0.8" fill="currentColor"/><circle cx="10.5" cy="7" r="0.8" fill="currentColor"/><path d="M5 10c1 1.5 3 1.5 5 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </button>
            <button className="chat-icon-btn" onClick={handleScreenshot} title="截图">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><rect x="1" y="3" width="11" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M5 1h7l3 3v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="6" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1"/></svg>
            </button>
            <button className="chat-icon-btn" onClick={handleFile} title="发送文件">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M8 9.5V2.5m0 0L5.5 5M8 2.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M2.5 12v1A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </button>
            <button className="chat-icon-btn" onClick={() => setShowShareModal(true)} title="分享网盘文件">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><circle cx="12" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.3"/><circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/><circle cx="12" cy="12.5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M10.2 4.6L5.8 7.2M10.2 11.4L5.8 8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </button>
          </div>
          <button className="message-send-btn" onClick={handleSend} disabled={!input.trim()}>发送</button>
        </div>
      </div>

      {showAddMembers && (
        <div className="fm-modal-overlay" onClick={() => setShowAddMembers(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="fm-modal-header">添加成员</div>
            <div className="fm-modal-body">
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {allProfiles.filter(p => p.accessKey !== currentUserKey && !(conv?.members.includes(p.accessKey))).map(p => (
                  <label key={p.accessKey} className="chat-member-check">
                    <input type="checkbox" checked={selectedMembers.has(p.accessKey)}
                      onChange={() => setSelectedMembers(prev => { const n = new Set(prev); n.has(p.accessKey) ? n.delete(p.accessKey) : n.add(p.accessKey); return n; })} />
                    <span>{p.nickname}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setShowAddMembers(false)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={handleAdd} className="fm-modal-btn fm-modal-btn-ok">确认</button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <ShareFileModal
          onSend={(path, days) => { onShareFile(path, days); setShowShareModal(false); }}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {saveTo && (
        <SaveToModal
          fileName={saveTo.fileName}
          onConfirm={handleConfirmSaveTo}
          onClose={() => setSaveTo(null)}
        />
      )}

      <AnimatePresence>
        {viewImage && <ImageLightbox src={viewImage} onClose={() => setViewImage(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default ChatView;
