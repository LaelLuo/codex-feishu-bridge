# Decisions

- 暂无。
- 2026-03-20T04:16:52.571Z [agent] 根因不仅是脚本当前包含 CRLF，还包括 Windows 下 core.autocrlf=true 会在未来签出时把 .sh 再次转回 CRLF，因此新增 .gitattributes 强制 *.sh 使用 LF。
