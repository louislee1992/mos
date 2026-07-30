package com.mos.model;

import lombok.Data;

@Data
public class TrashEntry {
    private String name;
    private String originalPath;
    private String trashPath;
    private String type;
    private long size;
    private long deletedAt;
}
