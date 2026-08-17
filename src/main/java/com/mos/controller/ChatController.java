package com.mos.controller;

import com.mos.config.MinioConfig;
import com.mos.model.ChatMessage;
import com.mos.model.ConversationMeta;
import com.mos.model.UserProfile;
import com.mos.service.ChatService;
import com.mos.service.MinioService;
import com.mos.service.OnlineUserService;
import io.minio.MinioClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
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

    private static String maskKey(String key) {
        if (key == null || key.length() <= 6) return key;
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }

    // ── Profiles ──

    @GetMapping("/profiles")
    public ResponseEntity<?> listProfiles(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.listProfiles());
        } catch (Exception e) {
            log.error("Chat profiles list FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/profiles/me")
    public ResponseEntity<?> myProfile(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.loadMyProfile(getAccessKey(req)));
        } catch (Exception e) {
            log.error("Chat my profile FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PutMapping("/profiles/me")
    public ResponseEntity<?> updateMyProfile(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            chatService.saveMyProfile(getAccessKey(req), body.get("nickname"), body.get("avatar"));
            messagingTemplate.convertAndSend("/topic/online",
                    Collections.singletonMap("type", "profile_update"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Chat update my profile FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // ── Online Users ──

    @GetMapping("/online")
    public ResponseEntity<?> onlineUsers(HttpServletRequest req) {
        try {
            Set<String> keys = onlineUserService.getOnlineAccessKeys();
            List<UserProfile> users = new ArrayList<>();
            for (String key : keys) {
                try {
                    users.add(chatService.loadMyProfile(key));
                } catch (Exception e) {
                    log.error("Chat load profile for online user {} FAIL: {}", key, e.getMessage());
                    UserProfile p = new UserProfile();
                    p.setAccessKey(key);
                    p.setNickname(key);
                    users.add(p);
                }
            }
            return ResponseEntity.ok(users);
        } catch (Exception e) {
            log.error("Chat online users list FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // ── Conversations ──

    @GetMapping("/conversations")
    public ResponseEntity<?> listConversations(HttpServletRequest req) {
        try {
            log.info("Chat conversations — accessKey={}", maskKey(getAccessKey(req)));
            return ResponseEntity.ok(chatService.listConversations(getAccessKey(req)));
        } catch (Exception e) {
            log.error("Chat conversations list FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations")
    public ResponseEntity<?> getOrCreateConversation(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            log.info("Chat conv get/create — otherUser={} accessKey={}", body.get("otherUser"), maskKey(getAccessKey(req)));
            String otherUser = body.get("otherUser");
            if (otherUser == null || otherUser.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", "otherUser is required"));
            }
            return ResponseEntity.ok(chatService.getOrCreatePrivateConv(getAccessKey(req), otherUser));
        } catch (Exception e) {
            log.error("Chat conversation get/create FAIL — otherUser={}: {}", body.get("otherUser"), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // ── Messages ──

    @GetMapping("/conversations/{id}/messages")
    public ResponseEntity<?> loadMessages(@PathVariable String id, HttpServletRequest req) {
        try {
            return ResponseEntity.ok(chatService.loadMessages(id, getAccessKey(req)));
        } catch (Exception e) {
            log.error("Chat messages load FAIL — convId={}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations/{id}/read")
    public ResponseEntity<?> markConversationRead(@PathVariable String id, HttpServletRequest req) {
        try {
            chatService.markConversationRead(id, getAccessKey(req));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Chat mark read FAIL — convId={}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations/{id}/messages")
    public ResponseEntity<?> sendMessage(@PathVariable String id, @RequestBody Map<String, String> body,
                                          HttpServletRequest req) {
        try {
            log.info("Chat send — convId={} msgType={} accessKey={}", id, body.getOrDefault("msgType", "text"), maskKey(getAccessKey(req)));
            String sender = getAccessKey(req);
            ChatMessage msg = chatService.sendMessage(id, sender,
                    body.get("content"), body.getOrDefault("msgType", "text"),
                    body.get("fileName"),
                    body.containsKey("fileSize") ? Long.parseLong(body.get("fileSize")) : null);

            // Push via WebSocket to conversation members
            for (String member : chatService.getConversationMembers(id)) {
                if (!member.equals(sender)) {
                    messagingTemplate.convertAndSendToUser(member, "/queue/chat", msg);
                }
            }

            return ResponseEntity.ok(msg);
        } catch (Exception e) {
            log.error("Chat send FAIL — convId={}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // ── Groups ──

    @PostMapping("/groups")
    public ResponseEntity<?> createGroup(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        try {
            @SuppressWarnings("unchecked")
            List<String> memberKeys = (List<String>) body.get("memberKeys");
            if (memberKeys == null) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", "memberKeys is required"));
            }
            String creator = getAccessKey(req);
            ConversationMeta meta = chatService.createGroup(creator, (String) body.get("name"), memberKeys);
            ChatMessage sysMsg = chatService.sendSystemMessage(meta.getId(), creator,
                    chatService.loadMyProfile(creator).getNickname() + " 创建了群聊");
            for (String member : meta.getMembers()) {
                if (!member.equals(creator)) {
                    messagingTemplate.convertAndSendToUser(member, "/queue/chat", sysMsg);
                }
            }
            return ResponseEntity.ok(meta);
        } catch (Exception e) {
            log.error("Chat group create FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/groups/{id}/members")
    public ResponseEntity<?> addGroupMembers(@PathVariable String id,
                                              @RequestBody Map<String, Object> body, HttpServletRequest req) {
        try {
            @SuppressWarnings("unchecked")
            List<String> memberKeys = (List<String>) body.get("memberKeys");
            if (memberKeys == null) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", "memberKeys is required"));
            }
            chatService.addGroupMembers(id, memberKeys);
            String operator = getAccessKey(req);
            ChatMessage sysMsg = chatService.sendSystemMessage(id, operator,
                    chatService.loadMyProfile(operator).getNickname() + " 邀请新成员加入群聊");
            for (String member : chatService.getConversationMembers(id)) {
                if (!member.equals(operator)) {
                    messagingTemplate.convertAndSendToUser(member, "/queue/chat", sysMsg);
                }
            }
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Chat group add members FAIL — convId={}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // ── File Operations ──

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(@RequestParam("file") MultipartFile file,
                                        @RequestParam("convId") String convId,
                                        HttpServletRequest req) {
        try {
            log.info("Chat upload — convId={} file={} accessKey={}", convId, file.getOriginalFilename(), maskKey(getAccessKey(req)));
            String path = chatService.uploadChatFile(convId, file.getOriginalFilename(), file.getBytes());
            return ResponseEntity.ok(Collections.singletonMap("s3Key", path));
        } catch (Exception e) {
            log.error("Chat file upload FAIL — convId={} file={}: {}", convId, file.getOriginalFilename(), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/cloud-file")
    public ResponseEntity<?> sendCloudFile(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            log.info("Chat cloud-file — convId={} vfsPath={} accessKey={}", body.get("convId"), body.get("vfsPath"), maskKey(getAccessKey(req)));
            String path = chatService.sendCloudFile(getClient(req), getBucket(req),
                    body.get("convId"), body.get("vfsPath"), body.get("fileName"));
            return ResponseEntity.ok(Collections.singletonMap("s3Key", path));
        } catch (Exception e) {
            log.error("Chat cloud file send FAIL — convId={}: {}", body.get("convId"), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/download")
    public ResponseEntity<?> downloadFile(@RequestParam String s3Key, HttpServletRequest req) {
        try {
            log.info("Chat download — path={} accessKey={}", s3Key, maskKey(getAccessKey(req)));
            byte[] data = chatService.downloadChatFile(s3Key);
            String filename = s3Key.contains("_") ? s3Key.substring(s3Key.lastIndexOf('_') + 1) : "file";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename*=UTF-8''" + URLEncoder.encode(filename, StandardCharsets.UTF_8))
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(data);
        } catch (Exception e) {
            log.error("Chat file download FAIL — path={}: {}", s3Key, e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/save-to-vfs")
    public ResponseEntity<?> saveToVfs(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            log.info("Chat save-to-vfs — path={} accessKey={}", body.get("s3Key"), maskKey(getAccessKey(req)));
            chatService.saveChatFileToVfs(getClient(req), getBucket(req),
                    body.get("s3Key"), body.get("destPath"));
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Chat save-to-vfs FAIL — path={}: {}", body.get("s3Key"), e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    // ── Saved Redis Config (legacy) ──

    @GetMapping("/saved-server")
    public ResponseEntity<?> getSavedServer(HttpServletRequest req) {
        try {
            Object config = minioService.readJsonOrDefault(getClient(req), getBucket(req),
                    "mos-chat/redis-config.json", Object.class, null);
            return ResponseEntity.ok(config != null ? config : Collections.emptyMap());
        } catch (Exception e) {
            log.error("Chat saved server read FAIL: {}", e.getMessage());
            return ResponseEntity.ok(Collections.emptyMap());
        }
    }

    @PutMapping("/saved-server")
    public ResponseEntity<?> saveServer(@RequestBody Object config, HttpServletRequest req) {
        try {
            minioService.writeJson(getClient(req), getBucket(req), "mos-chat/redis-config.json", config);
            return ResponseEntity.ok(Collections.singletonMap("ok", true));
        } catch (Exception e) {
            log.error("Chat saved server save FAIL: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }
}
