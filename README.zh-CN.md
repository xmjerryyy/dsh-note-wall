# dsh-note-wall · 便签墙

[English](README.md) | **简体中文**

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web GUI 加一面便签墙：
左侧栏一个图标，一页纸给你那些不想弄丢的念头。

便签就是你自己磁盘上的普通 JSON。不要账号、不同步、不联网。

## 它做什么

- **左侧栏入口。** 便签图标和内置面板并排待在左栏，点一下主区域就切到便签墙。
- **一面便签墙。** 卡片按自适应网格铺开，每张有自己的颜色、时间和操作按钮。
- **快速记一条。** 点「新便签」，写完按 `Ctrl + Enter` 存下（`Esc` 取消）。
- **让墙一直好用。** 置顶、改色（6 种）、编辑、删除、搜索、只看置顶，以及需要二次确认的清空。
- **给 agent 的工具。** 宿主半还注册了 `note_wall` 工具，所以你可以直接让模型读写这面墙
  （「把这句记到便签墙上」）。

## 便签存在哪

```
<DSH_HOME>/note-wall/notes.json
```

- 单个 JSON 文档，原子写入（临时文件 + `rename`），写到一半崩溃也不会截断。
- 文件坏了不会让面板打不开：字节会被挪到 `notes.json.corrupt-<时间戳>` 留证，
  墙从空状态开始，而不是每次打开都抛错。
- 上限 2000 条、单条 10000 字。
- **删插件、升级插件都不会碰你的便签。** 卸载插件，文件还在。

## 安装

这是一个纯 bundle——两个 JS 文件，没有构建步骤。

```powershell
# 通过插件管理器
#   action: install_bundle
#   target: 本目录的绝对路径
```

装完 **重启一次 DSH**。浏览器半会通过 HMR 立刻激活，但宿主半（路由 + 工具）是 Node 模块，
运行中的进程会继续用它已经加载的那份。

之后改 `client.js` 只要刷新页面；改 `index.js` 还要再重启一次。

### 依赖

- 带 Web GUI 的 DeepSeek Harness（`@deepseek-ai/dsh-web-app`）。
- 宿主服务 `connection` 与 `tools`——默认的 `dsh-base` / `dsh-web-app` 组合里都自带。

## 两侧怎么通信

没有新造存储服务，也没有往会话事件里塞东西。浏览器半用宿主自己的连接方言调宿主半，
和 `dsh-context`、`dsh-opencode-palette` 是同一套：

```js
connection.rpc.call('/api', 'dsh-note-wall', { method, payload })
```

宿主半用一条精确路由接住：

```js
connection.fetch.register({
  path: '/api/dsh-note-wall',
  methods: ['POST'],
  requestBody: 'buffered',
  fetch: routeFetch,
})
```

回 `{ type: 'server-response', rpcId, result }`。

只有一份真源。浏览器里不留本地副本，所以刷新、开第二个标签页、agent 改便签，看到的是同一份。

## 文件

| 文件 | 是什么 |
|---|---|
| `index.js` | 宿主半：精确路由、`note_wall` 工具、原子落盘 |
| `client.js` | 浏览器半：侧栏图标与便签墙页面 |
| `cordis.patch.yml` | bundle 补丁，插入插件行 |
| `package.json` | 清单，含 `dsh.client` 声明 |
| `locale/en.json`、`locale/zh.json` | 插件管理页显示的标题与描述 |
| `icon.svg` | 原创图标 |

### 样式

样式表只用 `--dsw-alias-*` 主题 token。卡片底色是 `color-mix` 叠在 `bg-layer-1` 上，
浅色和深色主题都不用另配一套色板。所有类名带 `nw-` 前缀，布局对齐宿主自己的管理页
（100% 高度的滚动根、layer-1 卡片、13px 正文）。

## 验证到哪一步

- **宿主半。** 三种宿主形态下共 23 条断言：正常的、注入服务探测会竞态返回 `undefined` 的、
  以及完全没有 Fetch 载体的。覆盖路由注册、工具注册、增删改查与置顶改色、只改置顶不丢正文、
  超长输入截断、未知方法拒绝、落盘、坏文件恢复、卸载清理。
- **浏览器半。** bundle 按 shell 的模块加载契约求值，并用 `react-dom/server` 渲染：
  两个槽位都注册成功、图标是真的 `<svg>`、卡片带着各自底色渲染出来、
  markup 里用到的每个 class 都存在于样式表中。
- **实际运行。** 路由应答并把一条真实便签写进了磁盘；两个槽位
  （`sidebar.panellist` 与 `main`）都显示本插件是活跃占位者。

**未验证：** 真实浏览器里的最终观感。正因如此，本仓库不放截图。

## 卸载

通过插件管理器移除 bundle，然后重启。便签仍留在 `<DSH_HOME>/note-wall/`，
想一并删掉就自己删那个目录。

## 许可

MIT —— 见 [LICENSE](LICENSE)。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
