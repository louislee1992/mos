package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.UserSettings;
import com.mos.service.MinioService;
import com.mos.service.SettingsService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;
    private final MinioService minioService;

    private MinioClient getClient(HttpServletRequest req) {
        return (MinioClient) req.getAttribute("minioClient");
    }

    private String getAccessKey(HttpServletRequest req) {
        return (String) req.getAttribute("accessKey");
    }

    private String getBucket(HttpServletRequest req) {
        return MinioConfig.deriveBucketName(getAccessKey(req));
    }

    @GetMapping("/api/settings")
    public ResponseEntity<?> loadSettings(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(settingsService.loadSettings(getClient(req), getAccessKey(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/api/settings")
    public ResponseEntity<?> saveSettings(@RequestBody UserSettings settings, HttpServletRequest req) {
        try {
            settingsService.saveSettings(getClient(req), getAccessKey(req), settings);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // Config file management
    @PostMapping("/api/config/upload")
    public ResponseEntity<?> uploadConfig(@RequestParam("file") MultipartFile file,
                                          @RequestParam("key") String key,
                                          HttpServletRequest req) {
        try {
            minioService.uploadFile(getClient(req), getBucket(req), "config/" + key,
                    file.getInputStream(), file.getSize(), file.getContentType());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/api/config/{key}")
    public ResponseEntity<?> deleteConfig(@PathVariable String key, HttpServletRequest req) {
        try {
            minioService.deleteObject(getClient(req), getBucket(req), "config/" + key);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/api/config/{key}")
    public ResponseEntity<?> readConfig(@PathVariable String key, HttpServletRequest req) {
        try {
            byte[] data = minioService.downloadFile(getClient(req), getBucket(req), "config/" + key);
            return ResponseEntity.ok(Map.of("content", new String(data)));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    // History
    @GetMapping("/api/history")
    public ResponseEntity<?> listHistory(HttpServletRequest req) {
        try {
            var data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/login-history.json", Object.class, java.util.List.of());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.List.of());
        }
    }

    @PostMapping("/api/history")
    public ResponseEntity<?> recordHistory(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        // Append to login history
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // Favorites
    @GetMapping("/api/favorites")
    public ResponseEntity<?> listFavorites(HttpServletRequest req) {
        try {
            var data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/favorites.json", Object.class, java.util.List.of());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.List.of());
        }
    }

    @PostMapping("/api/favorites")
    public ResponseEntity<?> addFavorite(@RequestBody Map<String, String> body, HttpServletRequest req) {
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/api/favorites")
    public ResponseEntity<?> removeFavorite(@RequestParam String path, HttpServletRequest req) {
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // Transfers
    @GetMapping("/api/transfers")
    public ResponseEntity<?> loadTransfers(HttpServletRequest req) {
        try {
            var data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/transfers.json", Object.class, java.util.List.of());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.List.of());
        }
    }

    @PutMapping("/api/transfers")
    public ResponseEntity<?> saveTransfers(@RequestBody Object transfers, HttpServletRequest req) {
        try {
            minioService.writeJson(getClient(req), getBucket(req), "config/transfers.json", transfers);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
