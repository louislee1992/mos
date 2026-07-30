package com.mos.model;

import lombok.Data;
import java.util.List;

@Data
public class UserSettings {
    private int version;
    private long updatedAt;
    private String wallpaperId;
    private String wallpaperType;
    private String solidColor;
    private List<CustomWallpaper> customWallpapers;
    private List<String> desktopIconOrder;
    private String theme;
    private List<WindowState> openWindows;

    @Data
    public static class CustomWallpaper {
        private String id;
        private String name;
        private String key;
    }

    @Data
    public static class WindowState {
        private String appId;
        private int x;
        private int y;
        private int width;
        private int height;
    }
}
