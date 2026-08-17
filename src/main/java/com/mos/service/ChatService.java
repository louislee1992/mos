package com.mos.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.mos.model.ChatMessage;
import com.mos.model.ConversationMeta;
import com.mos.model.UserProfile;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final LocalChatStore store;
    private final MinioService minioService;

    public static final String PREFIX = "mos-chat";

    private static String membersKey(String convId) {
        return PREFIX + "/conversations/" + convId + "_members.json";
    }

    private static String messagesKey(String convId) {
        return PREFIX + "/conversations/" + convId + ".json";
    }

    // ── Profiles ──

    public List<UserProfile> listProfiles() throws Exception {
        List<UserProfile> profiles = new ArrayList<>();
        for (String name : store.listFiles(PREFIX + "/profiles")) {
            if (!name.endsWith(".json")) continue;
            UserProfile p = store.readJson(PREFIX + "/profiles/" + name, UserProfile.class, null);
            if (p != null) profiles.add(p);
        }
        return profiles;
    }

    public UserProfile loadMyProfile(String accessKey) throws Exception {
        return store.readJson(PREFIX + "/profiles/" + accessKey + ".json",
                UserProfile.class, createDefaultProfile(accessKey));
    }

    public synchronized void saveMyProfile(String accessKey, String nickname, String avatar) throws Exception {
        UserProfile existing = store.readJson(PREFIX + "/profiles/" + accessKey + ".json",
                UserProfile.class, null);
        long createdAt = existing != null && existing.getCreatedAt() > 0
                ? existing.getCreatedAt() : System.currentTimeMillis();
        UserProfile profile = new UserProfile();
        profile.setAccessKey(accessKey);
        profile.setNickname(nickname != null ? nickname
                : (existing != null && existing.getNickname() != null && !existing.getNickname().isEmpty()
                        ? existing.getNickname() : accessKey));
        profile.setAvatar(avatar != null ? avatar
                : (existing != null && existing.getAvatar() != null ? existing.getAvatar() : ""));
        profile.setCreatedAt(createdAt);
        store.writeJson(PREFIX + "/profiles/" + accessKey + ".json", profile);
    }

    // ── Conversations ──

    public List<ConversationMeta> listConversations(String accessKey) throws Exception {
        List<ConversationMeta> convs = new ArrayList<>();
        for (String name : store.listFiles(PREFIX + "/conversations")) {
            if (!name.endsWith("_members.json")) continue;
            ConversationMeta meta = store.readJson(PREFIX + "/conversations/" + name,
                    ConversationMeta.class, null);
            if (meta != null && meta.getMembers() != null && meta.getMembers().contains(accessKey)) {
                refreshFromMessages(meta, accessKey);
                convs.add(meta);
            }
        }
        convs.sort((a, b) -> Long.compare(b.getLastMessageTime(), a.getLastMessageTime()));
        return convs;
    }

    private void refreshFromMessages(ConversationMeta meta, String accessKey) throws Exception {
        List<ChatMessage> msgs = store.readJson(messagesKey(meta.getId()),
                new TypeReference<List<ChatMessage>>() {
                }, Collections.emptyList());
        long unread = 0;
        if (!msgs.isEmpty()) {
            ChatMessage last = msgs.get(msgs.size() - 1);
            meta.setLastMessage(computeLastMessagePreview(last.getMsgType(), last.getContent(), last.getFileName()));
            meta.setLastMessageTime(last.getTimestamp());
            long readAt = meta.getReadTimes() != null && meta.getReadTimes().get(accessKey) != null
                    ? meta.getReadTimes().get(accessKey) : 0L;
            for (ChatMessage m : msgs) {
                if (m.getTimestamp() > readAt && !m.getSender().equals(accessKey)) unread++;
            }
        }
        meta.setUnreadCount(unread);
    }

    public synchronized void markConversationRead(String convId, String accessKey) throws Exception {
        ConversationMeta meta = store.readJson(membersKey(convId), ConversationMeta.class, null);
        if (meta == null || meta.getMembers() == null || !meta.getMembers().contains(accessKey)) {
            throw new SecurityException("User is not a member of this conversation");
        }
        if (meta.getReadTimes() == null) meta.setReadTimes(new HashMap<>());
        meta.getReadTimes().put(accessKey, System.currentTimeMillis());
        store.writeJson(membersKey(convId), meta);
    }

    private String makePrivateConvId(String a, String b) {
        List<String> keys = Arrays.asList(a, b);
        Collections.sort(keys);
        return "conv_" + keys.get(0) + "_" + keys.get(1);
    }

    public synchronized ConversationMeta getOrCreatePrivateConv(String currentUser, String otherUser) throws Exception {
        String convId = makePrivateConvId(currentUser, otherUser);
        ConversationMeta meta = store.readJson(membersKey(convId), ConversationMeta.class, null);
        if (meta != null) {
            refreshFromMessages(meta, currentUser);
            return meta;
        }
        meta = new ConversationMeta();
        meta.setId(convId);
        meta.setConvType("private");
        meta.setName("");
        meta.setMembers(Arrays.asList(currentUser, otherUser));
        meta.setCreatedAt(System.currentTimeMillis());
        meta.setLastMessage("");
        meta.setLastMessageTime(0);
        store.writeJson(membersKey(convId), meta);
        return meta;
    }

    public synchronized ConversationMeta createGroup(String currentUser, String name,
                                                      List<String> memberKeys) throws Exception {
        List<String> members = new ArrayList<>(memberKeys);
        if (!members.contains(currentUser)) members.add(currentUser);
        String convId = "conv_" + UUID.randomUUID();
        ConversationMeta meta = new ConversationMeta();
        meta.setId(convId);
        meta.setConvType("group");
        meta.setName(name != null ? name : "");
        meta.setMembers(members);
        meta.setCreatedAt(System.currentTimeMillis());
        meta.setLastMessage("");
        meta.setLastMessageTime(System.currentTimeMillis());
        Map<String, Long> readTimes = new HashMap<>();
        long now = System.currentTimeMillis();
        for (String m : members) readTimes.put(m, now);
        meta.setReadTimes(readTimes);
        store.writeJson(membersKey(convId), meta);
        store.writeJson(messagesKey(convId), new ArrayList<>());
        return meta;
    }

    public synchronized void addGroupMembers(String convId, List<String> memberKeys) throws Exception {
        ConversationMeta meta = store.readJson(membersKey(convId), ConversationMeta.class, null);
        if (meta == null) throw new SecurityException("Conversation not found");
        if (meta.getReadTimes() == null) meta.setReadTimes(new HashMap<>());
        for (String mk : memberKeys) {
            if (!meta.getMembers().contains(mk)) {
                meta.getMembers().add(mk);
                meta.getReadTimes().put(mk, System.currentTimeMillis());
            }
        }
        store.writeJson(membersKey(convId), meta);
    }

    public List<String> getConversationMembers(String convId) throws Exception {
        ConversationMeta meta = store.readJson(membersKey(convId), ConversationMeta.class, null);
        return meta != null && meta.getMembers() != null ? meta.getMembers() : Collections.emptyList();
    }

    // ── Messages ──

    public List<ChatMessage> loadMessages(String convId, String currentUser) throws Exception {
        ConversationMeta meta = store.readJson(membersKey(convId), ConversationMeta.class, null);
        if (meta == null || meta.getMembers() == null || !meta.getMembers().contains(currentUser)) {
            throw new SecurityException("User is not a member of this conversation");
        }
        return store.readJson(messagesKey(convId),
                new TypeReference<List<ChatMessage>>() {
                }, new ArrayList<>());
    }

    public synchronized ChatMessage sendMessage(String convId, String sender, String content,
                                                String msgType, String fileName, Long fileSize) throws Exception {
        ConversationMeta meta = store.readJson(membersKey(convId), ConversationMeta.class, null);
        if (meta == null || meta.getMembers() == null || !meta.getMembers().contains(sender)) {
            throw new SecurityException("User is not a member of this conversation");
        }

        String senderName = loadMyProfile(sender).getNickname();
        ChatMessage msg = new ChatMessage();
        msg.setId(UUID.randomUUID().toString());
        msg.setConvId(convId);
        msg.setSender(sender);
        msg.setSenderName(senderName);
        msg.setMsgType(msgType != null ? msgType : "text");
        msg.setContent(content != null ? content : "");
        msg.setFileName(fileName != null ? fileName : "");
        msg.setFileSize(fileSize != null ? fileSize : 0);
        msg.setTimestamp(System.currentTimeMillis());

        List<ChatMessage> existing = loadMessages(convId, sender);
        existing.add(msg);
        store.writeJson(messagesKey(convId), existing);

        meta.setLastMessage(computeLastMessagePreview(msgType, content, fileName));
        meta.setLastMessageTime(msg.getTimestamp());
        store.writeJson(membersKey(convId), meta);

        return msg;
    }

    public synchronized ChatMessage sendSystemMessage(String convId, String sender, String content) throws Exception {
        ConversationMeta meta = store.readJson(membersKey(convId), ConversationMeta.class, null);
        if (meta == null) throw new SecurityException("Conversation not found");

        ChatMessage msg = new ChatMessage();
        msg.setId(UUID.randomUUID().toString());
        msg.setConvId(convId);
        msg.setSender(sender);
        msg.setSenderName(loadMyProfile(sender).getNickname());
        msg.setMsgType("system");
        msg.setContent(content != null ? content : "");
        msg.setFileName("");
        msg.setFileSize(0);
        msg.setTimestamp(System.currentTimeMillis());

        List<ChatMessage> existing = store.readJson(messagesKey(convId),
                new TypeReference<List<ChatMessage>>() {
                }, new ArrayList<>());
        existing.add(msg);
        store.writeJson(messagesKey(convId), existing);

        meta.setLastMessage(content != null ? content : "");
        meta.setLastMessageTime(msg.getTimestamp());
        store.writeJson(membersKey(convId), meta);

        return msg;
    }

    // ── Files ──

    public synchronized String uploadChatFile(String convId, String fileName, byte[] data) throws Exception {
        String relative = PREFIX + "/files/" + convId + "/" + UUID.randomUUID() + "_" + fileName;
        store.writeFile(relative, data);
        return relative;
    }

    public synchronized String sendCloudFile(MinioClient client, String bucket, String convId,
                                             String vfsPath, String fileName) throws Exception {
        byte[] data = minioService.downloadFile(client, bucket, "vfs/" + vfsPath.replaceAll("^/", ""));
        return uploadChatFile(convId, fileName, data);
    }

    public byte[] downloadChatFile(String relative) throws Exception {
        return store.readFile(relative);
    }

    public synchronized void saveChatFileToVfs(MinioClient client, String bucket, String s3Key,
                                               String destPath) throws Exception {
        if (s3Key == null || !s3Key.startsWith(PREFIX + "/files/")) {
            throw new SecurityException("Invalid chat file path");
        }
        String fileName = s3Key.substring(s3Key.lastIndexOf('/') + 1);
        int underscore = fileName.indexOf('_');
        if (underscore >= 0) fileName = fileName.substring(underscore + 1);
        byte[] data = store.readFile(s3Key);

        String destKey = "vfs/" + destPath.replaceAll("^/", "");
        if (!destKey.endsWith("/")) destKey += "/";
        destKey += fileName;
        try {
            minioService.statSize(client, bucket, destKey);
            throw new IllegalStateException("Target file already exists");
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception ignored) {
            // target does not exist, proceed
        }
        minioService.uploadFile(client, bucket, destKey,
                new java.io.ByteArrayInputStream(data), data.length, "application/octet-stream");
    }

    // ── Helpers ──

    private UserProfile createDefaultProfile(String accessKey) {
        UserProfile p = new UserProfile();
        p.setAccessKey(accessKey);
        p.setNickname(accessKey);
        p.setAvatar("");
        p.setCreatedAt(0);
        return p;
    }

    private String computeLastMessagePreview(String msgType, String content, String fileName) {
        if (msgType == null) return content != null ? content : "";
        switch (msgType) {
            case "image":
                return "[图片]";
            case "file":
                return "[文件] " + (fileName != null ? fileName : "");
            case "share":
                return "[分享] " + (fileName != null ? fileName : "");
            case "emoji":
                return content != null ? content : "";
            default:
                return content != null ? content : "";
        }
    }
}
