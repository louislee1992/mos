package com.mos.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;
import java.util.Map;

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
    private Map<String, Long> readTimes;
    private long unreadCount;
}
