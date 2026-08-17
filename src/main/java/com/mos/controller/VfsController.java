package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.VfsEntry;
import com.mos.service.MinioService;
import com.mos.service.VfsService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/vfs")
@RequiredArgsConstructor
public class VfsController {

    private final VfsService vfsService;
    private final MinioService minioService;

    private MinioClient getClient(HttpServletRequest req) {
        return (MinioClient) req.getAttribute("minioClient");
    }

    private String getAccessKey(HttpServletRequest req) {
        return (String) req.getAttribute("accessKey");
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 6) return key;
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }

    private ResponseEntity<?> requireFields(Map<String, String> body, String... fields) {
        for (String field : fields) {
            if (body.get(field) == null || body.get(field).trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", "Missing required field: " + field));
            }
        }
        return null;
    }

    @GetMapping
    public ResponseEntity<?> listVfs(@RequestParam(defaultValue = "") String path, HttpServletRequest req) {
        try {
            log.info("VFS list — path={} accessKey={}", path, maskKey(getAccessKey(req)));
            List<VfsEntry> entries = vfsService.listVfs(getClient(req), getAccessKey(req), path);
            return ResponseEntity.ok(entries);
        } catch (Exception e) {
            log.error("VFS list FAIL — path={} accessKey={}: {}", path, maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/folder")
    public ResponseEntity<?> createFolder(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path");
            if (err != null) return err;
            vfsService.createFolder(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS createFolder FAIL — path={} accessKey={}: {}", body.get("path"), maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/file")
    public ResponseEntity<?> createFile(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path");
            if (err != null) return err;
            vfsService.createFile(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS createFile FAIL — path={} accessKey={}: {}", body.get("path"), maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/word")
    public ResponseEntity<?> createWordDoc(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path");
            if (err != null) return err;
            vfsService.createWordDoc(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS createWordDoc FAIL — path={} accessKey={}: {}", body.get("path"), maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(@RequestParam("file") MultipartFile file,
                                        @RequestParam("path") String path,
                                        HttpServletRequest req) {
        try {
            log.info("VFS upload — path={} size={} accessKey={}", path, file.getSize(), maskKey(getAccessKey(req)));
            if (path == null || path.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", "Missing required field: path"));
            }
            String bucket = MinioConfig.deriveBucketName(getAccessKey(req));
            String s3Key = "vfs/" + path.replaceAll("^/", "");
            minioService.uploadFile(getClient(req), bucket, s3Key, file.getInputStream(),
                    file.getSize(), file.getContentType());
            Map<String, Object> result = new HashMap<>();
            result.put("ok", true);
            result.put("size", file.getSize());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("VFS upload FAIL — path={} accessKey={}: {}", path, maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/download")
    public ResponseEntity<?> downloadFile(@RequestParam String path, HttpServletRequest req) {
        try {
            log.info("VFS download — path={} accessKey={}", path, maskKey(getAccessKey(req)));
            byte[] data = vfsService.downloadFile(getClient(req), getAccessKey(req), path);
            String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename*=UTF-8''" + URLEncoder.encode(filename, StandardCharsets.UTF_8))
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(data);
        } catch (Exception e) {
            log.error("VFS download FAIL — path={} accessKey={}: {}", path, maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/text")
    public ResponseEntity<?> readText(@RequestParam String path, HttpServletRequest req) {
        try {
            String text = vfsService.readText(getClient(req), getAccessKey(req), path);
            return ResponseEntity.ok(Collections.singletonMap("content", text));
        } catch (Exception e) {
            log.error("VFS readText FAIL — path={} accessKey={}: {}", path, maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PutMapping("/text")
    public ResponseEntity<?> writeText(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path", "content");
            if (err != null) return err;
            vfsService.writeText(getClient(req), getAccessKey(req), body.get("path"), body.get("content"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS writeText FAIL — path={} accessKey={}: {}", body.get("path"), maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/copy")
    public ResponseEntity<?> copyVfs(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            log.info("VFS copy — source={} dest={} accessKey={}", body.get("source"), body.get("dest"), maskKey(getAccessKey(req)));
            ResponseEntity<?> err = requireFields(body, "source", "dest");
            if (err != null) return err;
            vfsService.copyVfs(getClient(req), getAccessKey(req), body.get("source"), body.get("dest"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS copy FAIL — source={} dest={} accessKey={}: {}", body.get("source"), body.get("dest"), maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PutMapping("/rename")
    public ResponseEntity<?> renameVfs(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "oldPath", "newPath");
            if (err != null) return err;
            vfsService.renameVfs(getClient(req), getAccessKey(req), body.get("oldPath"), body.get("newPath"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS rename FAIL — oldPath={} newPath={} accessKey={}: {}", body.get("oldPath"), body.get("newPath"), maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @DeleteMapping
    public ResponseEntity<?> deleteVfs(@RequestParam String path, HttpServletRequest req) {
        try {
            log.info("VFS delete — path={} accessKey={}", path, maskKey(getAccessKey(req)));
            vfsService.deleteVfs(getClient(req), getAccessKey(req), path);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS delete FAIL — path={} accessKey={}: {}", path, maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/trash")
    public ResponseEntity<?> moveToTrash(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            log.info("VFS trash — path={} accessKey={}", body.get("path"), maskKey(getAccessKey(req)));
            ResponseEntity<?> err = requireFields(body, "path");
            if (err != null) return err;
            vfsService.moveToTrash(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("VFS trash FAIL — path={} accessKey={}: {}", body.get("path"), maskKey(getAccessKey(req)), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }
}
