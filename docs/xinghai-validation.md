# 星海音源脚本验证与真实接口测试记录

验证日期：**2026-10-10**。对象：用户提供的脚本 URL
`https://zrcdy.dpdns.org/lx/xinghai-music-sourcev2.3.15.js`（文件名 v2.3.15，头部 `@version v3.2.15`、`@lastUpdate 2026-10-02`、`@license 仅供学习交流，请支持正版`）。

**本仓库不内置、不分发、不自动执行该第三方脚本。** 验证工具 [`music-holo-desktop/scripts/validate-source-script.cjs`](../music-holo-desktop/scripts/validate-source-script.cjs) 由操作者传入脚本路径后在一次性隔离环境中运行；离线夹具中的媒体地址与签名一律是占位符，不含任何密钥、Cookie、登录凭据或临时访问令牌（真实解析结果里的 `authSecret`/`vuutv` 等签名参数在本文档中已脱敏）。

本文严格区分三类结论：

| 分类 | 含义 |
| --- | --- |
| **客户端兼容** | 脚本与 Music Holo 隔离 Worker / 桌面网络桥的契约问题，可由本仓库修复 |
| **第三方服务** | 请求构造正确但服务端失败/未实现，与客户端无关 |
| **环境限制** | 验证所在环境的出口网络策略或探测通道限制，**不能**据此判断服务可用性 |

---

## 1. 脚本来源核对（静态）

- 验证环境无法直连 `zrcdy.dpdns.org`（出口策略仅放行 GitHub/npm/PyPI），脚本正文经外部抓取通道获取，并与两个互相独立的 GitHub 公共镜像逐字比对：
  - [`wangshiyulin/LXmusic-source` 星海音乐源 v2.3.15.js](https://github.com/wangshiyulin/LXmusic-source/blob/main/%E6%98%9F%E6%B5%B7%E9%9F%B3%E4%B9%90%E6%BA%90%20v2.3.15.js) 与 [`child9527/software` 星海音乐源V3.2.15.js](https://github.com/child9527/software/blob/master/lxSources/guoyue2010/%E6%98%9F%E6%B5%B7%E9%9F%B3%E4%B9%90%E6%BA%90V3.2.15.js) 字节数一致（38,858）、`diff` 无差异，sha256 `807d6157e4fd7cdd05b8727efd73778b54a3b05a0b5e4c6bb28dedc0668e94e9`。
  - 与用户 URL 抓取分片抽查比对（`URL_CONFIG`、启动 IIFE、`safeParseBody`、酷我音质表、GD/后端分支等）内容一致。
- 上游文件名（v2.3.15）与头部版本（v3.2.15）不一致，是上游命名混乱；本文按头部版本 v3.2.15 记录。

## 2. 静态检查结论（客户端视角）

- **初始化**：`on(request)` 注册后 `send(inited)`，声明 6 个平台 `wy/tx/kg/kw/mg/qs` 及各自音质列表；随后**立即异步联网**（`fetchIp()` 请求 `yy.zddyr.top/ip.php`，`checkUpdate()` 并行请求主/备 `versionh2.php`）。因此初始化阶段就会出现域名授权窗口；`updateAlert` 只作提示，宿主不自动下载（既有策略保持）。
- **动作**：只实现 `musicUrl / lyric / pic`，**没有搜索或榜单能力**（协议本身也不定义搜索 action）。
- **平台曲目 ID 字段**（正确传 ID 的关键，实测映射见 §6）：
  - 主键取 `musicInfo.hash ?? musicInfo.songmid ?? musicInfo.id`；缺少则报 `缺少 songId`。
  - 聚合后端 `GET /lx/api/`：非 kg 传 `source/name/singer/songmid/interval/albumName/quality`；kg 传 `source/quality/songmid/albumId/mainHash`（及 `_types[音质].hash`）；`songmid` 取 `musicInfo.songmid || musicInfo.id`。
  - `interval`（秒）与 `albumName` 是脚本实际读取的字段名（不是 `duration`/`album`，虽然 `album` 有回退）。
- **歌词/封面**：**只**在 `musicUrl` 成功后从本次会话的 `extraCache` 读取（键同上主键）；解析前 `lyric/pic` 返回 `null`。GD 分支不返回歌词/封面 → 走 GD 的网易曲目即使解析成功，`lyric/pic` 仍为 `null`。
- **分支顺序**：wy = chksz（默认关闭，`apikey` 空）→ 聚合后端 → GD（仅 128k/320k/flac/hires）；kw = 本地直连（`mobi.s` 明文/签名渠道，可拿歌词封面）→ 后端回退；tx = chksz（关）→ 后端；kg/mg/qs = 后端。`/lx/api/` 返回 403 会全会话屏蔽聚合后端。
- **密钥状态**：`CHKSZ_CONFIG.apikey` 为空、酷我解密代理 `allowEncryptedLossless: false`——加密音质（mflac/mgg）默认不解析，不涉及密钥入库。
- **兼容细节**：脚本读 `env?.platform`（官方 `lx.env` 是字符串）→ X-Client 显示 `(unknown)`，宿主**不**为单个脚本伪造非标准 env 对象；`X-Token` 是脚本自生成的 base64 设备信息（device_id/ip/时间戳/随机数），不是本站或第三方登录令牌；使用 `Promise.any`、`URLSearchParams`、可选链等，Worker 环境均支持。
- **明文 HTTP**：酷我渠道与歌词接口走 `http://`（80 端口），桌面桥允许（带明文提示）；解析出的网易/酷我媒体直链也可能是 `http://`（实测如此）。

## 3. 隔离环境验证（客户端契约，全部通过）

工具：`node scripts/validate-source-script.cjs <脚本.js> [--live|--json]`，在 Node `vm` 中加载**真实** Worker 桥（`customSourceWorker.js`）+ 真实脚本，桌面在线模式走**真实**桌面传输策略（`transport.cjs`：公网 DNS 校验、IP 固定、拒绝重定向、512 KB 上限、15 秒总时限）。

**离线夹具模式**（响应形状取自 §4 真实探测，媒体地址/签名替换为占位符；13 项检查全部通过）：

| 检查 | 结果 |
| --- | --- |
| worker-loaded / inited-event | 6 平台声明与音质列表与静态分析一致 |
| no-search-capability | 脚本不自带搜索/榜单（宿主适配器负责，见 §7） |
| init-network | 初始化后立即 3 个请求：`ip.php` + 主/备 `versionh2.php?ver=v3.2.15` |
| platform-resolve-wy/tx/mg/qs | 经 `/lx/api/` 解析成功，平台 ID（`songmid=347230` 等）出现在出站请求 |
| platform-resolve-kw | 酷我本地直连链（4 个 `mobi.s?...&rid=5886682` + `songinfoandlrc`）解析成功 |
| platform-resolve-kg | 请求构造正确（`mainHash=c41e80…`、`albumId=973001`），夹具返回真实观测到的 `code:500` → 脚本优雅报错（服务侧失败分支） |
| lyric-cache-behavior | 未解析曲目 `lyric → null`；已解析曲目 → 缓存歌词（证实歌词依赖先解析） |
| search-action-rejected | `不支持的操作: search` |
| error-missing-music-info / quality | `参数不完整` |
| header-audit | 13 个出站请求无 Cookie/Authorization/Referer；X-Token 为脚本生成设备信息 |

**在线模式**（`--live`，本沙箱出口仅放行 GitHub/npm/PyPI）：真实请求链完整可见——网易 `wy` 分支自动执行 **后端 `/lx/api/` → 失败 → GD `api.php?types=url&source=netease&id=347230&br=320`（UA `LX-Music-Mobile`）** 的降级链；所有请求均在 TLS 握手被出口策略掐断（`Client network socket disconnected before secure TLS connection was established`），归类**环境限制**，不能作为服务故障证据。

## 4. 真实接口测试记录（2026-10-10，外部探测通道 GET；脚本头部路径已用隔离在线模式构造验证）

### 星海后端（`yy.zddyr.top` / 备 `zrcdy.dpdns.org`）

| 接口 | 结果 | 分类 |
| --- | --- | --- |
| `GET /ip.php` | ✓ `{"ip":"…","ip_type":"IPv4"}` | 服务在线 |
| `GET /lx/versionh2.php?ver=v3.2.15` | ✓ `{"message":"你已是最新版本","update_url":null}` | 服务在线 |
| `GET /lx/api/?source=wy&…&songmid=347230&quality=320k` | ✓ `code:200`，`quality:"320k","format":"mp3"`，返回 `http://m7xx.music.126.net/…mp3`（签名参数已脱敏） | **wy+320k 解析成功** |
| `GET /lx/api/?source=kw&…&songmid=5886682&quality=320k` | ✓ `code:200`，`http://car-er.kuwo.cn/…/M800…mp3?bitrate$320&format$mp3…` | kw+320k 解析成功 |
| `GET /lx/api/?source=migu&…&songmid=1135162566&quality=320k` | ✓ `code:200`，`https://freetyst.nf.migu.cn/…mp3`（路径显示 `MP3_128`，`quality_fallback:false` 声明 320k——实际码率存疑） | mg 解析成功（用搜索结果 `id`） |
| `GET /lx/api/?source=migu&songmid=600913000009337537`（contentId） | ✗ `code:400 「无法解析到有效歌曲…（需要name+singer或正确的咪咕songmid）」` | 正确拒绝错误 ID 字段 |
| `GET /lx/api/?source=kg&…`（`mainHash=c41e80…`+`hash=320hash` 两种组合） | ✗ `code:500 「所有音质(128k)均获取失败」` | **第三方服务故障**（参数被接受并回显，服务端拿不到链接） |

探测通道无法附加 `X-Token/X-Client` 头；服务对无令牌 GET 返回 `auth:{"trusted":false,"auth_type":"none"}` 并附 QPS 滥用提示。脚本实际请求的令牌路径由隔离在线模式验证构造正确。

### GD 公开接口（`music-api.gdstudio.xyz/api.php`）

| 接口 | 结果 | 分类 |
| --- | --- | --- |
| `types=search&source=netease&name=海阔天空` | ✓ 真实曲目（`id:347230`、`pic_id`、`lyric_id`…）。**注意参数是 `name=`，`id=` 会报 `Field 'name' is required`** | 服务在线 |
| `types=url&source=netease&id=347230&br=320`（含脚本 gdParams） | ✓ `{"url":"https://m701.music.126.net/…mp3","br":320,"size":13042460}` | **wy+320k 解析成功** |
| `types=lyric&source=netease&id=347230` | ✓ 完整 LRC（含 `tlyric:""`） | 歌词可用 |
| `types=pic&source=netease&id=347230` | ✓ `https://p2.music.126.net/…jpg` | 封面可用 |
| `source=qq / kugou / kuwo` | ✗ `{"detail":"Value of 'source' is not supported."}` | 服务能力边界（当前仅 netease） |

### 搜索与榜单（宿主平台适配器的数据源，与脚本无关）

| 接口 | 结果 | 分类 |
| --- | --- | --- |
| `music.163.com/api/toplist/detail` | ✓ 真实榜单（飙升榜 `19723756`、新歌榜 `3779629`、原创榜 `2884035`、热歌榜 `3778678` 等） | 服务在线 |
| `music.163.com/api/playlist/detail?id=3778678` | ✓ 热歌榜真实曲目 ID（`287398`、`1973665667`、`1456890009`…，含 `duration`/`artists`/`album`） | 服务在线（响应约数百 KB，接近桌面桥 512 KB 上限） |
| `music.163.com/api/playlist/track/all` | ✗ 返回网页而非 JSON | 接口不存在（已弃用） |
| `mobileservice.kugou.com/api/v3/search/song` | ✓ 真实 `hash`/`album_id`/`320hash`/`sqhash`/`audio_id`/`duration` | 服务在线 |
| `search.kuwo.cn/r.s?all=…&rformat=json` | ✓ 真实 `MUSICRID:MUSIC_5886682` 等（**单引号松散 JSON**，需宽松解析） | 服务在线 |
| `search.kuwo.cn/api/search/music` | ✗ HTTP 500 | 第三方服务故障（旧接口 `r.s` 可用） |
| `pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do` | ✓ 真实 `id:1135162566`、`contentId`、`lyricUrl`、`imgItems` 封面 | 服务在线 |
| QQ：`c.y.qq.com` smartbox / `client_search_cp`、`u.y.qq.com` musicu.fcg | ✗ 空响应体 / 空结果列表 | **未实测通过**：疑似要求 `Referer` 热链头；受控桥按安全边界禁止发送 Referer（不放宽） |

### 媒体直链与实际播放

- 解析服务返回的直链带 `br/size` 元数据（GD 明示 `size:13,042,460` ≈ 320kbps 全曲），服务端已校验资源存在。
- 对 `m701.music.126.net/…mp3` 与封面 jpg 的取回经外部探测通道返回 **HTTP 500**（该通道不支持二进制媒体验收，或 CDN 拒绝非播放器请求）→ **归类环境/通道限制**。
- **2026-10-10 补记：@live 真实音源在线旅程**：新增 `music-holo-web/tests/e2e/live-xinghai-source.spec.js`——从公开地址下载**真实星海脚本**（sha256 钉死为 `807d6157…`，上游换文件会立刻失败），榜单页曲目 → 「使用自定义源播放」→ 先填真实咪咕 ID `songmid=1135162566`（320k；§4 有实测 https 直链），若失败再尝试网易 `songmid=347230`（320k；后端明文 http / GD 可能 https）→ 真实第三方解析。明确选中脚本声明的平台 key，不能假设宿主默认值。断言的是两条确定性行为：① 脚本指纹一致；② 结果要么落地为 https 直链且浏览器**真的解码**（`currentTime > 0`），要么因明文 http 直链/第三方离线而未落地，此时界面**必须有明确提示**，不允许静默失败。实际结果写进 `testInfo` 注解与 job 注解，可通过 GitHub API 查看。它依赖第三方服务，因此单独跑在非阻断 job（`ci.yml` 的 `live-source`，`continue-on-error`），主旅程 job 用 `--grep-invert @live` 排除它。沙箱内无法运行（无浏览器、平台域名不通），首次结果以 CI 为准。

- **2026-10-10 补记：@live 旅程第一次真相（此前"通过"是假象）**：`live-source` job 是 `continue-on-error` 且脚本里 `exit 0`，所以**它一直显示绿色，即使用例是红的**。给 workflow 加上"无论成败都写一条 job 注解"之后才读到真实结果：**用例在 `locator.click` 上超时**。最初推测是未显式选择平台与初始化阶段联网；后来通过失败注解检查页面 DOM，确认实际阻塞根因是多域名并发弹授权框（见紧接的更正条目）。显式选择正确平台仍是必须的，因为星海声明 6 个平台且默认第一项不一定是当前测试平台；初始化网络授权也要处理，但二者不是已证实的 click timeout 根因。测试候选改为**先 mg 后 wy**——§4 记录里只有 mg（以及 wy 降级到 GD）实测返回 **https** 直链，网页端 HTTPS-only 边界下才有机会真播。
- **2026-10-10 补记：@live 点击超时根因更正 + 产品代码修复**：此前只从失败的 `locator.click` 推断为“确认窗挡住下拉框”，新的失败注解通过 UI DOM 实证：初始化时星海**并发**请求 `https://yy.zddyr.top/ip.php`、`yy.zddyr.top/lx/versionh2.php` 与 `zrcdy.dpdns.org/lx/versionh2.php`，`createCustomSourceRequestBridge` 为每个未授权 origin 同时弹 `ElMessageBox.confirm`，形成 3 个叠加的“确认音源网络请求”模态框（底下的「仅本次允许」按钮一直被顶层遮罩拦住）。正确修复不该只在 E2E 里绕，而是在产品桥 `src/utils/customSourceConsent.js`：每会话的 origin 授权队列串行显示、同 origin 并发请求共用一个 pending 确认；确认结果仍仅本会话有效，用户拒绝某个 host 也不会卡住其他 host；网络请求仍走原有 CORS/HTTPS/无凭据策略。新增单测验证两个 host 的 prompt 最大并发数为 1、同域请求只确认一次。E2E 额外处理「稍后处理」的版本提示（不自动打开更新地址），失败注解会输出当前可见 messagebox/buttons。**待最新 CI @live 重新验证：是否能完成真实解析，以及是否真的有声音/进度前进。**
- **2026-10-10 补记：单测顺序依赖导致的偶发红**：`tests/desktop-sources-route.test.js` 共用模块级 `router` 单例，若上一个用例的落点恰好是本次要跳的路由，vue-router 会判成**重复导航、不再执行守卫**，"应被重定向到 /home"的断言就假失败（用 `vitest --sequence.shuffle --sequence.seed=1234` 可稳定复现）。已改为每个用例先 `router.replace('/lyrics')` 回到无守卫的中性路由；三个随机种子下 296/296 全绿。

- **2026-10-10 补记：榜单 → 自定义源播放的浏览器旅程**：新增 `music-holo-web/tests/e2e/charts-custom-source-playback.spec.js`——榜单页首行 → 「使用自定义源播放」→（受控音源夹具）信任/初始化 → 选平台与 320k → 解析并播放；媒体地址与封面由 Playwright 拦截回 `public/audio/song1.wav`（仓库里的真实 wav），因此断言的是**浏览器真的解码、进度真的前进**（`currentTime > 0`、`paused === false`），而不只是“src 变了”。音源仍是受控夹具，不代表第三方平台可用；无头 Chromium 默认拦自动播放，这条旅程显式加了 `--autoplay-policy=no-user-gesture-required`（解析是异步的，真正 play() 时手势已过期）。

- **实际出声（播放）验收未完成**：需要能出网的桌面客户端（或 CI 联网 runner）走媒体票据流式加载。桌面媒体桥允许 `http://` 明文直链（带确认提示）、单段 Range、无 Cookie；网页沙箱 HTTPS-only 会拒绝 `http://` 直链（既有安全边界，保持）。

## 5. 客户端兼容问题清单（本轮处置）

| # | 问题 | 处置 |
| --- | --- | --- |
| 1 | `lyric/pic` 只吃 `musicUrl` 后的缓存；GD 分支无歌词封面 | **已补**：宿主平台适配器提供歌词/封面（wy 走 GD `types=lyric/pic`，mg 用搜索结果 `lyricUrl/imgItems`），试听台在脚本未返回时自动补齐 |
| 2 | 曲库「自定义源播放」合并 JSON 时 Music Holo ID 曾覆盖平台 `id` | **已修**：`id` 只从用户/适配器 JSON 进入；Music Holo ID 仅存 `musicHoloId` 字段，标题歌手专辑时长仍受保护 |
| 3 | 字段名差异：脚本读 `interval`/`albumName`，曲库是 `duration`/`album` | **已补**：适配器统一输出 `interval`/`albumName`；手动 JSON 时按本文 §2 填写 |
| 4 | 解析结果常为 `http://` 明文直链 | 保持现状：桌面桥允许并提示明文；网页沙箱拒绝（安全边界不放宽） |
| 5 | `env.platform` 不存在（`env` 是字符串）→ X-Client `(unknown)` | 保持不伪造 env 对象；无功能影响 |
| 6 | 初始化即联网（ip/版本）→ 授权弹窗提前 | 保持逐域名授权；更新提示不自动执行 |
| 7 | QQ 搜索疑似需要 Referer | 保持禁止 Referer；tx 搜索适配保留但标记**未实测**，UI 显示「未实测」 |
| 8 | 热歌榜 `playlist/detail` 响应接近 512 KB 桥上限 | 适配器只取前 50 首；超限报「响应过大」并提示 |

## 6. 平台曲目 ID 映射（实测结论）

| 平台 | musicInfo 关键字段 | 取值来源 | 解析验证 |
| --- | --- | --- | --- |
| wy 网易 | `id`（数字曲目 ID） | GD 搜索 / 网易榜单 | ✓ 后端与 GD 双通道 |
| kw 酷我 | `songmid` = rid（`MUSICRID` 去 `MUSIC_` 前缀） | 酷我 `r.s` 搜索 | ✓ 后端（脚本另有本地直连链） |
| kg 酷狗 | `hash` + `albumId` + `_types[音质].hash` | 酷狗搜索 `hash/320hash/sqhash` | 请求正确，后端 code 500（第三方故障） |
| mg 咪咕 | `songmid` = 搜索结果 **`id`**（`contentId` 会 400） | 咪咕搜索 | ✓ 后端 |
| tx QQ | `songmid` = QQ mid | QQ 搜索（未实测通过） | 未实测 |
| qs 汽水 | `songmid` | 无公开搜索 | 未实测（后端有测试分支） |

## 7. 平台适配器（搜索 / 榜单 / 歌词封面，本轮新增）

新增 [`music-holo-web/src/utils/sourceCatalog/`](../music-holo-web/src/utils/sourceCatalog/)，在「本机音源工作台 → 试听台」按所选音源平台显示：搜索/加载榜单 → 点击曲目 → 自动填入真实平台 ID 的 musicInfo JSON。**搜索与榜单是宿主能力，不假设音源脚本自带**；适配器只用公开无凭据接口，无密钥入库；桌面走受控桥（逐域名授权、DNS 校验、无 Referer/Cookie），网页受 HTTPS+CORS 限制。

| 平台 | 搜索 | 榜单 | 歌词/封面 | 实测 |
| --- | --- | --- | --- | --- |
| wy | GD `types=search` | 网易 toplist + playlist/detail | GD `types=lyric/pic` | ✓ 2026-10-10 |
| kw | `search.kuwo.cn/r.s`（宽松 JSON 解析） | 未接入 | 未接入 | 搜索 ✓ |
| kg | `mobileservice.kugou.com` | 未接入 | 未接入 | 搜索 ✓ |
| mg | `MIGUM3.0 search_all.do` | 未接入 | 搜索结果 `lyricUrl/imgItems` | ✓ |
| tx | `musicu.fcg` | 未接入 | 未接入 | **未实测**（空响应，疑 Referer） |
| qs | 明确报「尚未接入」 | 未接入 | 未接入 | 不猜 ID |

回归测试：`music-holo-web/tests/source-catalog.test.js`（夹具响应，覆盖 ID 映射与解析器）。

## 8. 一个平台一种音质的完整播放流程（wy + 320k）

1. **搜索/榜单取真实 ID**：GD 搜索 `海阔天空` → `id:347230`（或热歌榜 `id:287398`）— 实测 ✓。
2. **试听台填入** `{"id":"347230","name":"海阔天空","singer":"Beyond","albumName":"海阔天空","interval":326}`（适配器自动完成）。
3. **脚本解析**（隔离 Worker）：`/lx/api/?source=wy&…&songmid=347230&quality=320k` → `code:200` 真实 320k 直链；失败自动降级 GD `types=url&br=320` — 双通道实测 ✓。
4. **歌词/封面**：脚本缓存 + 宿主适配器 GD 补齐 — 实测 ✓。
5. **播放**：桌面媒体票据匿名流式加载（`http://` 明文会弹确认；不带 Cookie、只转发单段 Range）。**实际出声待联网客户端人工验收**（本环境无法流式取回二进制媒体）。

## 9. 复现方法

```sh
# 客户端契约验证（离线夹具，不联网）
node music-holo-desktop/scripts/validate-source-script.cjs <你的脚本.js>

# 真实网络验证（需能出网的机器；走桌面同款网络策略）
node music-holo-desktop/scripts/validate-source-script.cjs <你的脚本.js> --live

# 回归测试（不接触第三方脚本与网络）
npm test --prefix music-holo-desktop
npm test --prefix music-holo-web
```

**再次强调**：上一轮桌面/项目 CI 全绿使用的是模拟音源服务；本轮 §4 才是真实接口的实测记录。模拟测试通过 ≠ 真实服务可用，实际播放与多系统人工验收、tx/qs 平台、酷狗解析恢复情况仍待后续轮次。
