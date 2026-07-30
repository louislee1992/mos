export interface VfsEntry {
  name: string;
  path: string;
  isFolder: boolean;
  size: number;
  lastModified: string;
  contentType: string;
}
