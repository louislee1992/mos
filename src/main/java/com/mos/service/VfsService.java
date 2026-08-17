package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.VfsEntry;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

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

            // Skip zero-byte directory-marker objects (path ends with /)
            if (relative.endsWith("/")) continue;

            // Convert .keep files to folder entries
            boolean isKeep = relative.endsWith("/.keep") || relative.equals(".keep");

            VfsEntry entry = new VfsEntry();
            if (isKeep) {
                String folderPath = relative.equals(".keep")
                        ? ""
                        : relative.substring(0, relative.length() - "/.keep".length());
                entry.setPath(folderPath);
                entry.setName(folderPath.contains("/")
                        ? folderPath.substring(folderPath.lastIndexOf('/') + 1) : folderPath);
                entry.setType("folder");
            } else {
                entry.setPath(relative);
                entry.setName(relative.contains("/")
                        ? relative.substring(relative.lastIndexOf('/') + 1) : relative);
                entry.setType(item.isDir() ? "folder" : "file");
            }
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

    public void createWordDoc(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String s3Key = "vfs/" + path.replaceAll("^/", "");
        minioService.writeBytes(client, bucket, s3Key, buildMinimalDocx(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }

    private byte[] buildMinimalDocx() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            putZipEntry(zip, "[Content_Types].xml",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                            + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                            + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                            + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                            + "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>"
                            + "</Types>");
            putZipEntry(zip, "_rels/.rels",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                            + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                            + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>"
                            + "</Relationships>");
            putZipEntry(zip, "word/document.xml",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                            + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                            + "<w:body><w:p/></w:body></w:document>");
        }
        return out.toByteArray();
    }

    private void putZipEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private List<String> collectKeys(MinioClient client, String bucket, String path) throws Exception {
        String prefix = "vfs/" + path.replaceAll("^/", "");
        List<String> keys = new ArrayList<>();
        for (Result<Item> result : minioService.listObjects(client, bucket, prefix)) {
            Item item = result.get();
            String key = item.objectName();
            if (key != null && (key.equals(prefix) || key.startsWith(prefix + "/"))) {
                keys.add(key);
            }
        }
        return keys;
    }

    public void deleteVfs(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        for (String key : collectKeys(client, bucket, path)) {
            minioService.deleteObject(client, bucket, key);
        }
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
        minioService.writeText(client, bucket, s3Key, content);
    }

    public void copyVfs(MinioClient client, String accessKey, String source, String dest) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        minioService.copyObject(client, bucket, "vfs/" + source.replaceAll("^/", ""),
                "vfs/" + dest.replaceAll("^/", ""));
    }

    public void renameVfs(MinioClient client, String accessKey, String oldPath, String newPath) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String oldPrefix = "vfs/" + oldPath.replaceAll("^/", "");
        String newPrefix = "vfs/" + newPath.replaceAll("^/", "");
        for (String key : collectKeys(client, bucket, oldPath)) {
            minioService.copyObject(client, bucket, key, newPrefix + key.substring(oldPrefix.length()));
            minioService.deleteObject(client, bucket, key);
        }
    }

    public void moveToTrash(MinioClient client, String accessKey, String path) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        String source = "vfs/" + path.replaceAll("^/", "");
        String destPrefix = "trash/" + System.currentTimeMillis() + "/" + path.replaceAll("^/", "");
        for (String key : collectKeys(client, bucket, path)) {
            minioService.copyObject(client, bucket, key, destPrefix + key.substring(source.length()));
            minioService.deleteObject(client, bucket, key);
        }
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
