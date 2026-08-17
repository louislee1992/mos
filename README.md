# MOS

## minio配置

### mc配置服务别名

```bash
# 查看别名
mc alias list 
# 使用 mc alias set 命令为 local 别名填入你的 MinIO 管理员账号密码
mc alias set local http://localhost:9000 <你的AccessKey> <你的SecretKey>
```


### 设置策略

将以下策略保存到my-policy.json文件中，并使用mc命令行工具将策略添加到MinIO中。
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:CreateBucket"
      ],
      "Resource": "arn:aws:s3:::${aws:username}-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${aws:username}-*/*"
    }
  ]
}
```
```bash
# readWriteSelf是策略名称，my-policy.json是策略文件路径
mc admin policy create local readWriteSelf ./my-policy.json
```


### mc配置组并添加策略
```bash
# 创建组readWriteSelfGroup是组名
mc admin group add local readWriteSelfGroup
# 为组分配策略readWriteSelf
mc admin policy attach local readWriteSelf --group=readWriteSelfGroup
```

### 创建用户并添加到组
```bash
# 创建用户
mc admin user add local test 12345678
# 添加用户到组
mc admin group add local readWriteSelfGroup test

```

### 其他mc命令

```bash
# 查看组信息
mc admin group info local readWriteSelfGroup
# 将用户移出组
mc admin group remove local readWriteSelfGroup test
```

