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
import java.util.List;
import java.util.Map;
import java.util.Set;

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

    // ── Profiles ──

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

    // ── Online Users ──

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
                    p.setAccessKey(key);
                    p.setNickname(key);
                    users.add(p);
                }
            }
            return ResponseEntity.ok(users);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Conversations ──

    @GetMapping("/conversations")
    public ResponseEntity<?> listConversations(HttpServletRequest req) {
        try {
            return ResponseEntity.ok(
                    chatService.listConversations(getClient(req), getBucket(req), getAccessKey(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations")
    public ResponseEntity<?> getOrCreateConversation(@RequestBody Map<String, String> body, HttpServletRequest req) {
        try {
            String otherUser = body.get("otherUser");
            if (otherUser == null || otherUser.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "otherUser is required"));
            }
            return ResponseEntity.ok(chatService.getOrCreatePrivateConv(
                    getClient(req), getBucket(req), getAccessKey(req), otherUser));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Messages ──

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
                    body.get("fileName"),
                    body.containsKey("fileSize") ? Long.parseLong(body.get("fileSize")) : null);

            // Push via WebSocket to conversation members
            String membersKey = "mos-chat/conversations/" + id + "_members.json";
            try {
                ConversationMeta meta = minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
                if (meta != null && meta.getMembers() != null) {
                    for (String member : meta.getMembers()) {
                        if (!member.equals(sender)) {
                            messagingTemplate.convertAndSendToUser(member, "/queue/chat", msg);
                        }
                    }
                }
            } catch (Exception ignored) {
            }

            return ResponseEntity.ok(msg);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Groups ──

    @PostMapping("/groups")
    public ResponseEntity<?> createGroup(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        try {
            @SuppressWarnings("unchecked")
            List<String> memberKeys = (List<String>) body.get("memberKeys");
            if (memberKeys == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "memberKeys is required"));
            }
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
            if (memberKeys == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "memberKeys is required"));
            }
            chatService.addGroupMembers(getClient(req), getBucket(req), id, memberKeys);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── File Operations ──

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

    // ── Saved Redis Config (legacy) ──

    @GetMapping("/saved-server")
    public ResponseEntity<?> getSavedServer(HttpServletRequest req) {
        try {
            Object config = minioService.readJsonOrDefault(getClient(req), getBucket(req),
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
