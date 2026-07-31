package com.mos.websocket;

import com.mos.config.MinioConfig;
import com.mos.model.ChatMessage;
import com.mos.model.ConversationMeta;
import com.mos.service.ChatService;
import com.mos.service.MinioService;
import com.mos.service.OnlineUserService;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
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

@Controller
@RequiredArgsConstructor
@Slf4j
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
            if (parts.length < 2) {
                log.warn("Invalid Basic Auth format for session {}", accessor.getSessionId());
                return;
            }
            String accessKey = parts[0];
            String bucket = MinioConfig.deriveBucketName(accessKey);

            // Store credentials in session attributes
            accessor.getSessionAttributes().put("accessKey", accessKey);
            accessor.getSessionAttributes().put("secretKey", parts[1]);
            accessor.getSessionAttributes().put("endpoint", endpoint);
            accessor.getSessionAttributes().put("bucket", bucket);

            // Register online
            onlineUserService.userConnected(accessKey, accessor.getSessionId());

            // Save/initialize profile
            MinioClient client = MinioConfig.buildClient(endpoint, parts[0], parts[1]);
            chatService.saveMyProfile(client, bucket, accessKey, null, null);

            // Broadcast online update
            messagingTemplate.convertAndSend("/topic/online",
                    Map.of("type", "user_online", "accessKey", accessKey));
        } catch (Exception e) {
            log.error("Failed to handle STOMP connect for session {}: {}", accessor.getSessionId(), e.getMessage(), e);
        }
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
        if (convId == null || content == null) {
            log.warn("Received chat.send with null convId or content from user {}", accessKey);
            return;
        }
        String msgType = (String) payload.getOrDefault("msgType", "text");
        String fileName = (String) payload.get("fileName");
        Long fileSize = payload.get("fileSize") != null
                ? ((Number) payload.get("fileSize")).longValue() : null;

        try {
            MinioClient client = MinioConfig.buildClient(endpoint, accessKey, secretKey);
            ChatMessage msg = chatService.sendMessage(client, bucket, convId, accessKey,
                    content, msgType, fileName, fileSize, accessKey);

            // Push to other conversation members
            String membersKey = ChatService.PREFIX + "/conversations/" + convId + "_members.json";
            try {
                ConversationMeta meta = minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
                for (String member : meta.getMembers()) {
                    if (!member.equals(accessKey)) {
                        messagingTemplate.convertAndSendToUser(member, "/queue/chat", msg);
                    }
                }
            } catch (Exception e) {
                log.error("Failed to read conversation members for convId {}: {}", convId, e.getMessage(), e);
            }
        } catch (Exception e) {
            log.error("Failed to send chat message from user {}: {}", accessKey, e.getMessage(), e);
        }
    }

    @MessageExceptionHandler
    public void handleMessageException(Exception e) {
        log.error("Unhandled exception in chat WebSocket handler: {}", e.getMessage(), e);
    }
}
