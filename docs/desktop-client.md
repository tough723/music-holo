# Music Holo Electron 桌面客户端（0.1 基础接入）

## 当前交付范围

主路线为 **Electron 桌面客户端 + 现有 Vue 界面 + 原 Spring Boot 业务后端**。网页继续存在，网页端不会因为新增桌面客户端而获得本机权限或绕过浏览器 CORS。

本轮实现的是桌面音源运行与播放接入基础，不是 LX 全功能移植，也不是已验收的第三方音乐聚合发行版。

| 能力 | 本轮状态 |
| --- | --- |
| 加载打包的 Vue 界面，独立本机存储、账号登录、原曲库与播放器 | 已接入；桌面用 hash 路由，页面由 `app://music-holo/` 提供 |
| 音源文件导入、备份、能力检测、手动传入 musicInfo 解析试听 | 桌面默认进入免登录本机音源工作台，无需业务后端；脚本导入不会执行 |
| HTTPS URL 下载源脚本 | 桌面原生请求，先原生窗口授权；仍有 128 KB 文件限制 |
| `lx.request` 桌面网络桥 | 受控 HTTP(S) 请求，不依赖浏览器 CORS；独立于账号 API 通道 |
| 播放与封面 | 显式授权后签发临时媒体票据，经 `app://music-holo/__source_media/<随机票据>` 流式加载；支持单段 Range |
| 音源持久化 | 脚本按账号存于 Electron 的页面本机存储，不上传 Spring Boot |
| 第三方平台搜索、榜单、歌词封面 | **已接入宿主平台适配器**（`src/utils/sourceCatalog/`，与音源脚本解耦）：wy 搜索/榜单/歌词封面、kw/kg/mg 搜索已实测；tx 未实测（疑需 Referer，受控桥禁止）、qs 未接入；不猜平台 ID，见 [星海验证记录](xinghai-validation.md) |
| 星海源 wy + 320k 全流程 | **真实接口已验证**：搜索/榜单取真实 ID → 后端与 GD 双通道解析 → 歌词封面补齐；**实际出声播放仍待联网客户端验收**。其余平台/音质部分实测、部分第三方故障，见 [星海验证记录](xinghai-validation.md) |
| 签名安装包、自动更新、原生手机端 | **未实现/未发布**；仅提供桌面打包配置 |

## 开发环境运行

需要 Node.js **22.12 或更高版本**、npm，以及可运行 Electron 的桌面系统。Linux 需要相应图形库与可用的 Chromium 沙箱；不要用 `--no-sandbox` 规避部署问题。

在仓库根目录安装：

```sh
npm ci --prefix music-holo-web
npm ci --prefix music-holo-desktop
```

安装 Electron 会从其发行站下载运行文件，需要网络可达。仅 `npm ci --ignore-scripts` 不代表 Electron 已安装完整。

### 先使用本机音源（无需后端或账号）

```sh
cd music-holo-desktop
npm run build:web
npm start
```

启动后默认进入「本机音源工作台」。访客可以导入、检测脚本并填写平台曲目信息试听，不请求业务 API，也不需要演示账号。脚本保存在本机访客源库；登录后切换到独立账号源库，不自动迁移。可以通过导出/导入备份显式迁移。音源自己的网络接口仍需联网，所谓“无需后端”不表示音乐能离线获取。

网页登录设置、收藏、歌单和管理员权限不受此入口影响；网页版无法进入 `/sources` 工作台。

### 无后端的完整界面演示（可选）

```sh
cd music-holo-desktop
npm run build:demo
npm start
```

演示构建使用现有 Mock API，可使用 `demo / 123456` 登录，进入设置 → 自定义源。Mock 数据不代表第三方音乐平台数据。此模式只用于开发，不用于发布。

### 连接真正的 Spring Boot 后端

先按主 README 启动 MySQL、Redis 与 `music-holo-server`。然后：

```sh
cd music-holo-desktop
npm run build:web
npm start
```

默认业务后端为 `http://127.0.0.1:8080`。也可以在启动前设置由部署者控制的服务源（**不带路径、账号或密码**）：

```sh
# macOS / Linux
MUSIC_HOLO_BACKEND=https://your-backend.example.com npm start
```

```powershell
# Windows PowerShell
$env:MUSIC_HOLO_BACKEND = 'https://your-backend.example.com'
npm start
```

`your-backend.example.com` 是占位地址，必须换成真实服务。远程后端要求 HTTPS，本机回环可用 HTTP。桌面将 `/api/*` 转到配置后端的 `/*`，`/profile/*` 保留路径转发；现有账号令牌只进入业务 API。源网络桥拒绝业务后端主机名，也不会接收其 Cookie 或令牌。

这一版没有面向普通用户的后端配置向导；使用账号和站内曲库时，部署者仍需提供可用的业务后端，或以演示构建验收；本机音源工作台无需配置后端。桌面包并不自带 MySQL、Redis 或 Spring Boot。

## 如何导入用户提供的音源

1. 打开客户端进入「本机音源工作台」（无需登录），选择本机 `.js/.mjs`，或粘贴 HTTPS 脚本链接。已有账号也可以登录后从设置 → 自定义源进入。
2. URL 导入会显示原生域名授权窗口；拒绝则不下载，不自动执行下载到的脚本。
3. 点击隔离兼容检测并确认信任；脚本通过 `globalThis.lx` 注册能力。
4. 首次请求某个 HTTP(S) 来源时出现原生授权窗口。域名授权只属于本次音源会话；HTTP 会标记明文风险。
5. 打开试听台，填写脚本所需的 `musicInfo`（例如正确的平台 `songmid`/`hash`），选择平台、音质，再解析。
6. 解析成功后确认媒体来源，交给全局播放器。曲目与临时媒体票据不进入服务端历史和持久播放队列。

也可在原曲库歌曲列表选择「使用自定义源播放」，但原曲库 ID **不能自动当作第三方平台 ID**。需要的平台字段必须来自真实平台元数据，不猜 ID。

可以先用 [`examples/lx-custom-source/music-holo-local.js`](../examples/lx-custom-source/music-holo-local.js) 和自己的授权 HTTPS 音频测试。其字段说明见 [源脚本指南](lx-custom-source-guide.md)。

## 运行与安全边界

```text
打包 Vue 主页面（无 Node，contextIsolation + sandbox + webSecurity）
    ├─ 原业务 API → 固定配置的 Spring Boot 服务
    └─ 沙箱 iframe → 一次性 Worker → lx.request 消息
          ↓ 仅主页面可调用的窄 IPC
        主进程会话、原生域名确认、DNS 校验、受限网络请求
          ↓
        第三方接口 / 已授权的临时媒体流
```

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`。不开启 webview；阻止应用窗口外部导航及新窗口，不提供 shell/文件/任意 IPC API。
- preload 只向主 frame 暴露窄接口；主进程再次核对窗口、frame 身份和固定应用 URL。Worker 无 preload、require、process、DOM、页面存储；其 CSP 禁止直接联网。`new Function` 仅在一次性 Worker 内使用，不在主进程或业务页面执行源脚本。
- 顶层 CSP 的 `unsafe-eval`/`unsafe-inline` 用于当前继承 CSP 的 srcdoc/Worker 引导，并不等于允许脚本直接联网；这不是强 CPU/内存配额沙箱。恶意 Worker 仍可能消耗渲染进程资源，**只运行可信脚本**，需要保持 Electron 更新。
- 源请求只支持 GET/POST/HEAD、HTTP(S) 标准端口 80/443。拒绝 URL 凭据、IP 直连、本地名称和业务后端主机；解析 IPv4，拒绝非公网及混合 DNS 答案，将校验通过的 IP 固定到 socket，避免二次解析的 DNS 重绑定。IPv6-only 主机当前不支持。
- 不跟随任何重定向。需要重定向的接口/CDN 会失败，必须提供最终地址；不静默改写协议或放宽内网限制。
- 不共享 Cookie、账号登录头、代理授权、连接池或网络缓存；保留受限的自定义普通请求头。不支持 multipart `formData`，支持 `form`、文本/JSON/二进制 body。传输层返回 UTF-8 文本，下载脚本不会被解析或执行；桌面 Worker 的 `lx.request` 回调会先尝试 JSON.parse，失败则保留文本，回调第三参数与 `resp.body` 一致。支持 gzip/deflate/br 接口响应，压缩前后均限制 512 KB，拒绝损坏或未知压缩格式。网页回调仍保留原文本行为。`on/send` 返回 Promise。
- 8 个源会话上限、每会话最多 16 个来源、全窗口 4 个源网络请求并发；请求体 64 KB、响应 512 KB；网络总时限最多 15 秒。桌面脚本初始化 60 秒、action 默认 90 秒、会话 10 分钟，关闭/取消/超时中止网络并清理会话。最后一个等待者取消时会关闭原生授权窗口并释放并发名额；共享窗口不会因其中一个等待者取消而误关。
- 媒体票据仅存在主进程内存，一窗口最多 256 个，最多 8 个媒体流；流上限 1 GB / 2 小时，首连 15 秒。只转发 Range，不转发 Cookie/登录头，不跟随重定向，不开放任意 URL 代理。刷新、关闭窗口即撤销票据并中止流；票据不落盘。Range 会拒绝空范围、反向范围、超大数值及多段范围；媒体拒绝 SVG/HTML 等主动文档，并加上 sandbox CSP。
- 未实现完整 LX 加密 API：沿用 Web Worker 工具子集，RSA 未开放，AES/zlib 行为不能视为完全等同 LX。`env: desktop` 只表示桌面宿主，不代表全量兼容认证；扩展平台/音质可以展示，不代表播放器有对应编解码能力。
- 更新提示事件不会触发自动下载或执行。脚本可以发起更新/IP 请求，但仍受同样的原生域名授权限制。

## 构建与打包

```sh
cd music-holo-desktop
npm run pack   # 重建生产网页，生成当前系统的未安装应用目录
npm run dist   # 重建生产网页，按当前系统生成 AppImage / NSIS / DMG
```

输出在被 Git 忽略的 `music-holo-desktop/release/`。不同系统应在相应系统构建并验收；当前没有代码签名证书、自动发布和自动更新，不应声称已有可供公众安装的正式发行包。依赖锁定在 `package-lock.json`；开发依赖 `global-agent` 覆盖到 4.1.3，避免旧依赖链的审计问题，Linux 目录打包已通过下述 CI；Windows/macOS 及签名发行仍待验收。

## 验证与后续验收

```sh
npm test --prefix music-holo-desktop
npm test --prefix music-holo-web
node --test examples/lx-custom-source/music-holo-local.test.cjs
npm run build:web --prefix music-holo-desktop
npm run test:smoke --prefix music-holo-desktop
```

Linux 无显示器时最后一步使用 `xvfb-run -a npm run test:smoke --prefix music-holo-desktop`。

桌面单元测试覆盖 IPC sender、URL/DNS/请求限制、域名授权、取消与超时、拒绝重定向、媒体票据/Range/刷新撤销以及业务 API 通道隔离。Electron smoke 使用生产网页构建、真实窗口，并显式设置 `chromiumSandbox: true`，额外断言不存在 `--no-sandbox`（Playwright 在 Linux 下默认会添加该参数，不能只检查窗口 preferences）。测试代码通过调试通道模拟第三方网络及原生确认，拒绝任何业务后端请求，验证访客导入/解析/媒体播放、Range、拒绝授权、脚本持久化与刷新票据撤销；应用本身没有测试旁路。新增 `.github/workflows/desktop.yml` 会运行测试、smoke 与目录打包。

**已验证**：桌面 37 项单元测试（含新增源脚本验证工具回归）、前端 120 项测试和生产构建通过。上一轮 CI（[桌面 run 37965363398](https://github.com/tough723/music-holo/actions/runs/37965363398)、[原项目 run 37965363418](https://github.com/tough723/music-holo/actions/runs/37965363418)）使用的是**模拟音源服务**，不代表真实接口可用。2026-10-10 起对用户提供的星海脚本完成静态检查、隔离契约验证与真实接口实测（星海后端、GD、网易榜单、酷狗/酷我/咪咕搜索均实测；wy+320k 解析双通道成功），并新增宿主平台搜索/榜单适配器；真实接口结果、客户端兼容修复与第三方服务故障的逐项记录见 **[星海音源脚本验证与真实接口测试记录](xinghai-validation.md)**。模拟测试通过 ≠ 真实服务可用；实际出声播放、tx/qs 平台与多系统人工验收仍未完成。

下一阶段：联网客户端的实际播放与后台播放人工验收，tx 搜索（Referer 约束下）与 qs 接入评估，酷狗解析第三方故障跟踪，Windows/macOS 人工验收、安装包签名及升级验收。

### 星海脚本验证摘录（2026-10-10）

静态阅读与隔离执行确认：脚本只实现 `musicUrl/lyric/pic`（无搜索/榜单），初始化后立即联网（ip/版本检查），平台 ID 主键为 `musicInfo.hash ?? songmid ?? id`，歌词/封面只在解析成功后的会话缓存中出现（GD 分支不带歌词封面），`X-Token` 是脚本自生成的设备信息而非登录令牌，`env.platform` 在官方字符串 `env` 下不可用（X-Client 显示 `(unknown)`，不为单个脚本伪造 env 对象）。新增工具 `music-holo-desktop/scripts/validate-source-script.cjs` 可对任意操作者提供的脚本做同类验证（离线夹具/在线实测），不把第三方脚本复制进仓库。详细结论与真实接口测试数据见 [星海验证记录](xinghai-validation.md)。
