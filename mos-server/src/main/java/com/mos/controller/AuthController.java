package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.service.MinioService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final MinioService minioService;

    @PostMapping("/verify")
    public ResponseEntity<?> verify(@RequestBody Map<String, String> body) {
        String endpoint = body.get("endpoint").trim().replaceAll("/$", "");
        String accessKey = body.get("accessKey").trim();
        String secretKey = body.get("secretKey").trim();

        if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Endpoint 必须以 http:// 或 https:// 开头"));
        }

        try {
            MinioClient client = MinioConfig.buildClient(endpoint, accessKey, secretKey);
            String bucket = MinioConfig.deriveBucketName(accessKey);
            client.bucketExists(io.minio.BucketExistsArgs.builder().bucket(bucket).build());
            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "bucket", bucket,
                    "accessKey", accessKey
            ));
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg != null && (msg.contains("dns") || msg.contains("Connect"))) {
                return ResponseEntity.status(502).body(Map.of("error", "无法连接到服务器: " + endpoint));
            }
            if (msg != null && (msg.contains("InvalidAccessKey") || msg.contains("Signature"))) {
                return ResponseEntity.status(401).body(Map.of("error", "凭证无效"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "连接失败: " + msg));
        }
    }

    @GetMapping("/admin")
    public ResponseEntity<?> checkAdmin(HttpServletRequest request) {
        String accessKey = (String) request.getAttribute("accessKey");
        return ResponseEntity.ok(Map.of("accessKey", accessKey, "isAdmin", false));
    }

    @GetMapping("/version")
    public ResponseEntity<?> version() {
        return ResponseEntity.ok(Map.of("version", "1.0.0"));
    }
}
