# 3D 全息投影音乐播放平台 · music-holo

基于 **Spring Boot 3 + Vue 3** 开发的前后端分离音乐播放平台，主打 **3D 全息投影** 视觉风格：
旋转的全息碟片、投影光锥、粒子、扫描线，配合实时歌词、多套全息主题，把音乐播放做成一场视觉秀。

播放器提供可放大的沉浸式 3D 歌词舞台（同步高亮、逐行进度与点击跳转）和可选 HRTF 虚拟空间音效；全站玻璃面板支持透明度调节。导航按“发现 / 曲库 / 我的音乐 / 管理 / 偏好”分组，桌面侧栏可折叠并记住选择；窄屏改用共享导航抽屉，播放器继续固定悬浮。播放栏支持空格、方向键、L/Q 快捷操作，兼容的浏览器还能把曲目信息和播放控制同步到系统媒体控件/耳机按键；在线歌曲可从播放器一键开启相似电台，按歌手与分类延伸聆听。专辑库由现有歌曲曲库聚合，支持专辑搜索、曲目浏览、整张播放和加入队列，不重复维护专辑数据。也可设置 15/30/45/60 分钟睡眠定时或在本曲结束后停止。播放队列支持多选导入本地音频，仅在当前浏览器播放、不上传服务器；底部播放器悬浮固定，不随内容滚动。公开歌单详情支持系统分享与复制链接回退，私密歌单不提供分享入口。歌曲与公开歌单支持分页短评、点赞、举报及管理员审核闭环；私密歌单短评遵从歌单权限。登录用户可在首页一键续播最近听过的歌曲；发现页提供基于近期收听与收藏的每日推荐歌单。登录用户也可屏蔽指定歌曲或整位歌手：自动下一首、每日推荐和相似电台会跳过，搜索、排行榜、管理后台和手动点播仍可见，规则按账号保存并可撤销，不删除曲库。主题包含深空棱镜、紫雾回响、琥珀舞台、矩阵声场与绯红现场。设置中心另提供本机自定义源库，支持 .js/.mjs 文件或 HTTPS URL 导入、按名称/作者/文件名筛选、展示源作者及安全的 HTTPS 主页、排序、查看、导出/恢复备份和删除。导入脚本默认不自动运行；除能力检测外，歌曲列表提供显式「自定义源播放」入口，可选择源、平台和音质，确认后在隔离 Worker 运行 `musicUrl`，传入所选 Music Holo 歌曲元数据；可选填写平台 ID，并按源声明获取歌词/封面。LX 协议负责解析曲目，不接管歌曲搜索，源不会出现在全局搜索结果中。每个源会话按 HTTPS 域名确认，遵守浏览器 CORS 与匿名加载、不携带登录凭据；临时音频 URL 不写入服务端历史或持久播放队列。浏览器无法可靠识别全部 DNS 重绑定，须只使用已获授权且可信的源脚本。

---

## 技术栈

### 后端 `music-holo-server`

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| Spring Boot | 3.2.0 | 基础框架 |
| MyBatis-Plus | 3.5.5 | ORM 框架（分页插件 / 逻辑删除 / 自动填充） |
| Sa-Token | 1.37.0 | 权限认证（注解式鉴权 + Redis 持久化会话） |
| MySQL | 8.x | 数据库 |
| Redis | 6.x+ | 缓存 / Sa-Token 会话存储 / 播放队列 |
| Knife4j | 4.4.0 | API 文档（OpenAPI3，启动后访问 `/doc.html`） |
| Hutool | 5.8.23 | 工具库（BCrypt 加密 / CSV 导入导出 / 文件 / 日期） |
| Lombok | - | 简化代码 |

### 前端 `music-holo-web`

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| Vue | 3.5.43 | 前端框架（包含 server-renderer XSS 安全修复） |
| Vite | 8.3.4 | 构建工具 |
| JavaScript | - | 纯 JS 单页应用 |
| Element Plus | 2.14.7 | UI 组件库（暗色主题） |
| Pinia | 2.1.7 | 状态管理 |
| Vue Router | 4.2.5 | 路由管理 |
| Axios | 1.20.0 | HTTP 客户端 |
| ECharts | 6.1.0 | 图表库（管理后台仪表盘，安全修复版） |
| Vitest | 5.0.3 | Mock API 集成测试 |
| Playwright | 1.64.0 | Chromium 生产构建浏览器 E2E |

> 版本说明：安全审计后将 Vue、Vite、ECharts 与 Vitest 升级到已修复公开漏洞的版本；Pinia 2.1.7 与 Vue Router 4.2.5 仍按需求固定。Vite 8 / Vitest 5 需要 Node.js ≥ 22.12。前端锁文件固定了完整依赖树。

---

## 功能模块（接口一览）

后端共 18 组 RESTful 接口，统一返回 `Result{code, msg, data}`，Knife4j 文档分组与之对应：

1. **认证相关** `/auth`：注册、登录、退出、当前用户信息
2. **用户相关** `/user`：资料查询、信息完善修改、修改密码
3. **系统设置** `/system`：全息主题查询与修改（个人主题 / 全局主题）、系统参数查询
4. **歌手相关** `/singer`：分页查询、详情、歌手歌曲查询、新增 / 修改 / 删除、CSV 导入导出、导入模板下载
5. **歌单相关** `/playlist`：分页查询、详情、歌单歌曲查询、新增 / 修改 / 删除、批量添加歌曲、移除歌曲；创建者可上移或下移一首歌曲并保存顺序，管理员不能调整别人的歌单；登录用户可导出自己的歌单 JSON，并在预览后导入为新副本
6. **歌曲相关** `/song`：分页查询（关键字 / 分类 / 歌手过滤）、详情（含歌词与收藏状态）、新增 / 修改 / 删除、播放（播放量 +1）
7. **歌曲分类** `/category`：分类列表、新增、修改、删除（分类下有歌曲时不可删除）
8. **播放列表** `/play/queue`：基于 Redis 的登录用户播放队列 —— 查询、添加一首、批量添加、移除、清空
9. **歌词处理** `/lyric`：LRC 歌词解析（结构化歌词行）、歌词导出（.lrc 下载）、歌词保存、歌词文件上传
10. **歌曲收藏** `/favorite`：添加收藏、取消收藏、收藏列表分页、收藏 id 集合、收藏状态检查
11. **其他公共** `/common`：代码表（字典）查询、文件上传下载、平台统计（仪表盘图表数据）
12. **最近播放** `/history`：当前用户的最近收听分页、移除单曲与清空历史；首页提供一键续播入口，游客播放不会写个人历史
13. **全局搜索** `/search`：跨歌曲标题/专辑/歌词、歌手与可见歌单搜索
14. **个性化推荐** `/recommend`：基于用户近期收听与收藏的歌手/分类做可解释推荐，匿名冷启动回落热门歌曲；`/recommend/similar` 按当前歌曲相近歌手/分类生成歌曲电台
15. **歌曲与歌单短评** `/review`：公开分页、发布、作者删除、幂等点赞与举报；游客可读公开短评，私密歌单短评按歌单访问权限隔离
16. **短评审核** `/review/admin`：管理员分页查看短评与举报，驳回举报、隐藏/恢复短评；隐藏时同一短评的待处理举报一并结案
17. **专辑浏览** `/album`：从已上架歌曲按专辑名与歌手聚合，支持搜索、分页、专辑详情与曲目查询，不另建重复曲库
18. **不喜欢规则** `/dislike`：登录用户屏蔽指定歌曲或整位歌手。自动下一首、每日推荐和相似电台跳过；搜索、排行榜、管理后台和显式点播仍可见。可撤销，不删除曲库；匿名请求不写入规则

主流音乐平台能力对照、按 ROI 排序的下一步建议及 V1 收口条件见 [`docs/product-parity-audit.md`](docs/product-parity-audit.md)。

### 本地音乐与播放器浮层

在底部播放器打开“播放队列”，可多选本地音频文件导入并立即播放。音频使用浏览器临时 Blob URL，不会上传服务端或写入账号播放历史；刷新页面后需重新选择文件。底部播放器和歌词面板传送到页面根层，固定在视口上方，不受内容滚动容器影响；3D 全息舞台继续保留为 Music Holo 自有视觉特色。

### 自定义源曲库播放

设置中心导入的 `.js/.mjs` 脚本仍按当前账号保存在本机，导入本身不会执行。歌曲列表中有「使用自定义源播放」按钮时，可针对一首曲库歌曲单独选择脚本、平台和音质；初始化需显式确认，运行后再按脚本声明解析 `musicUrl`，并可选调用 `lyric`/`pic`。对于需要 `songmid` 等平台 ID 的脚本，可在确认框的可选 JSON 字段补充曲目 ID；敏感凭据字段会拒绝，曲目信息仅为本次传入。LX 自定义源协议本身不提供通用搜索动作，所以搜索结果仍只来自 Music Holo 曲库。

每个隔离会话首次访问某个 HTTPS 域名都需用户确认；网络桥只允许受限的 CORS `GET/POST/HEAD`，不带 Cookie/授权头、不绕过 CORS。音频与可选封面在加载前显示来源确认，播放器以匿名 CORS 访问；同源媒体地址会拒绝，避免携带 Music Holo 站点凭据。未开放 CORS 的站点可能无法播放/显示。解析失败时可关闭对话框再用原曲库音频播放。自定义源曲目仅加入当前内存队列，不记服务端播放历史、不恢复到持久队列；系统媒体会话也不接收自定义源封面 URL。导入、能力检测和显式播放都不等同于内容授权，请只使用可信且获准使用的源脚本；浏览器端仍无法可靠消除所有 DNS 重绑定风险。

### 窄屏导航

导航菜单按“发现、曲库、我的音乐、管理、偏好”组织，桌面侧栏可手动折叠且选择会保存在当前设备，中等窗口会自动收窄；歌手、歌单与专辑详情页会高亮对应栏目；相似电台可从播放器当前歌曲或发现菜单进入。视口宽度不超过 600px 时隐藏侧栏，顶部菜单按钮打开同一套全站导航抽屉；选择页面后抽屉自动关闭，播放器仍固定在底部。游客账户菜单直接提供登录/注册入口，登录后才显示退出登录。

### 系统媒体控制

支持 Media Session API 的浏览器会将当前曲名、歌手和封面提供给系统媒体控件，并响应系统/耳机的播放、暂停、上一首、下一首与进度操作。该能力仅在浏览器支持时启用，不影响普通网页播放；媒体信息由浏览器本机显示。自定义源的外链封面不会交给系统 Media Session，避免把临时第三方媒体地址暴露给操作系统。

### 耳机空间音效

播放器的耳机按钮可开关 HRTF 虚拟空间音效：将本机或同源立体声音轨的左右声道送入不同虚拟声源位置，并保留原声混合，耳机上效果更明显。原声与空间音效使用独立媒体元素，因此跨域音源不会接入 Web Audio，也不会因 CORS 限制导致无声；这属于浏览器虚拟声场处理，不是原生多声道母带、头部追踪或专用空间音频编码。浏览器不支持 Web Audio 或空间音效启动失败时，播放器保持/回退原声。

### 权限模型

- **匿名可访问**：登录 / 注册、歌曲 / 歌手 / 公开歌单 / 分类浏览、全局搜索、热榜/推荐冷启动、播放量上报、歌词解析与导出、公开歌曲与公开歌单短评分页、代码表查询、文件下载、静态资源
- **登录用户**：私人最近播放记录、收藏、播放队列、歌单创建与管理（私密歌单仅创建者 / 管理员可读写）、资料修改、文件上传、歌词保存；可发布短评、点赞、举报，作者只能删除自己的短评；私密歌单短评遵从该歌单权限；收听历史可移除或清空
- **管理员**（`@SaCheckRole("admin")`）：歌手 / 歌曲 / 分类的增删改、歌手导入导出、全局主题设置、平台统计；可查看管理私密歌单、查看举报队列、驳回举报、隐藏 / 恢复短评并向作者提供审核说明

---

## 项目结构

```
music-holo/
├── docker-compose.yml          # 一键启动本机生产式全栈（MySQL + Redis + Spring Boot + Nginx）
├── sql/
│   ├── music_holo.sql          # 全新安装：建库建表 + 种子数据（内置 admin/123456、demo/123456）
│   ├── migration_20261008_play_history.sql # 已部署数据库增量升级：最近播放表
│   ├── migration_20261009_music_reviews.sql # 已部署数据库增量升级：短评、点赞与举报审核表
│   ├── migration_20261009_lyric_translation.sql # 已部署数据库增量升级：双语歌词译文列
│   └── migration_20261009_dislike.sql # 已部署数据库增量升级：不喜欢歌曲/歌手规则表
├── music-holo-server/          # 后端（Spring Boot 3.2）
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/musicholo/
│       │   ├── config/         # MyBatis-Plus / Sa-Token / Knife4j / Redis / Web(CORS+静态资源)
│       │   ├── common/         # 统一响应 Result / 全局异常处理
│       │   ├── controller/     # 18 组接口
│       │   ├── dto/  vo/       # 请求参数 / 视图对象
│       │   ├── entity/ mapper/ # 16 张表的实体与 Mapper
│       │   ├── service/        # 业务层（含 SongAssembler / PlayQueueService(Redis) 等）
│       │   └── util/           # LRC 歌词解析 / 文件存储
│       └── resources/
│           ├── application.yml
│           ├── application-dev.yml
│           └── application-prod.yml
│   └── Dockerfile              # Java 17 多阶段生产镜像
└── music-holo-web/             # 前端（Vue 3 + Vite）
    ├── Dockerfile              # Vite 构建 + Nginx 静态服务
    ├── deploy/nginx.conf       # SPA 回退、/api 与 /profile 同源反代
    ├── scripts/gen-audio.mjs   # 演示音频生成脚本（8 首 10 秒 WAV 电子旋律）
    ├── public/audio/           # 生成的演示音频 song1~8.wav
    └── src/
        ├── api/                # axios 封装 + 全部接口模块 + Mock 演示服务
        ├── components/         # HoloProjector(3D全息投影) / PlayerBar / LyricPanel / SongList / Cover
        ├── router/  store/     # 路由守卫 / 用户 / 播放器 / 主题
        ├── styles/  utils/  views/  # 全局样式 / 工具 / 页面（含管理后台）
```

---

## 快速开始

### 推荐：本机生产式全栈运行

需要 Docker Engine / Docker Desktop 与 Docker Compose v2；无需在宿主机安装 Java、Maven、MySQL 或 Redis。先复制本地配置（默认端口与密码只用于 loopback 本机演示）：

```bash
cp .env.example .env
# Windows PowerShell：Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

浏览器打开 **http://localhost:8088**，使用下方 `demo / 123456` 或 `admin / 123456` 登录。可用下面两条检查 Nginx 与 API：

```bash
curl -fsS http://localhost:8088/healthz
curl -fsS http://localhost:8088/api/system/theme
```

Nginx 提供生产构建的 SPA 静态文件，并将 `/api` 与 `/profile` 同源反代到 Spring Boot；MySQL、Redis、上传文件分别使用持久化卷。容器运行 `prod` profile（关闭 SQL 调试输出和 API 文档）。日志：`docker compose logs -f web server`。停止服务但保留数据：`docker compose down`；**清除数据库、队列和上传文件**：`docker compose down -v`（不可恢复）。初始化 SQL 只在 MySQL 数据卷第一次创建时执行。

> 这是单机验收 / 演示配置，不是公网生产安全基线：默认账号与密码是公开演示凭证；部署到公网前必须改密、配置 TLS、备份和密钥管理。

### 分离开发模式（前端热更新）

```bash
docker compose up -d mysql redis
```

全新数据库会自动执行初始化 SQL；已有部署数据库请先备份，并按日期顺序执行尚未应用的增量迁移：

```bash
mysql -uroot -proot music_holo < sql/migration_20261008_play_history.sql
mysql -uroot -proot music_holo < sql/migration_20261009_music_reviews.sql
mysql -uroot -proot music_holo < sql/migration_20261009_lyric_translation.sql
mysql -uroot -proot music_holo < sql/migration_20261009_dislike.sql
```

表迁移使用 `CREATE TABLE IF NOT EXISTS`；双语歌词迁移通过 `INFORMATION_SCHEMA` 检查后补列，均可安全重复执行。

### 启动后端

```bash
cd music-holo-server
mvn spring-boot:run
# 启动后访问 API 文档：http://localhost:8080/doc.html
```

环境变量（可选）：`MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_DB` / `MYSQL_USER` / `MYSQL_PASSWORD` / `REDIS_HOST` / `REDIS_PORT`。

### 3. 启动前端

```bash
cd music-holo-web
npm install
npm test       # 运行 Mock API 集成测试
npm run build  # 生产构建验证
npm run dev
# 浏览器打开 http://localhost:5173
# 开发环境下 /api 与 /profile 会被 Vite 代理到 http://localhost:8080
```

浏览器主流程回归（使用 Mock API 的生产构建）首次运行先安装 Chromium：

```bash
cd music-holo-web
npx playwright install chromium
npm run test:e2e
```

Playwright 当前覆盖 25 个浏览器测试场景：游客搜索并播放、歌曲“下一首播放”与队列重排、同源空间音效开关、系统媒体控制同步、导航分组/桌面折叠持久化/中等屏幕收窄/窄屏抽屉、demo 收藏与个人播放历史、设置页主题/资料/密码校验、自定义源文件导入/元数据/排序/导出/HTTPS URL 导入、显式同意后的隔离 Worker 初始化检测，以及曲库歌曲自定义源解析/音质选择/歌词封面匿名 CORS 播放、管理员上传译文后播放器同步切换双语 LRC、专辑详情与整张播放、相似歌曲电台播放、每日推荐筛选播放、公开歌单分享回退、账号歌单 JSON 导出与预览导入、本地音频导入与窄屏滚动时播放器固定、短评发布/举报/管理员隐藏/作者查看说明、歌曲/歌手不喜欢规则的自动跳过与手动点播、歌曲库跨页多选并批量加入队列和歌单、歌单创建者上下移动曲目并保存、管理员仪表盘、罗马音默认隐藏并可切换、授权后记住本地文件且刷新不自动入队、自有演示音频离线保存与删除。

### 4. 演示账号

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | admin | 123456 |
| 普通用户 | demo | 123456 |

### 5. Mock 演示模式（无需后端）

如果只想体验前端效果，可以不启动后端，直接使用内置 Mock 服务：

```bash
cd music-holo-web
VITE_API_MOCK=true npm run dev
```

此时全部接口由 `src/api/mock/` 在浏览器内存中模拟实现（含登录、播放、专辑聚合、歌曲电台、收藏、短评分页/限频/点赞/举报/管理端审核闭环等流程）。Mock 数据只在本次页面运行期间保留，不是持久化社区服务。

### 自动化检查

`.github/workflows/ci.yml` 在推送 `main` / `arena/**` 分支或向 `main` 提交 PR 时自动执行：前端依赖安全审计、Mock API 集成测试、生产构建、Playwright Chromium 25 个关键浏览器测试场景（搜索/播放、下一首优先插入与队列重排、空间音效、系统媒体控制、分组导航/桌面折叠持久化/中等屏幕收窄/窄屏抽屉、收藏/历史、设置页主题/资料/密码校验、自定义源导入/排序/导出/URL 导入、显式确认的隔离 Worker 初始化检测与正常歌曲解析播放/音质/歌词封面匿名 CORS、管理员双语 LRC 上传/保存/播放器切换、专辑浏览与播放、相似歌曲电台、每日推荐、歌单分享、账号歌单 JSON 导出与预览导入、本地音频/播放器悬浮、短评审核、歌曲/歌手不喜欢规则、歌曲库跨页多选、歌单曲目排序、管理员仪表盘、罗马音开关、本地句柄与自有演示音频缓存）、后端 Java 17 Maven `verify`，以及本机生产式 Docker Compose 全栈 smoke test（登录、收藏、播放历史、不喜欢规则的推荐过滤与账号隔离、账号歌单备份导出/导入、歌单曲目排序的创建者限制与落库回读、歌词罗马音解析与搜索不回传正文、音频与上传文件重启持久化）。浏览器测试失败时会保留截图、trace 与 HTML 报告。

---

## 3D 全息特效说明

- 全站 `HoloEnvironment`：CSS 生成的空间背景、透视网格地面、轨道光环、体积光锥与漂浮粒子；登录、曲库、歌单、播放器和管理后台均共享同一视觉舞台。
- 全局玻璃面板、导航、数据卡片、歌曲行和按钮加入轻量景深、悬浮层与折射高光，主题切换同步驱动光环和环境色；`prefers-reduced-motion` 开启时自动收敛动画。
- `HoloProjector` 组件：纯 CSS 3D 实现 —— `perspective` + `rotateX(72deg)` 倾斜碟片绕 Y 轴旋转、
  `clip-path` 投影光锥闪烁、虚线轨道环呼吸、粒子上浮、扫描线叠加、底座呼吸灯与地面投影。
- 播放时碟片加速旋转（`animation-play-state` 随播放状态切换），暂停即冻结，所见即所得。
- 主题系统通过 CSS 变量（`--holo-primary / --holo-secondary / --holo-glow`）驱动全站全息色，
  内置 5 套主题：深空棱镜 / 紫雾回响 / 琥珀舞台 / 矩阵声场 / 绯红现场，登录后自动同步到账号；玻璃面板不透明度可单独调整。
- 底部播放器、侧边栏迷你投影、首页 Hero、设置页实时预览均实时响应当前播放的歌曲。

## 演示音频

`music-holo-web/public/audio/song1~8.wav` 为脚本合成的 10 秒电子旋律（16kHz / 16bit / 单声道），
让播放器在开箱后即可真实播放。重新生成：

```bash
cd music-holo-web
npm run gen:audio
```

真实环境中，歌曲的 `audio_url` 指向 `/common/upload` 上传后的音频文件（`/profile/**` 静态映射）。

---

## 生产部署建议

- 后端：`mvn clean package`，使用 `java -jar` 或 Docker 部署；将 `knife4j.production=true` 关闭文档
- 前端：`npm run build`，将 `dist/` 交给 Nginx；Nginx 反向代理 `/api` 与 `/profile` 到后端
- 数据库 / Redis：生产环境请修改默认密码，并将 `upload-path` 指向持久化存储目录

---

## 常见问题

- **前端请求 401**：未登录或 token 过期，前端会自动跳转登录页重新登录
- **跨域问题**：后端已全局放开 CORS（`allowedOriginPatterns("*")`），前后端分离部署无需额外配置
- **端口占用**：后端默认 8080，前端默认 5173，可在 `application.yml` 与 `vite.config.js` 修改
- **歌词乱码**：上传歌词时后端会自动尝试 UTF-8 / GBK 两种编码
