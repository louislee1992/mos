package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.VfsEntry;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class VfsService {

    private final MinioService minioService;

    public List<VfsEntry> listVfs(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String prefix = path.isEmpty() ? "vfs/" : "vfs/" + path.replaceAll("^/", "");
        if (!prefix.endsWith("/")) prefix += "/";

        List<VfsEntry> entries = new ArrayList<>();
        for (Result<Item> result : minioService.listObjects(client, bucket, prefix)) {
            Item item = result.get();
            String key = item.objectName();
            if (key == null || key.equals(prefix)) continue;
            String relative = key.substring("vfs/".length());
            VfsEntry entry = new VfsEntry();
            entry.setPath(relative);
            entry.setName(relative.contains("/")
                    ? relative.substring(relative.lastIndexOf('/') + 1) : relative);
            entry.setType(item.isDir() ? "folder" : "file");
            entry.setSize(item.size());
            if (item.lastModified() != null) {
                entry.setLastModified(item.lastModified().toString());
            }
            entries.add(entry);
        }
        return entries;
    }

    public void createFolder(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        if (!s3Key.endsWith("/")) s3Key += "/";
        minioService.writeJson(client, bucket, s3Key + ".keep", "");
    }

    public void createFile(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        minioService.writeJson(client, bucket, s3Key, "");
    }

    public void deleteVfs(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        minioService.deleteObject(client, bucket, s3Key);
    }

    public byte[] downloadFile(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        return minioService.downloadFile(client, bucket, s3Key);
    }

    public String readText(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        return new String(minioService.downloadFile(client, bucket, s3Key), StandardCharsets.UTF_8);
    }

    public void writeText(MinioClient client, String accessKey, String path, String content) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        minioService.writeJson(client, bucket, s3Key, content);
    }

    public void copyVfs(MinioClient client, String accessKey, String source, String dest) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        minioService.copyObject(client, bucket, "vfs/" + source.replaceAll("^/", ""),
                "vfs/" + dest.replaceAll("^/", ""));
    }

    public void renameVfs(MinioClient client, String accessKey, String oldPath, String newPath) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String oldKey = "vfs/" + oldPath.replaceAll("^/", "");
        String newKey = "vfs/" + newPath.replaceAll("^/", "");
        minioService.copyObject(client, bucket, oldKey, newKey);
        minioService.deleteObject(client, bucket, oldKey);
    }

    public void moveToTrash(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String source = "vfs/" + path.replaceAll("^/", "");
        String dest = "trash/" + System.currentTimeMillis() + "_" + path.replaceAll("[/]+", "_");
        minioService.copyObject(client, bucket, source, dest);
        minioService.deleteObject(client, bucket, source);
    }

    public String ensureVfs(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        try {
            minioService.downloadFile(client, bucket, s3Key);
        } catch (Exception e) {
            minioService.writeJson(client, bucket, s3Key, "");
        }
        return s3Key;
    }
}
