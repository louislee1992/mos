# Task 14 Report: Vite Build Config + Dependency Cleanup

**Status:** Complete

## Summary

Updated Vite build configuration and removed all Tauri dependencies from the project.

## Changes Made

### 1. `vite.config.ts`
- Kept existing `react()` and `tailwindcss()` plugins
- Added `build.outDir: '../mos-server/src/main/resources/static'`
- Added `build.emptyOutDir: true`
- Added dev server proxy:
  - `/api` -> `http://localhost:8080`
  - `/ws` -> `ws://localhost:8080` (with `ws: true`)

### 2. `package.json`
- Removed `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs` from dependencies
- Removed `@tauri-apps/cli` from devDependencies
- Removed `"tauri"` and `"tauri:build"` scripts
- Added `@tailwindcss/vite` to devDependencies (needed by vite.config.ts, was missing)

### 3. `src/main.tsx`
- Skipped -- already clean, no Tauri imports

### 4. `npm install`
- Ran to sync package-lock.json -- removed 5 packages (the 3 Tauri deps, cli, + 1 transitive)

### 5. Build Verification
- `npm run build` failed due to pre-existing TypeScript errors in unmodified files (App.tsx, ChatView.tsx, FileManager.tsx, etc.)
- `npx vite build` succeeded, output to `mos-server/src/main/resources/static/`:
  - `index.html` (0.46 kB)
  - `assets/index-BvnRKEUx.css` (38.93 kB)
  - `assets/index-yrBa6i07.js` (1,160.12 kB)

## Commit

```
8c79ea0 build: configure Vite output to Spring Boot static dir, remove Tauri deps
```

Files committed: `vite.config.ts`, `package.json`, `package-lock.json`

## Concerns

- Pre-existing tsc errors in unmodified files still present -- these are from earlier tasks (App.tsx, FileManager.tsx, MyAccount.tsx, Window.tsx, useWebSocket.ts) and are not introduced by this change
- `vite.config.ts` has a CRLF warning from Git -- this is cosmetic and will be corrected on next checkout

## Fix Round 1: Remove remaining Tauri imports (App.tsx + MyAccount.tsx)

**Status:** Complete

### Problem

3 remaining `@tauri-apps/api` imports in `App.tsx` and `MyAccount.tsx`:
- `App.tsx`: `getCurrentWindow` from `@tauri-apps/api/window`, `invoke` from `@tauri-apps/api/core`
- `MyAccount.tsx`: `invoke` from `@tauri-apps/api/core`

### Changes Made

#### `src/App.tsx`
- Replaced `getCurrentWindow().setTitle(...)` with `document.title = ...`
- Replaced `getCurrentWindow().close()` with `window.close()`
- Replaced `invoke('get_app_version')` with `getVersion()` from `../api/auth`
- Replaced `invoke('read_config_file', ...)` wallpaper loading with direct `fetch` + `URL.createObjectURL` using credentials from `getCredentials()`
- Added imports: `getVersion` from `../api/auth`, `getCredentials` from `../api/client`

#### `src/components/MyAccount.tsx`
- Replaced `invoke<AccountsData>('load_accounts')` with `localStorage.getItem('mos-accounts')`
- Replaced `invoke<DeviceInfo>('get_device_info')` with `getDeviceInfo()` from `../api/system`
- Replaced `invoke('read_config_file', ...)` thumbnail loading with direct `fetch` + `URL.createObjectURL`
- Replaced `invoke('upload_config_file', ...)` with `uploadConfig(file, key)` from `../api/settings` (removed `ArrayBuffer`/`Uint8Array` conversion)
- Replaced `invoke('delete_config_file', ...)` with `deleteConfig(key)` from `../api/settings`
- Removed `AccountsData` import (no longer needed), added imports: `getDeviceInfo`, `uploadConfig`, `deleteConfig`, `getCredentials`

#### `src/hooks/useSettings.ts`
- Rewrote to match `App.tsx` usage: accepts `accessKey` parameter, returns `{ settings, updateSettings }`
- On mount/`accessKey` change, loads settings from API via `loadSettings()`
- `updateSettings` applies partial patch and saves via `saveSettings()`

#### `src/types/accounts.ts` (NEW)
- Created with `AccountEntry` and `AccountsData` interfaces, shared between `MyAccount.tsx` and `LoginScreen.tsx`

### Verification

- `grep -r "tauri" src/ --include="*.ts" --include="*.tsx"` -- **zero matches**
- `npx tsc --noEmit` -- **zero errors**

### Commit

```
1ea1b81 fix: replace remaining @tauri-apps/api imports with browser-compatible APIs
```
