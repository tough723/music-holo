# OnlineTrackService 统一试听与在线播放设计

## 目标

将设置页试听台、全局搜索在线结果、在线排行榜统一到同一条平台曲目处理链：

1. 平台适配器负责搜索、榜单和平台原生 `musicInfo`；
2. 统一服务负责规范化曲目、选择自动音源、执行 `musicUrl`、可选歌词/封面；
3. 播放器只接收标准化 `isCustomSource` 曲目；
4. 试听台保留人工确认/JSON 编辑能力，全局入口使用自动模式。

## 统一接口

`src/utils/onlineTrackService.js`

- `normalizeOnlineTrack(track)`：补齐标题、歌手、专辑和稳定标识；
- `buildOnlineMusicInfo(track)`：合并平台 `musicInfo` 与公共元数据，不伪造平台 ID；
- `searchOnlineTracks(platform, keyword, options)`：代理 `sourceCatalog.searchPlatformTracks`；
- `listOnlineCharts(platform, options)` / `fetchOnlineChartTracks(...)`；
- `resolveOnlineTrack(track, options)`：复用自动音源会话，返回播放器标准曲目；
- `playOnlineTrack(playerStore, track, options)`：解析后调用 `playerStore.playSong`。

## 不变的安全边界

- 自定义脚本仍运行于受限 iframe/Worker；
- 仍由 `validateCustomSourceMediaUrl` 校验媒体地址；
- Web 请求仍为匿名、HTTPS、公网和 CORS 约束；
- 自动授权只作用于已导入并启用自动模式的音源；
- 不向音源传 Cookie、授权头或 Music Holo 登录态。

## 授权管理

在本地音源记录中持久化 `autoRun` 与 `autoApproveNetwork`。当前用户已选择导入即启用，因此默认值为 true。后续 UI 应提供关闭开关和域名撤销入口；统一服务不绕过底层 URL 校验。

## 测试策略

- 纯函数单测：曲目规范化、`musicInfo` 合并、稳定 ID；
- 服务编排单测：用 fake session 验证 musicUrl、歌词、封面和播放器曲目映射；
- 保留 source-catalog 适配器测试；
- 真实栈 E2E：搜索、解析、播放和播放器控制点击。

## 实施顺序

1. 新增统一服务和单测；
2. Search/Charts 改用统一服务；
3. CustomSourceManager 试听台的搜索/榜单改用统一服务，解析逻辑逐步委托统一服务；
4. 增加授权状态/撤销 UI；
5. 完成构建、单测、真实栈 E2E，再提交。
