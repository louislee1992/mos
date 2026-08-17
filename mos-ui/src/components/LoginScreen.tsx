import { type FC, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { verifyCredentials } from '../api/auth';
import { setCredentials } from '../api/client';

interface AccountEntry {
  id: string;
  name: string;
  accessKey: string;
  secretKey: string;
  isAdmin: boolean;
  createdAt: number;
  lastUsedAt: number;
}

interface LoginScreenProps {
  onLoginSuccess: (accessKey: string) => void;
}

function getTimeString(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function getDateString(): string {
  const now = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

function getAccountColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

// WARNING: credentials (including secretKey) are stored as plaintext in localStorage.
// This is a known limitation of the web migration — the browser offers no secure
// equivalent to Tauri's OS-level encrypted file storage. Restrict access to the
// host machine accordingly.
const ACCOUNTS_KEY = 'mos-accounts';

function loadAccounts(): AccountEntry[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(entries: AccountEntry[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(entries));
}

const LoginScreen: FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [showForm, setShowForm] = useState(false);
  const [timeStr, setTimeStr] = useState(getTimeString);
  const [dateStr] = useState(getDateString);
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountEntry[]>(loadAccounts);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;





  useEffect(() => {
    const timer = setInterval(() => setTimeStr(getTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showForm && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setShowForm(true);
      }
      if (showForm && e.key === 'Escape') {
        setShowForm(false);
        setError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForm]);

  const doLogin = useCallback(async (ak: string, sk: string) => {
    setError(null);
    setLoading(true);
    try {
      await verifyCredentials(ak, sk);
      setCredentials(ak, sk);

      const now = Date.now();
      const prev = accountsRef.current;
      const existing = prev.find((a) => a.accessKey === ak);
      const entry: AccountEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        name: `MOS · ${ak}`,
        accessKey: ak,
        secretKey: sk,
        isAdmin: existing?.isAdmin ?? false,
        createdAt: existing?.createdAt ?? now,
        lastUsedAt: now,
      };
      const updated = prev.filter((a) => a.accessKey !== ak);
      updated.push(entry);

      saveAccounts(updated);
      setAccounts(updated);
      onLoginSuccess(ak);
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败');
    } finally {
      setLoading(false);
    }
  }, [onLoginSuccess]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await doLogin(accessKey.trim(), secretKey.trim());
    },
    [accessKey, secretKey, doLogin],
  );

  const handleDeleteAccount = useCallback((id: string) => {
    const updated = accounts.filter((a) => a.id !== id);
    saveAccounts(updated);
    setAccounts(updated);
  }, [accounts]);

  const handleSelectAccount = useCallback((acc: AccountEntry) => {
    doLogin(acc.accessKey, acc.secretKey);
  }, [doLogin]);

  const sortedAccounts = [...accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  return (
    <div
      className="login-screen"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      onClick={() => !showForm && setShowForm(true)}
    >
      {/* 锁屏层：时间 + 日期 */}
      <AnimatePresence>
        {!showForm && (
          <motion.div
            className="login-lockscreen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30, transition: { duration: 0.3 } }}
          >
            <h1 className="login-clock">
              {timeStr}
            </h1>
            <p className="login-date">{dateStr}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 登录表单层 */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            className="login-form-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="login-card"
              style={{
                background: 'rgba(22,22,42,0.9)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              }}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* 头像 */}
              <div className="login-avatar-row">
                <h2 className="login-title">MOS云桌面</h2>
              </div>

              {/* 已保存账户 */}
              {sortedAccounts.length > 0 && (
                <div className="login-accounts-row">
                  {sortedAccounts.map((acc) => (
                    <div key={acc.id} className="login-account-wrapper">
                      <button
                        type="button"
                        onClick={() => handleSelectAccount(acc)}
                        className="login-account-btn"
                        style={{ backgroundColor: getAccountColor(acc.id) }}
                        title={acc.name}
                      >
                        {acc.accessKey.charAt(0).toUpperCase()}
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAccount(acc.id);
                        }}
                        className="login-account-delete"
                      >
                        &#x00D7;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 表单 */}
              <form onSubmit={handleSubmit} className="login-form">
                <input
                  type="text"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Access Key"
                  className="login-input"
                />
                <div className="login-field-wrapper">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Secret Key"
                    className="login-input login-input-pr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="login-secret-toggle"
                    tabIndex={-1}
                  >
                    {showSecret ? (
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 4C5 4 1.5 10 1.5 10S5 16 10 16s8.5-6 8.5-6S15 4 10 4Z" />
                        <circle cx="10" cy="10" r="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 4C5 4 1.5 10 1.5 10S5 16 10 16s8.5-6 8.5-6S15 4 10 4Z" />
                        <circle cx="10" cy="10" r="3" />
                        <line x1="3" y1="3" x2="17" y2="17" />
                      </svg>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      className="login-error"
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  className="login-submit"
                >
                  {loading && (
                    <svg className="login-spinner" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                  {loading ? '验证中...' : '登录'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoginScreen;
