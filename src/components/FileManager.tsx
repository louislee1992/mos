import React, { type FC, useState, useEffect, useCallback, useRef } from 'react';

interface DirNode {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  children: DirNode[];
}

type NavKey = 'my-files' | 'shared-others' | 'my-shares' | 'recent' | 'favorites' | 'trash';
type SortKey = 'name' | 'time' | 'type' | 'size';

const NAV_ICONS: Record<NavKey, React.ReactNode> = {
  'my-files': (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M2 5.5C2 4.67 2.67 4 3.5 4h4.12l1.5 1.5h5.38c.83 0 1.5.67 1.5 1.5V15a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 15V5.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="1" />
    </svg>
  ),
  'shared-others': (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
      <circle cx="7" cy="8" r="2.5" stroke="#9ca3af" strokeWidth="1.3" />
      <path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" stroke="#9ca3af" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="14" cy="7" r="2" stroke="#9ca3af" strokeWidth="1.3" />
      <path d="M11.5 14.5h6M14.5 11.5v6" stroke="#9ca3af" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  'my-shares': (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M14 7l-4-4-4 4M10 3v10" stroke="#9ca3af" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13v3a1 1 0 001 1h12a1 1 0 001-1v-3" stroke="#9ca3af" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  recent: (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
      <circle cx="10" cy="10" r="7" stroke="#9ca3af" strokeWidth="1.3" />
      <path d="M10 6v4l2.5 2.5" stroke="#9ca3af" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  favorites: (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M10 2l2.1 5.6 6 .4-4.6 3.8 1.5 5.7L10 14.3 5 17.5l1.5-5.7L1.9 8l6-.4L10 2z" stroke="#9ca3af" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M4 5h12l-1 11a1 1 0 01-1 1H6a1 1 0 01-1-1L4 5z" stroke="#9ca3af" strokeWidth="1.3" />
      <path d="M3 5h14M7 5V3.5A1.5 1.5 0 018.5 2h3A1.5 1.5 0 0113 3.5V5" stroke="#9ca3af" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

const NAV_LABELS: Record<NavKey, string> = {
  'my-files': '我的文件',
  'shared-others': '他人共享',
  'my-shares': '我的共享',
  recent: '最近访问',
  favorites: '我的收藏',
  trash: '回收站',
};

function findNode(root: DirNode[], path: string[]): DirNode | null {
  let nodes = root;
  for (let i = 0; i < path.length; i++) {
    const found = nodes.find((n) => n.name === path[i]);
    if (!found) return null;
    if (i === path.length - 1) return found;
    nodes = found.children;
  }
  return null;
}

function findNodeByRelPath(root: DirNode[], relPath: string): DirNode | null {
  if (!relPath) return null;
  const parts = relPath.split('/');
  let nodes = root;
  for (let i = 0; i < parts.length; i++) {
    const found = nodes.find(n => n.name === parts[i]);
    if (!found) return null;
    if (i === parts.length - 1) return found;
    nodes = found.children;
  }
  return null;
}

// ── formatters ──

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFileType(name: string, isDir: boolean): string {
  if (isDir) return '文件夹';
  const dot = name.lastIndexOf('.');
  if (dot === -1 || dot === name.length - 1) return '文件';
  return name.slice(dot).toLowerCase();
}

const EDITABLE_EXTS = new Set([
  'txt', 'md', 'csv', 'json',
  'js', 'ts', 'jsx', 'tsx',
  'html', 'htm', 'css', 'scss', 'less',
  'xml', 'svg',
  'py', 'sh', 'bash', 'zsh',
  'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'properties', 'env',
  'sql', 'rs', 'log',
]);

function isEditableFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return EDITABLE_EXTS.has(name.slice(dot + 1).toLowerCase());
}

// ── icons ──

const IconFolder = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2 5.5C2 4.67 2.67 4 3.5 4h4.12l1.5 1.5h5.38c.83 0 1.5.67 1.5 1.5V15a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 15V5.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
  </svg>
);

const IconFolderOpen = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2 6.5C2 5.67 2.67 5 3.5 5h4.5l2 2h5c.83 0 1.5.67 1.5 1.5v6a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 14.5v-8z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
  </svg>
);

const IconFile = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M5 2h6l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
    <path d="M11 2v4h4" fill="none" stroke="#4b5563" strokeWidth="0.8" />
  </svg>
);

// ── sidebar tree ──

const SidebarTree: FC<{
  nodes: DirNode[];
  depth: number;
  selectedPath: string[];
  onSelect: (path: string[]) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}> = ({ nodes, depth, selectedPath, onSelect, expandedPaths, onToggleExpand }) => {
  return (
    <>
      {nodes.filter(n => n.isDirectory).map((node) => {
        const isSelected = depth < selectedPath.length && selectedPath[depth] === node.name;
        const hasChildren = node.children.some(c => c.isDirectory);
        const nodePath = selectedPath.slice(0, depth).concat(node.name).join('/');
        const expanded = expandedPaths.has(nodePath);

        return (
          <div key={node.name}>
            <div
              className={`fm-sidebar-row${isSelected ? ' fm-sidebar-row-active' : ''}`}
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              <span
                className={`fm-tree-arrow${hasChildren ? '' : ' fm-tree-arrow-empty'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasChildren) onToggleExpand(nodePath);
                }}
              >
                {hasChildren ? (
                  <svg viewBox="0 0 12 12" width="10" height="10" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.12s' }}>
                    <path d="M4 2l4 4-4 4" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              <button
                onClick={() => {
                  const newPath = selectedPath.slice(0, depth);
                  newPath.push(node.name);
                  onSelect(newPath);
                }}
                className="fm-sidebar-folder-btn"
              >
                {expanded && hasChildren ? <IconFolderOpen /> : <IconFolder />}
                <span className="fm-tree-name">{node.name}</span>
              </button>
            </div>
            {expanded && hasChildren && (
              <SidebarTree nodes={node.children} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} />
            )}
          </div>
        );
      })}
    </>
  );
};

// ── context menu types ──

interface CtxMenu {
  x: number;
  y: number;
  visible: boolean;
}

// ── FileManager ──

const FileManager: FC<{ onOpenApp?: (appId: string) => void; onOpenFile?: (filePath: string, fileName: string) => void }> = ({ onOpenApp, onOpenFile }) => {
  const [activeNav, setActiveNav] = useState<NavKey>('my-files');
  const [selectedPath, setSelectedPath] = useState<string[]>(['我的文件']);
  const [searchQuery, setSearchQuery] = useState('');
  const [vfsTree, setVfsTree] = useState<DirNode[]>([{ name: '我的文件', isDirectory: true, size: 0, modifiedAt: '', children: [] }]);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>({ x: 0, y: 0, visible: false });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['我的文件']));
  const [expandedMainDirs, setExpandedMainDirs] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [createType, setCreateType] = useState<'folder' | 'file'>('folder');
  const [createName, setCreateName] = useState('');
  const [modalError, setModalError] = useState('');

  // dropdowns
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const moreRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  const [toast, setToast] = useState<string | null>(null);

  // navigation history
  const [navHistory, setNavHistory] = useState<string[][]>([['我的文件']]);
  const [navIndex, setNavIndex] = useState(0);

  const navigateTo = useCallback((path: string[]) => {
    setActiveNav('my-files');
    setNavHistory(prev => {
      const newHistory = prev.slice(0, navIndex + 1);
      newHistory.push(path);
      return newHistory;
    });
    setNavIndex(prev => prev + 1);
    setSelectedPath(path);
  }, [navIndex]);

  const handleBack = () => {
    if (navIndex > 0) {
      const newIdx = navIndex - 1;
      setNavIndex(newIdx);
      setSelectedPath(navHistory[newIdx]);
    }
  };

  const handleForward = () => {
    if (navIndex < navHistory.length - 1) {
      const newIdx = navIndex + 1;
      setNavIndex(newIdx);
      setSelectedPath(navHistory[newIdx]);
    }
  };

  // recent tracking
  const RECENT_KEY = 'mos_recent_vfs';

  interface RecentEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    accessedAt: string;
  }

  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const recordRecent = useCallback((name: string, fullPath: string, isDir: boolean) => {
    setRecentEntries(prev => {
      const filtered = prev.filter(r => !(r.path === fullPath && r.isDirectory === isDir));
      const entry: RecentEntry = { name, path: fullPath, isDirectory: isDir, accessedAt: new Date().toISOString() };
      const next = [entry, ...filtered].slice(0, 50);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // column resize
  const [colWidths, setColWidths] = useState({ time: 140, type: 80, size: 80 });
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);

  const handleResizeStart = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: colWidths[col as keyof typeof colWidths] };
    setResizing(col);
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const newW = Math.max(50, resizeRef.current.startW + delta);
      setColWidths(prev => ({ ...prev, [resizeRef.current!.col]: newW }));
    };
    const onUp = () => { setResizing(null); resizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizing]);

  const loadVfs = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ensure_vfs');
      const entries = await invoke<DirNode[]>('list_vfs');
      setVfsTree([{ name: '我的文件', isDirectory: true, size: 0, modifiedAt: '', children: entries }]);
    } catch (e) {
      console.warn('[FileManager] loadVfs failed:', e);
    }
  }, []);

  useEffect(() => { loadVfs(); }, [loadVfs]);

  // close context menu & dropdowns on any click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      setCtxMenu((c) => (c.visible ? { ...c, visible: false } : c));
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMoreMenu(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSortMenu(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // clear selection when directory changes
  useEffect(() => {
    setSelectedItems(new Set());
  }, [selectedPath]);


  const currentDir = selectedPath.length > 0 ? findNode(vfsTree, selectedPath) : null;
  const currentChildren = currentDir ? currentDir.children : vfsTree;

  const vfsPath = (extra: string): string => {
    const parts = selectedPath.slice(1);
    if (extra) return [...parts, extra].join('/');
    return parts.join('/');
  };

  const handleRefresh = () => { setSelectedItems(new Set()); loadVfs(); };

  const handleToggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); }
      return next;
    });
  };

  // auto-expand paths along selectedPath
  useEffect(() => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.add('我的文件');
      for (let i = 1; i < selectedPath.length; i++) {
        next.add(selectedPath.slice(0, i + 1).join('/'));
      }
      return next;
    });
  }, [selectedPath]);

  // ── create ──

  const openCreateModal = (type: 'folder' | 'file') => {
    setCreateType(type);
    setCreateName('');
    setModalError('');
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) { setModalError('请输入名称'); return; }
    if (name.includes('/')) { setModalError('名称不能包含 /'); return; }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const targetPath = vfsPath(name);
      if (createType === 'folder') {
        await invoke('create_vfs_folder', { path: targetPath });
      } else {
        await invoke('create_vfs_file', { path: targetPath });
      }
      setShowCreateModal(false);
      loadVfs();
    } catch (e) {
      setModalError(String(e));
    }
  };

  // ── delete ──

  const handleDeleteClick = () => {
    if (selectedItems.size === 0) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const allItems = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean) as DirNode[];
      for (const item of allItems) {
        const targetPath = vfsPath(item.name);
        await invoke('move_vfs_to_trash', { path: targetPath, isDirectory: item.isDirectory });
      }
      setSelectedItems(new Set());
      setShowDeleteConfirm(false);
      loadVfs();
    } catch (e) {
      console.warn('[FileManager] delete failed:', e);
    }
  };

  const deleteTargets = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean) as DirNode[];

  // ── download ──

  const handleOpenFile = async (name: string, relPath: string) => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const targetPath = vfsPath(relPath);
      const savePath = await save({ defaultPath: name });
      if (!savePath) return;
      await invoke('download_vfs_file', { vfsPath: targetPath, localPath: savePath });
      recordRecent(name, relPath, false);
    } catch (e) {
      console.warn('[FileManager] open file failed:', e);
    }
  };

  const handleDownload = async () => {
    const files = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean).filter(n => n && !n.isDirectory) as DirNode[];
    if (files.length === 0) return;
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      for (const file of files) {
        const targetPath = vfsPath(file.name);
        const savePath = await save({ defaultPath: file.name });
        if (!savePath) continue;
        await invoke('download_vfs_file', { vfsPath: targetPath, localPath: savePath });
      }
      setSelectedItems(new Set());
    } catch (e) {
      console.warn('[FileManager] download failed:', e);
    }
  };

  // ── upload ──

  const handleUploadFile = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: true }) as string[] | string | null;
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const { invoke } = await import('@tauri-apps/api/core');
      for (const filePath of paths) {
        await invoke('upload_vfs_file', { localPath: filePath, vfsFolder: vfsPath('') });
      }
      loadVfs();
    } catch (e) {
      console.warn('[FileManager] upload file failed:', e);
    }
  };

  const handleUploadFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false }) as string | null;
      if (!selected) return;
      const dirPath = selected;
      const dirName = dirPath.split(/[\\/]/).pop() || 'upload';
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('upload_vfs_folder', { localDir: dirPath, vfsFolder: vfsPath(dirName) + '/' });
      loadVfs();
    } catch (e) {
      console.warn('[FileManager] upload folder failed:', e);
    }
  };

  const SORT_LABELS: Record<SortKey, string> = { name: '文件名', time: '修改时间', type: '类型', size: '大小' };

  // ── context menu ──

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuW = 170;
    const menuH = 190;
    let sx = e.clientX;
    let sy = e.clientY;
    if (sx + menuW > window.innerWidth) sx = e.clientX - menuW;
    if (sy + menuH > window.innerHeight) sy = e.clientY - menuH;
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    setCtxMenu({ x: sx - rect.left, y: sy - rect.top, visible: true });
  };

  const ctxItems: { label: string; icon: React.ReactNode; action: () => void }[] = [
    {
      label: '刷新',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M2 8a6 6 0 0111.3-3.3M14 8a6 6 0 01-11.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      action: handleRefresh,
    },
    {
      label: '新建文件夹',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M2 4.5C2 3.67 2.67 3 3.5 3h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5V12a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 12V4.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
          <line x1="8" y1="8" x2="8" y2="11" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="6.5" y1="9.5" x2="9.5" y2="9.5" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
      action: () => openCreateModal('folder'),
    },
    {
      label: '新建文件',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
          <path d="M9 1.5v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8" />
          <line x1="8" y1="8" x2="8" y2="11" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="6.5" y1="9.5" x2="9.5" y2="9.5" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
      action: () => openCreateModal('file'),
    },
    {
      label: '上传文件夹',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M2 4.5C2 3.67 2.67 3 3.5 3h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5V12a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 12V4.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
          <path d="M8 5v5M5.5 7.5h5" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
      action: handleUploadFolder,
    },
    {
      label: '上传文件',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
          <path d="M9 1.5v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8" />
          <path d="M8 5v5M5.5 7.5h5" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
      action: handleUploadFile,
    },
  ];

  return (
    <div className="fm-container">
      {/* ===== Create Modal ===== */}
      {showCreateModal && (
        <div className="fm-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">
              {createType === 'folder' ? '新建文件夹' : '新建文件'}
            </div>
            <div className="fm-modal-body">
              <input
                autoFocus
                value={createName}
                onChange={(e) => { setCreateName(e.target.value); setModalError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateModal(false); }}
                placeholder={createType === 'folder' ? '请输入文件夹名称' : '请输入文件名称'}
                className="fm-modal-input"
              />
              {modalError && <div className="fm-modal-error">{modalError}</div>}
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={handleCreate} className="fm-modal-btn fm-modal-btn-ok">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Delete Confirm Modal ===== */}
      {showDeleteConfirm && (
        <div className="fm-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">确认删除</div>
            <div className="fm-modal-body" style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6 }}>
              <p>确定要删除以下 {deleteTargets.length} 个{deleteTargets.length === 1 ? '项' : '项'}吗？</p>
              <div style={{ marginTop: '0.5rem', maxHeight: 120, overflowY: 'auto' }}>
                {deleteTargets.map((item) => (
                  <div key={item.name} style={{ padding: '0.125rem 0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    {item.isDirectory ? <IconFolder /> : <IconFile />}
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: '0.75rem', color: '#f87171', fontSize: '0.8125rem' }}>
                {deleteTargets.some(i => i.isDirectory) ? '删除文件夹将同时删除其中的所有内容。' : ''}
              </p>
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setShowDeleteConfirm(false)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={handleDeleteConfirm} className="fm-modal-btn fm-modal-btn-danger">删除</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 左侧菜单栏 ===== */}
      <div className="fm-sidebar">
        <div className="fm-sidebar-section">
          <div className="fm-sidebar-tree">
            <SidebarTree nodes={vfsTree} depth={0} selectedPath={selectedPath} onSelect={navigateTo} expandedPaths={expandedPaths} onToggleExpand={handleToggleExpand} />
          </div>
        </div>

        <div className="fm-sidebar-divider" />

        {(['shared-others', 'my-shares', 'recent', 'favorites'] as NavKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveNav(key)}
            className={`fm-nav-item${activeNav === key ? ' fm-nav-item-active' : ''}`}
          >
            <span className="fm-nav-icon">{NAV_ICONS[key]}</span>
            <span>{NAV_LABELS[key]}</span>
          </button>
        ))}

        <button
          onClick={() => onOpenApp?.('recycle-bin')}
          className="fm-nav-item"
        >
          <span className="fm-nav-icon">{NAV_ICONS['trash']}</span>
          <span>{NAV_LABELS['trash']}</span>
        </button>
      </div>

      {/* ===== 右侧主区域 ===== */}
      <div className="fm-main">
            {/* 文件工具栏 */}
            <div className="fm-toolbar">
              <div className="fm-toolbar-left">
                <button className="fm-toolbar-btn" title="后退" disabled={navIndex === 0} onClick={handleBack}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button className="fm-toolbar-btn" title="前进" disabled={navIndex >= navHistory.length - 1} onClick={handleForward}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button className="fm-toolbar-btn" title="刷新" onClick={handleRefresh}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M2 8a6 6 0 0111.3-3.3M14 8a6 6 0 01-11.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="fm-toolbar-sep" />
                <div className="fm-breadcrumb">
                  {activeNav === 'recent' ? (
                    <span className="fm-breadcrumb-item" style={{ cursor: 'default', color: '#9ca3af' }}>
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      最近访问
                    </span>
                  ) : (
                    <>
                      <button onClick={() => navigateTo(['我的文件'])} className="fm-breadcrumb-item">
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                          <path d="M2 5.5C2 4.67 2.67 4 3.5 4h5l2 2h5.5c.83 0 1.5.67 1.5 1.5V15a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 15V5.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                        </svg>
                      </button>
                      {selectedPath.map((seg, i) => (
                        <span key={i} className="fm-breadcrumb-seg">
                          <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                            <path d="M4 2l4 4-4 4" stroke="#6b7280" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <button onClick={() => navigateTo(selectedPath.slice(0, i + 1))} className="fm-breadcrumb-item">
                            {seg}
                          </button>
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>
              <div className="fm-toolbar-right">
                <div className="fm-search">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" className="fm-search-icon">
                    <circle cx="7" cy="7" r="4.5" stroke="#6b7280" strokeWidth="1.3" />
                    <path d="M10.5 10.5L14 14" stroke="#6b7280" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索..."
                    className="fm-search-input"
                  />
                </div>
              </div>
            </div>

            {activeNav !== 'recent' ? (
              <>
            {/* 操作按钮栏 */}
            <div className="fm-actionbar">
              <div className="fm-actionbar-left">
                <button className="fm-action-btn" onClick={handleUploadFolder} title="上传文件夹">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M2 4.5C2 3.67 2.67 3 3.5 3h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5V12a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 12V4.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                    <path d="M8 5v5M5.5 7.5h5" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span>上传文件夹</span>
                </button>
                <button className="fm-action-btn" onClick={() => openCreateModal('folder')} title="新建文件夹">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M2 4.5C2 3.67 2.67 3 3.5 3h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5V12a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 12V4.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                    <line x1="8" y1="8" x2="8" y2="11" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="6.5" y1="9.5" x2="9.5" y2="9.5" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span>新建文件夹</span>
                </button>
                <button
                  className={`fm-action-btn${selectedItems.size === 0 || ![...selectedItems].some(p => { const n = findNodeByRelPath(currentChildren, p); return n && !n.isDirectory; }) ? ' fm-action-btn-disabled' : ''}`}
                  onClick={handleDownload}
                  disabled={selectedItems.size === 0 || ![...selectedItems].some(p => { const n = findNodeByRelPath(currentChildren, p); return n && !n.isDirectory; })}
                  title="下载"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span>下载</span>
                </button>
                <button
                  className={`fm-action-btn${selectedItems.size === 0 ? ' fm-action-btn-disabled' : ''}`}
                  onClick={handleDeleteClick}
                  disabled={selectedItems.size === 0}
                  title="删除"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M3 4h10l-1 10a1 1 0 01-1 1H5a1 1 0 01-1-1L3 4z" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M2 4h12M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <span>删除</span>
                </button>

                {/* 更多下拉 */}
                <div className="fm-dropdown-wrapper" ref={moreRef}>
                  <button
                    className="fm-action-btn"
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    title="更多"
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                      <circle cx="3" cy="8" r="1.2" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                      <circle cx="13" cy="8" r="1.2" fill="currentColor" />
                    </svg>
                    <span>更多</span>
                    <svg viewBox="0 0 10 10" width="8" height="8" fill="none" style={{ marginLeft: 2 }}>
                      <path d="M2 3l3 4 3-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {showMoreMenu && (
                    <div className="fm-dropdown-menu">
                      <button className="fm-dropdown-item" onClick={() => { setShowMoreMenu(false); openCreateModal('file'); }}>
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
                          <path d="M9 1.5v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8" />
                          <line x1="8" y1="8" x2="8" y2="11" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
                          <line x1="6.5" y1="9.5" x2="9.5" y2="9.5" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        <span>新建文件</span>
                      </button>
                      <button className="fm-dropdown-item" onClick={() => { setShowMoreMenu(false); handleUploadFile(); }}>
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
                          <path d="M9 1.5v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8" />
                          <path d="M8 5v5M5.5 7.5h5" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        <span>上传文件</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 排序下拉 */}
              <div className="fm-dropdown-wrapper" ref={sortRef}>
                <button
                  className="fm-action-btn"
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  title="排序"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M4 2v10M1 9l3 3 3-3M12 14V4M9 7l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>排序</span>
                </button>
                {showSortMenu && (
                  <div className="fm-dropdown-menu fm-dropdown-menu-right">
                    <div className="fm-dropdown-label">排序方式</div>
                    {(['name', 'time', 'type', 'size'] as SortKey[]).map((key) => (
                      <button
                        key={key}
                        className="fm-dropdown-item"
                        onClick={() => { if (sortBy === key) setSortAsc(!sortAsc); else { setSortBy(key); setSortAsc(true); } }}
                      >
                        <span className="fm-dropdown-check">
                          {sortBy === key ? (
                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                              <path d="M3 8l3 3 7-7" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span style={{ width: 12, display: 'inline-block' }} />
                          )}
                        </span>
                        <span>{SORT_LABELS[key]}</span>
                      </button>
                    ))}
                    <div className="fm-ctxmenu-sep" />
                    <button
                      className="fm-dropdown-item"
                      onClick={() => setSortAsc(true)}
                    >
                      <span className="fm-dropdown-check">
                        {sortAsc ? (
                          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                            <path d="M3 8l3 3 7-7" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span style={{ width: 12, display: 'inline-block' }} />
                        )}
                      </span>
                      <span>升序</span>
                    </button>
                    <button
                      className="fm-dropdown-item"
                      onClick={() => setSortAsc(false)}
                    >
                      <span className="fm-dropdown-check">
                        {!sortAsc ? (
                          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                            <path d="M3 8l3 3 7-7" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span style={{ width: 12, display: 'inline-block' }} />
                        )}
                      </span>
                      <span>降序</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 文件列表 */}
            <div
              className="fm-content"
              ref={contentRef}
              onContextMenu={handleContextMenu}
            >
              {currentChildren.length === 0 ? (
                <div className="fm-empty">此目录为空</div>
              ) : (
                <div className="fm-file-table">
                  <div className={`fm-file-header${resizing ? ' fm-file-header-resizing' : ''}`}>
                    <button className="fm-col-header fm-col-name" onClick={() => { if (sortBy === 'name') setSortAsc(!sortAsc); else { setSortBy('name'); setSortAsc(true); } }}>
                      <span>名称</span>
                      {sortBy === 'name' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                    </button>
                    <div className="fm-col-resize" onMouseDown={(e) => handleResizeStart('time', e)} />
                    <button className="fm-col-header fm-col-time" style={{ width: colWidths.time }} onClick={() => { if (sortBy === 'time') setSortAsc(!sortAsc); else { setSortBy('time'); setSortAsc(true); } }}>
                      <span>修改时间</span>
                      {sortBy === 'time' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                    </button>
                    <div className="fm-col-resize" onMouseDown={(e) => handleResizeStart('type', e)} />
                    <button className="fm-col-header fm-col-type" style={{ width: colWidths.type }} onClick={() => { if (sortBy === 'type') setSortAsc(!sortAsc); else { setSortBy('type'); setSortAsc(true); } }}>
                      <span>类型</span>
                      {sortBy === 'type' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                    </button>
                    <div className="fm-col-resize" onMouseDown={(e) => handleResizeStart('size', e)} />
                    <button className="fm-col-header fm-col-size" style={{ width: colWidths.size }} onClick={() => { if (sortBy === 'size') setSortAsc(!sortAsc); else { setSortBy('size'); setSortAsc(true); } }}>
                      <span>大小</span>
                      {sortBy === 'size' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                    </button>
                  </div>
                  {(() => {
                    // Recursive tree row renderer
                    const renderTree = (nodes: DirNode[], depth: number, parentPath: string): React.ReactNode[] => {
                      const sorted = [...nodes].sort((a, b) => {
                        const dirCmp = b.isDirectory === a.isDirectory ? 0 : b.isDirectory ? 1 : -1;
                        if (dirCmp !== 0) return dirCmp;
                        let cmp = 0;
                        switch (sortBy) {
                          case 'name': cmp = a.name.localeCompare(b.name); break;
                          case 'time': cmp = a.modifiedAt.localeCompare(b.modifiedAt); break;
                          case 'type': cmp = getFileType(a.name, a.isDirectory).localeCompare(getFileType(b.name, b.isDirectory)); break;
                          case 'size': cmp = a.size - b.size; break;
                        }
                        return sortAsc ? cmp : -cmp;
                      });
                      const result: React.ReactNode[] = [];
                      for (const node of sorted) {
                        if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) continue;
                        const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
                        const isSel = selectedItems.has(fullPath);
                        const hasChildren = node.isDirectory && node.children.length > 0;
                        const isExpanded = expandedMainDirs.has(fullPath);
                        result.push(
                          <button
                            key={fullPath}
                            onClick={(e) => {
                              if (node.isDirectory && e.detail === 2) {
                                navigateTo([...selectedPath, ...fullPath.split('/')]);
                                return;
                              }
                              if (!node.isDirectory && e.detail === 2) {
                                if (onOpenFile && isEditableFile(node.name)) {
                                  const vfsRelPath = selectedPath.slice(1).join('/');
                                  const fullVfsPath = vfsRelPath ? `${vfsRelPath}/${fullPath}` : fullPath;
                                  onOpenFile(fullVfsPath, node.name);
                                } else {
                                  setToast('暂不支持此文件格式');
                                }
                                return;
                              }
                              if (node.isDirectory && hasChildren) {
                                setExpandedMainDirs(prev => {
                                  const next = new Set(prev);
                                  if (next.has(fullPath)) next.delete(fullPath);
                                  else next.add(fullPath);
                                  return next;
                                });
                              }
                              setSelectedItems(prev => {
                                const next = new Set<string>();
                                if (e.shiftKey) {
                                  if (prev.has(fullPath)) next.delete(fullPath);
                                  else { prev.forEach(v => next.add(v)); next.add(fullPath); }
                                } else {
                                  if (!prev.has(fullPath) || prev.size !== 1) { next.clear(); next.add(fullPath); }
                                }
                                return next;
                              });
                            }}
                            className={`fm-file-row${isSel ? ' fm-file-row-selected' : ''}`}
                          >
                            <span className="fm-col-name" style={{ paddingLeft: 8 + depth * 16 }}>
                              <span className={`fm-tree-arrow${hasChildren ? '' : ' fm-tree-arrow-empty'}`} onClick={(e) => {
                                if (!hasChildren) return;
                                e.stopPropagation();
                                setExpandedMainDirs(prev => {
                                  const next = new Set(prev);
                                  if (next.has(fullPath)) next.delete(fullPath);
                                  else next.add(fullPath);
                                  return next;
                                });
                              }}>
                                {hasChildren ? (
                                  <svg viewBox="0 0 12 12" width="10" height="10" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.12s' }}>
                                    <path d="M4 2l4 4-4 4" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : null}
                              </span>
                              {node.isDirectory ? (isExpanded && hasChildren ? <IconFolderOpen /> : <IconFolder />) : <IconFile />}
                              <span className="fm-file-name-text">{node.name}</span>
                            </span>
                            <span className="fm-col-time" style={{ width: colWidths.time }}>{formatTime(node.modifiedAt)}</span>
                            <span className="fm-col-type" style={{ width: colWidths.type }}>{getFileType(node.name, node.isDirectory)}</span>
                            <span className="fm-col-size" style={{ width: colWidths.size }}>{node.isDirectory ? '-' : formatSize(node.size)}</span>
                          </button>
                        );
                        if (isExpanded && hasChildren) {
                          result.push(...renderTree(node.children, depth + 1, fullPath));
                        }
                      }
                      return result;
                    };
                    return renderTree(currentChildren, 0, '');
                  })()}
                </div>
              )}

              {/* context menu */}
              {ctxMenu.visible && (
                <div className="fm-ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
                  {ctxItems.map((item, i) => (
                    <React.Fragment key={item.label}>
                      {i === 1 || i === 3 ? <div className="fm-ctxmenu-sep" /> : null}
                      <button
                        className="fm-ctxmenu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCtxMenu({ ...ctxMenu, visible: false });
                          item.action();
                        }}
                      >
                        <span className="fm-ctxmenu-icon">{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
              </>
            ) : (
              <div className="fm-content">
                {recentEntries.length === 0 ? (
                  <div className="fm-empty">暂无最近访问记录</div>
                ) : (
                  <div className="fm-file-table">
                    <div className="fm-file-header">
                      <button className="fm-col-header fm-col-name"><span>名称</span></button>
                      <div className="fm-col-resize" />
                      <button className="fm-col-header fm-col-time" style={{ width: colWidths.time }}><span>访问时间</span></button>
                      <div className="fm-col-resize" />
                      <button className="fm-col-header fm-col-type" style={{ width: colWidths.type }}><span>类型</span></button>
                      <div className="fm-col-resize" />
                      <button className="fm-col-header fm-col-size" style={{ width: colWidths.size }}><span>-</span></button>
                    </div>
                    {recentEntries.filter(e => !e.isDirectory).map((entry) => (
                      <button
                        key={`${entry.path}|${entry.isDirectory}`}
                        className="fm-file-row"
                        onDoubleClick={() => {
                          if (entry.isDirectory) {
                            const parts = entry.path.split('/');
                            navigateTo(parts);
                          }
                        }}
                        onClick={() => {
                          if (!entry.isDirectory) {
                            handleOpenFile(entry.name, entry.path);
                          }
                        }}
                      >
                        <span className="fm-col-name">
                          <span className="fm-tree-arrow fm-tree-arrow-empty" />
                          {entry.isDirectory ? <IconFolder /> : <IconFile />}
                          <span className="fm-file-name-text">{entry.name}</span>
                        </span>
                        <span className="fm-col-time" style={{ width: colWidths.time }}>{formatTime(entry.accessedAt)}</span>
                        <span className="fm-col-type" style={{ width: colWidths.type }}>{getFileType(entry.name, entry.isDirectory)}</span>
                        <span className="fm-col-size" style={{ width: colWidths.size }}>{entry.isDirectory ? '-' : '-'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
      </div>
      {toast && (
        <div className="fm-toast">{toast}</div>
      )}
    </div>
  );
};

export default FileManager;
