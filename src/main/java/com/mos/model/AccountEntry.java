package com.mos.model;

import lombok.Data;

@Data
public class AccountEntry {
    private String id;
    private String name;
    private String accessKey;
    private String secretKey;
    private long createdAt;
    private long lastUsedAt;
    private boolean isAdmin;
}
