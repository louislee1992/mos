package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.TrashEntry;
import com.mos.service.MinioService;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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
            List<TrashEntry> entries = new ArrayList<>();
            for (Result<Item> result : minioService.listObjects(getClient(req), getBucket(req), "trash/")) {
                Item item = result.get();
                String key = item.objectName();
                if (key == null || key.equals("trash/")) continue;
                TrashEntry entry = new TrashEntry();
                entry.setTrashPath(key);
                entry.setName(key.replaceAll("^trash/\\d+_", ""));
                entry.setType(item.isDir() ? "folder" : "file");
                entry.setSize(item.size());
                entry.setDeletedAt(System.currentTimeMillis());
                entries.add(entry);
            }
            return ResponseEntity.ok(entries);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/restore")
    public ResponseEntity<?> restore(@RequestBody Map<String, String> body, HttpServletRequest req) {
        String trashPath = body.get("trashPath");
        String originalPath = body.get("originalPath");
        if (trashPath == null || trashPath.isBlank() || originalPath == null || originalPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "trashPath and originalPath are required"));
        }
        try {
            MinioClient client = getClient(req);
            String bucket = getBucket(req);
            minioService.copyObject(client, bucket, trashPath, "vfs/" + originalPath.replaceAll("^/", ""));
            minioService.deleteObject(client, bucket, trashPath);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping
    public ResponseEntity<?> deletePermanently(@RequestParam String trashPath, HttpServletRequest req) {
        try {
            minioService.deleteObject(getClient(req), getBucket(req), trashPath);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
