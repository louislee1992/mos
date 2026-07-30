package com.mos.model;

import lombok.Data;

@Data
public class SystemInfo {
    private long objectCount;
    private long storageBytes;
    private String bucketName;
}
