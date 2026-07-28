export interface WindowState {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CustomWallpaper {
  id: string;       // uuid
  name: string;     // original filename
  key: string;      // config/wallpapers/{uuid}.{ext}
}

export interface UserSettings {
  version: number;
  updatedAt: number;
  wallpaperId: string;
  wallpaperType: 'preset' | 'solid' | 'custom';
  solidColor: string;
  customWallpapers: CustomWallpaper[];
  desktopIconOrder: string[];
  theme: string;
  openWindows: WindowState[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  version: 1,
  updatedAt: Date.now(),
  wallpaperId: 'default',
  wallpaperType: 'preset',
  solidColor: '#1a1a2e',
  customWallpapers: [],
  desktopIconOrder: ['file-manager', 'recycle-bin'],
  theme: 'dark',
  openWindows: [],
};
