# codex-feishu-bridge

`codex-feishu-bridge` 用来把同一个任务同时接到桌面端 VSCode 和手机端飞书上。
你可以在电脑上启动和接管任务，也可以在离开工位后继续在手机上看进度、收回复、处理审批。

英文版说明保留在 [docs/README.en.md](./docs/README.en.md)。

## 你可以这样用

- 在飞书里发第一条消息，创建任务
- 在 VSCode 里打开监视器，查看会话、审批和 diff
- 离开工位前，把主机上正在跑的任务同步到飞书，之后在手机上继续监工

## 最快开始

### 1. 填最少配置

先打开：

```bash
docker/.env
```

至少填这 3 项：

```env
FEISHU_APP_ID=你的 App ID
FEISHU_APP_SECRET=你的 App Secret
FEISHU_DEFAULT_CHAT_NAME=你的飞书群名
```

前两项来自飞书开放平台的应用后台，最后一项填你要接收消息的那个飞书群名。

如果你已经知道群 ID，也可以改成：

```env
FEISHU_DEFAULT_CHAT_ID=oc_xxx
```

另外只要确认两件事：

- 机器人已经加入目标飞书群
- 飞书后台已经开启 long-connection 的 `im.message.receive_v1` 和 `card.action.trigger`

### 2. 一键启动

运行：

```bash
./scripts/dev-stack.sh up
```

如果你更习惯用 npm 命令，也可以运行：

```bash
npm run start:all
```

启动完成后，看到 `ready` 和 `http://127.0.0.1:8787/health` 就可以了。

### 3. 一键在 VSCode 里使用

1. 用 VSCode 打开这个仓库
2. 直接按 `F5`
3. 会自动弹出一个新的 VSCode 窗口
4. 在新窗口里运行命令 `Codex Bridge: Open Monitor`

### 4. 开始在飞书里用

1. 在目标飞书群里发第一条普通文本
2. bridge 会回复一张配置卡片
3. 在卡片里点 `Create Task`
4. 之后继续在同一线程里聊天、看回复、处理审批

## 离开工位时怎么用

如果任务已经在主机上跑着，但你准备离开工位：

1. 打开 VSCode 监视器
2. 先点 `Refresh`
3. 如果任务还没出现，再点 `Import Recent Host Threads`
4. 把任务同步到 bridge / Feishu
5. 之后在手机上继续看进度、收回复、处理审批
6. 回到工位后，再在 VSCode 里接管同一条任务

常用配套命令：

```bash
npm run status:all
npm run logs:all
npm run stop:all
```

## VSCode 图形化监视器

这是桌面端的主页面。你通常会在这里：

- 看任务列表和 `FEISHU`、`VSCODE`、`CLI` 标签
- 查看会话、审批和 diff
- 在底部输入框继续发消息
- 对本地任务做导入、忘记、删除等操作

## 飞书使用方式

推荐路径很简单：

1. 在飞书里发第一条普通文本
2. 收到卡片后点击 `Create Task`
3. 之后继续在同一线程里聊天、看回复、处理审批

如果群里没有反应，优先检查：

- 机器人是否已经加入目标群
- `docker/.env` 里的群名或群 ID 是否正确
- 飞书后台是否已经开启 `im.message.receive_v1` 和 `card.action.trigger`

## 更多说明

- [产品说明](./docs/prd.md)
- [架构说明](./docs/architecture.md)
- [English README](./docs/README.en.md)
