# B 站 UP 主视频下载 · DSH 插件

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的 B 站下载插件：在左侧栏加入「B 站下载」面板，输入 UP 主 UID 批量下载其主页全部视频，或粘贴链接下载单个视频；可指定清晰度与保存目录。同一套能力也注册为 Agent 工具，可以直接在对话里让助手下载。

- 无需单独安装 ffmpeg：首次需要 DASH 合并时会自动下载并校验（Windows x64），也可以手动指定已有路径。
- 同名不同视频不会互相覆盖：第二个起自动追加 `[BV号]`。
- 支持断点续传、跳过已存在文件、覆盖重下、多 P 视频、按链接下载。

## 安装

**方式一：本地目录（开发/自用）**

在 DSH 的「插件」页添加本地目录，或让助手执行 `plugin_manager` 的 `install_bundle`，目标填本仓库的绝对路径。安装后左侧栏出现「B 站下载」。

**方式二：npm（发布后）**

```bash
npm publish --access public        # 见下方「发布」
```

然后在 DSH 中按插件安装流程用安装规格安装，例如 `dsh-bilibili-downloader@1.0.0`（也可带 scope）。插件安装后同样出现在左侧栏，无需重启浏览器；若面板没有立即更新，刷新一次页面。

**环境**：DSH 0.2.2-rc.5，Windows x64 上验证通过（面板与工具）。macOS/Linux 可运行，但「打开文件夹」与 ffmpeg 自动下载目前只针对 Windows 做了适配，其他平台请在设置里填写 ffmpeg 路径。

## 使用

1. 左侧栏点「B 站下载」。先在「登录 Cookie」里粘贴 `bilibili.com` 的 **SESSDATA**（只贴值也可以，会自动补成 `SESSDATA=...`），点「保存」。B 站只对登录请求返回 UP 主视频列表，这一步是读取列表的前提。
2. 选「清晰度」「下载通道」「保存目录」。文件保存到 `<保存目录>/<UP 主昵称>/`。
3. 卡片右上角切换 **按 UP 主 / 按链接**：
   - 按 UP 主：填 UID →「查询」确认昵称、视频数与最新视频可用清晰度 → 可选「最多下载」→「开始下载」；
   - 按链接：粘贴 `bilibili.com` 链接、`b23.tv` 短链、BV 号或 av 号 →「下载这个视频」。
   两种模式共用同一套清晰度、通道、保存目录与「覆盖已存在文件」设置。
4. 进度、失败原因、实际清晰度都在面板里；「打开文件夹」会新开资源管理器窗口并选中最新文件（窗口若在后面，用 Alt+Tab）。

### 清晰度与通道

| 清晰度 | 说明 |
| --- | --- |
| 8K / 4K / 1080P 60 帧 | 需要大会员，且必须走 DASH（需要 ffmpeg） |
| 1080P | 必须走 DASH（需要 ffmpeg）；单文件 MP4 通道最高 720P |
| 720P / 480P / 360P | 单文件通道即可 |

- **自动**（推荐）：有 ffmpeg 时用 DASH 分别下载音视频再本地合并，否则退回单文件 MP4。
- **单文件 MP4**：无需 ffmpeg，最高 720P。
- **DASH 合并**：1080P 及以上的唯一通道。

面板会显示每个视频**实际拿到**的清晰度；请求高于实际时会提示原因（通道上限、账号等级或视频本身没有更高画质）。

### ffmpeg

- 首次在「自动/DASH」下开始下载时，若找不到 ffmpeg，会自动从 npm 镜像下载固定的静态构建（约 22 MB，解压后 64 MB），校验大小与 SHA-256 后放到 `<DSH_HOME>/bilibili-downloader/bin/ffmpeg.exe`。也可以在设置里点「一键下载 ffmpeg」。
- 已有 ffmpeg 时可在设置里填路径，或放进 `PATH`；查找顺序：设置 → `FFMPEG_PATH` → `PATH` → 插件数据目录 → 包内 `vendor/` → WinGet/Scoop/Chocolatey 常见位置。
- 想把 ffmpeg 一起打包分发：`npm run fetch:ffmpeg` 会把它放到 `vendor/`，插件会优先使用它。**分发 FFmpeg 二进制需要遵守其 GPL/LGPL 许可**，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## Agent 工具

| 工具 | 用途 |
| --- | --- |
| `bilibili_download_videos` | 按 UID 下载 UP 主全部视频（可限定数量、清晰度、目录、是否覆盖） |
| `bilibili_download_video` | 按链接 / BV 号 / av 号下载单个视频 |
| `bilibili_download_status` | 查看任务进度（不传 id 看最近一个） |
| `bilibili_open_download_folder` | 在文件管理器里打开下载目录 |

## 数据与隐私

- 网络访问：`bilibili.com` 的接口与视频 CDN；自动安装 ffmpeg 时访问 `registry.npmmirror.com` / `registry.npmjs.org`。
- Cookie 保存在 DSH 凭据服务（`credentials` 记录 `bilibili-downloader`），不写入插件配置文件；没有凭据服务时退回 `settings.json`。也可用环境变量 `BILIBILI_SESSDATA`。
- 设置保存在 `<DSH_HOME>/bilibili-downloader/settings.json`；只保存在本机。
- 任务状态在内存中，DSH 重启后不恢复；已下载文件会跳过，可勾选「覆盖」重下。

## 开发

无需构建：`index.js` 是 Host 端（B 站接口、下载引擎、HTTP 路由、Agent 工具），`client.js` 是浏览器面板（`window.__ModuleLoader__.load` 格式），`cordis.patch.yml` 声明插件行，`locale/*.json` 提供插件页标题/描述。

```bash
node --check index.js
node --check client.js
```

目录内文件即为运行代码，改完后需要在 DSH 里重新加载插件（插件页关闭再开启）并刷新页面。

## 发布到 npm

改好包名（未占用可直接用 `dsh-bilibili-downloader`；否则用 `@你的名字/dsh-bilibili-downloader`，并同步修改 `cordis.patch.yml` 里的 `name` 与 `client.js` 里的模块 `id`）后：

```bash
npm login
npm publish --access public
```

发布前建议补上 `repository` / `homepage` 字段，并在 GitHub 上提供 README、LICENSE 与 THIRD_PARTY_NOTICES.md。

## 许可

插件代码以 [MIT](LICENSE) 发布。它会在运行时获取 FFmpeg（GPL/LGPL），FFmpeg 版权与许可归 FFmpeg 项目所有，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。与 B 站无隶属关系，请遵守 B 站服务条款与著作权法。
