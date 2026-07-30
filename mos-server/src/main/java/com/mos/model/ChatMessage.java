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
