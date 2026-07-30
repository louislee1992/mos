import { type FC, useState, useEffect, useRef } from 'react';
import type { AccountEntry } from '../types/accounts';
import type { UserSettings, CustomWallpaper, DeviceInfo } from '../types/settings';
import { wallpapers } from '../data/wallpapers';
import { getDeviceInfo } from '../api/system';
import { uploadConfig, deleteConfig } from '../api/settings';
import { getCredentials } from '../api/client';

interface MyAccountProps {
  accessKey: string | null;
  settings: UserSettings | null;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  initialTab?: string;
}

type TabId = 'account' | 'theme' | 'devices';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN');
}

const MyAccount: FC<MyAccountProps> = ({ accessKey, settings, onUpdateSettings }) => {
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [deviceInfoLoading, setDeviceInfoLoading] = useState(true);
  const [wallpaperSubTab, setWallpaperSubTab] = useState<'preset' | 'solid' | 'custom'>(
    settings?.wallpaperType ?? 'preset',
  );
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentAccount = accounts.find((a) => a.accessKey === accessKey) ?? null;

  /* Load accounts on mount */
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

  /* Load device info on mount */
  useEffect(() => {
    getDeviceInfo()
      .then(setDeviceInfo)
      .catch(console.error)
      .finally(() => setDeviceInfoLoading(false));
  }, []);

  /* Sync wallpaperSubTab when settings.wallpaperType changes from parent */
  useEffect(() => {
    if (settings?.wallpaperType) {
      setWallpaperSubTab(settings.wallpaperType);
    }
  }, [settings?.wallpaperType]);

  /* Load custom wallpaper thumbnails */
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
          const res = await fetch(`${creds.endpoint}/api/config/${encodeURIComponent(key)}`, {
            headers: {
              'Authorization': 'Basic ' + btoa(`${creds.accessKey}:${creds.secretKey}`),
              'X-Minio-Endpoint': creds.endpoint,
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

  /* ── Handlers ── */

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

  /* ── Style helpers ── */

  const activeBtnStyle = (isActive: boolean) => ({
    padding: '6px 16px',
    border: isActive
      ? '1px solid rgba(66,133,244,0.6)'
      : '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    background: isActive
      ? 'rgba(66,133,244,0.15)'
      : 'rgba(255,255,255,0.04)',
    color: isActive ? '#8ab4f8' : '#aaa',
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
        stroke="#4285f4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  /* ── Nav items ── */

  const navItems: { id: TabId; label: string }[] = [
    { id: 'account', label: '账号' },
    { id: 'theme', label: '主题壁纸' },
    { id: 'devices', label: '登录设备管理' },
  ];

  /* ── Solid colour palette ── */

  const solidColors = [
    '#1a1a2e', '#16213e', '#0f3460', '#533483',
    '#e94560', '#ff6b6b', '#ffd93d', '#6bcb77',
    '#4d96ff', '#9b59b6', '#1abc9c', '#e67e22',
  ];

  /* ── Render ── */

  return (
    <div className="fm-container">
      <div className="settings-sidebar">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`settings-nav-btn${activeTab === item.id ? ' settings-nav-btn-active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        {/* ═══ Tab 1: Account Info ═══ */}
        {activeTab === 'account' && (
          <div className="settings-info-section">
            <h2
              style={{
                margin: '0 0 16px',
                fontSize: 16,
                color: '#e0e0e0',
                fontWeight: 600,
              }}
            >
              账号
            </h2>

            {loading && (
              <p style={{ color: '#888', fontSize: 14 }}>加载中...</p>
            )}

            {!loading && !currentAccount && (
              <p style={{ color: '#888', fontSize: 14 }}>暂无账号信息</p>
            )}

            {!loading && currentAccount && (
              <div className="settings-info-card">
                <div className="settings-info-item">
                  <div className="settings-info-label">用户名</div>
                  <div className="settings-info-value">
                    {currentAccount.name}
                  </div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">MinIO 地址</div>
                  <div className="settings-info-value">
                    {currentAccount.endpoint}
                  </div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">Access Key</div>
                  <div className="settings-info-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {currentAccount.accessKey}
                  </div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">创建时间</div>
                  <div className="settings-info-value">
                    {formatTime(currentAccount.createdAt)}
                  </div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">最近使用</div>
                  <div className="settings-info-value">
                    {formatTime(currentAccount.lastUsedAt)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ Tab 2: Theme + Wallpaper ═══ */}
        {activeTab === 'theme' && (
          <div className="settings-info-section">
            <h2
              style={{
                margin: '0 0 16px',
                fontSize: 16,
                color: '#e0e0e0',
                fontWeight: 600,
              }}
            >
              主题壁纸
            </h2>

            {/* Theme mode */}
            <div className="settings-info-card">
              <div style={{ marginBottom: 12, fontSize: 13, color: '#ccc' }}>
                主题模式
              </div>
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

            {/* Wallpaper */}
            <div className="settings-info-card">
              <div style={{ marginBottom: 12, fontSize: 13, color: '#ccc' }}>
                壁纸
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(
                  [
                    { value: 'preset' as const, label: '预设' },
                    { value: 'solid' as const, label: '纯色' },
                    { value: 'custom' as const, label: '自定义' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.value}
                    style={activeBtnStyle(wallpaperSubTab === st.value)}
                    onClick={() => setWallpaperSubTab(st.value)}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Preset grid */}
              {wallpaperSubTab === 'preset' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 12,
                  }}
                >
                  {wallpapers.map((wp) => {
                    const selected =
                      settings?.wallpaperId === wp.id &&
                      settings?.wallpaperType === 'preset';
                    return (
                      <div
                        key={wp.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                          onUpdateSettings({
                            wallpaperId: wp.id,
                            wallpaperType: 'preset',
                          })
                        }
                      >
                        <div
                          style={{
                            width: '100%',
                            paddingBottom: '62.5%',
                            borderRadius: 6,
                            background: wp.background,
                            border: selected
                              ? '2px solid #4285f4'
                              : '2px solid transparent',
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          {selected && checkmarkSvg}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: '#aaa',
                            marginTop: 4,
                            textAlign: 'center',
                          }}
                        >
                          {wp.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Solid grid */}
              {wallpaperSubTab === 'solid' && (
                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    {solidColors.map((color) => {
                      const selected = settings?.solidColor === color;
                      return (
                        <div
                          key={color}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: color,
                            border: selected
                              ? '2px solid #4285f4'
                              : '2px solid transparent',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                          onClick={() => handleSolidColorChange(color)}
                        >
                          {selected && (
                            <svg
                              style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                              }}
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <path
                                d="M7 12l3 3 7-7"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <input
                      type="color"
                      value={settings?.solidColor ?? '#1a1a2e'}
                      onChange={(e) =>
                        handleSolidColorChange(e.target.value)
                      }
                      style={{
                        width: 36,
                        height: 36,
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        background: 'none',
                      }}
                    />
                    <input
                      type="text"
                      value={settings?.solidColor ?? '#1a1a2e'}
                      onChange={handleHexInputChange}
                      style={{
                        padding: '6px 10px',
                        fontSize: 13,
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#ccc',
                        width: 100,
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Custom grid */}
              {wallpaperSubTab === 'custom' && (
                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 12,
                    }}
                  >
                    {settings?.customWallpapers?.map((cw) => {
                      const selected =
                        settings?.wallpaperId === cw.id &&
                        settings?.wallpaperType === 'custom';
                      const thumbUrl = thumbnails[cw.id];
                      return (
                        <div
                          key={cw.id}
                          style={{ position: 'relative', cursor: 'pointer' }}
                        >
                          <div
                            onClick={() =>
                              onUpdateSettings({
                                wallpaperId: cw.id,
                                wallpaperType: 'custom',
                              })
                            }
                            style={{
                              width: '100%',
                              paddingBottom: '62.5%',
                              borderRadius: 6,
                              border: selected
                                ? '2px solid #4285f4'
                                : '2px solid transparent',
                              overflow: 'hidden',
                              position: 'relative',
                              background: thumbUrl
                                ? `url(${thumbUrl}) center/cover no-repeat`
                                : 'rgba(255,255,255,0.05)',
                            }}
                          >
                            {selected && checkmarkSvg}
                          </div>

                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustom(cw);
                            }}
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              border: 'none',
                              background: 'rgba(0,0,0,0.6)',
                              color: '#fff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              lineHeight: 1,
                            }}
                          >
                            X
                          </button>

                          <div
                            style={{
                              fontSize: 11,
                              color: '#888',
                              marginTop: 2,
                              textAlign: 'center',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {cw.name}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add button */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%',
                        paddingBottom: '62.5%',
                        borderRadius: 6,
                        border: '2px dashed rgba(255,255,255,0.15)',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          fontSize: 24,
                          color: 'rgba(255,255,255,0.3)',
                        }}
                      >
                        +
                      </span>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelected}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Tab 3: Device Info ═══ */}
        {activeTab === 'devices' && (
          <div className="settings-info-section">
            <h2
              style={{
                margin: '0 0 16px',
                fontSize: 16,
                color: '#e0e0e0',
                fontWeight: 600,
              }}
            >
              登录设备管理
            </h2>

            <div className="settings-info-card">
              <div style={{ marginBottom: 12, fontSize: 13, color: '#ccc' }}>
                当前设备
              </div>

              {deviceInfoLoading && (
                <p style={{ color: '#888', fontSize: 14 }}>加载中...</p>
              )}

              {!deviceInfoLoading && deviceInfo && (
                <>
                  <div className="settings-info-item">
                    <div className="settings-info-label">操作系统</div>
                    <div className="settings-info-value">
                      {deviceInfo.osName} {deviceInfo.osVersion}
                    </div>
                  </div>
                  <div className="settings-info-item">
                    <div className="settings-info-label">主机名</div>
                    <div className="settings-info-value">
                      {deviceInfo.hostname}
                    </div>
                  </div>
                  <div className="settings-info-item">
                    <div className="settings-info-label">IP 地址</div>
                    <div className="settings-info-value">
                      {deviceInfo.localIp}
                    </div>
                  </div>
                </>
              )}
            </div>

            {currentAccount && (
              <div className="settings-info-card">
                <div
                  style={{ marginBottom: 12, fontSize: 13, color: '#ccc' }}
                >
                  登录历史
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">最近登录</div>
                  <div className="settings-info-value">
                    {formatTime(currentAccount.lastUsedAt)}
                  </div>
                </div>
                <div className="settings-info-item">
                  <div className="settings-info-label">登录节点</div>
                  <div className="settings-info-value">
                    {currentAccount.endpoint}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyAccount;
