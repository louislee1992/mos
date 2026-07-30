package com.mos.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.*;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class MinioService {

    private final ObjectMapper objectMapper;

    public <T> T readJson(MinioClient client, String bucket, String key, Class<T> clazz) throws Exception {
        GetObjectResponse resp = client.getObject(
                GetObjectArgs.builder().bucket(bucket).object(key).build());
        byte[] data = resp.readAllBytes();
        return objectMapper.readValue(data, clazz);
    }

    public <T> T readJsonOrDefault(MinioClient client, String bucket, String key, Class<T> clazz, T defaultVal) {
        try {
            return readJson(client, bucket, key, clazz);
        } catch (Exception e) {
            return defaultVal;
        }
    }

    public void writeJson(MinioClient client, String bucket, String key, Object obj) throws Exception {
        byte[] data = objectMapper.writeValueAsBytes(obj);
        client.putObject(PutObjectArgs.builder()
                .bucket(bucket).object(key)
                .stream(new ByteArrayInputStream(data), data.length, -1)
                .contentType("application/json").build());
    }

    public Iterable<Result<io.minio.messages.Item>> listObjects(MinioClient client, String bucket, String prefix) throws Exception {
        return client.listObjects(ListObjectsArgs.builder()
                .bucket(bucket).prefix(prefix).recursive(true).build());
    }

    public void deleteObject(MinioClient client, String bucket, String key) throws Exception {
        client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
    }

    public void copyObject(MinioClient client, String bucket, String source, String dest) throws Exception {
        client.copyObject(CopyObjectArgs.builder()
                .bucket(bucket).object(dest)
                .source(CopySource.builder().bucket(bucket).object(source).build())
                .build());
    }

    public String getPresignedUrl(MinioClient client, String bucket, String key, int expirySec) throws Exception {
        return client.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .bucket(bucket).object(key).method(Method.GET)
                .expiry(expirySec, TimeUnit.SECONDS).build());
    }

    public void uploadFile(MinioClient client, String bucket, String key, InputStream stream, long size, String contentType) throws Exception {
        client.putObject(PutObjectArgs.builder()
                .bucket(bucket).object(key)
                .stream(stream, size, -1)
                .contentType(contentType != null ? contentType : "application/octet-stream")
                .build());
    }

    public byte[] downloadFile(MinioClient client, String bucket, String key) throws Exception {
        GetObjectResponse resp = client.getObject(
                GetObjectArgs.builder().bucket(bucket).object(key).build());
        return resp.readAllBytes();
    }
}
