import { useState, useCallback, useEffect } from 'react';

export interface TransferTask {
  id: string;
  fileName: string;
  vfsPath: string;
  sourcePath?: string;
  destPath?: string;
  direction: 'upload' | 'download' | 'move';
  totalBytes: number;
  transferredBytes: number;
  status: 'transferring' | 'completed' | 'failed';
  writingToStorage?: boolean;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface UseTransfersResult {
  tasks: TransferTask[];
  addUploadTask: (fileName: string, vfsPath: string, totalBytes: number) => string;
  addDownloadTask: (fileName: string, vfsPath: string, totalBytes: number) => string;
  addMoveTask: (fileName: string, vfsPath: string, totalBytes: number, sourcePath?: string, destPath?: string) => string;
  completeTask: (id: string, transferredBytes?: number) => void;
  failTask: (id: string, error: string) => void;
  updateTask: (id: string, transferredBytes: number) => void;
  setTaskWriting: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
}

function now(): number {
  return Date.now();
}

function generateId(): string {
  return `${now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useTransfers(): UseTransfersResult {
  const [tasks, setTasks] = useState<TransferTask[]>([]);

  // clean up tasks older than 3 days
  useEffect(() => {
    const interval = setInterval(() => {
      const minTime = now() - 3 * 24 * 60 * 60 * 1000;
      setTasks((prev) => {
        const filtered = prev.filter(
          (t) => t.createdAt >= minTime || t.status === 'transferring',
        );
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const addUploadTask = useCallback(
    (fileName: string, vfsPath: string, totalBytes: number): string => {
      const id = generateId();
      const task: TransferTask = {
        id,
        fileName,
        vfsPath,
        direction: 'upload',
        totalBytes,
        transferredBytes: 0,
        status: 'transferring',
        createdAt: now(),
      };
      setTasks((prev) => [task, ...prev]);
      return id;
    },
    [],
  );

  const addDownloadTask = useCallback(
    (fileName: string, vfsPath: string, totalBytes: number): string => {
      const id = generateId();
      const task: TransferTask = {
        id,
        fileName,
        vfsPath,
        direction: 'download',
        totalBytes,
        transferredBytes: 0,
        status: 'transferring',
        createdAt: now(),
      };
      setTasks((prev) => [task, ...prev]);
      return id;
    },
    [],
  );

  const addMoveTask = useCallback(
    (fileName: string, vfsPath: string, totalBytes: number, sourcePath?: string, destPath?: string): string => {
      const id = generateId();
      const task: TransferTask = {
        id,
        fileName,
        vfsPath,
        sourcePath,
        destPath,
        direction: 'move',
        totalBytes,
        transferredBytes: totalBytes,
        status: 'completed',
        createdAt: now(),
        completedAt: now(),
      };
      setTasks((prev) => [task, ...prev]);
      return id;
    },
    [],
  );

  const completeTask = useCallback((id: string, transferredBytes?: number) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'completed' as const, transferredBytes: transferredBytes ?? t.totalBytes, completedAt: now(), writingToStorage: false }
          : t,
      ),
    );
  }, []);

  const failTask = useCallback((id: string, error: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: 'failed' as const, error, completedAt: now(), writingToStorage: false } : t,
      ),
    );
  }, []);

  const updateTask = useCallback((id: string, transferredBytes: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, transferredBytes } : t)),
    );
  }, []);

  const setTaskWriting = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, writingToStorage: true } : t)),
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'transferring'));
  }, []);

  const clearAll = useCallback(() => {
    setTasks([]);
  }, []);

  return { tasks, addUploadTask, addDownloadTask, addMoveTask, completeTask, failTask, updateTask, setTaskWriting, clearCompleted, clearAll };
}
