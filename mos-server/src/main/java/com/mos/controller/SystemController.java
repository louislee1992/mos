package com.mos.controller;

import com.mos.service.SystemService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
@RequiredArgsConstructor
public class SystemController {

    private final SystemService systemService;

    @GetMapping("/info")
    public ResponseEntity<?> systemInfo(HttpServletRequest req) {
        try {
            MinioClient client = (MinioClient) req.getAttribute("minioClient");
            String accessKey = (String) req.getAttribute("accessKey");
            return ResponseEntity.ok(systemService.getSystemInfo(client, accessKey));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(java.util.Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/device")
    public ResponseEntity<?> deviceInfo() {
        try {
            return ResponseEntity.ok(systemService.getDeviceInfo());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(java.util.Map.of("error", e.getMessage()));
        }
    }
}
