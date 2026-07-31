package com.mos.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.mos.model.ChatMessage;
import com.mos.model.ConversationMeta;
import com.mos.model.UserProfile;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final MinioService minioService;
    public static final String PREFIX = "mos-chat";

    // ── Profiles ──

    public List<UserProfile> listProfiles(MinioClient client, String bucket) throws Exception {
        List<UserProfile> profiles = new ArrayList<>();
        for (Result<Item> result : minioService.listObjects(client, bucket, PREFIX + "/profiles/")) {
            Item item = result.get();
            String key = item.objectName();
            if (key == null || !key.endsWith(".json")) continue;
            try {
                UserProfile p = minioService.readJson(client, bucket, key, UserProfile.class);
                if (p != null) profiles.add(p);
            } catch (Exception ignored) {
            }
        }
        return profiles;
    }

    public UserProfile loadMyProfile(MinioClient client, String bucket, String accessKey) throws Exception {
        String key = PREFIX + "/profiles/" + accessKey + ".json";
        return minioService.readJsonOrDefault(client, bucket, key, UserProfile.class,
                createDefaultProfile(accessKey));
    }

    public void saveMyProfile(MinioClient client, String bucket, String accessKey,
                              String nickname, String avatar) throws Exception {
        String key = PREFIX + "/profiles/" + accessKey + ".json";
        long createdAt = System.currentTimeMillis();
        try {
            UserProfile existing = minioService.readJson(client, bucket, key, UserProfile.class);
            if (existing != null && existing.getCreatedAt() > 0) {
                createdAt = existing.getCreatedAt();
            }
        } catch (Exception ignored) {
        }
        UserProfile profile = new UserProfile();
        profile.setAccessKey(accessKey);
        profile.setNickname(nickname != null ? nickname : accessKey);
        profile.setAvatar(avatar != null ? avatar : "");
        profile.setCreatedAt(createdAt);
        minioService.writeJson(client, bucket, key, profile);
    }

    // ── Conversations ──

    public List<ConversationMeta> listConversations(MinioClient client, String bucket, String accessKey) throws Exception {
        List<ConversationMeta> convs = new ArrayList<>();
        for (Result<Item> result : minioService.listObjects(client, bucket, PREFIX + "/conversations/")) {
            Item item = result.get();
            String key = item.objectName();
            if (key == null || !key.endsWith("_members.json")) continue;
            try {
                ConversationMeta meta = minioService.readJson(client, bucket, key, ConversationMeta.class);
                if (meta.getMembers() != null && meta.getMembers().contains(accessKey)) {
                    convs.add(meta);
                }
            } catch (Exception ignored) {
            }
        }
        convs.sort((a, b) -> Long.compare(b.getLastMessageTime(), a.getLastMessageTime()));
        return convs;
    }

    private String makePrivateConvId(String a, String b) {
        List<String> keys = Arrays.asList(a, b);
        Collections.sort(keys);
        return "conv_" + keys.get(0) + "_" + keys.get(1);
    }

    public ConversationMeta getOrCreatePrivateConv(MinioClient client, String bucket,
                                                    String currentUser, String otherUser) throws Exception {
        String convId = makePrivateConvId(currentUser, otherUser);
        String membersKey = PREFIX + "/conversations/" + convId + "_members.json";
        try {
            return minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
        } catch (Exception e) {
            ConversationMeta meta = new ConversationMeta();
            meta.setId(convId);
            meta.setConvType("private");
            meta.setName("");
            meta.setMembers(Arrays.asList(currentUser, otherUser));
            meta.setCreatedAt(System.currentTimeMillis());
            meta.setLastMessage("");
            meta.setLastMessageTime(0);
            minioService.writeJson(client, bucket, membersKey, meta);
            return meta;
        }
    }

    public ConversationMeta createGroup(MinioClient client, String bucket, String currentUser,
                                         String name, List<String> memberKeys) throws Exception {
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
        minioService.writeJson(client, bucket, PREFIX + "/conversations/" + convId + "_members.json", meta);
        minioService.writeJson(client, bucket, PREFIX + "/conversations/" + convId + ".json", new ArrayList<>());
        return meta;
    }

    public void addGroupMembers(MinioClient client, String bucket, String convId,
                                 List<String> memberKeys) throws Exception {
        String key = PREFIX + "/conversations/" + convId + "_members.json";
        ConversationMeta meta = minioService.readJson(client, bucket, key, ConversationMeta.class);
        for (String mk : memberKeys) {
            if (!meta.getMembers().contains(mk)) meta.getMembers().add(mk);
        }
        minioService.writeJson(client, bucket, key, meta);
    }

    // ── Messages ──

    public List<ChatMessage> loadMessages(MinioClient client, String bucket, String convId,
                                          String currentUser) throws Exception {
        String membersKey = PREFIX + "/conversations/" + convId + "_members.json";
        ConversationMeta meta = minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
        if (meta == null || meta.getMembers() == null || !meta.getMembers().contains(currentUser)) {
            throw new SecurityException("User is not a member of this conversation");
        }
        String key = PREFIX + "/conversations/" + convId + ".json";
        return minioService.readJsonOrDefault(client, bucket, key,
                new TypeReference<List<ChatMessage>>() {
                }, new ArrayList<>());
    }

    public ChatMessage sendMessage(MinioClient client, String bucket, String convId,
                                    String sender, String content, String msgType,
                                    String fileName, Long fileSize,
                                    String currentUser) throws Exception {
        // Verify sender is a member of the conversation
        String membersKey = PREFIX + "/conversations/" + convId + "_members.json";
        ConversationMeta meta = minioService.readJson(client, bucket, membersKey, ConversationMeta.class);
        if (meta == null || meta.getMembers() == null || !meta.getMembers().contains(currentUser)) {
            throw new SecurityException("User is not a member of this conversation");
        }

        String senderName = loadMyProfile(client, bucket, sender).getNickname();
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

        // Append to messages array
        String msgKey = PREFIX + "/conversations/" + convId + ".json";
        List<ChatMessage> existing = loadMessages(client, bucket, convId, currentUser);
        existing.add(msg);
        minioService.writeJson(client, bucket, msgKey, existing);

        // Update conversation meta
        try {
            meta.setLastMessage(computeLastMessagePreview(msgType, content, fileName));
            meta.setLastMessageTime(msg.getTimestamp());
            minioService.writeJson(client, bucket, membersKey, meta);
        } catch (Exception ignored) {
        }

        return msg;
    }

    // ── Files ──

    public String uploadChatFile(MinioClient client, String bucket, String convId,
                                  String fileName, byte[] data) throws Exception {
        String msgId = UUID.randomUUID().toString();
        String s3Key = PREFIX + "/files/" + convId + "/" + msgId + "_" + fileName;
        minioService.uploadFile(client, bucket, s3Key,
                new ByteArrayInputStream(data), data.length,
                URLConnection.guessContentTypeFromName(fileName));
        return s3Key;
    }

    public String sendCloudFile(MinioClient client, String bucket, String convId,
                                 String vfsPath, String fileName) throws Exception {
        String msgId = UUID.randomUUID().toString();
        String s3Key = PREFIX + "/files/" + convId + "/" + msgId + "_" + fileName;
        minioService.copyObject(client, bucket, "vfs/" + vfsPath.replaceAll("^/", ""), s3Key);
        return s3Key;
    }

    public byte[] downloadChatFile(MinioClient client, String bucket, String s3Key) throws Exception {
        return minioService.downloadFile(client, bucket, s3Key);
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
        return switch (msgType) {
            case "image" -> "[图片]";
            case "file" -> "[文件] " + (fileName != null ? fileName : "");
            case "emoji" -> content != null ? content : "";
            default -> content != null ? content : "";
        };
    }
}
