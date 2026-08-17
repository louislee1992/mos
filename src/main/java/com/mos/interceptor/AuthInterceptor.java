package com.mos.interceptor;

import com.mos.config.MinioConfig;
import com.mos.config.MosProperties;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final MosProperties mosProperties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        String method = request.getMethod();
        String path = request.getRequestURI();
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Basic ")) {
            log.warn("Auth FAIL — {} {} — no Authorization header", method, path);
            response.setStatus(401);
            response.getWriter().write("{\"error\":\"Missing credentials\"}");
            return false;
        }

        String decoded = new String(Base64.getDecoder().decode(
                auth.substring(6)), StandardCharsets.UTF_8);
        String[] parts = decoded.split(":", 2);
        if (parts.length != 2) {
            log.warn("Auth FAIL — {} {} — invalid Basic auth format", method, path);
            response.setStatus(401);
            response.getWriter().write("{\"error\":\"Invalid credentials format\"}");
            return false;
        }

        try {
            MinioClient client = MinioConfig.buildClient(mosProperties.getEndpoint(), parts[0], parts[1]);
            request.setAttribute("minioClient", client);
            request.setAttribute("accessKey", parts[0]);
            request.setAttribute("secretKey", parts[1]);
            log.info("Auth OK — {} {} — endpoint={} accessKey={}", method, path,
                    mosProperties.getEndpoint(), maskKey(parts[0]));
        } catch (Exception e) {
            log.error("Auth FAIL — {} {} — MinioClient build error — endpoint={} accessKey={}: {}",
                    method, path, mosProperties.getEndpoint(), maskKey(parts[0]), e.getMessage());
            response.setStatus(500);
            response.getWriter().write("{\"error\":\"Failed to create Minio client\"}");
            return false;
        }
        return true;
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 6) return key;
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }
}
