export interface VfsEntry {
  name: string;
  path: string;
  type: string;  // "file" | "folder"
  size: number;
  lastModified: string;
}
