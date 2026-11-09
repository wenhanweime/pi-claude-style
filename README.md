# Pi Claude Style

一条命令，把 Pi 装扮成暖橙色的 Claude Code 风格。

完整包含主题、消息与 diff 渲染、舒适输入框、两行状态栏，以及自动备份和合并 Pi 设置的安装器。适合在另一台电脑复刻相同 UI。

## 一键安装

需要 Node.js **22.19.0+**、npm、curl 和 tar。macOS / Linux 可直接执行：

```sh
curl -fsSL https://raw.githubusercontent.com/wenhanweime/pi-claude-style/v0.2.0/install.sh | sh
```

安装完成后重启 Pi。没有安装 Pi 时，安装器会安装 `@earendil-works/pi-coding-agent@1.5.0`；已有 Pi 则检查兼容版本，不自动降级。当前支持 **Pi 1.5.x**，实际验证版本为 **1.5.0**。不支持的版本会停止并说明原因。

如希望先查看源码：

```sh
git clone --branch v0.2.0 --depth 1 https://github.com/wenhanweime/pi-claude-style.git
cd pi-claude-style
node scripts/setup.mjs install
```

Windows 请在 WSL 中使用上面的安装命令。原生 Windows 安装暂未验证。

## 从旧版升级

先将 Pi 升到固定版本，再运行同一条新版安装命令：

```sh
npm install --global @earendil-works/pi-coding-agent@1.5.0
curl -fsSL https://raw.githubusercontent.com/wenhanweime/pi-claude-style/v0.2.0/install.sh | sh
```

不需要先卸载 0.1.x。保留旧 Pi 0.84.x 的用户请继续使用样式包 v0.1.2；v0.2.0 面向 Pi 1.5.x，不会替换不兼容的现有 Pi。

## 包含什么

| 组件 | 实现 |
|---|---|
| 主题 | `claude-warm`，包含完整 Pi 主题字段与 HTML 导出配色 |
| 消息、工具、Markdown、diff | `pi-cc-extensions@1.0.16` |
| 输入框、交互面板 | 基于 `pi-comfy-ui@0.3.1` 的内置 1.5 兼容模块 |
| 两行状态栏 | 从 `@adrianapan/pikit@1.1.8` 提取的 footer，保留 MIT 归属，仅加载此模块 |
| 设置 | `quietStartup: true`、`clearOnStart: true`、`editorPaddingX: 1` |
| diff | 自动布局、色条指示、自动换行，折叠编辑 24 行、展开预览 40 行 |

依赖使用固定版本和 `package-lock.json`，安装时使用 `npm ci`。通过单一扩展入口按 **CC → Comfy → footer** 顺序加载，不启用 Pikit 的其他功能。CC 包自身附带的 `/ccstyle`、上下文和会话引用等功能仍属于该依赖。CC 1.x 新增的输入框前缀与自带 footer 在本预设中关闭，由 Comfy 和内置 footer 分别拥有对应槽位。旧 `claude-code-style.json` 的自定义选项会合并到新文件，原文件保留，避免依赖在导入时删除旧配置。

状态栏展示模型、路径、Git 分支与工作区状态、上下文占用、thinking 等级、token 和费用。使用 Unicode 字符，无需 Nerd Font。费用来自模型报告，是否准确取决于模型供应商配置。

## 配色

| 用途 | 颜色 |
|---|---|
| 主色 | `#D77757` 暖橙色 |
| 浅主色 / diff 删除 | `#EB9F7F` |
| 正文 / 次要文字 | `#FFFFFF` / `#999999` |
| 用户消息背景 | `#373737` |
| 输入与操作区域 | `#2C323E` |
| 工具背景 | `#2E2E2E` |
| 选中背景 | `#3E3E3E` |
| 链接 | `#7AB4E8` |
| diff 新增 | `#7FD884` |

完整颜色定义见 [`themes/claude-warm.json`](themes/claude-warm.json)。终端整体背景沿用终端自身配置，推荐暗色背景、真彩色终端。

## 设置与备份

默认配置根目录是 `~/.pi/agent`，支持 `PI_CODING_AGENT_DIR`。安装器写入：

- `settings.json`：合并上述 UI 设置，注册一个本地样式包路径。
- `configs/footer.json`：合并模型和 high thinking 的暖橙色。
- `pi-cc-extensions.json`：合并固定的消息/diff 样式设置。
- `styles/pi-claude-style/0.2.0/`：固定版本的运行代码和依赖。
- `styles/pi-claude-style/backups/<timestamp>/`：修改前的配置备份。

模型、认证、权限、工具、MCP 和其他不相关设置保持原值。安装包不包含任何源机凭据、provider、会话、技能或宿主集成。

安装器会从 `settings.packages` 移除独立安装的 CC、Comfy 和完整 Pikit 条目，改由此包统一加载；卸载时恢复。检测到常见的 `extensions/pikit-lite.ts` footer 适配器时，暂存到备份目录，卸载时恢复。任意自定义 fork、其他本地输入框/状态栏扩展和项目级 `.pi` 覆盖配置不能自动识别；若界面被覆盖，请用 `/config` 检查重复扩展。

重复执行同一版本不会覆盖第一次备份，也不会反复改写配置。再次运行新版安装命令即可从 0.1.x 原地升级；保留首次备份、安装后新增的插件和手动修改的 UI 字段，卸载仍可恢复首次安装前的设置。安装期间请关闭 Pi，避免已有进程同时保存设置；使用的是原子文件替换和安装锁。

## 卸载与恢复

```sh
curl -fsSL https://raw.githubusercontent.com/wenhanweime/pi-claude-style/v0.2.0/install.sh | sh -s -- uninstall
```

也可执行本地安装副本：

```sh
node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/styles/pi-claude-style/0.2.0/scripts/setup.mjs" uninstall
```

重启 Pi 后生效。卸载移除样式包注册，并恢复仍与预设相同的 UI 字段；安装后手动修改过的字段与新加入的插件会保留并提示。备份与运行代码保留在磁盘，方便恢复和检查。

## 原生 Pi 包安装（手动设置）

```sh
pi install git:github.com/wenhanweime/pi-claude-style@v0.2.0
```

这条命令只注册扩展和主题资源，不自动应用 UI 设置。需要手动选择 `claude-warm` 并合并 [`preset/ui.json`](preset/ui.json) 中的设置；已有 CC、Comfy 或 footer 要先禁用以免重复。推荐使用上面的一键安装器。

## 开发验证

```sh
npm ci --legacy-peer-deps
npm test
# 已全局安装 Pi 1.5.0 时：
node scripts/smoke.mjs
python3 scripts/tui-smoke.py
```

配置测试使用隔离临时目录，覆盖备份、非 UI 设置保留、重复安装、插件去重、无效 JSON、卸载恢复和后续用户修改。smoke 通过 Pi 的真实扩展加载器及主题 schema 检查组合扩展和主题；PTY 测试启动真实 Pi，验证暖橙强调色、Comfy 背景与 footer，且无输入框冲突。测试不发送模型请求。GitHub Actions 在 Linux、macOS 的 Node 22 上执行这些检查。

## 开源与致谢

MIT。第三方归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。感谢 [Pi](https://github.com/earendil-works/pi)、[pi-cc-extensions](https://github.com/minuque/pi-cc-extensions)、[pi-comfy-ui](https://github.com/adanft/pi-comfy-ui) 和 [Pikit](https://github.com/adrianapan/pikit)。这是独立社区预设，名称描述视觉风格，不代表 Anthropic 官方产品。
