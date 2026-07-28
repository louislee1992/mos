# My Account Window Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign MyAccount window with sidebar navigation (账号/主题壁纸/登录设备管理), extend UserSettings for wallpaper types, add backend config-file commands and device info.

**Architecture:** Reuse `.settings-sidebar`/`.settings-content` layout from Settings.tsx. Extend `UserSettings` in both TS and Rust with `wallpaperType`, `solidColor`, `customWallpapers`. Add 4 Rust commands: `upload_config_file`, `delete_config_file`, `read_config_file`, `get_device_info`. Desktop component resolves wallpaper background via new helper supporting preset/solid/custom types.

**Tech Stack:** React + TypeScript (frontend), Tauri 2 + Rust + AWS SDK + os_info/hostname/local-ip-address crates (backend), MinIO bucket for config persistence

## Global Constraints

- All config persisted per-account in bucket `config/settings.json`
- Custom wallpaper images stored in `config/wallpapers/{uuid}.{ext}`
- `wallpaperType` defaults to `'preset'` (backward compatible)
- Theme: `'system'` | `'light'` | `'dark'`
- Wallpaper types: `'preset'` | `'solid'` | `'custom'`
- New UserSettings fields have defaults; existing `config/settings.json` must not break

---

### Task 1: Extend TypeScript types and add wallpaper helper

**Files:**
- Modify: `src/types/settings.ts`
- Modify: `src/data/wallpapers.ts`

**Interfaces:**
- Produces: `CustomWallpaper` interface, extended `UserSettings`, `getWallpaperBackground(settings)` helper

- [ ] **Step 1: Extend UserSettings in settings.ts**

Add `CustomWallpaper` interface and add `wallpaperType`, `solidColor`, `customWallpapers` fields to `UserSettings`. Update `DEFAULT_SETTINGS` with defaults for new fields. See spec for exact field definitions.

- [ ] **Step 2: Add getWallpaperBackground helper in wallpapers.ts**

Import `UserSettings` type. Export `getWallpaperBackground(settings: UserSettings | null | undefined): string`. If preset or null/undefined, resolve wallpaper from the wallpapers array by ID. If solid, return `settings.solidColor`. If custom, return a fallback preset background (Desktop component handles the custom image via `<img>` overlay).

- [ ] **Step 3: Type check and commit**

```bash
npx tsc --noEmit --pretty
git add src/types/settings.ts src/data/wallpapers.ts
git commit -m "feat: extend UserSettings, add getWallpaperBackground helper"
```

---

### Task 2: Extend Rust UserSettings and add backend commands

**Files:**
- Modify: `src-tauri/src/bootstrap.rs`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Produces: `CustomWallpaper` Rust struct, extended `UserSettings` with `wallpaper_type`/`solid_color`/`custom_wallpapers`, `DeviceInfo` struct, 4 new commands: `upload_config_file`, `delete_config_file`, `read_config_file`, `get_device_info`

- [ ] **Step 1: Add CustomWallpaper struct, extend UserSettings, update default_config()**

Add `CustomWallpaper` struct with `id: String`, `name: String`, `key: String`. Add `wallpaper_type: String`, `solid_color: String`, `custom_wallpapers: Vec<CustomWallpaper>` to `UserSettings`. Set defaults in `default_config()`: `wallpaper_type: "preset"`, `solid_color: "#1a1a2e"`, `custom_wallpapers: vec![]`.

- [ ] **Step 2: Add DeviceInfo struct and get_device_info command**

Add `DeviceInfo` struct with fields `os_name`, `os_version`, `hostname`, `local_ip` (all String, serde camelCase). Implement `get_device_info()` using `os_info::get()`, `hostname::get()`, `local_ip_address::local_ip()`.

- [ ] **Step 3: Add upload_config_file, delete_config_file, read_config_file commands**

All three follow the existing pattern: extract endpoint/access_key/secret_key from AppState, build S3 client, derive bucket name. They operate on `config/{key}` instead of `vfs/`.

- `upload_config_file(key: String, data: Vec<u8>)` — put_object to `config/{key}`
- `delete_config_file(key: String)` — delete_object at `config/{key}`
- `read_config_file(key: String) -> Vec<u8>` — get_object from `config/{key}`, return body bytes

- [ ] **Step 4: Add Rust dependencies to Cargo.toml**

```toml
os_info = "3"
hostname = "0.4"
local-ip-address = "0.6"
```

- [ ] **Step 5: Build check and commit**

```bash
cd src-tauri && cargo check 2>&1
git add src-tauri/src/bootstrap.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: extend UserSettings, add config file commands and device_info"
```

---

### Task 3: Register new Rust commands and add frontend fs dependency

**Files:**
- Modify: `src-tauri/src/main.rs` (invoke_handler block)
- Modify: `package.json`

**Interfaces:**
- Consumes: `upload_config_file`, `delete_config_file`, `read_config_file`, `get_device_info` from bootstrap.rs
- Produces: registered commands callable from TS frontend

- [ ] **Step 1: Register new commands in main.rs**

Add `bootstrap::upload_config_file`, `bootstrap::delete_config_file`, `bootstrap::read_config_file`, `bootstrap::get_device_info` to the `invoke_handler` macro.

- [ ] **Step 2: Install and register @tauri-apps/plugin-fs**

```bash
npm install @tauri-apps/plugin-fs
```

Add `tauri-plugin-fs = "2"` to `src-tauri/Cargo.toml` dependencies.
Add `.plugin(tauri_plugin_fs::init())` to the Tauri builder chain in `src-tauri/src/main.rs`.

- [ ] **Step 3: Build check and commit**

```bash
cd src-tauri && cargo check 2>&1
npx tsc --noEmit --pretty
git add src-tauri/src/main.rs src-tauri/Cargo.toml src-tauri/Cargo.lock package.json package-lock.json
git commit -m "feat: register new config commands, add plugin-fs dependency"
```

---

### Task 4: Rewrite MyAccount.tsx with sidebar + 3 tabs

**Files:**
- Write: `src/components/MyAccount.tsx` (full rewrite)

**Interfaces:**
- Consumes: `load_accounts`, `get_device_info`, `upload_config_file`, `delete_config_file`, `read_config_file` Tauri commands; `wallpapers` data; `CustomWallpaper`, `UserSettings`, `DeviceInfo`, `AccountEntry` types; `@tauri-apps/plugin-dialog` (open); `@tauri-apps/plugin-fs` (readFile)
- Produces: `MyAccount` component with props `{ accessKey, settings, onUpdateSettings }`

**Props note:** The component now receives props instead of being self-contained. `Window.tsx` and `App.tsx` will pass these down (wired in Task 6).

- [ ] **Step 1: Component shell + sidebar navigation**

Render a `.fm-container` with `.settings-sidebar` (180px) and `.settings-content` (flex:1). Sidebar has 3 buttons: 账号, 主题壁纸, 登录设备管理. Use `useState<TabId>` for active tab tracking. Apply `.settings-nav-btn-active` class to active item.

- [ ] **Step 2: Tab 1 — 账号 (account info)**

On mount, invoke `load_accounts` to get accounts list. Find `currentAccount` by matching `accessKey` prop. Display in `.settings-info-card`: name, endpoint, access key (monospace), creation time, last used time. Show loading/empty states.

- [ ] **Step 3: Tab 2 — 主题壁纸 (theme + wallpaper)**

**Theme mode section:** 3-button group (跟随系统/亮色/暗色). Active button gets blue border + blue tinted background. Click calls `onUpdateSettings({ theme })`.

**Wallpaper sub-tabs:** 3 buttons (预设/纯色/自定义). Use `useState<WallpaperSubTab>` for tracking. Default to `settings.wallpaperType`.

**Preset grid:** 4-column grid of 8 wallpaper cards. Each card shows gradient background at 16:10 aspect ratio. Selected card has blue border + checkmark SVG. Click calls `onUpdateSettings({ wallpaperId, wallpaperType: 'preset' })`.

**Solid grid:** 6-column grid of 12 preset swatches + a native `<input type="color">` + hex text input. Selecting a swatch or input calls `onUpdateSettings({ solidColor, wallpaperType: 'solid' })`.

**Custom grid:** 4-column grid of uploaded images + an "add" button. Each card shows a thumbnail (loaded via `read_config_file` → blob URL). Delete button (X overlay) calls `delete_config_file` then removes from `customWallpapers` list. Add button opens file dialog via `@tauri-apps/plugin-dialog`, reads file via `@tauri-apps/plugin-fs` `readFile`, uploads via `upload_config_file`, and appends to list. On image select: `onUpdateSettings({ wallpaperId: cw.id, wallpaperType: 'custom' })`.

- [ ] **Step 4: Tab 3 — 登录设备管理 (device info + login history)**

On mount, invoke `get_device_info`. Display in card: OS name+version, hostname, local IP, MinIO endpoint, Access Key. Below, show login history from the matched account entry (lastUsedAt + endpoint).

- [ ] **Step 5: Type check and commit**

```bash
npx tsc --noEmit --pretty
git add src/components/MyAccount.tsx
git commit -m "feat: rewrite MyAccount with sidebar navigation and 3 tabs"
```

---

### Task 5: Add CSS for MyAccount layout

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: existing `.settings-sidebar`, `.settings-nav-btn`, `.settings-content`, `.settings-info-card`, `.settings-info-item`, `.settings-info-label`, `.settings-info-value` classes
- Produces: no new class names needed (reuses existing Settings pattern)

- [ ] **Step 1: Verify existing styles are sufficient**

The existing `.settings-sidebar` (180px), `.settings-nav-btn`, `.settings-nav-btn-active`, `.settings-content` (flex:1, padding:24px 32px), `.settings-info-card`, `.settings-info-item`, `.settings-info-label`, `.settings-info-value` from the Settings component already provide the layout, sidebar, and card styles needed. No new CSS classes required for the core layout.

- [ ] **Step 2: Add wallpaper grid styles if needed**

Add minimal grid-specific styles as inline styles in MyAccount.tsx (already covered by style props in Task 4). No separate CSS needed.

- [ ] **Step 3: Commit**

```bash
git add src/index.css  # only if styles were added
git commit -m "style: verify MyAccount layout styles reuse existing settings pattern"
```

---

### Task 6: Wire up MyAccount props and update Desktop for wallpaper types

**Files:**
- Modify: `src/components/Window.tsx` — pass `accessKey`, `settings`, `onUpdateSettings` to MyAccount
- Modify: `src/components/Desktop.tsx` — support solid/custom wallpapers
- Modify: `src/App.tsx` — resolve wallpaper background correctly

**Interfaces:**
- Consumes: `MyAccount` new props, `getWallpaperBackground` helper, `useSettings` hook
- Produces: working wallpaper switching across all 3 types

- [ ] **Step 1: Pass props to MyAccount in Window.tsx**

In `Window.tsx`, when `app.id === 'my-account'`, pass `accessKey`, `settings`, `onUpdateSettings` props to `<MyAccount />`. These need to be threaded from App.tsx through Window. Add optional props to `WindowProps`:
- `accessKey?: string | null`
- `settings?: UserSettings | null`  
- `onUpdateSettings?: (patch: Partial<UserSettings>) => void`

In `App.tsx`, pass these to `<Window />` when rendering each open window.

- [ ] **Step 2: Update Desktop.tsx for wallpaper types**

Change `DesktopProps.currentWallpaper` from `Wallpaper` to accept background CSS string directly. Add a new prop `background: string`. In `App.tsx`, resolve background via `getWallpaperBackground(settings)` and pass to Desktop.

For custom wallpapers (`wallpaperType === 'custom'`): Desktop renders an `<img>` element as absolute-positioned background layer when a custom wallpaper is active. The image src is loaded via `read_config_file` → blob URL.

- [ ] **Step 3: Update App.tsx background resolution**

In `App.tsx`, compute `desktopBackground` from `settings` using `getWallpaperBackground`. Pass to `<Desktop background={desktopBackground} />`. Handle custom wallpaper type with additional state for the custom image blob URL.

- [ ] **Step 4: Type check and commit**

```bash
npx tsc --noEmit --pretty
git add src/components/Window.tsx src/components/Desktop.tsx src/App.tsx
git commit -m "feat: wire MyAccount props, support solid/custom wallpaper backgrounds"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Build check (full)**

```bash
cd src-tauri && cargo check 2>&1
npx tsc --noEmit --pretty
```

- [ ] **Step 2: Test the flow**

Open the app. Click user center → 个人设置. Verify:
- Tab 1 shows current account info
- Tab 2 theme buttons work, preset wallpapers selectable, solid colors selectable, custom upload/select/delete works
- Tab 3 shows OS info, IP address, login history
- Closing settings and reopening preserves state

- [ ] **Step 3: Fix any issues and final commit**

```bash
git add -A
git commit -m "chore: final fixes for MyAccount redesign"
```
