package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.UserSettings;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private final MinioService minioService;

    public UserSettings loadSettings(MinioClient client, String accessKey) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        UserSettings defaults = new UserSettings();
        defaults.setVersion(1);
        defaults.setWallpaperId("default");
        defaults.setWallpaperType("preset");
        defaults.setSolidColor("#1a1a2e");
        defaults.setTheme("dark");
        return minioService.readJsonOrDefault(client, bucket, "config/settings.json",
                UserSettings.class, defaults);
    }

    public void saveSettings(MinioClient client, String accessKey, UserSettings settings) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        settings.setUpdatedAt(System.currentTimeMillis());
        minioService.writeJson(client, bucket, "config/settings.json", settings);
    }
}
