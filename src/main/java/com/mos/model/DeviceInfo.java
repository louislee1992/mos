package com.mos.model;

import lombok.Data;

@Data
public class DeviceInfo {
    private String osName;
    private String osVersion;
    private String hostname;
    private String localIp;
}
