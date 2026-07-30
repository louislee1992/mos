package com.mos.config;

import io.minio.MinioClient;

public class MinioConfig {

    public static String deriveBucketName(String accessKey) {
        return accessKey.toLowerCase().replaceAll("[^a-z0-9-]", "-") + "-os";
    }

    public static MinioClient buildClient(String endpoint, String accessKey, String secretKey) {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
