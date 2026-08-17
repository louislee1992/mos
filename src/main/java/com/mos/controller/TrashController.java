package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.TrashEntry;
import com.mos.service.MinioService;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/trash")
@RequiredArgsConstructor
public class TrashController {

    private final MinioService minioService;

    private MinioClient getClient(HttpServletRequest req) {
        return (MinioClient) req.getAttribute("minioClient");
    }

    private String getBucket(HttpServletRequest req) {
        return MinioConfig.deriveBucketName((String) req.getAttribute("accessKey"));
    }

    @GetMapping
    public ResponseEntity<?> listTrash(HttpServletRequest req) {
        try {
            log.info("Trash list — accessKey={}", maskKey((String) req.getAttribute("accessKey")));
            List<TrashEntry> entries = new ArrayList<>();
            for (Result<Item> result : minioService.listObjects(getClient(req), getBucket(req), "trash/")) {
                Item item = result.get();
                String key = item.objectName();
                if (key == null || key.equals("trash/")) continue;
                // key format: trash/{timestamp}/{originalPath}
                String afterPrefix = key.substring("trash/".length());
                int slashIdx = afterPrefix.indexOf('/');
                if (slashIdx < 0) continue;
                String originalPath = afterPrefix.substring(slashIdx + 1);
                if (originalPath.isEmpty() || originalPath.endsWith("/")) continue;
                boolean isKeep = originalPath.endsWith("/.keep");
                if (isKeep) originalPath = originalPath.substring(0, originalPath.length() - "/.keep".length());
                TrashEntry entry = new TrashEntry();
                entry.setTrashPath(key);
                entry.setOriginalPath(originalPath);
                entry.setName(originalPath.contains("/")
                        ? originalPath.substring(originalPath.lastIndexOf('/') + 1) : originalPath);
                entry.setType(isKeep ? "folder" : "file");
                entry.setSize(item.size());
                entry.setDeletedAt(item.lastModified() != null
                        ? item.lastModified().toInstant().toEpochMilli()
                        : System.currentTimeMillis());
                entries.add(entry);
            }
            return ResponseEntity.ok(entries);
        } catch (Exception e) {
            log.error("Trash list FAIL — accessKey={}: {}", maskKey((String) req.getAttribute("accessKey")), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/restore")
    public ResponseEntity<?> restore(@RequestBody Map<String, String> body, HttpServletRequest req) {
        String trashPath = body.get("trashPath");
        String originalPath = body.get("originalPath");
        if (trashPath == null || trashPath.trim().isEmpty() || originalPath == null || originalPath.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "trashPath and originalPath are required"));
        }
        try {
            log.info("Trash restore — trashPath={} originalPath={}", trashPath, originalPath);
            MinioClient client = getClient(req);
            String bucket = getBucket(req);
            String vfsTarget = "vfs/" + originalPath.replaceAll("^/", "");
            boolean folderMarker = trashPath.endsWith("/.keep");
            for (Result<Item> result : minioService.listObjects(client, bucket, trashPath)) {
                Item item = result.get();
                String key = item.objectName();
                if (key == null || !(key.equals(trashPath) || key.startsWith(trashPath + "/"))) continue;
                String target = key.equals(trashPath) && folderMarker
                        ? vfsTarget + "/.keep"
                        : vfsTarget + key.substring(trashPath.length());
                minioService.copyObject(client, bucket, key, target);
                minioService.deleteObject(client, bucket, key);
            }
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Trash restore FAIL — trashPath={} originalPath={}: {}", trashPath, originalPath, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @DeleteMapping
    public ResponseEntity<?> deletePermanently(@RequestParam String trashPath, HttpServletRequest req) {
        try {
            log.info("Trash delete — trashPath={}", trashPath);
            MinioClient client = getClient(req);
            String bucket = getBucket(req);
            for (Result<Item> result : minioService.listObjects(client, bucket, trashPath)) {
                Item item = result.get();
                String key = item.objectName();
                if (key != null && (key.equals(trashPath) || key.startsWith(trashPath + "/"))) {
                    minioService.deleteObject(client, bucket, key);
                }
            }
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Trash delete FAIL — trashPath={}: {}", trashPath, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 6) return key;
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }
}
