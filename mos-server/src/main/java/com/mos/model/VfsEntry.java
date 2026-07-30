package com.mos.model;

import lombok.Data;

@Data
public class VfsEntry {
    private String name;
    private String path;
    private String type;
    private long size;
    private String lastModified;
}
