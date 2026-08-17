import React, { type FC, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { listVfs, createFolder, createFile, createWordDoc, moveToTrash, deleteVfs, uploadFile, copyVfs, renameVfs } from '../api/vfs';
import { downloadVfsFile } from '../api/client';
import { listFavorites, addFavorite, removeFavorite, listVfsHistory, recordVfsHistory, removeVfsHistory, type FavoriteEntry, type VfsHistoryEntry } from '../api/settings';
import type { VfsEntry } from '../types/vfs';
import SharesPanel from './SharesPanel';

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

function getBaseName(path: string): string {
  const p = path.endsWith('/') ? path.slice(0, -1) : path;
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function getExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
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

interface FileCtxMenu {
  x: number;
  y: number;
  visible: boolean;
  path: string;
  isDirectory: boolean;
}

interface RubberBand {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// ── tree builder ──

function entriesToTree(entries: VfsEntry[]): DirNode[] {
  const nodeMap = new Map<string, DirNode>();

  for (const entry of entries) {
    const parts = entry.path.split('/');

    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      if (!nodeMap.has(currentPath)) {
        nodeMap.set(currentPath, {
          name: parts[i],
          isDirectory: true,
          size: 0,
          modifiedAt: '',
          children: [],
        });
      }
    }
  }

  for (const entry of entries) {
    const node = nodeMap.get(entry.path);
    if (node) {
      node.isDirectory = entry.type === 'folder';
      node.size = entry.size;
      node.modifiedAt = entry.lastModified;
      node.children = node.children || [];
    }
  }

  const root: DirNode[] = [];
  for (const [path, node] of nodeMap) {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
      root.push(node);
    } else {
      const parentPath = path.substring(0, lastSlash);
      const parent = nodeMap.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

// ── flat list for shift-range ordering ──

function flattenVisible(
  nodes: DirNode[],
  parentPath: string,
  expandedDirs: Set<string>,
  sortBy: SortKey,
  sortAsc: boolean,
  searchQuery: string,
): { path: string; node: DirNode }[] {
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

  const result: { path: string; node: DirNode }[] = [];
  for (const node of sorted) {
    if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) continue;
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    result.push({ path: fullPath, node });
    if (node.isDirectory && expandedDirs.has(fullPath) && node.children.length > 0) {
      result.push(...flattenVisible(node.children, fullPath, expandedDirs, sortBy, sortAsc, searchQuery));
    }
  }
  return result;
}

// ── FileManager ──

const FileManager: FC<{
  onOpenApp?: (appId: string) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  onOpenFileManagerAt?: (initialPath: string[], initialSelectName?: string) => void;
  initialPath?: string[];
  initialSelectName?: string;
  onAddUploadTask?: (fileName: string, vfsPath: string, totalBytes: number) => string;
  onCompleteTask?: (id: string, transferredBytes?: number) => void;
  onFailTask?: (id: string, error: string) => void;
  onUpdateTask?: (id: string, transferredBytes: number) => void;
  onSetTaskWriting?: (id: string) => void;
  onAddDownloadTask?: (fileName: string, vfsPath: string, totalBytes: number) => string;
  onAddMoveTask?: (fileName: string, vfsPath: string, totalBytes: number, sourcePath?: string, destPath?: string) => string;
  onDragEnter?: () => void;
}> = ({ onOpenApp, onOpenFile, onOpenFileManagerAt, initialPath, initialSelectName, onAddUploadTask, onCompleteTask, onFailTask, onUpdateTask, onSetTaskWriting, onAddDownloadTask, onAddMoveTask, onDragEnter }) => {
  const [activeNav, setActiveNav] = useState<NavKey>('my-files');
  const [selectedPath, setSelectedPath] = useState<string[]>(['我的文件']);
  const [searchQuery, setSearchQuery] = useState('');
  const [vfsTree, setVfsTree] = useState<DirNode[]>([{ name: '我的文件', isDirectory: true, size: 0, modifiedAt: '', children: [] }]);
  const [bgCtxMenu, setBgCtxMenu] = useState<CtxMenu>({ x: 0, y: 0, visible: false });
  const [fileCtxMenu, setFileCtxMenu] = useState<FileCtxMenu>({ x: 0, y: 0, visible: false, path: '', isDirectory: false });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['我的文件']));
  const [expandedMainDirs, setExpandedMainDirs] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // New feature state
  const [rubberBand, setRubberBand] = useState<RubberBand | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [contentDragOver, setContentDragOver] = useState(false);

  const lastClickedRef = useRef<string | null>(null);
  const clipboardRef = useRef<{ paths: string[]; operation: 'copy' } | null>(null);
  const rubberRef = useRef<RubberBand | null>(null);
  const rubberActiveRef = useRef(false);

  // modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [singleDelete, setSingleDelete] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createType, setCreateType] = useState<'folder' | 'file' | 'word'>('folder');
  const [createName, setCreateName] = useState('');
  const [modalError, setModalError] = useState('');
  const createParentRef = useRef<string | null>(null);

  // dropdowns
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const moreRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  const [toast, setToast] = useState<string | null>(null);

  // recent entry context menu
  const [recentCtxMenu, setRecentCtxMenu] = useState<{ x: number; y: number; visible: boolean; path: string; name: string; isDirectory: boolean }>({ x: 0, y: 0, visible: false, path: '', name: '', isDirectory: false });
  const [favCtxMenu, setFavCtxMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  // navigation history
  const [navHistory, setNavHistory] = useState<string[][]>([['我的文件']]);
  const [navIndex, setNavIndex] = useState(0);

  // recent tracking (server-persisted)
  const [recentEntries, setRecentEntries] = useState<VfsHistoryEntry[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const data = await listVfsHistory();
      setRecentEntries(data.filter(e => !e.isDirectory));
    } catch { /* ignore */ }
  }, []);

  const recordRecent = useCallback(async (name: string, fullPath: string, isDir: boolean) => {
    setRecentEntries(prev => {
      const filtered = prev.filter(r => !(r.path === fullPath && r.isDirectory === isDir));
      const entry: VfsHistoryEntry = { name, path: fullPath, isDirectory: isDir, accessedAt: new Date().toISOString() };
      return [entry, ...filtered].slice(0, 50);
    });
    try { await recordVfsHistory(fullPath, name, isDir); } catch { /* ignore */ }
  }, []);

  // favorites
  const [favoriteEntries, setFavoriteEntries] = useState<FavoriteEntry[]>([]);

  const loadFavorites = useCallback(async () => {
    try {
      const data = await listFavorites();
      setFavoriteEntries(data);
    } catch { /* ignore */ }
  }, []);

  const isFavorited = useCallback((path: string) => {
    return favoriteEntries.some(f => f.path === path);
  }, [favoriteEntries]);

  const toggleFavorite = useCallback(async (path: string, name: string, isDirectory: boolean) => {
    if (isFavorited(path)) {
      setFavoriteEntries(prev => prev.filter(f => f.path !== path));
      try { await removeFavorite(path); } catch { /* ignore */ }
    } else {
      const entry: FavoriteEntry = { path, name, isDirectory, favoritedAt: new Date().toISOString() };
      setFavoriteEntries(prev => [entry, ...prev]);
      try { await addFavorite(path, name, isDirectory); } catch { /* ignore */ }
    }
  }, [isFavorited]);

  const checkFavExists = useCallback(async (path: string, isDirectory: boolean): Promise<boolean> => {
    if (!path) return false;
    const parts = path.split('/');
    const parentPath = parts.slice(0, -1).join('/');
    const name = parts[parts.length - 1];
    try {
      const entries = await listVfs(parentPath);
      const found = entries.some(e => e.name === name && (isDirectory ? e.type === 'folder' : e.type === 'file'));
      if (found) return true;
      // Non-empty directories may lack a .keep marker; check if they contain files
      if (isDirectory) {
        const children = await listVfs(path);
        return children.length > 0;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const cleanInvalidFavorites = useCallback(async () => {
    const results = await Promise.all(
      favoriteEntries.map(async (entry) => {
        const exists = await checkFavExists(entry.path, entry.isDirectory);
        return { entry, exists };
      }),
    );
    const invalid = results.filter(r => !r.exists);
    if (invalid.length === 0) {
      setToast('所有收藏均有效');
      return;
    }
    for (const { entry } of invalid) {
      try { await removeFavorite(entry.path); } catch { /* ignore */ }
    }
    setFavoriteEntries(prev => prev.filter(f => results.find(r => r.entry.path === f.path)?.exists));
    setToast(`已清理 ${invalid.length} 个无效收藏`);
  }, [favoriteEntries, checkFavExists]);

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

  // column resize
  const [colWidths, setColWidths] = useState({ time: 140, type: 80, size: 80, path: 200 });
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
      const entries = await listVfs();
      const tree = entriesToTree(entries);
      setVfsTree([{ name: '我的文件', isDirectory: true, size: 0, modifiedAt: '', children: tree }]);
    } catch (e) {
      console.warn('[FileManager] loadVfs failed:', e);
    }
  }, []);

  useEffect(() => { loadVfs(); }, [loadVfs]);

  // Navigate to initialPath when provided
  useEffect(() => {
    if (initialPath && initialPath.length > 0) {
      setActiveNav('my-files');
      setSelectedPath(initialPath);
      setNavHistory([initialPath]);
      setNavIndex(0);
    }
  }, []); // only on mount

  useEffect(() => {
    const handler = () => loadVfs();
    window.addEventListener('vfs-changed', handler);
    return () => window.removeEventListener('vfs-changed', handler);
  }, [loadVfs]);

  // load recent & favorites when switching to those views
  useEffect(() => {
    if (activeNav === 'recent') loadRecent();
    else if (activeNav === 'favorites') loadFavorites();
  }, [activeNav, loadRecent, loadFavorites]);

  // close context menus & dropdowns on any click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      setBgCtxMenu((c) => (c.visible ? { ...c, visible: false } : c));
      setFileCtxMenu((c) => (c.visible ? { ...c, visible: false } : c));
      setRecentCtxMenu((c) => (c.visible ? { ...c, visible: false } : c));
      setFavCtxMenu((c) => (c.visible ? { ...c, visible: false } : c));
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
    clipboardRef.current = null;
    setRenamingPath(null);
  }, [selectedPath]);


  const currentDir = selectedPath.length > 0 ? findNode(vfsTree, selectedPath) : null;
  const currentChildren = currentDir ? currentDir.children : vfsTree;

  // Flat list for shift-range selection (mirrors renderTree order)
  const flatList = useMemo(
    () => flattenVisible(currentChildren, '', expandedMainDirs, sortBy, sortAsc, searchQuery),
    [currentChildren, expandedMainDirs, sortBy, sortAsc, searchQuery],
  );

  // Select initial entry when provided
  useEffect(() => {
    if (initialSelectName && currentChildren.length > 0) {
      const match = currentChildren.find((n) => n.name === initialSelectName);
      if (match) {
        const fullPath = selectedPath.length > 1
          ? selectedPath.slice(1).join('/') + '/' + initialSelectName
          : initialSelectName;
        setSelectedItems(new Set([fullPath]));
      }
    }
  }, [initialSelectName, currentChildren, selectedPath]);

  const vfsPath = (extra: string): string => {
    const parts = selectedPath.slice(1);
    if (extra) return [...parts, extra].join('/');
    return parts.join('/');
  };
  const vfsPathRef = useRef(vfsPath);
  vfsPathRef.current = vfsPath;

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

  const openCreateModal = (type: 'folder' | 'file' | 'word', parentPath?: string) => {
    createParentRef.current = parentPath ?? null;
    setCreateType(type);
    setCreateName(type === 'word' ? '新建 Word 文档' : '');
    setModalError('');
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    let name = createName.trim();
    if (!name) { setModalError('请输入名称'); return; }
    if (name.includes('/')) { setModalError('名称不能包含 /'); return; }
    if (createType === 'word' && !name.toLowerCase().endsWith('.docx')) name += '.docx';
    try {
      const targetPath = createParentRef.current
        ? createParentRef.current + '/' + name
        : vfsPath(name);
      if (createType === 'folder') {
        await createFolder(targetPath);
      } else if (createType === 'word') {
        await createWordDoc(targetPath);
      } else {
        await createFile(targetPath);
      }
      setShowCreateModal(false);
      createParentRef.current = null;
      loadVfs();
    } catch (e) {
      setModalError(String(e));
    }
  };

  // ── delete ──

  const isEmptyFolder = async (path: string): Promise<boolean> => {
    try {
      const entries = await listVfs(path);
      return entries.length === 0 || entries.every(e => e.type === 'folder');
    } catch {
      return false;
    }
  };

  const handleDeleteClick = () => {
    if (selectedItems.size === 0) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      const allItems = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean) as DirNode[];
      for (const item of allItems) {
        const targetPath = vfsPath(item.name);
        if (item.isDirectory && await isEmptyFolder(targetPath)) {
          await deleteVfs(targetPath);
        } else {
          await moveToTrash(targetPath);
        }
      }
      setSelectedItems(new Set());
      setShowDeleteConfirm(false);
      loadVfs();
    } catch (e) {
      console.warn('[FileManager] delete failed:', e);
    } finally {
      setDeleting(false);
    }
  };

  const handleSingleDeleteConfirm = async () => {
    if (!singleDelete) return;
    setDeleting(true);
    try {
      const tp = vfsPath(singleDelete.path);
      if (singleDelete.isDirectory && await isEmptyFolder(tp)) {
        await deleteVfs(tp);
      } else {
        await moveToTrash(tp);
      }
      setSelectedItems(new Set());
      setSingleDelete(null);
      loadVfs();
      setToast(`已删除 "${singleDelete.name}"`);
    } catch (e) {
      setToast(`删除失败: ${String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  const deleteTargets = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean) as DirNode[];

  // ── download ──

  const handleOpenFile = async (name: string, relPath: string) => {
    try {
      const targetPath = vfsPath(relPath);
      await downloadVfsFile(targetPath, name);
      recordRecent(name, targetPath, false);
    } catch (e) {
      console.warn('[FileManager] open file failed:', e);
    }
  };

  const handleDownload = async () => {
    const files = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean).filter(n => n && !n.isDirectory) as DirNode[];
    if (files.length === 0) return;
    for (const file of files) {
      const targetPath = vfsPath(file.name);
      const taskId = onAddDownloadTask?.(file.name, targetPath, file.size);
      try {
        await downloadVfsFile(targetPath, file.name);
        onCompleteTask?.(taskId ?? '', file.size);
      } catch (e) {
        onFailTask?.(taskId ?? '', String(e));
      }
    }
    setSelectedItems(new Set());
  };

  // ── upload ──

  const handleUploadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) return;
      try {
        const folder = vfsPath('');
        for (const file of Array.from(input.files)) {
          const taskId = onAddUploadTask?.(file.name, folder || '', file.size);
          try {
            await uploadFile(file, folder ? `${folder}/${file.name}` : file.name, (loaded) => onUpdateTask?.(taskId ?? '', loaded), () => onSetTaskWriting?.(taskId ?? ''));
            onCompleteTask?.(taskId ?? '', file.size);
          } catch (e) {
            onFailTask?.(taskId ?? '', String(e));
          }
        }
        loadVfs();
        window.dispatchEvent(new CustomEvent('vfs-changed'));
      } catch (e) {
        console.warn('[FileManager] upload file failed:', e);
      }
    };
    input.click();
  };

  const handleUploadFolder = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    (input as HTMLInputElement).setAttribute('directory', '');
    input.onchange = async () => {
      if (!input.files) return;
      try {
        for (const file of Array.from(input.files)) {
          const relativePath = file.webkitRelativePath;
          const slashIdx = relativePath.indexOf('/');
          const vfsRelPath = slashIdx >= 0 ? relativePath.substring(slashIdx + 1) : relativePath;
          const destPath = vfsPath(vfsRelPath);
          const taskId = onAddUploadTask?.(file.name, destPath, file.size);
          try {
            await uploadFile(file, destPath, (loaded) => onUpdateTask?.(taskId ?? '', loaded), () => onSetTaskWriting?.(taskId ?? ''));
            onCompleteTask?.(taskId ?? '', file.size);
          } catch (e) {
            onFailTask?.(taskId ?? '', String(e));
          }
        }
        loadVfs();
        window.dispatchEvent(new CustomEvent('vfs-changed'));
      } catch (e) {
        console.warn('[FileManager] upload folder failed:', e);
      }
    };
    input.click();
  };

  const SORT_LABELS: Record<SortKey, string> = { name: '文件名', time: '修改时间', type: '类型', size: '大小' };

  // ── rename ──

  const handleRenameStart = useCallback((relPath: string) => {
    const node = findNodeByRelPath(currentChildren, relPath);
    if (!node) return;
    setRenamingPath(relPath);
    setRenameValue(node.name);
  }, [currentChildren]);

  const handleRenameConfirm = useCallback(async () => {
    if (!renamingPath) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === getBaseName(renamingPath)) {
      setRenamingPath(null);
      return;
    }
    if (trimmed.includes('/')) { setToast('名称不能包含 /'); return; }
    try {
      const parentDir = renamingPath.includes('/')
        ? renamingPath.substring(0, renamingPath.lastIndexOf('/'))
        : '';
      const newRelPath = parentDir ? `${parentDir}/${trimmed}` : trimmed;
      await renameVfs(vfsPath(renamingPath), vfsPath(newRelPath));
      setRenamingPath(null);
      setSelectedItems(new Set());
      loadVfs();
      setToast('重命名成功');
    } catch (e) {
      setToast(`重命名失败: ${String(e)}`);
    }
  }, [renamingPath, renameValue, loadVfs]);

  // ── copy/paste ──

  const handlePaste = useCallback(async () => {
    const clip = clipboardRef.current;
    if (!clip || clip.paths.length === 0) return;
    try {
      for (const srcRel of clip.paths) {
        const srcNode = findNodeByRelPath(currentChildren, srcRel);
        if (!srcNode) continue;
        const baseName = srcNode.name;
        const ext = getExt(baseName);
        const nameWithoutExt = ext ? baseName.slice(0, -(ext.length + 1)) : baseName;

        let destName = baseName;
        let counter = 1;
        const existingNames = new Set(currentChildren.map(c => c.name));
        while (existingNames.has(destName)) {
          destName = ext ? `${nameWithoutExt} - 副本${counter > 1 ? ` (${counter})` : ''}.${ext}`
            : `${nameWithoutExt} - 副本${counter > 1 ? ` (${counter})` : ''}`;
          counter++;
        }
        const srcFull = vfsPath(srcRel);
        const destFull = vfsPath(destName);
        await copyVfs(srcFull, destFull);
      }
      clipboardRef.current = null;
      loadVfs();
      setToast(`已粘贴 ${clip.paths.length} 个文件`);
    } catch (e) {
      setToast(`粘贴失败: ${String(e)}`);
    }
  }, [currentChildren, loadVfs]);

  // ── file context menu actions ──

  const handleFileCtxAction = useCallback(async (action: string, menuPath: string, isDir: boolean) => {
    setFileCtxMenu(c => ({ ...c, visible: false }));
    const node = findNodeByRelPath(currentChildren, menuPath);
    const fileName = node?.name || getBaseName(menuPath);

    switch (action) {
      case 'open': {
        if (isDir) {
          navigateTo([...selectedPath, ...menuPath.split('/')]);
        } else {
          const fullMenuPath = (() => {
            const pre = selectedPath.slice(1).join('/');
            return pre ? `${pre}/${menuPath}` : menuPath;
          })();
          if (onOpenFile && isEditableFile(fileName)) {
            recordRecent(fileName, fullMenuPath, false);
            onOpenFile(fullMenuPath, fileName);
          } else {
            await handleOpenFile(fileName, menuPath);
          }
        }
        break;
      }
      case 'download': {
        try {
          await downloadVfsFile(vfsPath(menuPath), fileName);
          const fullMenuPath = (() => {
            const pre = selectedPath.slice(1).join('/');
            return pre ? `${pre}/${menuPath}` : menuPath;
          })();
          recordRecent(fileName, fullMenuPath, false);
        } catch (e) { setToast(`下载失败: ${String(e)}`); }
        break;
      }
      case 'rename': {
        handleRenameStart(menuPath);
        break;
      }
      case 'copy': {
        clipboardRef.current = { paths: [menuPath], operation: 'copy' };
        setToast(`已复制 "${fileName}" 到剪贴板`);
        break;
      }
      case 'delete': {
        setSingleDelete({ path: menuPath, name: fileName, isDirectory: fileCtxMenu.isDirectory });
        break;
      }
    }
  }, [currentChildren, selectedPath, onOpenFile, handleRenameStart, navigateTo, loadVfs, recordRecent]);

  // ── keyboard shortcuts ──

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target.isContentEditable) return;
      if (target.closest('.cm-editor') || target.closest('.text-editor-cm')) return;

      // Backspace - navigate to parent
      if (e.key === 'Backspace' && selectedPath.length > 1) {
        e.preventDefault();
        navigateTo(selectedPath.slice(0, -1));
        return;
      }

      // F2 - rename
      if (e.key === 'F2' && selectedItems.size === 1) {
        e.preventDefault();
        const path = [...selectedItems][0];
        handleRenameStart(path);
        return;
      }

      // Delete - delete
      if (e.key === 'Delete' && selectedItems.size > 0) {
        e.preventDefault();
        handleDeleteClick();
        return;
      }

      // Ctrl+C - copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedItems.size > 0) {
        e.preventDefault();
        clipboardRef.current = { paths: [...selectedItems], operation: 'copy' };
        setToast(`已复制 ${selectedItems.size} 个文件到剪贴板`);
        return;
      }

      // Ctrl+V - paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
        e.preventDefault();
        handlePaste();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItems, handleRenameStart, handlePaste, navigateTo, selectedPath]);

  // ── rubber-band selection ──

  useEffect(() => {
    if (!rubberBand) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!rubberRef.current) return;
      e.preventDefault();
      rubberRef.current.endX = e.clientX;
      rubberRef.current.endY = e.clientY;
      setRubberBand({ ...rubberRef.current });
    };

    const onMouseUp = (e: MouseEvent) => {
      const rb = rubberRef.current;
      if (!rb || !contentRef.current) {
        setRubberBand(null);
        rubberRef.current = null;
        rubberActiveRef.current = false;
        return;
      }

      const left = Math.min(rb.startX, rb.endX);
      const right = Math.max(rb.startX, rb.endX);
      const top = Math.min(rb.startY, rb.endY);
      const bottom = Math.max(rb.startY, rb.endY);

      if (right - left > 4 || bottom - top > 4) {
        const rows = contentRef.current.querySelectorAll('.fm-file-row');
        const selected = new Set<string>();
        rows.forEach((row) => {
          const rect = row.getBoundingClientRect();
          if (rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom) {
            const path = (row as HTMLElement).dataset.vfsPath;
            if (path) selected.add(path);
          }
        });

        if (!e.ctrlKey && !e.metaKey) {
          setSelectedItems(selected);
        } else {
          setSelectedItems(prev => {
            const next = new Set(prev);
            selected.forEach(p => next.add(p));
            return next;
          });
        }
      }

      setRubberBand(null);
      rubberRef.current = null;
      rubberActiveRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rubberBand]);

  // ── drag-to-move ──

  const handleDragStart = useCallback((e: React.DragEvent, relPath: string) => {
    const items = selectedItems.has(relPath) && selectedItems.size > 0
      ? [...selectedItems]
      : [relPath];
    const payload = items.map((p) => {
      const baseName = p.includes('/') ? p.substring(p.lastIndexOf('/') + 1) : p;
      return { fullPath: vfsPathRef.current(p), name: baseName, size: 0 };
    });
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', relPath);
    e.dataTransfer.effectAllowed = 'move';
  }, [selectedItems]);

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(folderPath);
  }, []);

  const handleFolderDragLeave = useCallback(() => {
    setDragOverPath(null);
  }, []);

  const handleFolderDrop = useCallback(async (e: React.DragEvent, destFolderPath: string) => {
    e.preventDefault();
    setDragOverPath(null);

    let items: { fullPath: string; name: string; size: number }[] = [];

    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const parsed = JSON.parse(jsonData);
        items = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        const srcRelPath = e.dataTransfer.getData('text/plain');
        if (!srcRelPath) return;
        const baseName = srcRelPath.includes('/') ? srcRelPath.substring(srcRelPath.lastIndexOf('/') + 1) : srcRelPath;
        items = [{ fullPath: vfsPathRef.current(srcRelPath), name: baseName, size: 0 }];
      }
    } catch {
      const srcRelPath = e.dataTransfer.getData('text/plain');
      if (!srcRelPath) return;
      const baseName = srcRelPath.includes('/') ? srcRelPath.substring(srcRelPath.lastIndexOf('/') + 1) : srcRelPath;
      items = [{ fullPath: vfsPathRef.current(srcRelPath), name: baseName, size: 0 }];
    }

    if (items.length === 0) return;

    const destDir = vfsPathRef.current(destFolderPath);
    let movedCount = 0;

    for (const item of items) {
      const newFullPath = destDir ? `${destDir}/${item.name}` : item.name;
      if (item.fullPath === newFullPath) continue;

      const existing = findNodeByRelPath(currentChildren, destFolderPath ? `${destFolderPath}/${item.name}` : item.name);
      if (existing) {
        setToast(`目标位置已存在 "${item.name}"`);
        continue;
      }

      try {
        await renameVfs(item.fullPath, newFullPath);
        const sourceDir = item.fullPath.substring(0, item.fullPath.lastIndexOf('/')) || '';
        onAddMoveTask?.(item.name, item.fullPath, item.size || 0, sourceDir, destDir);
        movedCount++;
      } catch (err) {
        setToast(`移动 "${item.name}" 失败: ${String(err)}`);
      }
    }

    if (movedCount > 0) {
      setSelectedItems(new Set());
      loadVfs();
      window.dispatchEvent(new CustomEvent('vfs-changed'));
      setToast(`已移动 ${movedCount} 个文件`);
    }
  }, [currentChildren, loadVfs, onAddMoveTask]);

  const handleContentDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/json') && !e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setContentDragOver(true);
    onDragEnter?.();
  }, [onDragEnter]);

  const handleContentDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setContentDragOver(false);
    }
  }, []);

  const handleContentDrop = useCallback(async (e: React.DragEvent) => {
    setContentDragOver(false);
    await handleFolderDrop(e, '');
  }, [handleFolderDrop]);

  // ── background context menu ──

  const handleBgContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const menuW = 170;
    const menuH = 190;
    let sx = e.clientX;
    let sy = e.clientY;
    if (sx + menuW > window.innerWidth) sx = e.clientX - menuW;
    if (sy + menuH > window.innerHeight) sy = e.clientY - menuH;
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    setBgCtxMenu({ x: sx, y: sy, visible: true });
  };

  const bgCtxItems: { label: string; icon: React.ReactNode; action: () => void }[] = [
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
      label: '新建Word文档',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#2b7cd3" stroke="#1e5fa8" strokeWidth="0.8" />
          <path d="M9 1.5v3h3" fill="none" stroke="#1e5fa8" strokeWidth="0.8" />
          <path d="M5 8.5l1.5 4 1-2.5 1 2.5 1.5-4" stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      action: () => openCreateModal('word'),
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

  // ── paste action (used in bg context menu too) ──

  const ctxItemsWithPaste = clipboardRef.current
    ? [
        ...bgCtxItems.slice(0, 1),
        {
          label: `粘贴 (${clipboardRef.current.paths.length} 个文件)`,
          icon: (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <rect x="4" y="2" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3 4h1v11h9v1a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          ),
          action: () => handlePaste(),
        },
        ...bgCtxItems.slice(1),
      ]
    : bgCtxItems;

  return (
    <div className="fm-container">
      {/* ===== Create Modal ===== */}
      {showCreateModal && (
        <div className="fm-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">
              {createType === 'folder' ? '新建文件夹' : createType === 'word' ? '新建Word文档' : '新建文件'}
            </div>
            <div className="fm-modal-body">
              <input
                autoFocus
                value={createName}
                onFocus={(e) => e.target.select()}
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
        <div className="fm-modal-overlay" onClick={() => { if (!deleting) setShowDeleteConfirm(false); }}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">确认删除</div>
            <div className="fm-modal-body" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              <p>确定要删除以下 {deleteTargets.length} 个{deleteTargets.length === 1 ? '项' : '项'}吗？</p>
              <div style={{ marginTop: '0.5rem', maxHeight: 120, overflowY: 'auto' }}>
                {deleteTargets.map((item) => (
                  <div key={item.name} style={{ padding: '0.125rem 0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    {item.isDirectory ? <IconFolder /> : <IconFile />}
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: '0.75rem', color: 'var(--error-text)', fontSize: '0.8125rem' }}>
                {deleteTargets.some(i => i.isDirectory) ? '删除文件夹将同时删除其中的所有内容。' : ''}
              </p>
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={handleDeleteConfirm} disabled={deleting} className="fm-modal-btn fm-modal-btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center' }}>
                {deleting && (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" className="transfer-spinner">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeLinecap="round" />
                  </svg>
                )}
                {deleting ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Single Delete Confirm Modal ===== */}
      {singleDelete && (
        <div className="fm-modal-overlay" onClick={() => { if (!deleting) setSingleDelete(null); }}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">确认删除</div>
            <div className="fm-modal-body" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              <p>确定要删除以下项目吗？</p>
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ padding: '0.125rem 0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  {singleDelete.isDirectory ? <IconFolder /> : <IconFile />}
                  <span>{singleDelete.name}</span>
                </div>
              </div>
              {singleDelete.isDirectory && (
                <p style={{ marginTop: '0.75rem', color: 'var(--error-text)', fontSize: '0.8125rem' }}>
                  删除文件夹将同时删除其中的所有内容。
                </p>
              )}
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setSingleDelete(null)} disabled={deleting} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={handleSingleDeleteConfirm} disabled={deleting} className="fm-modal-btn fm-modal-btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center' }}>
                {deleting && (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" className="transfer-spinner">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeLinecap="round" />
                  </svg>
                )}
                {deleting ? '删除中…' : '删除'}
              </button>
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
                    <span className="fm-breadcrumb-item" style={{ cursor: 'default', color: 'var(--text-secondary)' }}>
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      最近访问
                    </span>
                  ) : activeNav === 'favorites' ? (
                    <span className="fm-breadcrumb-item" style={{ cursor: 'default', color: 'var(--text-secondary)' }}>
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                        <path d="M10 2l2.1 5.6 6 .4-4.6 3.8 1.5 5.7L10 14.3 5 17.5l1.5-5.7L1.9 8l6-.4L10 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                      我的收藏
                    </span>
                  ) : activeNav === 'my-shares' || activeNav === 'shared-others' ? (
                    <span className="fm-breadcrumb-item" style={{ cursor: 'default', color: 'var(--text-secondary)' }}>
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                        {activeNav === 'my-shares' ? (
                          <path d="M14 7l-4-4-4 4M10 3v10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        ) : (
                          <path d="M10 10l-4-4 4-4M6 6v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        <path d="M3 13v3a1 1 0 001 1h12a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      {NAV_LABELS[activeNav]}
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

            {activeNav === 'my-files' ? (
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
                <button className="fm-action-btn" onClick={handleUploadFile} title="上传文件">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
                    <path d="M9 1.5v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8" />
                    <path d="M8 5v5M5.5 7.5h5" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span>上传文件</span>
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
                      <button className="fm-dropdown-item" onClick={() => { setShowMoreMenu(false); openCreateModal('word'); }}>
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#2b7cd3" stroke="#1e5fa8" strokeWidth="0.8" />
                          <path d="M9 1.5v3h3" fill="none" stroke="#1e5fa8" strokeWidth="0.8" />
                          <path d="M5 8.5l1.5 4 1-2.5 1 2.5 1.5-4" stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>新建Word文档</span>
                      </button>
                      <button className="fm-dropdown-item" onClick={() => { setShowMoreMenu(false); openCreateModal('folder'); }}>
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M2 4.5C2 3.67 2.67 3 3.5 3h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5V12a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 12V4.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                          <line x1="8" y1="8" x2="8" y2="11" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
                          <line x1="6.5" y1="9.5" x2="9.5" y2="9.5" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        <span>新建文件夹</span>
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
              className={`fm-content${contentDragOver ? ' fm-content-dragover' : ''}`}
              ref={contentRef}
              onContextMenu={handleBgContextMenu}
              onDragOver={handleContentDragOver}
              onDragLeave={handleContentDragLeave}
              onDrop={handleContentDrop}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (e.button !== 0) return;
                if (target.closest('.fm-file-row') || target.closest('.fm-file-header') || target.closest('.fm-col-resize')) return;
                if (!contentRef.current?.contains(target)) return;

                const x = e.clientX;
                const y = e.clientY;
                rubberRef.current = { startX: x, startY: y, endX: x, endY: y };
                rubberActiveRef.current = true;
                setRubberBand({ startX: x, startY: y, endX: x, endY: y });
              }}
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
                    const vfsRelPath = selectedPath.slice(1).join('/');
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
                        const vfsFullPath = vfsRelPath ? `${vfsRelPath}/${fullPath}` : fullPath;
                        const isSel = selectedItems.has(fullPath);
                        const hasChildren = node.isDirectory && node.children.length > 0;
                        const isExpanded = expandedMainDirs.has(fullPath);
                        const isRenaming = renamingPath === fullPath;
                        const isDragOver = dragOverPath === fullPath && node.isDirectory;

                        const dragHandlers = {
                          onDragOver: node.isDirectory
                            ? (e: React.DragEvent) => handleFolderDragOver(e, fullPath)
                            : (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
                          onDragLeave: node.isDirectory ? handleFolderDragLeave : undefined,
                          onDrop: node.isDirectory ? (e: React.DragEvent) => handleFolderDrop(e, fullPath) : undefined,
                        };

                        result.push(
                          <button
                            key={fullPath}
                            data-vfs-path={fullPath}
                            draggable
                            onDragStart={(e) => handleDragStart(e, fullPath)}
                            {...dragHandlers}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!isSel) {
                                setSelectedItems(new Set([fullPath]));
                                lastClickedRef.current = fullPath;
                              }
                              const menuW = 170;
                              const menuH = node.isDirectory ? 200 : 240;
                              let sx = e.clientX;
                              let sy = e.clientY;
                              if (sx + menuW > window.innerWidth) sx = e.clientX - menuW;
                              if (sy + menuH > window.innerHeight) sy = e.clientY - menuH;
                              if (sx < 0) sx = 0;
                              if (sy < 0) sy = 0;
                              setFileCtxMenu({ x: sx, y: sy, visible: true, path: fullPath, isDirectory: node.isDirectory });
                            }}
                            onDoubleClick={() => {
                              if (isRenaming) return;
                              if (node.isDirectory) {
                                navigateTo([...selectedPath, ...fullPath.split('/')]);
                                return;
                              }
                              if (onOpenFile && isEditableFile(node.name)) {
                                const vfsRelPath = selectedPath.slice(1).join('/');
                                const fullVfsPath = vfsRelPath ? `${vfsRelPath}/${fullPath}` : fullPath;
                                recordRecent(node.name, fullVfsPath, false);
                                onOpenFile(fullVfsPath, node.name);
                              } else {
                                setToast('暂不支持此文件格式');
                              }
                            }}
                            onClick={(e) => {
                              if (isRenaming) return;
                              setSelectedItems(prev => {
                                const next = new Set<string>();
                                if (e.ctrlKey || e.metaKey) {
                                  prev.forEach(v => next.add(v));
                                  if (next.has(fullPath)) next.delete(fullPath);
                                  else next.add(fullPath);
                                  if (next.has(fullPath)) lastClickedRef.current = fullPath;
                                  else if (lastClickedRef.current === fullPath) lastClickedRef.current = null;
                                } else if (e.shiftKey && lastClickedRef.current) {
                                  const anchorIdx = flatList.findIndex(f => f.path === lastClickedRef.current);
                                  const currentIdx = flatList.findIndex(f => f.path === fullPath);
                                  if (anchorIdx >= 0 && currentIdx >= 0) {
                                    const start = Math.min(anchorIdx, currentIdx);
                                    const end = Math.max(anchorIdx, currentIdx);
                                    for (let i = start; i <= end; i++) {
                                      next.add(flatList[i].path);
                                    }
                                  } else {
                                    next.add(fullPath);
                                  }
                                } else {
                                  next.add(fullPath);
                                  lastClickedRef.current = fullPath;
                                }
                                return next;
                              });
                            }}
                            className={`fm-file-row${isSel ? ' fm-file-row-selected' : ''}${isDragOver ? ' fm-file-row-drop-target' : ''}`}
                          >
                            <span className="fm-col-name" style={depth > 0 ? { paddingLeft: depth * 16 } : undefined}>
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
                              {isRenaming ? (
                                <input
                                  className="fm-rename-input"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameConfirm();
                                    if (e.key === 'Escape') setRenamingPath(null);
                                    e.stopPropagation();
                                  }}
                                  onBlur={handleRenameConfirm}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : (
                                <span className="fm-file-name-text">{node.name}</span>
                              )}
                              <span
                                className={`fm-fav-star${isFavorited(vfsFullPath) ? ' fm-fav-star-active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(vfsFullPath, node.name, node.isDirectory); }}
                                title={isFavorited(vfsFullPath) ? '取消收藏' : '添加到收藏'}
                              >
                                {isFavorited(fullPath) ? (
                                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                                    <path d="M8 1.5l1.9 4.9 5.1.4-3.8 3.2 1.2 5.2L8 12.7l-4.4 2.5 1.2-5.2L1 6.8l5.1-.4L8 1.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" className="fm-fav-star-outline">
                                    <path d="M8 1.5l1.9 4.9 5.1.4-3.8 3.2 1.2 5.2L8 12.7l-4.4 2.5 1.2-5.2L1 6.8l5.1-.4L8 1.5z" stroke="#9ca3af" strokeWidth="1" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
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

              {/* rubber-band overlay */}
              {rubberBand && (
                <div
                  className="fm-rubberband"
                  style={{
                    left: Math.min(rubberBand.startX, rubberBand.endX),
                    top: Math.min(rubberBand.startY, rubberBand.endY),
                    width: Math.abs(rubberBand.endX - rubberBand.startX),
                    height: Math.abs(rubberBand.endY - rubberBand.startY),
                  }}
                />
              )}

              {/* Background context menu */}
              {bgCtxMenu.visible && (
                <div className="fm-ctxmenu" style={{ left: bgCtxMenu.x, top: bgCtxMenu.y, position: 'fixed' }}>
                  {ctxItemsWithPaste.map((item) => (
                    <React.Fragment key={item.label}>
                      {item.label.startsWith('粘贴') || item.label === '上传文件夹' ? <div className="fm-ctxmenu-sep" /> : null}
                      <button
                        className="fm-ctxmenu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBgCtxMenu({ ...bgCtxMenu, visible: false });
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

              {/* File context menu */}
              {fileCtxMenu.visible && (
                <div className="fm-ctxmenu" style={{ left: fileCtxMenu.x, top: fileCtxMenu.y, position: 'fixed' }}>
                  <button className="fm-ctxmenu-item" onClick={() => handleFileCtxAction('open', fileCtxMenu.path, fileCtxMenu.isDirectory)}>
                    <span className="fm-ctxmenu-icon">
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                        <path d="M5 2h6l4 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M11 2v4h4" stroke="currentColor" strokeWidth="1.3" />
                      </svg>
                    </span>
                    <span>打开</span>
                  </button>
                  {fileCtxMenu.isDirectory && (
                    <>
                      <button className="fm-ctxmenu-item" onClick={() => {
                        setFileCtxMenu(c => ({ ...c, visible: false }));
                        const vfsPre = selectedPath.slice(1).join('/');
                        const fullP = vfsPre ? `${vfsPre}/${fileCtxMenu.path}` : fileCtxMenu.path;
                        openCreateModal('folder', fullP);
                      }}>
                        <span className="fm-ctxmenu-icon">
                          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                            <path d="M2 5.5C2 4.67 2.67 4 3.5 4h3l2 2h4c.83 0 1.5.67 1.5 1.5V13a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 13V5.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                            <path d="M7.5 9v3M6 10.5h3" stroke="#4b5563" strokeWidth="1" strokeLinecap="round" />
                          </svg>
                        </span>
                        <span>新建文件夹</span>
                      </button>
                      <button className="fm-ctxmenu-item" onClick={() => {
                        setFileCtxMenu(c => ({ ...c, visible: false }));
                        const vfsPre = selectedPath.slice(1).join('/');
                        const fullP = vfsPre ? `${vfsPre}/${fileCtxMenu.path}` : fileCtxMenu.path;
                        openCreateModal('file', fullP);
                      }}>
                        <span className="fm-ctxmenu-icon">
                          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                            <path d="M5 2h6l4 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
                            <path d="M11 2v4h4" fill="none" stroke="#4b5563" strokeWidth="0.8" />
                            <path d="M8 8v4M6 10h4" stroke="#9ca3af" strokeWidth="1" strokeLinecap="round" />
                          </svg>
                        </span>
                        <span>新建文件</span>
                      </button>
                      <button className="fm-ctxmenu-item" onClick={() => {
                        setFileCtxMenu(c => ({ ...c, visible: false }));
                        const vfsPre = selectedPath.slice(1).join('/');
                        const fullP = vfsPre ? `${vfsPre}/${fileCtxMenu.path}` : fileCtxMenu.path;
                        openCreateModal('word', fullP);
                      }}>
                        <span className="fm-ctxmenu-icon">
                          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                            <path d="M4 1.5h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" fill="#2b7cd3" stroke="#1e5fa8" strokeWidth="0.8" />
                            <path d="M9 1.5v3h3" fill="none" stroke="#1e5fa8" strokeWidth="0.8" />
                            <path d="M5 8.5l1.5 4 1-2.5 1 2.5 1.5-4" stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span>新建Word文档</span>
                      </button>
                    </>
                  )}
                  {!fileCtxMenu.isDirectory && (
                    <button className="fm-ctxmenu-item" onClick={() => handleFileCtxAction('download', fileCtxMenu.path, false)}>
                      <span className="fm-ctxmenu-icon">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span>下载</span>
                    </button>
                  )}
                  <div className="fm-ctxmenu-sep" />
                  <button className="fm-ctxmenu-item" onClick={() => handleFileCtxAction('rename', fileCtxMenu.path, fileCtxMenu.isDirectory)}>
                    <span className="fm-ctxmenu-icon">
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                        <path d="M11 2l3 3-9 9H2v-3L11 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>重命名</span>
                  </button>
                  <button className="fm-ctxmenu-item" onClick={() => {
                    const p = fileCtxMenu.path;
                    setFileCtxMenu(c => ({ ...c, visible: false }));
                    const node = findNodeByRelPath(currentChildren, p);
                    const vfsPre = selectedPath.slice(1).join('/');
                    const fullP = vfsPre ? `${vfsPre}/${p}` : p;
                    toggleFavorite(fullP, node?.name || getBaseName(p), fileCtxMenu.isDirectory);
                  }}>
                    <span className="fm-ctxmenu-icon">
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                        <path d="M8 1.5l1.9 4.9 5.1.4-3.8 3.2 1.2 5.2L8 12.7l-4.4 2.5 1.2-5.2L1 6.8l5.1-.4L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>{isFavorited((() => { const vfsPre = selectedPath.slice(1).join('/'); return vfsPre ? `${vfsPre}/${fileCtxMenu.path}` : fileCtxMenu.path; })()) ? '取消收藏' : '添加到收藏'}</span>
                  </button>
                  <button className="fm-ctxmenu-item" onClick={() => handleFileCtxAction('copy', fileCtxMenu.path, fileCtxMenu.isDirectory)}>
                    <span className="fm-ctxmenu-icon">
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                        <rect x="5" y="2" width="8" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M3 4h1v10h8v1a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
                      </svg>
                    </span>
                    <span>复制</span>
                  </button>
                  {clipboardRef.current && clipboardRef.current.paths.length > 0 && (
                    <button className="fm-ctxmenu-item" onClick={() => { setFileCtxMenu(c => ({ ...c, visible: false })); handlePaste(); }}>
                      <span className="fm-ctxmenu-icon">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <rect x="4" y="2" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M3 4h1v11h9v1a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
                        </svg>
                      </span>
                      <span>粘贴</span>
                    </button>
                  )}
                  <div className="fm-ctxmenu-sep" />
                  <button className="fm-ctxmenu-item fm-ctxmenu-item-danger" onClick={() => handleFileCtxAction('delete', fileCtxMenu.path, fileCtxMenu.isDirectory)}>
                    <span className="fm-ctxmenu-icon">
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                        <path d="M3 4h10l-1 10a1 1 0 01-1 1H5a1 1 0 01-1-1L3 4z" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M2 4h12M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>删除</span>
                  </button>
                </div>
              )}
            </div>
              </>
            ) : activeNav === 'my-shares' ? (
              <SharesPanel kind="mine" onToast={setToast} />
            ) : activeNav === 'shared-others' ? (
              <SharesPanel kind="received" onToast={setToast} />
            ) : activeNav === 'recent' ? (
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
                      <button className="fm-col-header fm-col-size" style={{ width: colWidths.size }}><span>大小</span></button>
                    </div>
                    {recentEntries.map((entry) => (
                        <button
                          key={`${entry.path}|${entry.isDirectory}`}
                          className="fm-file-row"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            const menuW = 160;
                            const menuH = 80;
                            let sx = e.clientX;
                            let sy = e.clientY;
                            if (sx + menuW > window.innerWidth) sx = e.clientX - menuW;
                            if (sy + menuH > window.innerHeight) sy = e.clientY - menuH;
                            setRecentCtxMenu({ x: sx, y: sy, visible: true, path: entry.path, name: entry.name, isDirectory: entry.isDirectory });
                          }}
                          onClick={() => {
                            if (entry.isDirectory) {
                              const parts = entry.path.split('/');
                              onOpenFileManagerAt?.(['我的文件', ...parts]);
                            } else {
                              onOpenFile?.(entry.path, entry.name);
                            }
                          }}
                        >
                          <span className="fm-col-name">
                            <span className="fm-tree-arrow fm-tree-arrow-empty" />
                            {entry.isDirectory ? <IconFolder /> : <IconFile />}
                            <span className="fm-file-name-text">{entry.name}</span>
                            <span
                              className={`fm-fav-star${isFavorited(entry.path) ? ' fm-fav-star-active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(entry.path, entry.name, entry.isDirectory); }}
                              title={isFavorited(entry.path) ? '取消收藏' : '添加到收藏'}
                            >
                              {isFavorited(entry.path) ? (
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                                  <path d="M8 1.5l1.9 4.9 5.1.4-3.8 3.2 1.2 5.2L8 12.7l-4.4 2.5 1.2-5.2L1 6.8l5.1-.4L8 1.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" className="fm-fav-star-outline">
                                  <path d="M8 1.5l1.9 4.9 5.1.4-3.8 3.2 1.2 5.2L8 12.7l-4.4 2.5 1.2-5.2L1 6.8l5.1-.4L8 1.5z" stroke="#9ca3af" strokeWidth="1" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                          </span>
                          <span className="fm-col-time" style={{ width: colWidths.time }}>{formatTime(entry.accessedAt)}</span>
                          <span className="fm-col-type" style={{ width: colWidths.type }}>{getFileType(entry.name, entry.isDirectory)}</span>
                          <span className="fm-col-size" style={{ width: colWidths.size }}>{entry.isDirectory ? '-' : '-'}</span>
                        </button>
                    ))}
                    {recentCtxMenu.visible && (
                      <div className="fm-ctxmenu" style={{ left: recentCtxMenu.x, top: recentCtxMenu.y, position: 'fixed' }}>
                        <button className="fm-ctxmenu-item" onClick={() => {
                          setRecentCtxMenu(c => ({ ...c, visible: false }));
                          const parts = recentCtxMenu.path.split('/');
                          if (recentCtxMenu.isDirectory) {
                            onOpenFileManagerAt?.(['我的文件', ...parts]);
                          } else {
                            const parentParts = parts.slice(0, -1);
                            const fileName = parts[parts.length - 1];
                            onOpenFileManagerAt?.(['我的文件', ...parentParts], fileName);
                          }
                        }}>
                          <span className="fm-ctxmenu-icon">
                            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                              <path d="M5 2h6l4 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
                              <path d="M11 2v4h4" stroke="currentColor" strokeWidth="1.3" />
                            </svg>
                          </span>
                          <span>打开文件路径</span>
                        </button>
                        <div className="fm-ctxmenu-sep" />
                        <button className="fm-ctxmenu-item fm-ctxmenu-item-danger" onClick={async () => {
                          setRecentCtxMenu(c => ({ ...c, visible: false }));
                          setRecentEntries(prev => prev.filter(r => r.path !== recentCtxMenu.path));
                          try { await removeVfsHistory(recentCtxMenu.path); } catch { /* ignore */ }
                        }}>
                          <span className="fm-ctxmenu-icon">
                            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                              <path d="M3 4h10l-1 10a1 1 0 01-1 1H5a1 1 0 01-1-1L3 4z" stroke="currentColor" strokeWidth="1.3" />
                              <path d="M2 4h12M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span>删除访问记录</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="fm-content" onContextMenu={(e) => {
                e.preventDefault();
                const menuW = 180;
                const menuH = 40;
                let sx = e.clientX;
                let sy = e.clientY;
                if (sx + menuW > window.innerWidth) sx = e.clientX - menuW;
                if (sy + menuH > window.innerHeight) sy = e.clientY - menuH;
                setFavCtxMenu({ x: sx, y: sy, visible: true });
              }}>
                {favoriteEntries.length === 0 ? (
                  <div className="fm-empty">暂无收藏</div>
                ) : (
                  <div className="fm-file-table">
                    <div className="fm-file-header">
                      <button className="fm-col-header fm-col-name"><span>名称</span></button>
                      <div className="fm-col-resize" />
                      <button className="fm-col-header fm-col-time" style={{ width: colWidths.time }}><span>收藏时间</span></button>
                      <div className="fm-col-resize" />
                      <button className="fm-col-header fm-col-type" style={{ width: colWidths.type }}><span>类型</span></button>
                      <div className="fm-col-resize" />
                      <button className="fm-col-header fm-col-size" style={{ width: colWidths.size }}><span>大小</span></button>
                    </div>
                    {favoriteEntries.map((entry) => (
                      <button
                        key={`${entry.path}|${entry.isDirectory}`}
                        className="fm-file-row"
                        onClick={async () => {
                          const exists = await checkFavExists(entry.path, entry.isDirectory);
                          if (!exists) {
                            setToast(`"${entry.name}" 已不存在`);
                            return;
                          }
                          if (entry.isDirectory) {
                            const parts = entry.path.split('/');
                            onOpenFileManagerAt?.(['我的文件', ...parts]);
                          } else {
                            onOpenFile?.(entry.path, entry.name);
                          }
                        }}
                      >
                        <span className="fm-col-name" title={entry.path}>
                          <span className="fm-tree-arrow fm-tree-arrow-empty" />
                          {entry.isDirectory ? <IconFolder /> : <IconFile />}
                          <span className="fm-file-name-text">{entry.name}</span>
                          <span
                            className="fm-fav-star fm-fav-star-active"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(entry.path, entry.name, entry.isDirectory); }}
                            title="取消收藏"
                          >
                            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                              <path d="M8 1.5l1.9 4.9 5.1.4-3.8 3.2 1.2 5.2L8 12.7l-4.4 2.5 1.2-5.2L1 6.8l5.1-.4L8 1.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
                            </svg>
                          </span>
                        </span>
                        <span className="fm-col-time" style={{ width: colWidths.time }}>{formatTime(entry.favoritedAt)}</span>
                        <span className="fm-col-type" style={{ width: colWidths.type }}>{getFileType(entry.name, entry.isDirectory)}</span>
                        <span className="fm-col-size" style={{ width: colWidths.size }}>{entry.isDirectory ? '-' : '-'}</span>
                      </button>
                    ))}
                  </div>
                )}
                {favCtxMenu.visible && (
                  <div className="fm-ctxmenu" style={{ left: favCtxMenu.x, top: favCtxMenu.y, position: 'fixed' }}>
                    <button className="fm-ctxmenu-item" onClick={async () => {
                      setFavCtxMenu(c => ({ ...c, visible: false }));
                      await cleanInvalidFavorites();
                    }}>
                      <span className="fm-ctxmenu-icon">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M2 4h12l-1 10a1 1 0 01-1 1H4a1 1 0 01-1-1L2 4z" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M1 4h14M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span>清理无效收藏</span>
                    </button>
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
