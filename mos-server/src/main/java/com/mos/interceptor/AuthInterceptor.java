package com.mos.interceptor;

import com.mos.config.MinioConfig;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Basic ")) {
            response.setStatus(401);
            response.getWriter().write("{\"error\":\"Missing credentials\"}");
            return false;
        }

        String decoded = new String(Base64.getDecoder().decode(
                auth.substring(6)), StandardCharsets.UTF_8);
        String[] parts = decoded.split(":", 2);
        if (parts.length != 2) {
            response.setStatus(401);
            response.getWriter().write("{\"error\":\"Invalid credentials format\"}");
            return false;
        }

        String endpoint = request.getHeader("X-Minio-Endpoint");
        if (endpoint == null || endpoint.isBlank()) {
            response.setStatus(400);
            response.getWriter().write("{\"error\":\"Missing X-Minio-Endpoint header\"}");
            return false;
        }

        try {
            MinioClient client = MinioConfig.buildClient(endpoint, parts[0], parts[1]);
            request.setAttribute("minioClient", client);
            request.setAttribute("accessKey", parts[0]);
            request.setAttribute("secretKey", parts[1]);
            request.setAttribute("endpoint", endpoint);
        } catch (Exception e) {
            response.setStatus(500);
            response.getWriter().write("{\"error\":\"Failed to create Minio client\"}");
            return false;
        }
        return true;
    }
}
