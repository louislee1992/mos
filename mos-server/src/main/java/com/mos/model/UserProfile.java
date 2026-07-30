package com.mos.model;

import lombok.Data;

@Data
public class UserProfile {
    private String accessKey;
    private String nickname;
    private String avatar;
    private long createdAt;
}
