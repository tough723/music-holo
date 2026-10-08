/**
 * Mock 演示模式的种子数据（与 sql/music_holo.sql 保持一致）
 */

export const clone = (obj) => JSON.parse(JSON.stringify(obj))

export function createSeed() {
  const users = [
    { id: 1, username: 'admin', password: '123456', nickname: '全息管理员', avatar: '', email: 'admin@musicholo.com', phone: '', gender: 1, role: 0, theme: 'cyan', status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 2, username: 'demo', password: '123456', nickname: '演示用户', avatar: '', email: '', phone: '', gender: 2, role: 1, theme: 'magenta', status: 1, createTime: '2026-01-02 10:00:00' }
  ]

  const singers = [
    { id: 1, name: '林澈', gender: 1, region: '内地', intro: '嗓音清澈如海风，擅长把情绪唱进霓虹夜色里。', avatar: '', sort: 1, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 2, name: '苏晚', gender: 2, region: '港台', intro: '深夜电台的声音，故事感与空气感并存。', avatar: '', sort: 2, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 3, name: 'KAIN', gender: 1, region: '欧美', intro: '电子音乐制作人，擅长用合成器搭建赛博空间。', avatar: '', sort: 3, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 4, name: '周屿舟', gender: 1, region: '内地', intro: '独立摇滚厂牌主理人，吉他与呐喊是他的语言。', avatar: '', sort: 4, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 5, name: '陆呼吸', gender: 2, region: '内地', intro: '民谣创作者，歌词像日记一样温柔锋利。', avatar: '', sort: 5, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 6, name: 'DJ Nova', gender: 1, region: '日韩', intro: '专注深空浩室与未来贝斯的电音玩家。', avatar: '', sort: 6, status: 1, createTime: '2026-01-01 10:00:00' }
  ]

  const categories = [
    { id: 1, name: '华语', parentId: 0, sort: 1, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 2, name: '欧美', parentId: 0, sort: 2, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 3, name: '日韩', parentId: 0, sort: 3, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 4, name: '电子', parentId: 0, sort: 4, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 5, name: '摇滚', parentId: 0, sort: 5, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 6, name: '民谣', parentId: 0, sort: 6, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 7, name: '古风', parentId: 0, sort: 7, status: 1, createTime: '2026-01-01 10:00:00' },
    { id: 8, name: '影视金曲', parentId: 0, sort: 8, status: 1, createTime: '2026-01-01 10:00:00' }
  ]

  const LYRICS = [
    '[00:00.50]霓虹亮起 城市开始呼吸\n[00:02.00]海风把心事 一并带走\n[00:03.50]我在全息投影里 想你\n[00:05.00]投影摇晃 像思念的形状\n[00:06.50]等信号亮起 说一句 hello\n[00:08.00]下一站 是温柔的宇宙',
    '[00:00.50]云朵寄来 一封旧时信\n[00:02.00]邮戳盖着 去年的风景\n[00:03.50]信使飞过 北纬三十五度\n[00:05.00]把你的名字 念成一颗星\n[00:06.50]星星亮了 邮件就到了\n[00:08.00]打开一看 是山河万程',
    '[00:00.50]青衫白马 谁在谁身旁\n[00:02.00]一帘幽梦 全息的光\n[00:03.50]你在投影里 我在投影外\n[00:05.00]伸手却握不住 一场春梦\n[00:06.50]琴声起 处处是故乡\n[00:08.00]醒来时 月色正微凉',
    '[00:00.50]午夜列车 穿过极光\n[00:02.00]每个窗口 都是一扇梦\n[00:03.50]下一站停靠 你的城\n[00:05.00]汽笛声里 藏着心动\n[00:06.50]列车员说 请系好安全带\n[00:08.00]我们即将抵达 温柔',
    '[00:00.50]糖纸折成 千纸鹤飞走\n[00:02.00]风一吹 透明的温柔\n[00:03.50]咬一口是 薄荷的凉\n[00:05.00]甜味里有 你的问候\n[00:06.50]夏天快结束 歌声慢下来\n[00:08.00]蝉鸣声里 说声再见',
    '[00:00.50]深空回响 电波的诗\n[00:02.00]飞过土星 光环的影子\n[00:03.50]外星的频率 陌生又熟悉\n[00:05.00]像你昨夜 的一句梦呓\n[00:06.50]信号断断 续续不停\n[00:08.00]宇宙很大 我只听你',
    '[00:00.50]旧城的灯 忽明忽暗\n[00:02.00]吉他声里 时间走慢\n[00:03.50]墙上的涂鸦 被雨冲淡\n[00:05.00]故事讲到一半 天就亮了\n[00:06.50]保安大叔 说该回家了\n[00:08.00]明天的太阳 照常升起',
    '[00:00.50]戴上耳机 世界换了频道\n[00:02.00]全息投影 演一场独角戏\n[00:03.50]我在光里 你也在光里\n[00:05.00]音乐是通用的 语言\n[00:06.50]闭上眼 就能看见你\n[00:08.00]漫游到 梦的尽头'
  ]

  const songMeta = [
    { title: '霓虹海', singerId: 1, categoryId: 1, album: '《霓虹海》', playCount: 12580 },
    { title: '云端信使', singerId: 2, categoryId: 1, album: '《云端信使》', playCount: 9860 },
    { title: '全息之恋', singerId: 1, categoryId: 7, album: '《全息之恋》', playCount: 7640 },
    { title: '极光列车', singerId: 3, categoryId: 4, album: '《极光列车》', playCount: 15320 },
    { title: '玻璃糖纸', singerId: 5, categoryId: 6, album: '《玻璃糖纸》', playCount: 5420 },
    { title: '深空回响', singerId: 6, categoryId: 4, album: '《深空回响》', playCount: 11050 },
    { title: '旧城之光', singerId: 4, categoryId: 5, album: '《旧城之光》', playCount: 8730 },
    { title: '幻境漫游', singerId: 2, categoryId: 8, album: '《幻境漫游》', playCount: 6210 }
  ]

  const songs = songMeta.map((meta, i) => ({
    id: i + 1,
    ...meta,
    duration: 10,
    cover: '',
    audioUrl: `/audio/song${i + 1}.wav`,
    lyric: LYRICS[i],
    status: 1,
    createTime: '2026-01-01 10:00:00'
  }))

  const playlists = [
    { id: 1, name: '深夜霓虹', cover: '', description: '凌晨两点的电台歌单，霓虹与海风的声音。', creatorId: 1, isPublic: 1, playCount: 3260, createTime: '2026-01-01 10:00:00' },
    { id: 2, name: '全息舞台', cover: '', description: '全息投影视觉系现场，古风与电子的碰撞。', creatorId: 1, isPublic: 1, playCount: 2180, createTime: '2026-01-01 10:00:00' },
    { id: 3, name: '华语精选', cover: '', description: '华语独立音乐人的深夜自留地。', creatorId: 2, isPublic: 1, playCount: 1540, createTime: '2026-01-01 10:00:00' }
  ]

  const playlistSongs = [
    { id: 1, playlistId: 1, songId: 1, sort: 1, createTime: '2026-01-01 10:00:00' },
    { id: 2, playlistId: 1, songId: 2, sort: 2, createTime: '2026-01-01 10:00:00' },
    { id: 3, playlistId: 1, songId: 4, sort: 3, createTime: '2026-01-01 10:00:00' },
    { id: 4, playlistId: 2, songId: 3, sort: 1, createTime: '2026-01-01 10:00:00' },
    { id: 5, playlistId: 2, songId: 6, sort: 2, createTime: '2026-01-01 10:00:00' },
    { id: 6, playlistId: 2, songId: 8, sort: 3, createTime: '2026-01-01 10:00:00' },
    { id: 7, playlistId: 3, songId: 1, sort: 1, createTime: '2026-01-01 10:00:00' },
    { id: 8, playlistId: 3, songId: 2, sort: 2, createTime: '2026-01-01 10:00:00' },
    { id: 9, playlistId: 3, songId: 7, sort: 3, createTime: '2026-01-01 10:00:00' }
  ]

  const favorites = [
    { id: 1, userId: 2, songId: 1, createTime: '2026-01-03 10:00:00' },
    { id: 2, userId: 2, songId: 4, createTime: '2026-01-03 10:01:00' },
    { id: 3, userId: 2, songId: 6, createTime: '2026-01-03 10:02:00' }
  ]

  const playHistory = [
    { id: 1, userId: 2, songId: 6, playCount: 9, lastPlayedAt: new Date(Date.now() - 10 * 60_000).toISOString() },
    { id: 2, userId: 2, songId: 4, playCount: 4, lastPlayedAt: new Date(Date.now() - 35 * 60_000).toISOString() },
    { id: 3, userId: 2, songId: 1, playCount: 12, lastPlayedAt: new Date(Date.now() - 60 * 60_000).toISOString() }
  ]

  const configs = [
    { id: 1, configKey: 'theme', configValue: 'cyan', configName: '全局默认主题', remark: '平台全局默认主题' },
    { id: 2, configKey: 'site_name', configValue: '3D全息音乐', configName: '站点名称', remark: '平台名称' }
  ]

  const dictData = [
    { id: 1, dictType: 'gender', dictLabel: '保密', dictValue: '0', sort: 1, status: 1 },
    { id: 2, dictType: 'gender', dictLabel: '男', dictValue: '1', sort: 2, status: 1 },
    { id: 3, dictType: 'gender', dictLabel: '女', dictValue: '2', sort: 3, status: 1 },
    { id: 4, dictType: 'user_status', dictLabel: '禁用', dictValue: '0', sort: 1, status: 1 },
    { id: 5, dictType: 'user_status', dictLabel: '正常', dictValue: '1', sort: 2, status: 1 },
    { id: 6, dictType: 'yes_no', dictLabel: '否', dictValue: '0', sort: 1, status: 1 },
    { id: 7, dictType: 'yes_no', dictLabel: '是', dictValue: '1', sort: 2, status: 1 }
  ]

  /** 服务端播放队列：userId -> [songId] */
  const queues = { 1: [1, 2, 4], 2: [1, 4, 6] }

  let nextId = 100
  const genId = () => ++nextId

  return { users, singers, categories, songs, playlists, playlistSongs, favorites, playHistory, configs, dictData, queues, genId }
}
