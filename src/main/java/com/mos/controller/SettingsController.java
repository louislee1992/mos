package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.UserSettings;
import com.mos.service.MinioService;
import com.mos.service.SettingsService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
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
            log.info("Settings load — accessKey={}", maskKey(getAccessKey(req)));
            return ResponseEntity.ok(settingsService.loadSettings(getClient(req), getAccessKey(req)));
        } catch (Exception e) {
            log.error("Settings load FAIL — accessKey={}: {}", maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PutMapping("/api/settings")
    public ResponseEntity<?> saveSettings(@RequestBody UserSettings settings, HttpServletRequest req) {
        try {
            log.info("Settings save — accessKey={}", maskKey(getAccessKey(req)));
            settingsService.saveSettings(getClient(req), getAccessKey(req), settings);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Settings save FAIL — accessKey={}: {}", maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // Config file management
    @PostMapping("/api/config/upload")
    public ResponseEntity<?> uploadConfig(@RequestParam("file") MultipartFile file,
                                          @RequestParam("key") String key,
                                          HttpServletRequest req) {
        try {
            log.info("Config upload — key={} size={} accessKey={}",
                    key, file.getSize(), maskKey(getAccessKey(req)));
            minioService.uploadFile(getClient(req), getBucket(req), "config/" + key,
                    file.getInputStream(), file.getSize(), file.getContentType());
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Config upload FAIL — key={}: {}", key, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @DeleteMapping("/api/config/{key}")
    public ResponseEntity<?> deleteConfig(@PathVariable String key, HttpServletRequest req) {
        try {
            log.info("Config delete — key={} accessKey={}", key, maskKey(getAccessKey(req)));
            minioService.deleteObject(getClient(req), getBucket(req), "config/" + key);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Config delete FAIL — key={}: {}", key, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/api/config/download")
    public ResponseEntity<?> downloadConfig(@RequestParam String key, HttpServletRequest req) {
        try {
            byte[] data = minioService.downloadFile(getClient(req), getBucket(req), "config/" + key);
            String ct = "application/octet-stream";
            String lk = key.toLowerCase();
            if (lk.endsWith(".png")) ct = "image/png";
            else if (lk.endsWith(".jpg") || lk.endsWith(".jpeg")) ct = "image/jpeg";
            else if (lk.endsWith(".gif")) ct = "image/gif";
            else if (lk.endsWith(".webp")) ct = "image/webp";
            else if (lk.endsWith(".svg")) ct = "image/svg+xml";
            return ResponseEntity.ok()
                    .contentType(org.springframework.http.MediaType.parseMediaType(ct))
                    .body(data);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/api/config/delete")
    public ResponseEntity<?> deleteConfigByKey(@RequestParam String key, HttpServletRequest req) {
        try {
            log.info("Config delete — key={} accessKey={}", key, maskKey(getAccessKey(req)));
            minioService.deleteObject(getClient(req), getBucket(req), "config/" + key);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Config delete FAIL — key={}: {}", key, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // History
    @GetMapping("/api/history")
    public ResponseEntity<?> listHistory(HttpServletRequest req) {
        try {
            Object data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/login-history.json", Object.class, Collections.emptyList());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping("/api/history")
    public ResponseEntity<?> recordHistory(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        // Append to login history
        return ResponseEntity.ok(Collections.singletonMap("ok", true));
    }

    // Favorites
    @GetMapping("/api/favorites")
    public ResponseEntity<?> listFavorites(HttpServletRequest req) {
        try {
            Object data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/favorites.json", Object.class, Collections.emptyList());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping("/api/favorites")
    public ResponseEntity<?> addFavorite(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        try {
            String bucket = getBucket(req);
            MinioClient client = getClient(req);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> favs = readJsonList(client, bucket, "config/favorites.json");
            String path = (String) body.get("path");
            favs.removeIf(f -> path.equals(f.get("path")));
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("path", body.get("path"));
            entry.put("name", body.get("name"));
            entry.put("isDirectory", body.get("isDirectory"));
            entry.put("favoritedAt", java.time.Instant.now().toString());
            favs.add(0, entry);
            minioService.writeJson(client, bucket, "config/favorites.json", favs);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Favorite add FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @DeleteMapping("/api/favorites")
    public ResponseEntity<?> removeFavorite(@RequestParam String path, HttpServletRequest req) {
        try {
            String bucket = getBucket(req);
            MinioClient client = getClient(req);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> favs = readJsonList(client, bucket, "config/favorites.json");
            favs.removeIf(f -> path.equals(f.get("path")));
            minioService.writeJson(client, bucket, "config/favorites.json", favs);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Favorite remove FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // VFS file-access history
    @GetMapping("/api/history/vfs")
    public ResponseEntity<?> listVfsHistory(HttpServletRequest req) {
        try {
            Object data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/vfs-history.json", Object.class, Collections.emptyList());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping("/api/history/vfs")
    public ResponseEntity<?> recordVfsHistory(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        try {
            String bucket = getBucket(req);
            MinioClient client = getClient(req);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> list = readJsonList(client, bucket, "config/vfs-history.json");
            String path = (String) body.get("path");
            list.removeIf(e -> path.equals(e.get("path")));
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("path", body.get("path"));
            entry.put("name", body.get("name"));
            entry.put("isDirectory", body.get("isDirectory"));
            entry.put("accessedAt", java.time.Instant.now().toString());
            list.add(0, entry);
            if (list.size() > 50) list = new ArrayList<>(list.subList(0, 50));
            minioService.writeJson(client, bucket, "config/vfs-history.json", list);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS history record FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @DeleteMapping("/api/history/vfs")
    public ResponseEntity<?> removeVfsHistory(@RequestParam String path, HttpServletRequest req) {
        try {
            String bucket = getBucket(req);
            MinioClient client = getClient(req);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> list = readJsonList(client, bucket, "config/vfs-history.json");
            list.removeIf(e -> path.equals(e.get("path")));
            minioService.writeJson(client, bucket, "config/vfs-history.json", list);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS history remove FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // Transfers
    @GetMapping("/api/transfers")
    public ResponseEntity<?> loadTransfers(HttpServletRequest req) {
        try {
            Object data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/transfers.json", Object.class, Collections.emptyList());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PutMapping("/api/transfers")
    public ResponseEntity<?> saveTransfers(@RequestBody Object transfers, HttpServletRequest req) {
        try {
            minioService.writeJson(getClient(req), getBucket(req), "config/transfers.json", transfers);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Transfers save FAIL — accessKey={}: {}", maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readJsonList(MinioClient client, String bucket, String key) {
        Object data = minioService.readJsonOrDefault(client, bucket, key, Object.class, Collections.emptyList());
        if (data instanceof List) return new ArrayList<>((List<Map<String, Object>>) data);
        return new ArrayList<>();
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 6) return key;
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }
}
