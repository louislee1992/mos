package com.mos.controller;

import com.mos.model.VfsEntry;
import com.mos.service.VfsService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/vfs")
@RequiredArgsConstructor
public class VfsController {

    private final VfsService vfsService;

    private MinioClient getClient(HttpServletRequest req) {
        return (MinioClient) req.getAttribute("minioClient");
    }

    private String getAccessKey(HttpServletRequest req) {
        return (String) req.getAttribute("accessKey");
    }

    private ResponseEntity<?> requireFields(Map<String, String> body, String... fields) {
        for (String field : fields) {
            if (body.get(field) == null || body.get(field).isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing required field: " + field));
            }
        }
        return null;
    }

    @GetMapping
    public ResponseEntity<?> listVfs(@RequestParam(defaultValue = "") String path, HttpServletRequest req) {
        try {
            List<VfsEntry> entries = vfsService.listVfs(getClient(req), getAccessKey(req), path);
            return ResponseEntity.ok(entries);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/folder")
    public ResponseEntity<?> createFolder(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path");
            if (err != null) return err;
            vfsService.createFolder(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/file")
    public ResponseEntity<?> createFile(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path");
            if (err != null) return err;
            vfsService.createFile(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(@RequestParam("file") MultipartFile file,
                                        @RequestParam("path") String path,
                                        HttpServletRequest req) {
        try {
            if (path == null || path.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing required field: path"));
            }
            vfsService.createFile(getClient(req), getAccessKey(req), path);
            return ResponseEntity.ok(Map.of("ok", true, "size", file.getSize()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/download")
    public ResponseEntity<?> downloadFile(@RequestParam String path, HttpServletRequest req) {
        try {
            byte[] data = vfsService.downloadFile(getClient(req), getAccessKey(req), path);
            String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename*=UTF-8''" + URLEncoder.encode(filename, StandardCharsets.UTF_8))
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(data);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/text")
    public ResponseEntity<?> readText(@RequestParam String path, HttpServletRequest req) {
        try {
            String text = vfsService.readText(getClient(req), getAccessKey(req), path);
            return ResponseEntity.ok(Map.of("content", text));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/text")
    public ResponseEntity<?> writeText(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path", "content");
            if (err != null) return err;
            vfsService.writeText(getClient(req), getAccessKey(req), body.get("path"), body.get("content"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/copy")
    public ResponseEntity<?> copyVfs(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "source", "dest");
            if (err != null) return err;
            vfsService.copyVfs(getClient(req), getAccessKey(req), body.get("source"), body.get("dest"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/rename")
    public ResponseEntity<?> renameVfs(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "oldPath", "newPath");
            if (err != null) return err;
            vfsService.renameVfs(getClient(req), getAccessKey(req), body.get("oldPath"), body.get("newPath"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping
    public ResponseEntity<?> deleteVfs(@RequestParam String path, HttpServletRequest req) {
        try {
            vfsService.deleteVfs(getClient(req), getAccessKey(req), path);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/trash")
    public ResponseEntity<?> moveToTrash(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            ResponseEntity<?> err = requireFields(body, "path");
            if (err != null) return err;
            vfsService.moveToTrash(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
