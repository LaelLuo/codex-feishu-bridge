# Decisions

- 暂无。
## 2026-03-21

- 公开文档统一补充三个事实：`FEISHU_DEFAULT_CHAT_ID` / `FEISHU_DEFAULT_CHAT_NAME` 只决定主动新建飞书话题的默认落点；私聊可直接发送普通文本；群聊需要 `@` 机器人，且飞书常以 `post` 富文本投递，bridge 会提取可见正文。
