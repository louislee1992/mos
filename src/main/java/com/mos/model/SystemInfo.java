package com.mos.model;

import lombok.Data;

@Data
public class SystemInfo {
    private String appVersion;
    private String minioEndpoint;
    private String minioBucket;
    private long objectCount;
    private long totalSizeBytes;
}
