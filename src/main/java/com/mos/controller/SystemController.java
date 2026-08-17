package com.mos.controller;

import java.util.Collections;

import com.mos.service.SystemService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/system")
@RequiredArgsConstructor
public class SystemController {

    private final SystemService systemService;

    @GetMapping("/info")
    public ResponseEntity<?> systemInfo(HttpServletRequest req) {
        String accessKey = (String) req.getAttribute("accessKey");
        try {
            log.info("System info — accessKey={}", maskKey(accessKey));
            MinioClient client = (MinioClient) req.getAttribute("minioClient");
            return ResponseEntity.ok(systemService.getSystemInfo(client, accessKey));
        } catch (Exception e) {
            log.error("System info FAIL — accessKey={}: {}", maskKey(accessKey), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/login-history")
    public ResponseEntity<?> loginHistory() {
        try {
            return ResponseEntity.ok(systemService.getLoginHistory());
        } catch (Exception e) {
            log.error("Login history FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/device")
    public ResponseEntity<?> deviceInfo() {
        try {
            return ResponseEntity.ok(systemService.getDeviceInfo());
        } catch (Exception e) {
            log.error("Device info FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 6) return key;
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }
}
