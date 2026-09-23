/* chronicle meta | 维度 / 时代带 / 轨道 / 主题线目录 | v1 */
window.__CHRONICLE_META = {
  version: "1.0.0",
  yearMin: -3000,
  yearMax: 2026,

  tracks: {
    cn:    { label: "中国编年史", short: "中国", color: "#d9482b", colorSoft: "#f0876e", colorDeep: "#8c2416" },
    world: { label: "世界编年史", short: "世界", color: "#2f6f9e", colorSoft: "#6ba7cd", colorDeep: "#173f5e" }
  },

  /* 十维：颜色 + 形状双重编码（色盲友好） */
  dimensions: {
    politics:    { label: "国家政治", color: "#d9482b", shape: "circle",   glyph: "●" },
    figure:      { label: "关键人物", color: "#e0a12b", shape: "pentagon", glyph: "⬟" },
    science:     { label: "科技进步", color: "#1f9c8f", shape: "triangle", glyph: "▲" },
    culture:     { label: "人文思想", color: "#8a5cc4", shape: "diamond",  glyph: "◆" },
    art:         { label: "文学艺术", color: "#cf5f9c", shape: "star",     glyph: "★" },
    military:    { label: "军事战争", color: "#7d8494", shape: "square",   glyph: "■" },
    economy:     { label: "经济社会", color: "#7a9440", shape: "hexagon",  glyph: "⬡" },
    institution: { label: "制度法律", color: "#4062c0", shape: "ring",     glyph: "◎" },
    explore:     { label: "地理探索", color: "#2a9ac4", shape: "compass",  glyph: "✧" },
    disaster:    { label: "灾害疫情", color: "#a2622f", shape: "cross",    glyph: "✚" }
  },

  dimOrder: ["politics","figure","science","culture","art","military","economy","institution","explore","disaster"],

  /* 中国时代带：前 841 之前为推定纪年区间 */
  cnEras: [
    { id:"cn-myth",  from:-3000, to:-2070, label:"传说时代",   sub:"三皇五帝",       approx:true },
    { id:"cn-xia",   from:-2070, to:-1600, label:"夏",         sub:"二里头文化",     approx:true },
    { id:"cn-shang", from:-1600, to:-1046, label:"商",         sub:"殷墟·甲骨文",    approx:true },
    { id:"cn-xizhou",from:-1046, to:-841,  label:"西周",       sub:"宗法·礼乐",      approx:false },
    { id:"cn-chunqiu",from:-841, to:-476,  label:"春秋",       sub:"共和行政起·霸主政治" },
    { id:"cn-zhanguo",from:-476, to:-221,  label:"战国",       sub:"变法·百家" },
    { id:"cn-qin",   from:-221,  to:-206,  label:"秦",         sub:"大一统·郡县" },
    { id:"cn-han",   from:-206,  to:220,   label:"两汉",       sub:"察举·丝路·纸" },
    { id:"cn-sanguo",from:220,   to:280,   label:"三国",       sub:"分裂与鼎立" },
    { id:"cn-jin",   from:265,   to:420,   label:"两晋",       sub:"玄学·南渡" },
    { id:"cn-nb",    from:420,   to:589,   label:"南北朝",     sub:"均田·石窟·融合" },
    { id:"cn-sui",   from:581,   to:618,   label:"隋",         sub:"科举·大运河" },
    { id:"cn-tang",  from:618,   to:907,   label:"唐",         sub:"贞观·开元·两税法" },
    { id:"cn-wd",    from:907,   to:960,   label:"五代十国",   sub:"石经·南方开发" },
    { id:"cn-song",  from:960,   to:1279,  label:"宋",         sub:"活字·市舶·理学" },
    { id:"cn-yuan",  from:1271,  to:1368,  label:"元",         sub:"行省·驿站·杂剧" },
    { id:"cn-ming",  from:1368,  to:1644,  label:"明",         sub:"郑和·心学·小说" },
    { id:"cn-qing",  from:1644,  to:1912,  label:"清",         sub:"康乾·边疆·考据" },
    { id:"cn-mord",  from:1840,  to:1949,  label:"近代",       sub:"条约·革命·抗战" },
    { id:"cn-prc",   from:1949,  to:2026,  label:"当代",       sub:"建国·改革·复兴" }
  ],

  /* 世界时代带 */
  worldEras: [
    { id:"w-bronze",  from:-3000, to:-1200, label:"青铜时代",     sub:"苏美尔·埃及·巴比伦", approx:true },
    { id:"w-iron",    from:-1200, to:-500,  label:"铁器与轴心前夜", sub:"赫梯·亚述·甲骨到字母" },
    { id:"w-axial",   from:-500,  to:-330,  label:"希腊古典",     sub:"城邦·民主·哲学" },
    { id:"w-hellen",  from:-330,  to:-27,   label:"希腊化与共和罗马", sub:"亚历山大·布匿·十二表法" },
    { id:"w-rome",    from:-27,   to:284,   label:"罗马帝国",     sub:"元首制·和平·基督诞生" },
    { id:"w-lateant", from:284,   to:476,   label:"晚期古代",     sub:"四帝共治·国教化·迁徙" },
    { id:"w-earlymd", from:476,   to:1000,  label:"早期中世纪",   sub:"拜占庭·伊斯兰·查理曼" },
    { id:"w-highmd",  from:1000,  to:1300,  label:"盛期中世纪",   sub:"十字军·大学·大教堂" },
    { id:"w-latemd",  from:1300,  to:1450,  label:"晚期中世纪",   sub:"黑死病·百年战争" },
    { id:"w-earlymo", from:1450,  to:1750,  label:"近代早期",     sub:"印刷·航海·宗教改革·科学" },
    { id:"w-enlight", from:1685,  to:1815,  label:"启蒙与革命",   sub:"理性·独立·拿破仑" },
    { id:"w-indust",  from:1815,  to:1914,  label:"工业时代",     sub:"铁路·电力·民族国家" },
    { id:"w-war",     from:1914,  to:1945,  label:"大战时代",     sub:"两次大战·极权·萧条" },
    { id:"w-cold",    from:1945,  to:1991,  label:"冷战",         sub:"两极·太空·互联网前夜" },
    { id:"w-global",  from:1991,  to:2026,  label:"全球化时代",   sub:"互联网·AI·多极" }
  ],

  /* 主题时间线：成员由主控在装配期按 tags/关键词回填，此处给目录与静态序列 */
  themes: []
};
