package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.model.DeviceInfo;
import com.mos.model.SystemInfo;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.InetAddress;

@Service
@RequiredArgsConstructor
public class SystemService {

    private final MinioService minioService;

    public SystemInfo getSystemInfo(MinioClient client, String accessKey) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        SystemInfo info = new SystemInfo();
        info.setBucketName(bucket);
        long count = 0;
        long bytes = 0;
        for (Result<Item> result : minioService.listObjects(client, bucket, "")) {
            Item item = result.get();
            count++;
            bytes += item.size();
        }
        info.setObjectCount(count);
        info.setStorageBytes(bytes);
        return info;
    }

    public DeviceInfo getDeviceInfo() throws Exception {
        DeviceInfo info = new DeviceInfo();
        info.setOsName(System.getProperty("os.name"));
        info.setOsVersion(System.getProperty("os.version"));
        info.setHostname(InetAddress.getLocalHost().getHostName());
        info.setLocalIp(InetAddress.getLocalHost().getHostAddress());
        return info;
    }
}
