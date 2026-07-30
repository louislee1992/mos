package com.mos.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OnlineUserService {

    private final Map<String, String> onlineUsers = new ConcurrentHashMap<>();

    public void userConnected(String accessKey, String sessionId) {
        onlineUsers.put(accessKey, sessionId);
    }

    public void userDisconnected(String accessKey) {
        onlineUsers.remove(accessKey);
    }

    public Set<String> getOnlineAccessKeys() {
        return onlineUsers.keySet();
    }

    public boolean isOnline(String accessKey) {
        return onlineUsers.containsKey(accessKey);
    }
}
