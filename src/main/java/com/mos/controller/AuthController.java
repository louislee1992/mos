package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.config.MosProperties;
import com.mos.service.ChatService;
import com.mos.service.MinioService;
import com.mos.service.SystemService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final MinioService minioService;
    private final MosProperties mosProperties;
    private final SystemService systemService;
    private final ChatService chatService;

    @PostMapping("/verify")
    public ResponseEntity<?> verify(@RequestBody Map<String, String> body, HttpServletRequest request) {
        String rawAccessKey = body.get("accessKey");
        String rawSecretKey = body.get("secretKey");

        String endpoint = mosProperties.getEndpoint();
        log.info("Auth verify attempt — endpoint={} accessKey={}",
                endpoint, maskKey(rawAccessKey));

        if (rawAccessKey == null || rawAccessKey.trim().isEmpty() ||
            rawSecretKey == null || rawSecretKey.trim().isEmpty()) {
            log.warn("Auth verify FAIL — missing required fields");
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "accessKey 和 secretKey 不能为空"));
        }

        String accessKey = rawAccessKey.trim();
        String secretKey = rawSecretKey.trim();

        try {
            MinioClient client = MinioConfig.buildClient(endpoint, accessKey, secretKey);
            String bucket = MinioConfig.deriveBucketName(accessKey);
            client.bucketExists(io.minio.BucketExistsArgs.builder().bucket(bucket).build());
            log.info("Auth verify OK — endpoint={} accessKey={} bucket={}",
                    endpoint, maskKey(accessKey), bucket);
            String ip = request.getRemoteAddr();
            String ua = request.getHeader("User-Agent");
            systemService.recordLogin(ip, ua);
            try {
                chatService.saveMyProfile(accessKey, null, null);
            } catch (Exception e) {
                log.warn("Auth verify — chat profile ensure FAIL — accessKey={}: {}",
                        maskKey(accessKey), e.getMessage());
            }
            Map<String, Object> result = new HashMap<>();
            result.put("ok", true);
            result.put("bucket", bucket);
            result.put("accessKey", accessKey);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg != null && (msg.contains("dns") || msg.contains("Connect"))) {
                log.error("Auth verify FAIL — connection error — endpoint={}: {}", endpoint, msg);
                return ResponseEntity.status(502).body(Collections.singletonMap("error", "无法连接到服务器: " + endpoint));
            }
            if (msg != null && (msg.contains("InvalidAccessKey") || msg.contains("Signature"))) {
                log.warn("Auth verify FAIL — invalid credentials — endpoint={} accessKey={}",
                        endpoint, maskKey(accessKey));
                return ResponseEntity.status(401).body(Collections.singletonMap("error", "凭证无效"));
            }
            log.error("Auth verify FAIL — endpoint={} accessKey={}: {}",
                    endpoint, maskKey(accessKey), msg);
            return ResponseEntity.status(500).body(Collections.singletonMap("error", "连接失败: " + msg));
        }
    }

    @GetMapping("/admin")
    public ResponseEntity<?> checkAdmin(HttpServletRequest request) {
        String accessKey = (String) request.getAttribute("accessKey");
        Map<String, Object> result = new HashMap<>();
        result.put("accessKey", accessKey);
        result.put("isAdmin", false);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/version")
    public ResponseEntity<?> version() {
        return ResponseEntity.ok(Collections.singletonMap("version", "1.0.0"));
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 6) return key;
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }
}
