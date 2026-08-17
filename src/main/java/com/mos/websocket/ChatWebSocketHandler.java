package com.mos.websocket;

import com.mos.model.ChatMessage;
import com.mos.service.ChatService;
import com.mos.service.OnlineUserService;
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

import java.util.HashMap;
import java.util.Map;

@Controller
@RequiredArgsConstructor
@Slf4j
public class ChatWebSocketHandler {

    private final OnlineUserService onlineUserService;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    @EventListener
    public void handleConnect(SessionConnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String accessKey = StompAuthSupport.decodeAccessKey(accessor);
        if (accessKey == null) return;

        try {
            accessor.getSessionAttributes().put("accessKey", accessKey);

            onlineUserService.userConnected(accessKey, accessor.getSessionId());

            chatService.saveMyProfile(accessKey, null, null);

            Map<String, Object> onlineMsg = new HashMap<>();
            onlineMsg.put("type", "user_online");
            onlineMsg.put("accessKey", accessKey);
            messagingTemplate.convertAndSend("/topic/online", onlineMsg);
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
            Map<String, Object> offlineMsg = new HashMap<>();
            offlineMsg.put("type", "user_offline");
            offlineMsg.put("accessKey", accessKey);
            messagingTemplate.convertAndSend("/topic/online", offlineMsg);
        }
    }

    @MessageMapping("/chat.send")
    public void handleChatSend(@Payload Map<String, Object> payload,
                               SimpMessageHeaderAccessor accessor) {
        String accessKey = (String) accessor.getSessionAttributes().get("accessKey");
        if (accessKey == null) return;

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
            ChatMessage msg = chatService.sendMessage(convId, accessKey,
                    content, msgType, fileName, fileSize);

            for (String member : chatService.getConversationMembers(convId)) {
                if (!member.equals(accessKey)) {
                    messagingTemplate.convertAndSendToUser(member, "/queue/chat", msg);
                }
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
