package com.mos.service;

import com.mos.config.MinioConfig;
import com.mos.config.MosProperties;
import com.mos.model.DeviceInfo;
import com.mos.model.LoginHistoryEntry;
import com.mos.model.SystemInfo;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;

@Service
@RequiredArgsConstructor
public class SystemService {

    private final MinioService minioService;
    private final MosProperties mosProperties;

    private final Deque<LoginHistoryEntry> loginHistory = new ConcurrentLinkedDeque<>();

    public SystemInfo getSystemInfo(MinioClient client, String accessKey) throws Exception {
        String bucket = MinioConfig.deriveBucketName(accessKey);
        SystemInfo info = new SystemInfo();
        info.setAppVersion("1.0.0");
        info.setMinioEndpoint(mosProperties.getEndpoint());
        info.setMinioBucket(bucket);
        long count = 0;
        long bytes = 0;
        for (Result<Item> result : minioService.listObjects(client, bucket, "")) {
            Item item = result.get();
            count++;
            bytes += item.size();
        }
        info.setObjectCount(count);
        info.setTotalSizeBytes(bytes);
        return info;
    }

    public void recordLogin(String ip, String userAgent) {
        LoginHistoryEntry entry = new LoginHistoryEntry();
        entry.setLoginTime(System.currentTimeMillis());
        entry.setIpAddress(ip);
        entry.setHostname(ip);
        parseUserAgent(userAgent, entry);
        loginHistory.addFirst(entry);
        while (loginHistory.size() > 10) {
            loginHistory.pollLast();
        }
    }

    private void parseUserAgent(String ua, LoginHistoryEntry entry) {
        if (ua == null || ua.isEmpty()) {
            entry.setOsName("未知");
            entry.setOsVersion("");
            return;
        }
        String uaLower = ua.toLowerCase();
        if (uaLower.contains("windows nt 10") || uaLower.contains("windows nt 11")) {
            entry.setOsName("Windows");
            entry.setOsVersion(uaLower.contains("windows nt 11") ? "11" : "10");
        } else if (uaLower.contains("windows")) {
            entry.setOsName("Windows");
            entry.setOsVersion("");
        } else if (uaLower.contains("mac os x") || uaLower.contains("macos")) {
            entry.setOsName("macOS");
            entry.setOsVersion("");
        } else if (uaLower.contains("linux")) {
            entry.setOsName("Linux");
            entry.setOsVersion("");
        } else if (uaLower.contains("android")) {
            entry.setOsName("Android");
            entry.setOsVersion("");
        } else if (uaLower.contains("ios") || uaLower.contains("iphone") || uaLower.contains("ipad")) {
            entry.setOsName("iOS");
            entry.setOsVersion("");
        } else {
            entry.setOsName("未知");
            entry.setOsVersion("");
        }
    }

    public List<LoginHistoryEntry> getLoginHistory() {
        return new ArrayList<>(loginHistory);
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
