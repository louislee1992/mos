import { type FC, useState, useEffect, useRef } from 'react';
import type { AccountEntry } from '../types/accounts';
import type { UserSettings, CustomWallpaper, DeviceInfo, LoginHistoryEntry } from '../types/settings';
import type { SystemInfo } from '../types/system';
import { wallpapers } from '../data/wallpapers';
import { getDeviceInfo, getLoginHistory, getSystemInfo } from '../api/system';
import { uploadConfig, deleteConfig } from '../api/settings';
import { getCredentials } from '../api/client';
import iconSvgs from '../data/icons';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN');
}

type NavItem = 'system' | 'users' | 'apps' | 'account' | 'theme' | 'devices';

interface SettingsProps {
  accessKey: string | null;
  settings: UserSettings | null;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  initialTab?: string;
}

const Settings: FC<SettingsProps> = ({ accessKey, settings, onUpdateSettings, initialTab }) => {
  const [activeNav, setActiveNav] = useState<NavItem>(() => {
    if (initialTab === 'theme') return 'theme';
    return 'system';
  });
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isAdmin] = useState(false);

  /* MyAccount state */
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [deviceInfoLoading, setDeviceInfoLoading] = useState(true);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [wallpaperSubTab, setWallpaperSubTab] = useState<'preset' | 'solid' | 'custom'>(
    settings?.wallpaperType ?? 'preset',
  );
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentAccount = accounts.find((a) => a.accessKey === accessKey) ?? null;

  useEffect(() => {
    getSystemInfo().then((info: any) => setSystemInfo(info)).catch(console.error);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mos-accounts');
      setAccounts(raw ? JSON.parse(raw) : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getDeviceInfo()
      .then(setDeviceInfo)
      .catch(console.error)
      .finally(() => setDeviceInfoLoading(false));
    getLoginHistory()
      .then(setLoginHistory)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (settings?.wallpaperType) {
      setWallpaperSubTab(settings.wallpaperType);
    }
  }, [settings?.wallpaperType]);

  useEffect(() => {
    if (!settings?.customWallpapers?.length) {
      setThumbnails({});
      return;
    }
    const urls: string[] = [];
    let cancelled = false;
    Promise.all(
      settings.customWallpapers.map(async (cw) => {
        try {
          const key = cw.key.replace('config/', '');
          const creds = getCredentials();
          const res = await fetch(`/api/config/download?key=${encodeURIComponent(key)}`, {
            headers: {
              'Authorization': 'Basic ' + btoa(`${creds.accessKey}:${creds.secretKey}`)
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return { id: cw.id, url };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      const map: Record<string, string> = {};
      for (const r of results) {
        if (r) map[r.id] = r.url;
      }
      setThumbnails(map);
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [settings?.customWallpapers]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop() || 'png';
    const id = crypto.randomUUID();
    const key = `wallpapers/${id}.${ext}`;
    await uploadConfig(file, key);
    const newCw: CustomWallpaper = { id, name: file.name, key: `config/${key}` };
    const updated = [...(settings?.customWallpapers ?? []), newCw];
    onUpdateSettings({ customWallpapers: updated });
    e.target.value = '';
  };

  const handleDeleteCustom = async (cw: CustomWallpaper) => {
    try {
      await deleteConfig(cw.key);
      const updated = (settings?.customWallpapers ?? []).filter((c) => c.id !== cw.id);
      onUpdateSettings({ customWallpapers: updated });
    } catch (err) {
      console.error('Failed to delete wallpaper:', err);
    }
  };

  const handleSolidColorChange = (color: string) => {
    onUpdateSettings({ solidColor: color, wallpaperType: 'solid' });
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      onUpdateSettings({ solidColor: val, wallpaperType: 'solid' });
    }
  };

  const activeBtnStyle = (isActive: boolean) => ({
    padding: '6px 16px',
    border: isActive
      ? '1px solid var(--border-focus)'
      : '1px solid var(--border-default)',
    borderRadius: 6,
    background: isActive
      ? 'var(--accent-bg)'
      : 'var(--bg-surface)',
    color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 13,
  });

  const checkmarkSvg = (
    <svg
      style={{ position: 'absolute', bottom: 4, right: 4 }}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="12" fill="white" />
      <path
        d="M7 12l3 3 7-7"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const solidColors = [
    '#1a1a2e', '#16213e', '#0f3460', '#533483',
    '#e94560', '#ff6b6b', '#ffd93d', '#6bcb77',
    '#4d96ff', '#9b59b6', '#1abc9c', '#e67e22',
  ];

  const navIcon = (id: NavItem) => {
    const color = activeNav === id ? 'var(--accent)' : 'var(--text-secondary)';
    switch (id) {
      case 'account':
        return (
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <circle cx="12" cy="9" r="3.5" stroke={color} strokeWidth="1.5" fill="none" />
            <path d="M5 20C5 16 8 14 12 14c4 0 7 2 7 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'theme':
        return (
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" stroke={color} strokeWidth="1.5" fill="none" />
            <path d="M12 2a10 10 0 0 1 0 20" fill={color} opacity="0.3" />
            <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.2" fill="none" />
          </svg>
        );
      case 'devices':
        return (
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
            <line x1="8" y1="19" x2="16" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="17" x2="12" y2="21" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        );
      case 'users':
        return (
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <circle cx="9" cy="7" r="3" stroke={color} strokeWidth="1.5" fill="none" />
            <path d="M1 20v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <circle cx="17" cy="9" r="2.5" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
            <path d="M21 20v-1a5 5 0 0 0-3-4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          </svg>
        );
      case 'apps':
        return (
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.5" />
          </svg>
        );
      case 'system':
        return (
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill="none" />
            <line x1="12" y1="7" x2="12" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="12" x2="15" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1" fill={color} />
          </svg>
        );
    }
  };

  const navItems: { id: NavItem; label: string }[] = [
    { id: 'account', label: '我的账号' },
    { id: 'theme', label: '主题壁纸' },
    { id: 'devices', label: '登录设备' },
    ...(isAdmin ? [{ id: 'users' as NavItem, label: '用户管理' }] : []),
    { id: 'apps', label: '应用管理' },
    { id: 'system', label: '系统信息' },
  ];

  return (
    <div className="fm-container">
      <div className="settings-sidebar">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            className={`settings-nav-btn${activeNav === item.id ? ' settings-nav-btn-active' : ''}`}
          >
            <span style={{ display: 'flex', alignItems: 'center', width: 16, height: 16, flexShrink: 0 }}>
              {navIcon(item.id)}
            </span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        {activeNav === 'system' && (
          <div className="settings-info-section">
            <div className="settings-info-card">
              <div className="settings-info-card-row">
                <img src="/favicon.png" alt="MOS" width="40" height="40" />
                <div>
                  <div className="settings-info-label">系统名称</div>
                  <div className="settings-info-value">MOS</div>
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">系统说明</div>
                <div className="settings-info-value">Minio OS — 基于 MinIO 对象存储的云桌面系统</div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">版本号</div>
                <div className="settings-info-value">
                  {systemInfo ? `v${systemInfo.appVersion}` : '加载中...'}
                </div>
              </div>
            </div>

            <div className="settings-info-card">
              <div className="settings-info-card-row">
                <span style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {iconSvgs['minio']}
                </span>
                <div>
                  <div className="settings-info-label">MinIO 服务器</div>
                  <div className="settings-info-value">
                    {systemInfo?.minioEndpoint ?? '加载中...'}
                  </div>
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">存储桶</div>
                <div className="settings-info-value">
                  {systemInfo?.minioBucket ?? '加载中...'}
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">对象数量</div>
                <div className="settings-info-value">
                  {systemInfo ? `${systemInfo.objectCount} 个对象` : '加载中...'}
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">已用容量</div>
                <div className="settings-info-value">
                  {systemInfo ? formatBytes(systemInfo.totalSizeBytes) : '加载中...'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeNav === 'account' && (
          <div className="settings-info-section">
            <h2 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>
              账号
            </h2>
            {loading && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>加载中...</p>}
            {!loading && !currentAccount && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>暂无账号信息</p>}
            {!loading && currentAccount && (
              <div className="settings-info-card">
                <div className="settings-info-item">
                  <div className="settings-info-label">用户名</div>
                  <div className="settings-info-value">{currentAccount.name}</div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">Access Key</div>
                  <div className="settings-info-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {currentAccount.accessKey}
                  </div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">创建时间</div>
                  <div className="settings-info-value">{formatTime(currentAccount.createdAt)}</div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">最近使用</div>
                  <div className="settings-info-value">{formatTime(currentAccount.lastUsedAt)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeNav === 'theme' && (
          <div className="settings-info-section">
            <h2 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>
              主题壁纸
            </h2>

            <div className="settings-info-card">
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>主题模式</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { value: 'system', label: '跟随系统' },
                  { value: 'light', label: '亮色' },
                  { value: 'dark', label: '暗色' },
                ].map((t) => (
                  <button
                    key={t.value}
                    style={activeBtnStyle(settings?.theme === t.value)}
                    onClick={() => onUpdateSettings({ theme: t.value })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-info-card">
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>壁纸</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['preset', 'solid', 'custom'] as const).map((st) => (
                  <button
                    key={st}
                    style={activeBtnStyle(wallpaperSubTab === st)}
                    onClick={() => setWallpaperSubTab(st)}
                  >
                    {{ preset: '预设', solid: '纯色', custom: '自定义' }[st]}
                  </button>
                ))}
              </div>

              {wallpaperSubTab === 'preset' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {wallpapers.map((wp) => {
                    const selected = settings?.wallpaperId === wp.id && settings?.wallpaperType === 'preset';
                    return (
                      <div key={wp.id} style={{ cursor: 'pointer' }} onClick={() => onUpdateSettings({ wallpaperId: wp.id, wallpaperType: 'preset' })}>
                        <div style={{
                          width: '100%', paddingBottom: '62.5%', borderRadius: 6,
                          background: wp.background,
                          border: selected ? '2px solid var(--accent)' : '2px solid transparent',
                          position: 'relative', overflow: 'hidden',
                        }}>
                          {selected && checkmarkSvg}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                          {wp.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {wallpaperSubTab === 'solid' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
                    {solidColors.map((color) => {
                      const selected = settings?.solidColor === color;
                      return (
                        <div
                          key={color}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', background: color,
                            border: selected ? '2px solid var(--accent)' : '2px solid transparent',
                            cursor: 'pointer', position: 'relative',
                          }}
                          onClick={() => handleSolidColorChange(color)}
                        >
                          {selected && (
                            <svg style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                              width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M7 12l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="color" value={settings?.solidColor ?? '#1a1a2e'}
                      onChange={(e) => handleSolidColorChange(e.target.value)}
                      style={{ width: 36, height: 36, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
                    <input type="text" value={settings?.solidColor ?? '#1a1a2e'}
                      onChange={handleHexInputChange}
                      style={{
                        padding: '6px 10px', fontSize: 13, borderRadius: 4,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-input)', color: 'var(--text-secondary)',
                        width: 100, outline: 'none',
                      }} />
                  </div>
                </div>
              )}

              {wallpaperSubTab === 'custom' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {settings?.customWallpapers?.map((cw) => {
                      const selected = settings?.wallpaperId === cw.id && settings?.wallpaperType === 'custom';
                      const thumbUrl = thumbnails[cw.id];
                      return (
                        <div key={cw.id} style={{ position: 'relative', cursor: 'pointer', minWidth: 0, overflow: 'hidden' }}>
                          <div onClick={() => onUpdateSettings({ wallpaperId: cw.id, wallpaperType: 'custom' })}
                            style={{
                              width: '100%', paddingBottom: '62.5%', borderRadius: 6,
                              border: selected ? '2px solid var(--accent)' : '2px solid transparent',
                              overflow: 'hidden', position: 'relative',
                              background: thumbUrl ? `url(${thumbUrl}) center/cover no-repeat` : 'var(--bg-surface)',
                            }}>
                            {selected && checkmarkSvg}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteCustom(cw); }}
                            style={{
                              position: 'absolute', top: 2, right: 2, width: 20, height: 20,
                              borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)',
                              color: '#fff', cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1,
                            }}>
                            X
                          </button>
                          <div style={{
                            fontSize: 11, color: 'var(--text-muted)', marginTop: 4,
                            textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {cw.name}
                          </div>
                        </div>
                      );
                    })}
                    <div onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%', paddingBottom: '62.5%', borderRadius: 6,
                        border: '2px dashed var(--border-default)', cursor: 'pointer', position: 'relative',
                      }}>
                      <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        fontSize: 24, color: 'var(--text-muted)' }}>+</span>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />
                </div>
              )}
            </div>
          </div>
        )}

        {activeNav === 'devices' && (
          <div className="settings-info-section">
            <h2 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>
              登录设备管理
            </h2>
            <div className="settings-info-card">
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>当前设备</div>
              {deviceInfoLoading && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>加载中...</p>}
              {!deviceInfoLoading && deviceInfo && (
                <>
                  <div className="settings-info-item">
                    <div className="settings-info-label">操作系统</div>
                    <div className="settings-info-value">{deviceInfo.osName} {deviceInfo.osVersion}</div>
                  </div>
                  <div className="settings-info-item">
                    <div className="settings-info-label">主机名</div>
                    <div className="settings-info-value">{deviceInfo.hostname}</div>
                  </div>
                  <div className="settings-info-item">
                    <div className="settings-info-label">IP 地址</div>
                    <div className="settings-info-value">{deviceInfo.localIp}</div>
                  </div>
                </>
              )}
            </div>
            <div className="settings-info-card">
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>登录历史（最近 10 次）</div>
              {loginHistory.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无登录记录</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>登录时间</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>IP 地址</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>主机名</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>操作系统</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginHistory.map((entry, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{formatTime(entry.loginTime)}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{entry.ipAddress}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{entry.hostname}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{entry.osName}{entry.osVersion ? ' ' + entry.osVersion : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeNav === 'users' && (
          <div className="settings-placeholder-section">
            <p className="settings-placeholder">用户管理 — 即将推出</p>
          </div>
        )}

        {activeNav === 'apps' && (
          <div className="settings-placeholder-section">
            <p className="settings-placeholder">应用管理 — 即将推出</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
