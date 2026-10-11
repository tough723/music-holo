# LX 自定义源脚本编写与使用

协议参考：[LX Music 自定义源脚本编写说明](https://lxmusic.toside.cn/desktop/custom-source)。

> 新增 Electron 桌面宿主的运行方式与限制见 [桌面客户端说明](desktop-client.md)。下文浏览器 CORS 限制指网页版；示例脚本自身仍限定 HTTPS。

## 本次提供的实现

[`music-holo-local.js`](../examples/lx-custom-source/music-holo-local.js) 是 UTF-8 普通 JavaScript 脚本，可导入支持 LX 事件协议的环境。它不包含第三方解析服务，也不自带音乐；需要配置你自有或获授权的资源。

- 头部包含名称、描述、版本、作者、主页。
- 通过 `globalThis.lx.on(EVENT_NAMES.request, async ...)` 注册处理器，所有分支返回 Promise。
- 注册完成后发送 `inited`，只声明实际实现的 `local` 源。
- `musicUrl` 返回 HTTPS 音频直链，`pic` 返回 HTTPS 封面直链。
- `lyric` 返回 `{ lyric, tlyric, rlyric, lxlyric }`，支持内联歌词及通过 `lx.request` 读取原文 LRC。
- 网络错误、非 2xx、无效歌词、缺少地址和不支持的操作会拒绝 Promise，不伪造播放链接。

这里 `local` 是协议平台键，不表示允许读取本机文件。此实现主动限定 HTTPS；桌面协议本身也允许 HTTP。没有宣称支持 kw/kg/tx/wy/mg 或任何未实现的音质。

## 在 Music Holo 中试用

1. 在设置中心的自定义源库导入 `examples/lx-custom-source/music-holo-local.js`，导入不执行代码。
2. 在歌曲列表点击「使用自定义源播放」，选择此脚本，明确同意初始化。
3. 选择 `local` 平台（音质为空），在可选曲目 JSON 中填写：

```json
{
  "audioUrl": "https://media.example.com/my-track.mp3",
  "coverUrl": "https://media.example.com/my-track.jpg",
  "lyric": "[00:00.000]这是你自己编写的歌词",
  "tlyric": null,
  "rlyric": null,
  "lxlyric": null
}
```

**example.com 是占位地址，不可直接播放。必须替换为实际可访问且获授权的 HTTPS 资源。** 不需要封面时省略 `coverUrl` 并不要勾选封面解析；没有歌词可省略歌词字段。远程歌词可用 `lyricUrl` 替代 `lyric`，两者同时存在时优先内联 `lyric`（包括空字符串）。远程接口必须返回原始 UTF-8 LRC 文本，而不是 JSON。

4. 按界面确认网络域名与媒体来源。服务器必须允许浏览器匿名 CORS 访问，不能依赖 Cookie 或登录头；Music Holo 不允许同源媒体地址。

也可编辑脚本顶部 `TRACKS`，以字符串 `songmid` 为键保存资源，再在 JSON 中只传 `{"songmid":"my-track"}`。匹配到配置时整条配置优先，不混合传入的资源字段。没有匹配配置时直接使用 `musicInfo` 中的字段。

## 在 LX 桌面端中使用

在自定义源管理中导入脚本。初始化可以直接成功，但播放前必须提供上述曲目字段或配置映射。

**`audioUrl`、`coverUrl`、`lyricUrl` 和这里的 `songmid` 映射规则是本示例约定，不是 LX 保证存在的本地曲目字段。** 桌面端实际传来的 `musicInfo` 依版本、曲目类型而异；若没有这些字段，需要根据实际元数据修改脚本中的曲目查找逻辑（例如用你维护的稳定曲目 ID 映射到 `TRACKS`）。不要假设导入即能自动匹配本地文件或平台曲库。本次没有进行 LX 桌面客户端实机验收。

## 宿主提供的 `lx.utils` 支持范围

以 LX 官方文档为基线：

| 接口 | 支持情况 |
| --- | --- |
| `buffer.from` / `buffer.bufToString` | `utf8`、`ascii`、`latin1`/`binary`、`utf16le`/`ucs2`、`hex`、`base64`、`base64url`；编码与解码语义对齐 Node Buffer（ascii 编码取低字节、解码清高位） |
| `crypto.md5` | 完整支持 |
| `crypto.randomBytes` | 完整支持（单次上限 4096 字节） |
| `crypto.aesEncrypt(buffer, mode, key, iv)` | 支持 `ECB / CBC / CFB / OFB / CTR / GCM`，模式名可写 `aes-128-cbc`、`AES-CBC`、`cbc` 等；ECB/CBC 使用 PKCS#7 填充，其余模式不填充，输出与 Node `createCipheriv` 逐字节一致。`GCM` 走 WebCrypto，密文含认证标签 |
| `crypto.rsaEncrypt(buffer, key[, options])` | 支持公钥加密，默认 OAEP + SHA-1（与 Node `crypto.publicEncrypt` 一致），可选 `{ padding: 'pkcs1' }` 或 `{ hash: 'sha256' }`；密钥可为 SPKI PEM、`RSA PUBLIC KEY` PEM、JWK 或裸 base64/hex DER。**私钥材料一律拒绝**，沙箱不提供解密与签名 |
| `zlib.inflate` / `zlib.deflate` | 支持，基于浏览器压缩流，行为不保证与 Node zlib 完全等同 |

其余差异（相对 LX 桌面端）：

- `lx.request` 的 `resp` 同时提供 `statusCode` 与 `status`。
- `formData` 在网页沙箱与桌面桥都可用（桌面桥按 multipart/form-data 组装，字段名需为简单文本以防请求头注入）；`form` 与 `body` 两种用法不受影响。
- `inited` 的 `openDevTools` 不会打开开发者工具：隔离环境无法附加调试器，宿主只开启本次会话的网络请求日志（输出到浏览器控制台）并在界面提示。
- `updateAlert` 会被校验并展示（日志、可选下载地址），每次运行只提示一次，**不会自动下载或替换脚本**；非法声明直接忽略。
- `lyric` 返回的 `lyric / tlyric / rlyric / lxlyric` 都会被消费：主歌词、译文、罗马音进入播放器，`lxlyric` 以逐字（卡拉 OK）方式高亮；只有逐字歌词时会用逐字文本合成主歌词行。

## 接入自己的解析 API

如果要实现 kw/kg/tx/wy/mg，需先有已获授权的解析接口，并明确：

1. 服务地址、请求方式与必要的曲目 ID 字段。
2. 各音质参数对应关系，以及无资源/权限不足的响应格式。
3. 成功响应内真正的媒体 URL 字段与有效期。
4. 浏览器 CORS 和匿名访问支持情况。

用 `lx.request(url, options, callback)` 包装 Promise，验证 HTTP 状态和业务响应，再返回媒体 URL；不要返回整个响应对象。不要使用 axios、Node require 或假定存在 fetch。非 `local` 源只声明 `actions: ['musicUrl']`，`qualitys` 只列真实支持的 `128k / 320k / flac / flac24bit` 子集。`local` 可声明三种 action，`qualitys` 必须是 `[]`，调用时 `info.type` 为 null。

参考页面示例中 `lyric`、`pic` 分支误调用 `musicUrl`，不能直接照抄；本实现分别处理三个操作。歌词字段使用 `lyric`、`tlyric`（不是部分文字描述中的 `lryic`、`tlryic`）。协议不定义通用搜索 action；搜索与榜单由宿主（Music Holo 平台适配器）实现，见 [星海验证记录](xinghai-validation.md) 的平台 ID 映射表。

## 安全与运行边界

- 不在脚本或曲目 JSON 中保存密码、Cookie、长期令牌；脚本导出会暴露其全部内容。
- 地址校验只是格式校验，不是 DNS、私网或重定向安全检查；仅配置可信资源。
- LX 桌面提供的网络能力不等同于 Music Holo 浏览器沙箱。后者继续执行 HTTPS、逐会话域名授权、无凭据 CORS、超时和响应体积限制，不提供绕过代理。
- 脚本的自动更新提示只展示日志与作者提供的下载地址，宿主不会自动下载或替换脚本。
- 可选远程歌词请求超时为 10 秒，歌词限制为 256K 字符，宿主可能施加更严格的字节限制。
- 原文、译文、罗马音和逐字歌词均按协议返回并展示（逐字歌词支持卡拉 OK 高亮）。

## 测试

无需安装依赖，在仓库根目录运行：

```sh
node --test examples/lx-custom-source/music-holo-local.test.cjs
```

测试使用模拟 `globalThis.lx`，验证初始化顺序、能力声明、直链、歌词结构、HTTP 回调两种 body 形式以及拒绝路径，不访问第三方网络。这不是实际音源可用性测试或客户端端到端验收。
