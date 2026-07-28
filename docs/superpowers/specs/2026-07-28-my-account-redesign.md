# My Account Window Redesign

**Date:** 2026-07-28
**Status:** approved

## Overview

Redesign the "我的账号" (My Account) window from a simple account info display into a full settings panel with sidebar navigation and three tabs: 账号, 主题壁纸, 登录设备管理. All configuration is persisted per-account in the bucket's `config/` directory.

## Layout

```
┌──────────┬──────────────────────────┐
│  账号     │                          │
│  主题壁纸  │     右侧主体内容区        │
│  登录设备  │                          │
│           │                          │
└──────────┴──────────────────────────┘
```

- Left sidebar: 180px width, vertical menu items with active highlight
- Right content area: renders different content based on selected tab
- Reuse existing `.settings-sidebar` and `.settings-content` CSS patterns from Settings component

## Tab 1 — 账号

**Display-only** view of current account information:

- Name (e.g., "MinIO @ 127.0.0.1:9000")
- MinIO Endpoint
- Access Key (monospace)
- Creation time (formatted)
- Last used time (formatted)

Data loaded via existing `load_accounts` Tauri command, filtered by current access key. No edit functionality for this tab.

## Tab 2 — 主题壁纸

### Theme Mode
Three mutually exclusive options as button group:
- **跟随系统** (`system`) — follows OS `prefers-color-scheme`
- **亮色** (`light`)
- **暗色** (`dark`)

Toggles CSS class on root element for theme switching.

### Wallpaper
Sub-tabs within the content area: 预设 | 纯色 | 自定义

#### 预设 (Preset)
Grid of existing 8 gradient wallpapers from `wallpapers.ts`. Click to select. Selected state has a blue border + checkmark.

#### 纯色 (Solid Color)
- Grid of preset color swatches (12 common desktop colors)
- Custom hex color input below the grid
- Live preview of selected color

#### 自定义 (Custom)
- Grid of user-uploaded wallpaper images (thumbnails)
- "上传图片" button opens file dialog (jpg/png/webp), uploads to `config/wallpapers/` via new Tauri command
- Each custom wallpaper card has a delete button (X overlay on hover)
- Images stored as `config/wallpapers/{uuid}.{ext}` in the bucket

### Data Model Changes

Extend `UserSettings` (TypeScript + Rust):

```typescript
// New fields
wallpaperType: 'preset' | 'solid' | 'custom';  // default: 'preset'
solidColor: string;                              // hex, e.g. '#1a1a2e'
customWallpapers: CustomWallpaper[];             // default: []

interface CustomWallpaper {
  id: string;       // uuid
  name: string;     // original filename
  key: string;      // config/wallpapers/{uuid}.{ext}
}
```

## Tab 3 — 登录设备管理

Only shows records for the **currently logged-in access key**.

### Current Session
Card showing:
- **操作系统** — OS name + version (e.g., "Windows 11 Pro 10.0.26200")
- **本机 IP** — Primary local network IP address
- **登录时间** — When the current session started
- **MinIO 地址** — Current endpoint
- **Access Key** — Current access key (monospace)

### Login History
Table/list of past logins for this access key, from `accounts` data:
- Login time (lastUsedAt)
- Endpoint

Sorted by time descending.

### Backend: Device Info

New Tauri command `get_device_info`:

```rust
#[tauri::command]
async fn get_device_info() -> Result<DeviceInfo, String>
```

Returns `{ os_name, os_version, hostname, local_ip }`.

## Backend Changes

### New Rust Commands

1. **`upload_config_file(key, data: Vec<u8>)`** — Upload bytes to `config/{key}` in bucket.
2. **`delete_config_file(key)`** — Delete object at `config/{key}`.
3. **`get_device_info()`** — Returns OS name, version, hostname, and primary local IP.

### Modified Commands

4. **`bootstrap_user_bucket` / `save_user_settings`** — `UserSettings` struct gains `wallpaper_type`, `solid_color`, `custom_wallpapers` fields with defaults for backward compatibility.

## File Plan

| File | Action | Description |
|------|--------|-------------|
| `src/components/MyAccount.tsx` | Rewrite | Sidebar + 3 tab panels |
| `src/types/settings.ts` | Modify | Extend UserSettings, add CustomWallpaper |
| `src/hooks/useSettings.ts` | Modify | Handle new settings fields |
| `src/index.css` | Modify | My-account sidebar/content styles |
| `src/App.tsx` | Modify | Apply wallpaperType/solidColor to desktop |
| `src/components/Desktop.tsx` | Modify | Support custom/solid wallpapers |
| `src-tauri/src/bootstrap.rs` | Modify | Extended UserSettings, new config commands, device_info |
| `src-tauri/src/main.rs` | Modify | Register new commands |
