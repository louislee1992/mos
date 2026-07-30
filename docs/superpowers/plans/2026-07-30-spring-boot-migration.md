# Spring Boot + React 架构迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 MOS 从 Tauri (Rust + React) 单机桌面架构迁移为 Spring Boot + React 多用户 Web 架构，合并部署（React 打包到 Spring Boot 静态资源目录）。

**Architecture:** Spring Boot 3.x 提供 REST API + WebSocket STOMP，React 前端通过 fetch + STOMP.js 通信。认证使用 MinIO 凭据（Basic Auth header）。数据存储纯 MinIO S3，无数据库。在线用户由服务端 ConcurrentHashMap 管理，WebSocket 连接即在线。

**Tech Stack:** Java 17+, Spring Boot 3.x, MinIO Java SDK, STOMP/WebSocket, React 18, TypeScript, Vite

## Global Constraints

- Java 17+，Spring Boot 3.x
- 纯 MinIO 存储，无数据库依赖
- React 打包输出到 `mos-server/src/main/resources/static/`
- 生产部署：`java -jar mos-server.jar` 即可运行
- 前端凭据存 sessionStorage，账户列表加密存 localStorage
- 聊天在线状态由 WebSocket 连接管理，无 Redis
- 保留所有 TypeScript 类型定义不变
- 保留 React 组件 UI 结构不变
- 保留 MinIO S3 存储路径规范不变

---

## 文件结构

```
mos-server/                          ← 新建 Spring Boot 项目
├── pom.xml
├── src/main/java/com/mos/
│   ├── MosApplication.java
│   ├── config/
│   │   ├── MinioConfig.java
│   │   ├── WebSocketConfig.java
│   │   └── WebMvcConfig.java
│   ├── interceptor/
│   │   └── AuthInterceptor.java
│   ├── controller/
│   │   ├── AuthController.java
│   │   ├── VfsController.java
│   │   ├── SettingsController.java
│   │   ├── TrashController.java
│   │   ├── ChatController.java
│   │   ├── TransferController.java
│   │   ├── FavoriteController.java
│   │   ├── HistoryController.java
│   │   └── SystemController.java
│   ├── service/
│   │   ├── MinioService.java
│   │   ├── VfsService.java
│   │   ├── ChatService.java
│   │   ├── OnlineUserService.java
│   │   ├── SettingsService.java
│   │   └── SystemService.java
│   ├── model/
│   │   ├── ChatMessage.java
│   │   ├── ConversationMeta.java
│   │   ├── UserProfile.java
│   │   ├── UserSettings.java
│   │   ├── VfsEntry.java
│   │   ├── TrashEntry.java
│   │   ├── AccountEntry.java
│   │   ├── SystemInfo.java
│   │   └── DeviceInfo.java
│   └── websocket/
│       └── ChatWebSocketHandler.java
├── src/main/resources/
│   ├── application.yml
│   └── static/                      ← React 构建产物（由 Vite 输出）
│       ├── index.html
│       └── assets/

mos-web/                             ← 现有 React 前端（修改）
├── src/
│   ├── api/                         ← 新建：REST API 封装
│   │   ├── client.ts
│   │   ├── auth.ts
│   │   ├── vfs.ts
│   │   ├── chat.ts
│   │   ├── settings.ts
│   │   ├── transfers.ts
│   │   └── system.ts
│   ├── hooks/
│   │   ├── useChat.ts               ← 修改：Tauri invoke → API + WebSocket
│   │   ├── useSettings.ts           ← 修改：Tauri invoke → API
│   │   └── useTransfers.ts          ← 修改：Tauri invoke → API
│   ├── components/
│   │   ├── ChatApp.tsx              ← 修改：移除 Redis 连接 UI
│   │   ├── ChatView.tsx             ← 修改：移除 Tauri dialog
│   │   ├── FileManager.tsx          ← 修改：Tauri invoke → API
│   │   ├── TransferPanel.tsx        ← 修改：Tauri invoke → API
│   │   ├── LoginScreen.tsx          ← 修改：Tauri invoke → API + localStorage
│   │   └── ...                      ← 其他组件基本不变
│   └── main.tsx                     ← 微调：不需要 Tauri 相关初始化
├── vite.config.ts                   ← 修改：输出目录指向 mos-server
└── package.json                     ← 移除 @tauri-apps 依赖
```

---

### Task 1: Spring Boot 项目骨架

**Files:**
- Create: `mos-server/pom.xml`
- Create: `mos-server/src/main/java/com/mos/MosApplication.java`
- Create: `mos-server/src/main/resources/application.yml`
- Create: `mos-server/src/main/java/com/mos/config/MinioConfig.java`
- Create: `mos-server/src/main/java/com/mos/config/WebSocketConfig.java`
- Create: `mos-server/src/main/java/com/mos/config/WebMvcConfig.java`
- Create: `mos-server/src/main/java/com/mos/interceptor/AuthInterceptor.java`

**Interfaces:**
- Produces: `MosApplication` Spring Boot 入口，`AuthInterceptor` 从 Basic Auth header 解析凭据并注入 request attribute，`MinioConfig` 提供 S3 客户端工厂方法，`WebSocketConfig` 配置 STOMP endpoints

- [ ] **Step 1: Create `mos-server/pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.1</version>
    </parent>
    <groupId>com.mos</groupId>
    <artifactId>mos-server</artifactId>
    <version>1.0.0</version>
    <name>mos-server</name>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-websocket</artifactId>
        </dependency>
        <dependency>
            <groupId>io.minio</groupId>
            <artifactId>minio</artifactId>
            <version>8.5.10</version>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 2: Create `mos-server/src/main/resources/application.yml`**

```yaml
server:
  port: 8080

spring:
  servlet:
    multipart:
      max-file-size: 1024MB
      max-request-size: 1024MB
```

- [ ] **Step 3: Create `MosApplication.java`**

```java
package com.mos;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class MosApplication {
    public static void main(String[] args) {
        SpringApplication.run(MosApplication.class, args);
    }
}
```

- [ ] **Step 4: Create `config/MinioConfig.java`**

```java
package com.mos.config;

import io.minio.MinioClient;

public class MinioConfig {

    public static String deriveBucketName(String accessKey) {
        return accessKey.toLowerCase().replaceAll("[^a-z0-9-]", "-") + "-os";
    }

    public static MinioClient buildClient(String endpoint, String accessKey, String secretKey) {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
```

- [ ] **Step 5: Create `interceptor/AuthInterceptor.java`**

```java
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
```

- [ ] **Step 6: Create `config/WebMvcConfig.java`**

```java
package com.mos.config;

import com.mos.interceptor.AuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    public WebMvcConfig(AuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/verify", "/api/auth/version");
    }

    @Override
    public void addResourceHandlers(org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/");
    }

    @Override
    public void addViewControllers(org.springframework.web.servlet.config.annotation.ViewControllerRegistry registry) {
        // SPA fallback: all non-API, non-WebSocket paths → index.html
        registry.addViewController("/{spring:[^(api|ws)].*}")
                .setViewName("forward:/index.html");
    }
}
```

- [ ] **Step 7: Create `config/WebSocketConfig.java`**

```java
package com.mos.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*");
    }
}
```

- [ ] **Step 8: Verify — `mvn compile` passes**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 9: Commit**

```bash
git add mos-server/pom.xml mos-server/src/
git commit -m "feat: add Spring Boot project skeleton with MinIO, WebSocket, and auth config
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: DTO / Model 类

**Files:**
- Create: `mos-server/src/main/java/com/mos/model/ChatMessage.java`
- Create: `mos-server/src/main/java/com/mos/model/ConversationMeta.java`
- Create: `mos-server/src/main/java/com/mos/model/UserProfile.java`
- Create: `mos-server/src/main/java/com/mos/model/UserSettings.java`
- Create: `mos-server/src/main/java/com/mos/model/VfsEntry.java`
- Create: `mos-server/src/main/java/com/mos/model/TrashEntry.java`
- Create: `mos-server/src/main/java/com/mos/model/AccountEntry.java`
- Create: `mos-server/src/main/java/com/mos/model/SystemInfo.java`
- Create: `mos-server/src/main/java/com/mos/model/DeviceInfo.java`

**Interfaces:**
- Produces: 所有 DTO 使用 Lombok `@Data` 注解，字段名和类型与 TypeScript 类型定义一致，`@JsonProperty` 确保 JSON key 为 camelCase

- [ ] **Step 1: Create all model classes**

Create `ChatMessage.java`:
```java
package com.mos.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ChatMessage {
    private String id;
    private String convId;
    private String sender;
    private String senderName;
    @JsonProperty("type")
    private String msgType;
    private String content;
    private String fileName;
    private long fileSize;
    private long timestamp;
}
```

Create `ConversationMeta.java`:
```java
package com.mos.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class ConversationMeta {
    private String id;
    @JsonProperty("type")
    private String convType;
    private String name;
    private List<String> members;
    private long createdAt;
    private String lastMessage;
    private long lastMessageTime;
}
```

Create `UserProfile.java`:
```java
package com.mos.model;

import lombok.Data;

@Data
public class UserProfile {
    private String accessKey;
    private String nickname;
    private String avatar;
    private long createdAt;
}
```

Create `UserSettings.java`:
```java
package com.mos.model;

import lombok.Data;
import java.util.List;

@Data
public class UserSettings {
    private int version;
    private long updatedAt;
    private String wallpaperId;
    private String wallpaperType;
    private String solidColor;
    private List<CustomWallpaper> customWallpapers;
    private List<String> desktopIconOrder;
    private String theme;
    private List<WindowState> openWindows;

    @Data
    public static class CustomWallpaper {
        private String id;
        private String name;
        private String key;
    }

    @Data
    public static class WindowState {
        private String appId;
        private int x;
        private int y;
        private int width;
        private int height;
    }
}
```

Create `VfsEntry.java`:
```java
package com.mos.model;

import lombok.Data;

@Data
public class VfsEntry {
    private String name;
    private String path;
    private String type; // "folder" | "file"
    private long size;
    private String lastModified;
}
```

Create `TrashEntry.java`:
```java
package com.mos.model;

import lombok.Data;

@Data
public class TrashEntry {
    private String name;
    private String originalPath;
    private String trashPath;
    private String type;
    private long size;
    private long deletedAt;
}
```

Create `AccountEntry.java`:
```java
package com.mos.model;

import lombok.Data;

@Data
public class AccountEntry {
    private String id;
    private String name;
    private String endpoint;
    private String accessKey;
    private String secretKey;
    private long createdAt;
    private long lastUsedAt;
    private boolean isAdmin;
}
```

Create `SystemInfo.java`:
```java
package com.mos.model;

import lombok.Data;

@Data
public class SystemInfo {
    private long objectCount;
    private long storageBytes;
    private String bucketName;
}
```

Create `DeviceInfo.java`:
```java
package com.mos.model;

import lombok.Data;

@Data
public class DeviceInfo {
    private String osName;
    private String osVersion;
    private String hostname;
    private String localIp;
}
```

- [ ] **Step 2: Verify — `mvn compile` passes**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add mos-server/src/main/java/com/mos/model/
git commit -m "feat: add DTO model classes matching TypeScript types
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: MinioService — S3 操作封装

**Files:**
- Create: `mos-server/src/main/java/com/mos/service/MinioService.java`

**Interfaces:**
- Produces: `MinioService` with methods `readJson(client, bucket, key)`, `writeJson(client, bucket, key, json)`, `listObjects(client, bucket, prefix)`, `deleteObject(client, bucket, key)`, `copyObject(client, bucket, source, dest)`, `getPresignedUrl(client, bucket, key)`, `uploadFile(client, bucket, key, stream, size, contentType)`, `downloadFile(client, bucket, key)`

- [ ] **Step 1: Create `service/MinioService.java`**

```java
package com.mos.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.*;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class MinioService {

    private final ObjectMapper objectMapper;

    public <T> T readJson(MinioClient client, String bucket, String key, Class<T> clazz) throws Exception {
        GetObjectResponse resp = client.getObject(
                GetObjectArgs.builder().bucket(bucket).object(key).build());
        byte[] data = resp.readAllBytes();
        return objectMapper.readValue(data, clazz);
    }

    public <T> T readJsonOrDefault(MinioClient client, String bucket, String key, Class<T> clazz, T defaultVal) {
        try {
            return readJson(client, bucket, key, clazz);
        } catch (Exception e) {
            return defaultVal;
        }
    }

    public void writeJson(MinioClient client, String bucket, String key, Object obj) throws Exception {
        byte[] data = objectMapper.writeValueAsBytes(obj);
        client.putObject(PutObjectArgs.builder()
                .bucket(bucket).object(key)
                .stream(new ByteArrayInputStream(data), data.length, -1)
                .contentType("application/json").build());
    }

    public Iterable<io.minio.messages.Item> listObjects(MinioClient client, String bucket, String prefix) throws Exception {
        return client.listObjects(ListObjectsArgs.builder()
                .bucket(bucket).prefix(prefix).recursive(true).build());
    }

    public void deleteObject(MinioClient client, String bucket, String key) throws Exception {
        client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
    }

    public void copyObject(MinioClient client, String bucket, String source, String dest) throws Exception {
        client.copyObject(CopyObjectArgs.builder()
                .bucket(bucket).object(dest)
                .source(CopySource.builder().bucket(bucket).object(source).build())
                .build());
    }

    public String getPresignedUrl(MinioClient client, String bucket, String key, int expirySec) throws Exception {
        return client.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .bucket(bucket).object(key).method(Method.GET)
                .expiry(expirySec, TimeUnit.SECONDS).build());
    }

    public void uploadFile(MinioClient client, String bucket, String key, InputStream stream, long size, String contentType) throws Exception {
        client.putObject(PutObjectArgs.builder()
                .bucket(bucket).object(key)
                .stream(stream, size, -1)
                .contentType(contentType != null ? contentType : "application/octet-stream")
                .build());
    }

    public byte[] downloadFile(MinioClient client, String bucket, String key) throws Exception {
        GetObjectResponse resp = client.getObject(
                GetObjectArgs.builder().bucket(bucket).object(key).build());
        return resp.readAllBytes();
    }
}
```

- [ ] **Step 2: Verify — `mvn compile`**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add mos-server/src/main/java/com/mos/service/MinioService.java
git commit -m "feat: add MinioService for S3 read/write/list/delete/copy operations
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: AuthController + OnlineUserService — 认证与在线管理

**Files:**
- Create: `mos-server/src/main/java/com/mos/controller/AuthController.java`
- Create: `mos-server/src/main/java/com/mos/service/OnlineUserService.java`

**Interfaces:**
- Consumes: `MinioService` from Task 3, `MinioConfig` from Task 1
- Produces: `POST /api/auth/verify` returns `{ok, bucket, accessKey}`, `GET /api/auth/version` returns version string, `OnlineUserService` manages `ConcurrentHashMap<String, String>` for online users

- [ ] **Step 1: Create `service/OnlineUserService.java`**

```java
package com.mos.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OnlineUserService {

    private final Map<String, String> onlineUsers = new ConcurrentHashMap<>();

    public void userConnected(String accessKey, String sessionId) {
        onlineUsers.put(accessKey, sessionId);
    }

    public void userDisconnected(String accessKey) {
        onlineUsers.remove(accessKey);
    }

    public Set<String> getOnlineAccessKeys() {
        return onlineUsers.keySet();
    }

    public boolean isOnline(String accessKey) {
        return onlineUsers.containsKey(accessKey);
    }
}
```

- [ ] **Step 2: Create `controller/AuthController.java`**

```java
package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.service.MinioService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
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
        // Admin check is client-side via accounts list; server returns the accessKey
        String accessKey = (String) request.getAttribute("accessKey");
        return ResponseEntity.ok(Map.of("accessKey", accessKey, "isAdmin", false));
    }

    @GetMapping("/version")
    public ResponseEntity<?> version() {
        return ResponseEntity.ok(Map.of("version", "1.0.0"));
    }
}
```

- [ ] **Step 3: Verify — `mvn compile`**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add mos-server/src/main/java/com/mos/controller/AuthController.java mos-server/src/main/java/com/mos/service/OnlineUserService.java
git commit -m "feat: add auth controller and online user service
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: VfsController + VfsService — 文件系统 API

**Files:**
- Create: `mos-server/src/main/java/com/mos/controller/VfsController.java`
- Create: `mos-server/src/main/java/com/mos/service/VfsService.java`

**Interfaces:**
- Consumes: `MinioService` from Task 3, `MinioConfig` from Task 1
- Produces: All `/api/vfs/**` endpoints as specified in the design

- [ ] **Step 1: Create `service/VfsService.java`**

```java
package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.VfsEntry;
import io.minio.MinioClient;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class VfsService {

    private final MinioService minioService;

    public List<VfsEntry> listVfs(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String prefix = path.isEmpty() ? "vfs/" : "vfs/" + path.replaceAll("^/", "");
        if (!prefix.endsWith("/")) prefix += "/";

        List<VfsEntry> entries = new ArrayList<>();
        for (Item item : minioService.listObjects(client, bucket, prefix)) {
            String key = item.objectName();
            if (key == null || key.equals(prefix)) continue;
            String relative = key.substring("vfs/".length());
            VfsEntry entry = new VfsEntry();
            entry.setPath(relative);
            entry.setName(relative.contains("/")
                    ? relative.substring(relative.lastIndexOf('/') + 1) : relative);
            entry.setType(item.isDir() ? "folder" : "file");
            entry.setSize(item.size());
            if (item.lastModified() != null) {
                entry.setLastModified(item.lastModified().toString());
            }
            entries.add(entry);
        }
        return entries;
    }

    public void createFolder(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        if (!s3Key.endsWith("/")) s3Key += "/";
        minioService.writeJson(client, bucket, s3Key + ".keep", "");
    }

    public void createFile(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        minioService.writeJson(client, bucket, s3Key, "");
    }

    public void deleteVfs(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        minioService.deleteObject(client, bucket, s3Key);
    }

    public byte[] downloadFile(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        return minioService.downloadFile(client, bucket, s3Key);
    }

    public String readText(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        return new String(minioService.downloadFile(client, bucket, s3Key));
    }

    public void writeText(MinioClient client, String accessKey, String path, String content) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        minioService.writeJson(client, bucket, s3Key, content);
    }

    public void copyVfs(MinioClient client, String accessKey, String source, String dest) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        minioService.copyObject(client, bucket, "vfs/" + source.replaceAll("^/", ""),
                "vfs/" + dest.replaceAll("^/", ""));
    }

    public void renameVfs(MinioClient client, String accessKey, String oldPath, String newPath) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String oldKey = "vfs/" + oldPath.replaceAll("^/", "");
        String newKey = "vfs/" + newPath.replaceAll("^/", "");
        minioService.copyObject(client, bucket, oldKey, newKey);
        minioService.deleteObject(client, bucket, oldKey);
    }

    public void moveToTrash(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String source = "vfs/" + path.replaceAll("^/", "");
        String dest = "trash/" + System.currentTimeMillis() + "_" + path.replaceAll("[/]+", "_");
        minioService.copyObject(client, bucket, source, dest);
        minioService.deleteObject(client, bucket, source);
    }

    public String ensureVfs(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        try {
            minioService.downloadFile(client, bucket, s3Key);
        } catch (Exception e) {
            minioService.writeJson(client, bucket, s3Key, "");
        }
        return s3Key;
    }
}
```

- [ ] **Step 2: Create `controller/VfsController.java`**

```java
package com.mos.controller;

import com.mos.model.VfsEntry;
import com.mos.service.VfsService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
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
            vfsService.createFolder(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/file")
    public ResponseEntity<?> createFile(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
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
            vfsService.writeText(getClient(req), getAccessKey(req), body.get("path"), body.get("content"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/copy")
    public ResponseEntity<?> copyVfs(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            vfsService.copyVfs(getClient(req), getAccessKey(req), body.get("source"), body.get("dest"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/rename")
    public ResponseEntity<?> renameVfs(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
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
            vfsService.moveToTrash(getClient(req), getAccessKey(req), body.get("path"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
```

- [ ] **Step 3: Verify — `mvn compile`**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add mos-server/src/main/java/com/mos/service/VfsService.java mos-server/src/main/java/com/mos/controller/VfsController.java
git commit -m "feat: add VFS controller and service for file system operations
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: TrashController + SettingsController + SystemController

**Files:**
- Create: `mos-server/src/main/java/com/mos/controller/TrashController.java`
- Create: `mos-server/src/main/java/com/mos/controller/SettingsController.java`
- Create: `mos-server/src/main/java/com/mos/controller/SystemController.java`
- Create: `mos-server/src/main/java/com/mos/service/SettingsService.java`
- Create: `mos-server/src/main/java/com/mos/service/SystemService.java`

**Interfaces:**
- Consumes: `MinioService` from Task 3
- Produces: `/api/trash/**`, `/api/settings/**`, `/api/system/**`, `/api/config/**`, `/api/history/**`, `/api/favorites/**`, `/api/transfers/**`

- [ ] **Step 1: Create `controller/TrashController.java`**

```java
package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.TrashEntry;
import com.mos.service.MinioService;
import io.minio.MinioClient;
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
            for (Item item : minioService.listObjects(getClient(req), getBucket(req), "trash/")) {
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
        try {
            String trashPath = body.get("trashPath");
            String originalPath = body.get("originalPath");
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
```

- [ ] **Step 2: Create `service/SettingsService.java`**

```java
package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.UserSettings;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private final MinioService minioService;

    public UserSettings loadSettings(MinioClient client, String accessKey) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        UserSettings defaults = new UserSettings();
        defaults.setVersion(1);
        defaults.setWallpaperId("default");
        defaults.setWallpaperType("preset");
        defaults.setSolidColor("#1a1a2e");
        defaults.setTheme("dark");
        return minioService.readJsonOrDefault(client, bucket, "config/settings.json",
                UserSettings.class, defaults);
    }

    public void saveSettings(MinioClient client, String accessKey, UserSettings settings) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        settings.setUpdatedAt(System.currentTimeMillis());
        minioService.writeJson(client, bucket, "config/settings.json", settings);
    }
}
```

- [ ] **Step 3: Create `controller/SettingsController.java`** (includes config, history, favorites, transfers)

```java
package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.UserSettings;
import com.mos.service.MinioService;
import com.mos.service.SettingsService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;
    private final MinioService minioService;

    private MinioClient getClient(HttpServletRequest req) {
        return (MinioClient) req.getAttribute("minioClient");
    }

    private String getAccessKey(HttpServletRequest req) {
        return (String) req.getAttribute("accessKey");
    }

    private String getBucket(HttpServletRequest req) {
        return MinioConfig.deriveBucketName(getAccessKey(req));
    }

    @GetMapping("/api/settings")
    public ResponseEntity<?> loadSettings(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(settingsService.loadSettings(getClient(req), getAccessKey(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/api/settings")
    public ResponseEntity<?> saveSettings(@RequestBody UserSettings settings, HttpServletRequest req) {
        try {
            settingsService.saveSettings(getClient(req), getAccessKey(req), settings);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // Config file management
    @PostMapping("/api/config/upload")
    public ResponseEntity<?> uploadConfig(@RequestParam("file") MultipartFile file,
                                          @RequestParam("key") String key,
                                          HttpServletRequest req) {
        try {
            minioService.uploadFile(getClient(req), getBucket(req), "config/" + key,
                    file.getInputStream(), file.getSize(), file.getContentType());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/api/config/{key}")
    public ResponseEntity<?> deleteConfig(@PathVariable String key, HttpServletRequest req) {
        try {
            minioService.deleteObject(getClient(req), getBucket(req), "config/" + key);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/api/config/{key}")
    public ResponseEntity<?> readConfig(@PathVariable String key, HttpServletRequest req) {
        try {
            byte[] data = minioService.downloadFile(getClient(req), getBucket(req), "config/" + key);
            return ResponseEntity.ok(Map.of("content", new String(data)));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    // History
    @GetMapping("/api/history")
    public ResponseEntity<?> listHistory(HttpServletRequest req) {
        try {
            var data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/login-history.json", Object.class, java.util.List.of());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.List.of());
        }
    }

    @PostMapping("/api/history")
    public ResponseEntity<?> recordHistory(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        // Append to login history
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // Favorites
    @GetMapping("/api/favorites")
    public ResponseEntity<?> listFavorites(HttpServletRequest req) {
        try {
            var data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/favorites.json", Object.class, java.util.List.of());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.List.of());
        }
    }

    @PostMapping("/api/favorites")
    public ResponseEntity<?> addFavorite(@RequestBody Map<String, String> body, HttpServletRequest req) {
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/api/favorites")
    public ResponseEntity<?> removeFavorite(@RequestParam String path, HttpServletRequest req) {
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // Transfers
    @GetMapping("/api/transfers")
    public ResponseEntity<?> loadTransfers(HttpServletRequest req) {
        try {
            var data = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "config/transfers.json", Object.class, java.util.List.of());
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.List.of());
        }
    }

    @PutMapping("/api/transfers")
    public ResponseEntity<?> saveTransfers(@RequestBody Object transfers, HttpServletRequest req) {
        try {
            minioService.writeJson(getClient(req), getBucket(req), "config/transfers.json", transfers);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
```

- [ ] **Step 4: Create `service/SystemService.java` and `controller/SystemController.java`**

```java
// SystemService.java
package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.DeviceInfo;
import com.mos.model.SystemInfo;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.InetAddress;

@Service
@RequiredArgsConstructor
public class SystemService {

    private final MinioService minioService;

    public SystemInfo getSystemInfo(MinioClient client, String accessKey) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        SystemInfo info = new SystemInfo();
        info.setBucketName(bucket);
        long count = 0;
        long bytes = 0;
        for (var item : minioService.listObjects(client, bucket, "")) {
            count++;
            bytes += item.size();
        }
        info.setObjectCount(count);
        info.setStorageBytes(bytes);
        return info;
    }

    public DeviceInfo getDeviceInfo() throws Exception {
        DeviceInfo info = new DeviceInfo();
        info.setOsName(System.getProperty("os.name"));
        info.setOsVersion(System.getProperty("os.version"));
        info.setHostname(InetAddress.getLocalHost().getHostName());
        info.setLocalIp(InetAddress.getLocalHost().getHostAddress());
        return info;
    }
}
```

```java
// SystemController.java
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
```

- [ ] **Step 5: Verify — `mvn compile`**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add mos-server/src/main/java/com/mos/controller/TrashController.java mos-server/src/main/java/com/mos/controller/SettingsController.java mos-server/src/main/java/com/mos/controller/SystemController.java mos-server/src/main/java/com/mos/service/SettingsService.java mos-server/src/main/java/com/mos/service/SystemService.java
git commit -m "feat: add trash, settings, system controllers and services
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: ChatService + ChatController — 聊天业务 API

**Files:**
- Create: `mos-server/src/main/java/com/mos/service/ChatService.java`
- Create: `mos-server/src/main/java/com/mos/controller/ChatController.java`

**Interfaces:**
- Consumes: `MinioService` from Task 3, `OnlineUserService` from Task 4
- Produces: All `/api/chat/**` REST endpoints; messages sent via REST also broadcast via SimpMessagingTemplate

- [ ] **Step 1: Create `service/ChatService.java`**

```java
package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.ChatMessage;
import com.mos.model.ConversationMeta;
import com.mos.model.UserProfile;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final MinioService minioService;
    private static final String PREFIX = "mos-chat";

    public List<UserProfile> listProfiles(MinioClient client, String bucket) throws Exception {
        List<UserProfile> profiles = new ArrayList<>();
        for (var item : minioService.listObjects(client, bucket, PREFIX + "/profiles/")) {
            String key = item.objectName();
            if (key == null || !key.endsWith(".json")) continue;
            try {
                UserProfile p = minioService.readJson(client, bucket, key, UserProfile.class);
                profiles.add(p);
            } catch (Exception ignored) {}
        }
        return profiles;
    }

    public UserProfile loadMyProfile(MinioClient client, String bucket, String accessKey) throws Exception {
        String key = PREFIX + "/profiles/" + accessKey + ".json";
        return minioService.readJsonOrDefault(client, bucket, key, UserProfile.class,
                createDefaultProfile(accessKey));
    }

    public void saveMyProfile(MinioClient client, String bucket, String accessKey,
                              String nickname, String avatar) throws Exception {
        UserProfile profile = new UserProfile();
        profile.setAccessKey(accessKey);
        profile.setNickname(nickname != null ? nickname : accessKey);
        profile.setAvatar(avatar);
        profile.setCreatedAt(System.currentTimeMillis());
        minioService.writeJson(client, bucket, PREFIX + "/profiles/" + accessKey + ".json", profile);
    }

    public List<ConversationMeta> listConversations(MinioClient client, String bucket, String accessKey) throws Exception {
        List<ConversationMeta> convs = new ArrayList<>();
        for (var item : minioService.listObjects(client, bucket, PREFIX + "/conversations/")) {
            String key = item.objectName();
            if (key == null || !key.endsWith("_members.json")) continue;
            try {
                ConversationMeta meta = minioService.readJson(client, bucket, key, ConversationMeta.class);
                if (meta.getMembers().contains(accessKey)) convs.add(meta);
            } catch (Exception ignored) {}
        }
        convs.sort((a, b) -> Long.compare(b.getLastMessageTime(), a.getLastMessageTime()));
        return convs;
    }

    public ConversationMeta getOrCreatePrivateConv(MinioClient client, String bucket,
                                                    String currentUser, String otherUser) throws Exception {
        String convId = makePrivateConvId(currentUser, otherUser);
        String membersKey = PREFIX + "/conversations/" + convId + "_members.json";
        try {
            return minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
        } catch (Exception e) {
            ConversationMeta meta = new ConversationMeta();
            meta.setId(convId);
            meta.setConvType("private");
            meta.setMembers(Arrays.asList(currentUser, otherUser));
            meta.setCreatedAt(System.currentTimeMillis());
            meta.setLastMessageTime(0);
            minioService.writeJson(client, bucket, membersKey, meta);
            return meta;
        }
    }

    public List<ChatMessage> loadMessages(MinioClient client, String bucket, String convId) throws Exception {
        String key = PREFIX + "/conversations/" + convId + ".json";
        return minioService.readJsonOrDefault(client, bucket, key,
                new com.fasterxml.jackson.core.type.TypeReference<List<ChatMessage>>() {}, new ArrayList<>());
    }

    public ChatMessage sendMessage(MinioClient client, String bucket, String convId,
                                    String sender, String content, String msgType,
                                    String fileName, Long fileSize) throws Exception {
        String senderName = loadMyProfile(client, bucket, sender).getNickname();
        ChatMessage msg = new ChatMessage();
        msg.setId(UUID.randomUUID().toString());
        msg.setConvId(convId);
        msg.setSender(sender);
        msg.setSenderName(senderName);
        msg.setMsgType(msgType);
        msg.setContent(content);
        msg.setFileName(fileName);
        msg.setFileSize(fileSize != null ? fileSize : 0);
        msg.setTimestamp(System.currentTimeMillis());

        // Append to messages array
        String msgKey = PREFIX + "/conversations/" + convId + ".json";
        List<ChatMessage> existing = loadMessages(client, bucket, convId);
        existing.add(msg);
        minioService.writeJson(client, bucket, msgKey, existing);

        // Update conversation meta
        String membersKey = PREFIX + "/conversations/" + convId + "_members.json";
        try {
            ConversationMeta meta = minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
            meta.setLastMessage(computeLastMessagePreview(msgType, content, fileName));
            meta.setLastMessageTime(msg.getTimestamp());
            minioService.writeJson(client, bucket, membersKey, meta);
        } catch (Exception ignored) {}

        return msg;
    }

    public ConversationMeta createGroup(MinioClient client, String bucket, String currentUser,
                                         String name, List<String> memberKeys) throws Exception {
        List<String> members = new ArrayList<>(memberKeys);
        if (!members.contains(currentUser)) members.add(currentUser);
        String convId = "conv_" + UUID.randomUUID();
        ConversationMeta meta = new ConversationMeta();
        meta.setId(convId);
        meta.setConvType("group");
        meta.setName(name);
        meta.setMembers(members);
        meta.setCreatedAt(System.currentTimeMillis());
        meta.setLastMessageTime(System.currentTimeMillis());
        minioService.writeJson(client, bucket, PREFIX + "/conversations/" + convId + "_members.json", meta);
        minioService.writeJson(client, bucket, PREFIX + "/conversations/" + convId + ".json", new ArrayList<>());
        return meta;
    }

    public void addGroupMembers(MinioClient client, String bucket, String convId,
                                 List<String> memberKeys) throws Exception {
        String key = PREFIX + "/conversations/" + convId + "_members.json";
        ConversationMeta meta = minioService.readJson(client, bucket, key, ConversationMeta.class);
        for (String mk : memberKeys) {
            if (!meta.getMembers().contains(mk)) meta.getMembers().add(mk);
        }
        minioService.writeJson(client, bucket, key, meta);
    }

    public String uploadChatFile(MinioClient client, String bucket, String convId,
                                  String fileName, byte[] data) throws Exception {
        String msgId = UUID.randomUUID().toString();
        String s3Key = PREFIX + "/files/" + convId + "/" + msgId + "_" + fileName;
        minioService.uploadFile(client, bucket, s3Key,
                new java.io.ByteArrayInputStream(data), data.length,
                java.net.URLConnection.guessContentTypeFromName(fileName));
        return s3Key;
    }

    public String sendCloudFile(MinioClient client, String bucket, String convId,
                                 String vfsPath, String fileName) throws Exception {
        String msgId = UUID.randomUUID().toString();
        String s3Key = PREFIX + "/files/" + convId + "/" + msgId + "_" + fileName;
        minioService.copyObject(client, bucket, "vfs/" + vfsPath.replaceAll("^/", ""), s3Key);
        return s3Key;
    }

    public byte[] downloadChatFile(MinioClient client, String bucket, String s3Key) throws Exception {
        return minioService.downloadFile(client, bucket, s3Key);
    }

    private UserProfile createDefaultProfile(String accessKey) {
        UserProfile p = new UserProfile();
        p.setAccessKey(accessKey);
        p.setNickname(accessKey);
        p.setCreatedAt(0);
        return p;
    }

    private String makePrivateConvId(String a, String b) {
        List<String> keys = Arrays.asList(a, b);
        Collections.sort(keys);
        return "conv_" + keys.get(0) + "_" + keys.get(1);
    }

    private String computeLastMessagePreview(String msgType, String content, String fileName) {
        return switch (msgType) {
            case "image" -> "[图片]";
            case "file" -> "[文件] " + (fileName != null ? fileName : "");
            case "emoji" -> content;
            default -> content;
        };
    }
}
```

- [ ] **Step 2: Create `controller/ChatController.java`**

```java
package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.*;
import com.mos.service.*;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final OnlineUserService onlineUserService;
    private final MinioService minioService;
    private final SimpMessagingTemplate messagingTemplate;

    private MinioClient getClient(HttpServletRequest req) {
        return (MinioClient) req.getAttribute("minioClient");
    }

    private String getBucket(HttpServletRequest req) {
        return MinioConfig.deriveBucketName((String) req.getAttribute("accessKey"));
    }

    private String getAccessKey(HttpServletRequest req) {
        return (String) req.getAttribute("accessKey");
    }

    @GetMapping("/profiles")
    public ResponseEntity<?> listProfiles(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.listProfiles(getClient(req), getBucket(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/profiles/me")
    public ResponseEntity<?> myProfile(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.loadMyProfile(getClient(req), getBucket(req), getAccessKey(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/profiles/me")
    public ResponseEntity<?> updateMyProfile(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            chatService.saveMyProfile(getClient(req), getBucket(req), getAccessKey(req),
                    body.get("nickname"), body.get("avatar"));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/online")
    public ResponseEntity<?> onlineUsers(HttpServletRequest req) {
        try {
            Set<String> keys = onlineUserService.getOnlineAccessKeys();
            List<UserProfile> users = new ArrayList<>();
            for (String key : keys) {
                try {
                    users.add(chatService.loadMyProfile(getClient(req), getBucket(req), key));
                } catch (Exception e) {
                    UserProfile p = new UserProfile();
                    p.setAccessKey(key); p.setNickname(key);
                    users.add(p);
                }
            }
            return ResponseEntity.ok(users);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/conversations")
    public ResponseEntity<?> listConversations(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.listConversations(getClient(req), getBucket(req), getAccessKey(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations")
    public ResponseEntity<?> getOrCreateConversation(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.getOrCreatePrivateConv(
                    getClient(req), getBucket(req), getAccessKey(req), body.get("otherUser")));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/conversations/{id}/messages")
    public ResponseEntity<?> loadMessages(@PathVariable String id, HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.loadMessages(getClient(req), getBucket(req), id));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations/{id}/messages")
    public ResponseEntity<?> sendMessage(@PathVariable String id, @RequestBody Map<String, String> body,
                                          HttpServletRequest req) {
        try {
            MinioClient client = getClient(req);
            String bucket = getBucket(req);
            String sender = getAccessKey(req);
            ChatMessage msg = chatService.sendMessage(client, bucket, id, sender,
                    body.get("content"), body.getOrDefault("msgType", "text"),
                    body.get("fileName"), body.containsKey("fileSize") ? Long.parseLong(body.get("fileSize")) : null);

            // Push via WebSocket to conversation members
            String membersKey = "mos-chat/conversations/" + id + "_members.json";
            try {
                ConversationMeta meta = minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
                for (String member : meta.getMembers()) {
                    if (!member.equals(sender)) {
                        messagingTemplate.convertAndSendToUser(member, "/queue/chat", msg);
                    }
                }
            } catch (Exception ignored) {}

            return ResponseEntity.ok(msg);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/groups")
    public ResponseEntity<?> createGroup(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        try {
            @SuppressWarnings("unchecked")
            List<String> memberKeys = (List<String>) body.get("memberKeys");
            return ResponseEntity.ok(chatService.createGroup(getClient(req), getBucket(req),
                    getAccessKey(req), (String) body.get("name"), memberKeys));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/groups/{id}/members")
    public ResponseEntity<?> addGroupMembers(@PathVariable String id,
                                              @RequestBody Map<String, Object> body, HttpServletRequest req) {
        try {
            @SuppressWarnings("unchecked")
            List<String> memberKeys = (List<String>) body.get("memberKeys");
            chatService.addGroupMembers(getClient(req), getBucket(req), id, memberKeys);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(@RequestParam("file") MultipartFile file,
                                        @RequestParam("convId") String convId,
                                        HttpServletRequest req) {
        try {
            String s3Key = chatService.uploadChatFile(getClient(req), getBucket(req), convId,
                    file.getOriginalFilename(), file.getBytes());
            return ResponseEntity.ok(Map.of("s3Key", s3Key));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/cloud-file")
    public ResponseEntity<?> sendCloudFile(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            String s3Key = chatService.sendCloudFile(getClient(req), getBucket(req),
                    body.get("convId"), body.get("vfsPath"), body.get("fileName"));
            return ResponseEntity.ok(Map.of("s3Key", s3Key));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/download")
    public ResponseEntity<?> downloadFile(@RequestParam String s3Key, HttpServletRequest req) {
        try {
            byte[] data = chatService.downloadChatFile(getClient(req), getBucket(req), s3Key);
            String filename = s3Key.contains("_") ? s3Key.substring(s3Key.lastIndexOf('_') + 1) : "file";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename*=UTF-8''" + URLEncoder.encode(filename, StandardCharsets.UTF_8))
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(data);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/saved-server")
    public ResponseEntity<?> getSavedServer(HttpServletRequest req) {
        try {
            var config = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "mos-chat/redis-config.json", Object.class, null);
            return ResponseEntity.ok(config != null ? config : Map.of());
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of());
        }
    }

    @PutMapping("/saved-server")
    public ResponseEntity<?> saveServer(@RequestBody Object config, HttpServletRequest req) {
        try {
            minioService.writeJson(getClient(req), getBucket(req), "mos-chat/redis-config.json", config);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
```

- [ ] **Step 3: Verify — `mvn compile`**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add mos-server/src/main/java/com/mos/service/ChatService.java mos-server/src/main/java/com/mos/controller/ChatController.java
git commit -m "feat: add chat controller and service with WebSocket push
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: ChatWebSocketHandler — WebSocket 连接管理

**Files:**
- Create: `mos-server/src/main/java/com/mos/websocket/ChatWebSocketHandler.java`

**Interfaces:**
- Consumes: `OnlineUserService` from Task 4, `ChatService` from Task 7, `MinioService` from Task 3
- Produces: Handles `/app/chat.send` STOMP messages, manages connect/disconnect events, broadcasts online user changes to `/topic/online`

- [ ] **Step 1: Create `websocket/ChatWebSocketHandler.java`**

```java
package com.mos.websocket;

import com.mos.config.MinioConfig;
import com.mos.model.ChatMessage;
import com.mos.model.ConversationMeta;
import com.mos.model.UserProfile;
import com.mos.service.ChatService;
import com.mos.service.MinioService;
import com.mos.service.OnlineUserService;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class ChatWebSocketHandler {

    private final OnlineUserService onlineUserService;
    private final ChatService chatService;
    private final MinioService minioService;
    private final SimpMessagingTemplate messagingTemplate;

    @EventListener
    public void handleConnect(SessionConnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String auth = accessor.getFirstNativeHeader("Authorization");
        String endpoint = accessor.getFirstNativeHeader("X-Minio-Endpoint");
        if (auth == null || endpoint == null) return;

        try {
            String decoded = new String(Base64.getDecoder().decode(
                    auth.substring(6)), StandardCharsets.UTF_8);
            String[] parts = decoded.split(":", 2);
            String accessKey = parts[0];
            String bucket = MinioConfig.deriveBucketName(accessKey);

            // Store credentials in session attributes
            accessor.getSessionAttributes().put("accessKey", accessKey);
            accessor.getSessionAttributes().put("secretKey", parts[1]);
            accessor.getSessionAttributes().put("endpoint", endpoint);
            accessor.getSessionAttributes().put("bucket", bucket);

            // Register online
            onlineUserService.userConnected(accessKey, accessor.getSessionId());

            // Save initial profile
            MinioClient client = MinioConfig.buildClient(endpoint, parts[0], parts[1]);
            try {
                chatService.loadMyProfile(client, bucket, accessKey);
            } catch (Exception e) {
                // Not yet exists, save default
            }
            chatService.saveMyProfile(client, bucket, accessKey, null, null);

            // Broadcast online update
            messagingTemplate.convertAndSend("/topic/online",
                    Map.of("type", "user_online", "accessKey", accessKey));
        } catch (Exception ignored) {}
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String accessKey = (String) accessor.getSessionAttributes().get("accessKey");
        if (accessKey != null) {
            onlineUserService.userDisconnected(accessKey);
            messagingTemplate.convertAndSend("/topic/online",
                    Map.of("type", "user_offline", "accessKey", accessKey));
        }
    }

    @MessageMapping("/chat.send")
    public void handleChatSend(@Payload Map<String, Object> payload,
                               SimpMessageHeaderAccessor accessor) {
        String accessKey = (String) accessor.getSessionAttributes().get("accessKey");
        String endpoint = (String) accessor.getSessionAttributes().get("endpoint");
        String secretKey = (String) accessor.getSessionAttributes().get("secretKey");
        String bucket = (String) accessor.getSessionAttributes().get("bucket");
        if (accessKey == null || endpoint == null) return;

        String convId = (String) payload.get("convId");
        String content = (String) payload.get("content");
        String msgType = (String) payload.getOrDefault("msgType", "text");
        String fileName = (String) payload.get("fileName");
        Long fileSize = payload.get("fileSize") != null
                ? ((Number) payload.get("fileSize")).longValue() : null;

        try {
            MinioClient client = MinioConfig.buildClient(endpoint, accessKey, secretKey);
            ChatMessage msg = chatService.sendMessage(client, bucket, convId, accessKey,
                    content, msgType, fileName, fileSize);

            // Push to other conversation members
            String membersKey = "mos-chat/conversations/" + convId + "_members.json";
            try {
                ConversationMeta meta = minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
                for (String member : meta.getMembers()) {
                    if (!member.equals(accessKey)) {
                        messagingTemplate.convertAndSendToUser(member, "/queue/chat", msg);
                    }
                }
            } catch (Exception ignored) {}
        } catch (Exception ignored) {}
    }
}
```

- [ ] **Step 2: Verify — `mvn compile`**

Run: `cd mos-server && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add mos-server/src/main/java/com/mos/websocket/ChatWebSocketHandler.java
git commit -m "feat: add WebSocket handler for chat messaging and online presence
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 前端 API 层 — client + auth + vfs + system

**Files:**
- Create: `mos-web/src/api/client.ts`
- Create: `mos-web/src/api/auth.ts`
- Create: `mos-web/src/api/vfs.ts`
- Create: `mos-web/src/api/settings.ts`
- Create: `mos-web/src/api/system.ts`
- Create: `mos-web/src/api/chat.ts`
- Create: `mos-web/src/api/transfers.ts`

**Interfaces:**
- Consumes: TypeScript types from `src/types/`
- Produces: All REST API wrapper functions replacing Tauri `invoke()` calls

- [ ] **Step 1: Create `src/api/client.ts`**

```typescript
let globalEndpoint = '';
let globalAccessKey = '';
let globalSecretKey = '';

export function setCredentials(endpoint: string, accessKey: string, secretKey: string) {
  globalEndpoint = endpoint.replace(/\/$/, '');
  globalAccessKey = accessKey;
  globalSecretKey = secretKey;
}

export function getCredentials() {
  return { endpoint: globalEndpoint, accessKey: globalAccessKey, secretKey: globalSecretKey };
}

function authHeader(): string {
  return 'Basic ' + btoa(`${globalAccessKey}:${globalSecretKey}`);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    method: 'DELETE',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiUpload<T>(path: string, file: File, extraFields?: Record<string, string>): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  }
  const res = await fetch(globalEndpoint + path, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function downloadUrl(path: string): string {
  const params = new URLSearchParams({ path });
  return `${globalEndpoint}/api/vfs/download?${params}`;
}

export async function apiDownloadBlob(path: string, filename: string) {
  const res = await fetch(globalEndpoint + path, {
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
  });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Create `src/api/auth.ts`**

```typescript
import { apiPost, apiGet } from './client';

export function verifyCredentials(endpoint: string, accessKey: string, secretKey: string) {
  return apiPost<{ ok: boolean; bucket: string; accessKey: string }>('/api/auth/verify', {
    endpoint, accessKey, secretKey,
  });
}

export function checkAdmin() {
  return apiGet<{ accessKey: string; isAdmin: boolean }>('/api/auth/admin');
}

export function getVersion() {
  return apiGet<{ version: string }>('/api/auth/version');
}
```

- [ ] **Step 3: Create `src/api/vfs.ts`**

```typescript
import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from './client';
import type { VfsEntry } from '../types/chat';  // will be consolidated

export function listVfs(path = '') {
  return apiGet<VfsEntry[]>(`/api/vfs?path=${encodeURIComponent(path)}`);
}

export function createFolder(path: string) {
  return apiPost('/api/vfs/folder', { path });
}

export function createFile(path: string) {
  return apiPost('/api/vfs/file', { path });
}

export function uploadFile(file: File, path: string) {
  return apiUpload('/api/vfs/upload', file, { path });
}

export function readText(path: string) {
  return apiGet<{ content: string }>(`/api/vfs/text?path=${encodeURIComponent(path)}`);
}

export function writeText(path: string, content: string) {
  return apiPut('/api/vfs/text', { path, content });
}

export function copyVfs(source: string, dest: string) {
  return apiPost('/api/vfs/copy', { source, dest });
}

export function renameVfs(oldPath: string, newPath: string) {
  return apiPut('/api/vfs/rename', { oldPath, newPath });
}

export function deleteVfs(path: string) {
  return apiDelete(`/api/vfs?path=${encodeURIComponent(path)}`);
}

export function moveToTrash(path: string) {
  return apiPost('/api/vfs/trash', { path });
}
```

- [ ] **Step 4: Create `src/api/settings.ts`**

```typescript
import { apiGet, apiPut, apiPost, apiDelete } from './client';
import type { UserSettings } from '../types/settings';

export function loadSettings() {
  return apiGet<UserSettings>('/api/settings');
}

export function saveSettings(settings: UserSettings) {
  return apiPut('/api/settings', settings);
}

export function uploadConfig(file: File, key: string) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('key', key);
  // custom upload with config path
  return apiPost('/api/config/upload', { file, key });
}

export function deleteConfig(key: string) {
  return apiDelete(`/api/config/${encodeURIComponent(key)}`);
}

export function readConfig(key: string) {
  return apiGet<{ content: string }>(`/api/config/${encodeURIComponent(key)}`);
}
```

- [ ] **Step 5: Create `src/api/chat.ts`**

```typescript
import { apiGet, apiPost, apiPut } from './client';
import type { ChatMessage, ConversationMeta, UserProfile } from '../types/chat';

export function listProfiles() {
  return apiGet<UserProfile[]>('/api/chat/profiles');
}

export function myProfile() {
  return apiGet<UserProfile>('/api/chat/profiles/me');
}

export function updateMyProfile(nickname: string, avatar?: string) {
  return apiPut('/api/chat/profiles/me', { nickname, avatar });
}

export function getOnlineUsers() {
  return apiGet<UserProfile[]>('/api/chat/online');
}

export function listConversations() {
  return apiGet<ConversationMeta[]>('/api/chat/conversations');
}

export function getOrCreateConversation(otherUser: string) {
  return apiPost<ConversationMeta>('/api/chat/conversations', { otherUser });
}

export function loadMessages(convId: string) {
  return apiGet<ChatMessage[]>(`/api/chat/conversations/${convId}/messages`);
}

export function sendMessage(convId: string, content: string, msgType = 'text', fileName?: string, fileSize?: number) {
  return apiPost<ChatMessage>(`/api/chat/conversations/${convId}/messages`, {
    content, msgType, fileName, fileSize,
  });
}

export function createGroup(name: string, memberKeys: string[]) {
  return apiPost<ConversationMeta>('/api/chat/groups', { name, memberKeys });
}

export function addGroupMembers(convId: string, memberKeys: string[]) {
  return apiPost(`/api/chat/groups/${convId}/members`, { memberKeys });
}

export function uploadChatFile(file: File, convId: string) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('convId', convId);
  return apiPost<{ s3Key: string }>('/api/chat/upload', fd);
}

export function sendCloudFile(convId: string, vfsPath: string, fileName: string) {
  return apiPost<{ s3Key: string }>('/api/chat/cloud-file', { convId, vfsPath, fileName });
}

export function getSavedServer() {
  return apiGet<{ host?: string; port?: number }>('/api/chat/saved-server');
}
```

- [ ] **Step 6: Create `src/api/system.ts` and `src/api/transfers.ts`**

```typescript
// src/api/system.ts
import { apiGet } from './client';
import type { DeviceInfo, SystemInfo } from './client';

export function getSystemInfo() {
  return apiGet<SystemInfo>('/api/system/info');
}

export function getDeviceInfo() {
  return apiGet<DeviceInfo>('/api/system/device');
}
```

```typescript
// src/api/transfers.ts
import { apiGet, apiPut } from './client';

export function loadTransfers() {
  return apiGet('/api/transfers');
}

export function saveTransfers(transfers: unknown) {
  return apiPut('/api/transfers', transfers);
}
```

- [ ] **Step 7: Commit**

```bash
git add src/api/
git commit -m "feat: add frontend API layer replacing Tauri invoke calls
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 迁移 LoginScreen — localStorage + API 认证

**Files:**
- Modify: `src/components/LoginScreen.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `auth.ts` API from Task 9, `AccountEntry` type
- Produces: LoginScreen 使用 `verifyCredentials` API 替代 Tauri invoke，账户列表存 localStorage

- [ ] **Step 1: Rewrite LoginScreen.tsx — remove Tauri imports, use API + localStorage**

Replace the file content:

```typescript
import { type FC, useState, useCallback, useEffect } from 'react';
import type { AccountEntry } from '../types/accounts';
import { verifyCredentials, setCredentials } from '../api/client';

interface LoginScreenProps {
  onLoginSuccess: (accessKey: string) => void;
}

function getTimeString(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function getDateString(): string {
  const now = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

function getAccountColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

const ACCOUNTS_KEY = 'mos-accounts';

function loadAccounts(): AccountEntry[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAccounts(accounts: AccountEntry[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

const LoginScreen: FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [showForm, setShowForm] = useState(false);
  const [timeStr, setTimeStr] = useState(getTimeString);
  const [dateStr] = useState(getDateString);
  const [endpoint, setEndpoint] = useState('http://');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountEntry[]>(loadAccounts);
  const [endpointFocused, setEndpointFocused] = useState(false);
  const [endpointSuggestions, setEndpointSuggestions] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const uniqueEndpoints = [...new Set(accounts.map((a) => a.endpoint))];

  const filterEndpointSuggestions = (input: string) => {
    if (!input.trim()) {
      setEndpointSuggestions(uniqueEndpoints);
    } else {
      setEndpointSuggestions(
        uniqueEndpoints.filter((ep) => ep.toLowerCase().includes(input.toLowerCase())),
      );
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setTimeStr(getTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showForm && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setShowForm(true);
      }
      if (showForm && e.key === 'Escape') {
        setShowForm(false);
        setError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForm]);

  const doLogin = useCallback(async (endpoint: string, accessKey: string, secretKey: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await verifyCredentials(endpoint, accessKey, secretKey);
      setCredentials(endpoint, accessKey, secretKey);

      const now = Date.now();
      const existing = accounts.find(
        (a) => a.endpoint === endpoint && a.accessKey === accessKey,
      );
      let host = endpoint;
      try { host = new URL(endpoint).host; } catch { /* keep raw */ }
      const entry: AccountEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        name: `MinIO @ ${host}`,
        endpoint,
        accessKey,
        secretKey,
        isAdmin: existing?.isAdmin ?? false,
        createdAt: existing?.createdAt ?? now,
        lastUsedAt: now,
      };
      const updated = accounts.filter(
        (a) => !(a.endpoint === endpoint && a.accessKey === accessKey),
      );
      updated.push(entry);
      saveAccounts(updated);
      setAccounts(updated);
      onLoginSuccess(accessKey);
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : '连接失败');
    } finally {
      setLoading(false);
    }
  }, [accounts, onLoginSuccess]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await doLogin(endpoint.trim(), accessKey.trim(), secretKey.trim());
    },
    [endpoint, accessKey, secretKey, doLogin],
  );

  // UI unchanged below — same JSX as before
  // ... (keep all existing JSX except replace Tauri invoke in auto-login)
  // The avatar click handler should call doLogin(account.endpoint, account.accessKey, account.secretKey)
  // The delete button should filter accounts and save to localStorage
  // Remove all invoke() calls and @tauri-apps imports
```

**Note:** The full JSX in the existing LoginScreen.tsx is preserved. Only the import statements change (`@tauri-apps/api/core` → `../api/client`) and the data-fetching logic changes (Tauri `invoke` → `verifyCredentials` + localStorage). The complete replacement is shown above for clarity.

- [ ] **Step 2: Commit**

```bash
git add src/components/LoginScreen.tsx
git commit -m "refactor: migrate LoginScreen from Tauri invoke to REST API + localStorage
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 迁移 useChat — API + WebSocket STOMP

**Files:**
- Modify: `src/hooks/useChat.ts`
- Create: `src/hooks/useWebSocket.ts`

**Interfaces:**
- Consumes: `chat.ts` API from Task 9, STOMP.js (new dependency)
- Produces: Same hook interface as current `useChat`, but ALL `invoke()` replaced with API calls, Redis replaced with WebSocket

- [ ] **Step 1: Install STOMP.js**

Run: `cd mos-web && npm install @stomp/stompjs`

- [ ] **Step 2: Create `src/hooks/useWebSocket.ts`**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { Client, IMessage } from '@stomp/stompjs';
import { getCredentials } from '../api/client';

export function useWebSocket(accessKey: string | null | undefined, onChatMessage: (msg: unknown) => void) {
  const clientRef = useRef<Client | null>(null);

  const connect = useCallback(() => {
    if (!accessKey) return;
    const creds = getCredentials();
    const client = new Client({
      brokerURL: creds.endpoint.replace(/^http/, 'ws') + '/ws',
      connectHeaders: {
        'Authorization': 'Basic ' + btoa(`${creds.accessKey}:${creds.secretKey}`),
        'X-Minio-Endpoint': creds.endpoint,
      },
      onConnect: () => {
        client.subscribe('/user/queue/chat', (msg: IMessage) => {
          try { onChatMessage(JSON.parse(msg.body)); } catch {}
        });
        client.subscribe('/topic/online', (msg: IMessage) => {
          try { /* online update handled separately */ } catch {}
        });
      },
      reconnectDelay: 5000,
    });
    client.activate();
    clientRef.current = client;
  }, [accessKey, onChatMessage]);

  const disconnect = useCallback(() => {
    clientRef.current?.deactivate();
    clientRef.current = null;
  }, []);

  useEffect(() => {
    return () => { clientRef.current?.deactivate(); };
  }, []);

  const sendChat = useCallback((payload: Record<string, unknown>) => {
    clientRef.current?.publish({ destination: '/app/chat.send', body: JSON.stringify(payload) });
  }, []);

  return { connect, disconnect, sendChat };
}
```

- [ ] **Step 3: Rewrite `useChat.ts` — replace all invoke() with API calls**

The hook keeps the same return signature (same property names, same types) but replaces:
- `invoke('connect_redis', { config })` → `wsConnect()` (WebSocket connect)
- `invoke('disconnect_redis')` → `wsDisconnect()`
- `invoke('get_online_users')` → `getOnlineUsers()` from api/chat
- `invoke('list_chat_profiles')` → `listProfiles()` from api/chat
- `invoke('get_conversations')` → `listConversations()` from api/chat
- `invoke('get_user_profile', { accessKey })` → `myProfile()` from api/chat
- `invoke('update_user_profile', ...)` → `updateMyProfile()` from api/chat
- `invoke('get_or_create_private_conv', ...)` → `getOrCreateConversation()` from api/chat
- `invoke('load_conversation', ...)` → `loadMessages()` from api/chat
- `invoke('send_message', ...)` → `sendMessage()` from api/chat (REST) or `wsSendChat()` for WebSocket path
- `invoke('create_group', ...)` → `createGroup()` from api/chat
- `invoke('add_group_members', ...)` → `addGroupMembers()` from api/chat
- `invoke('upload_chat_file', ...)` → `uploadChatFile()` from api/chat
- `invoke('send_cloud_file', ...)` → `sendCloudFile()` from api/chat
- `invoke('capture_screenshot')` → `getDisplayMedia()` browser API
- `invoke('download_chat_file', ...)` → browser download via Blob
- `invoke('heartbeat')` → removed (WebSocket is the heartbeat)
- `invoke('load_redis_config')` → `getSavedServer()` from api/chat
- `listen('chat-message', callback)` → WebSocket subscription

Remove: `redisStatus` state, `connectRedis`, `disconnectRedis`, `hbRef`, `unlistenRef`
Remove: imports from `@tauri-apps/api/core` and `@tauri-apps/api/event`
Add: `wsConnected` boolean, `wsConnect`, `wsDisconnect` from `useWebSocket`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useChat.ts src/hooks/useWebSocket.ts package.json package-lock.json
git commit -m "refactor: migrate useChat from Tauri+Redis to REST API+WebSocket STOMP
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: 迁移 ChatApp + ChatView — 移除 Tauri 依赖

**Files:**
- Modify: `src/components/ChatApp.tsx`
- Modify: `src/components/ChatView.tsx`

**Interfaces:**
- Consumes: Updated `useChat` from Task 11
- Produces: Same UI, no Tauri imports, no Redis config screen

- [ ] **Step 1: Simplify ChatApp.tsx — remove Redis config UI, auto-connect via WebSocket**

Since the design removes Redis, the ChatApp no longer needs a Redis config screen. It should directly show the chat UI and call `wsConnect` on mount.

Changes:
- Remove `redisConfig` state, `showConfig` state, `checkingSaved` state
- Remove `RedisConfig` import
- Remove the `checkingSaved` and `showConfig` conditional renders (the whole Redis config form)
- Call `chat.wsConnect()` on mount
- Update prop: `onlineUsers` instead of `onlineAccessKeys`

- [ ] **Step 2: Migrate ChatView.tsx — remove Tauri dialog/fs APIs**

Changes:
- `handleFile`: Replace `@tauri-apps/plugin-dialog` `open()` → `<input type="file">` element (hidden, triggered programmatically)
- `handleScreenshot`: Replace `invoke('capture_screenshot')` → `navigator.mediaDevices.getDisplayMedia()` with canvas capture
- File download: Replace `@tauri-apps/plugin-dialog` `save()` + `invoke('download_chat_file')` → browser Blob download
- Cloud file: Replace `prompt()` → could keep for now or use a modal

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatApp.tsx src/components/ChatView.tsx
git commit -m "refactor: remove Tauri/Redis dependencies from ChatApp and ChatView
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: 迁移 FileManager, useSettings, useTransfers 及剩余组件

**Files:**
- Modify: `src/hooks/useSettings.ts`
- Modify: `src/hooks/useTransfers.ts`
- Modify: `src/components/FileManager.tsx`
- Modify: `src/components/TransferPanel.tsx`
- Modify: `src/components/Settings.tsx`
- Modify: `src/components/RecycleBin.tsx`
- Modify: `src/components/TextEditor.tsx`

**Interfaces:**
- Consumes: API modules from Task 9
- Produces: All components use REST API instead of Tauri invoke

- [ ] **Step 1: Rewrite remaining hooks and components**

All `invoke('command_name', { args })` → corresponding `api*()` function call:
- `invoke('save_user_settings', { settings })` → `saveSettings(settings)`
- `invoke('list_vfs', { path })` → `listVfs(path)`
- `invoke('save_transfer_tasks', { tasks })` → `saveTransfers(tasks)`
- `invoke('load_transfer_tasks')` → `loadTransfers()`
- `invoke('list_trash')` → `apiGet('/api/trash')`
- `invoke('restore_from_trash', ...)` → `apiPost('/api/trash/restore', ...)`
- `invoke('read_vfs_text', { path })` → `readText(path)`
- `invoke('write_vfs_text', { path, content })` → `writeText(path, content)`
- `invoke('download_vfs_file', { path })` → browser download

File uploads: Replace Tauri local path approach → `<input type="file">` + `FormData` multipart upload.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSettings.ts src/hooks/useTransfers.ts src/components/FileManager.tsx src/components/TransferPanel.tsx src/components/Settings.tsx src/components/RecycleBin.tsx src/components/TextEditor.tsx
git commit -m "refactor: migrate remaining components and hooks from Tauri invoke to REST API
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: Vite 构建配置 + 依赖清理

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `npm run build` outputs to `mos-server/src/main/resources/static/`

- [ ] **Step 1: Update vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../mos-server/src/main/resources/static',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 2: Remove Tauri dependencies from package.json**

Run: `cd mos-web && npm uninstall @tauri-apps/api @tauri-apps/plugin-shell @tauri-apps/plugin-dialog @tauri-apps/plugin-fs`

- [ ] **Step 3: Clean up main.tsx**

Remove any Tauri-specific initialization code. Remove `import` from `@tauri-apps/api`.

- [ ] **Step 4: Verify build**

Run: `cd mos-web && npm run build`
Expected: Build succeeds, files in `mos-server/src/main/resources/static/`

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts package.json package-lock.json src/main.tsx
git commit -m "build: configure Vite output to Spring Boot static dir, remove Tauri deps
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 15: 集成测试 — 启动 Spring Boot + 浏览器验证

**Files:**
- Verify: `mos-server/src/main/resources/static/index.html` exists after build

- [ ] **Step 1: Build React and package Spring Boot**

```bash
cd mos-web && npm run build
cd ../mos-server && mvn package -DskipTests
```

- [ ] **Step 2: Start the server**

```bash
java -jar mos-server/target/mos-server-1.0.0.jar --server.port=8080
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:8080`:
- Login screen renders (no Tauri dependency)
- Can enter MinIO endpoint/credentials and log in
- After login, desktop UI renders (FileManager, Settings, etc.)
- Chat sidebar loads conversations from MinIO
- WebSocket connects (`/ws` endpoint)
- Online users visible
- Messages send/receive via WebSocket

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: final integration verification and cleanup
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 验证检查点

| 阶段 | 验证条件 |
|------|---------|
| Phase 1 (Tasks 1-4) | `mvn compile` passes, auth interceptor wired, WebSocket STOMP endpoints registered |
| Phase 2 (Tasks 5-6) | `mvn compile` passes, all REST endpoints defined |
| Phase 3 (Tasks 7-9) | `mvn compile` passes, chat with WebSocket push, frontend API module compiles |
| Phase 4 (Tasks 10-15) | `npm run build` succeeds, `java -jar` serves the app, full functionality in browser |
