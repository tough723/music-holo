# 3D 全息投影音乐播放平台 · music-holo

基于 **Spring Boot 3 + Vue 3** 开发的前后端分离音乐播放平台，主打 **3D 全息投影** 视觉风格：
旋转的全息碟片、投影光锥、粒子、扫描线，配合实时歌词、多套全息主题，把音乐播放做成一场视觉秀。

播放器提供可放大的沉浸式 3D 歌词舞台（同步高亮、逐行进度与点击跳转），全站玻璃面板支持透明度调节；主题包含深空棱镜、紫雾回响、琥珀舞台、矩阵声场与绯红现场。

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

> 版本说明：安全审计后将 Vue、Vite、ECharts 与 Vitest 升级到已修复公开漏洞的版本；Pinia 2.1.7 与 Vue Router 4.2.5 仍按需求固定。Vite 8 / Vitest 5 需要 Node.js ≥ 22.12。前端锁文件固定了完整依赖树。

---

## 功能模块（接口一览）

后端共 14 组 RESTful 接口，统一返回 `Result{code, msg, data}`，Knife4j 文档分组与之对应：

1. **认证相关** `/auth`：注册、登录、退出、当前用户信息
2. **用户相关** `/user`：资料查询、信息完善修改、修改密码
3. **系统设置** `/system`：全息主题查询与修改（个人主题 / 全局主题）、系统参数查询
4. **歌手相关** `/singer`：分页查询、详情、歌手歌曲查询、新增 / 修改 / 删除、CSV 导入导出、导入模板下载
5. **歌单相关** `/playlist`：分页查询、详情、歌单歌曲查询、新增 / 修改 / 删除、批量添加歌曲、移除歌曲
6. **歌曲相关** `/song`：分页查询（关键字 / 分类 / 歌手过滤）、详情（含歌词与收藏状态）、新增 / 修改 / 删除、播放（播放量 +1）
7. **歌曲分类** `/category`：分类列表、新增、修改、删除（分类下有歌曲时不可删除）
8. **播放列表** `/play/queue`：基于 Redis 的登录用户播放队列 —— 查询、添加一首、批量添加、移除、清空
9. **歌词处理** `/lyric`：LRC 歌词解析（结构化歌词行）、歌词导出（.lrc 下载）、歌词保存、歌词文件上传
10. **歌曲收藏** `/favorite`：添加收藏、取消收藏、收藏列表分页、收藏 id 集合、收藏状态检查
11. **其他公共** `/common`：代码表（字典）查询、文件上传下载、平台统计（仪表盘图表数据）
12. **最近播放** `/history`：当前用户的最近收听分页、移除单曲与清空历史；游客播放不会写个人历史
13. **全局搜索** `/search`：跨歌曲标题/专辑/歌词、歌手与可见歌单搜索
14. **个性化推荐** `/recommend`：基于用户近期收听与收藏的歌手/分类做可解释推荐，匿名冷启动回落热门歌曲

能力差距、市场观察与后续路线图见 [`docs/product-parity-audit.md`](docs/product-parity-audit.md)。

### 权限模型

- **匿名可访问**：登录 / 注册、歌曲 / 歌手 / 公开歌单 / 分类浏览、全局搜索、热榜/推荐冷启动、播放量上报、歌词解析与导出、代码表查询、文件下载、静态资源
- **登录用户**：私人最近播放记录、收藏、播放队列、歌单创建与管理（私密歌单仅创建者 / 管理员可读写）、资料修改、文件上传、歌词保存；收听历史可移除或清空
- **管理员**（`@SaCheckRole("admin")`）：歌手 / 歌曲 / 分类的增删改、歌手导入导出、全局主题设置、平台统计；可查看管理私密歌单

---

## 项目结构

```
music-holo/
├── docker-compose.yml          # 一键启动 MySQL 8 + Redis 7（自动执行初始化 SQL）
├── sql/
│   ├── music_holo.sql          # 全新安装：建库建表 + 种子数据（内置 admin/123456、demo/123456）
│   └── migration_20261008_play_history.sql # 已部署数据库增量升级：最近播放表
├── music-holo-server/          # 后端（Spring Boot 3.2）
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/musicholo/
│       │   ├── config/         # MyBatis-Plus / Sa-Token / Knife4j / Redis / Web(CORS+静态资源)
│       │   ├── common/         # 统一响应 Result / 全局异常处理
│       │   ├── controller/     # 14 组接口
│       │   ├── dto/  vo/       # 请求参数 / 视图对象
│       │   ├── entity/ mapper/ # 11 张表的实体与 Mapper
│       │   ├── service/        # 业务层（含 SongAssembler / PlayQueueService(Redis) 等）
│       │   └── util/           # LRC 歌词解析 / 文件存储
│       └── resources/
│           ├── application.yml
│           └── application-dev.yml
└── music-holo-web/             # 前端（Vue 3 + Vite）
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

### 1. 启动基础设施（MySQL + Redis）

```bash
docker compose up -d
# 全新安装会自动执行初始化 SQL；也可以手动导入：
# mysql -uroot -proot < sql/music_holo.sql
# 已有数据库请在备份后增量执行最近播放表迁移：
# mysql -uroot -proot music_holo < sql/migration_20261008_play_history.sql
```

### 2. 启动后端

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

此时全部接口由 `src/api/mock/` 在浏览器内存中模拟实现（含登录、播放、收藏、管理后台等完整流程）。

### 自动化检查

`.github/workflows/ci.yml` 在推送 `main` / `arena/**` 分支或向 `main` 提交 PR 时自动执行：前端依赖安全审计、10 项 Mock API 集成测试、生产构建，以及后端 Java 17 下的 Maven `verify` 编译校验。

---

## 3D 全息特效说明

- 全站 `HoloEnvironment`：CSS 生成的空间背景、透视网格地面、轨道光环、体积光锥与漂浮粒子；登录、曲库、歌单、播放器和管理后台均共享同一视觉舞台。
- 全局玻璃面板、导航、数据卡片、歌曲行和按钮加入轻量景深、悬浮层与折射高光，主题切换同步驱动光环和环境色；`prefers-reduced-motion` 开启时自动收敛动画。
- `HoloProjector` 组件：纯 CSS 3D 实现 —— `perspective` + `rotateX(72deg)` 倾斜碟片绕 Y 轴旋转、
  `clip-path` 投影光锥闪烁、虚线轨道环呼吸、粒子上浮、扫描线叠加、底座呼吸灯与地面投影。
- 播放时碟片加速旋转（`animation-play-state` 随播放状态切换），暂停即冻结，所见即所得。
- 主题系统通过 CSS 变量（`--holo-primary / --holo-secondary / --holo-glow`）驱动全站全息色，
  内置 4 套主题：青蓝全息 / 品红幻境 / 琥珀暖光 / 翠绿矩阵，登录后自动同步到账号。
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
