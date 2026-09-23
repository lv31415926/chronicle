/* chronicle reign | 中国政权与纪年边界表 v1
 * 口径说明：只收录边界学界通行、无争议的政权区间。
 * 年号未全录 —— 年号改元边界存在大量争议与在建中改元等复杂情形，
 * 为避免给出错误纪年，界面纪年由「公元年 + 时代带 + 事件 state（政权）」三段构成。
 * 需要补全 年号表 时，按 tools/DATA_SCHEMA.md 的校验流程增量加入并在 detail 中注明出处。
 */
window.__CHRONICLE_REIGN = {
  /* 更细粒度的政权区间（cnEras 的下钻），字段：from,to,label,note */
  polities: [
    { from:-1046, to:-841,  label:"西周",        note:"都镐京" },
    { from:-841,  to:-828,  label:"共和行政",     note:"中国连续确切纪年之始" },
    { from:-827,  to:-771,  label:"西周（宣幽）",  note:"至犬戎破镐京" },
    { from:-770,  to:-476,  label:"东周·春秋",    note:"平王东迁洛邑" },
    { from:-475,  to:-221,  label:"战国",         note:"七雄并立" },
    { from:-221,  to:-207,  label:"秦",           note:"始皇帝至子婴" },
    { from:-206,  to:9,     label:"西汉",         note:"都长安；含新莽间隔" },
    { from:9,     to:25,    label:"新莽",         note:"王莽改制" },
    { from:25,    to:220,   label:"东汉",         note:"都洛阳；末为三国鼎立" },
    { from:220,   to:265,   label:"三国",         note:"魏蜀吴" },
    { from:265,   to:316,   label:"西晋",         note:"短暂统一" },
    { from:317,   to:420,   label:"东晋",         note:"都建康；北方十六国" },
    { from:420,   to:589,   label:"南北朝",       note:"宋齐梁陈 / 北魏东西北齐北周" },
    { from:581,   to:618,   label:"隋",           note:"统一与大运河" },
    { from:618,   to:907,   label:"唐",           note:"含武周 690–705" },
    { from:907,   to:960,   label:"五代十国",      note:"中原五代与南方诸国" },
    { from:960,   to:1127,  label:"北宋",         note:"与辽、西夏并立" },
    { from:1127,  to:1279,  label:"南宋",         note:"与金、西夏、蒙并立" },
    { from:916,   to:1125,  label:"辽",           note:"契丹；与北宋并立" },
    { from:1038,  to:1227,  label:"西夏",         note:"党项；与宋金并立" },
    { from:1115,  to:1234,  label:"金",           note:"女真；与南宋并立" },
    { from:1271,  to:1368,  label:"元",           note:"至元国号至顺帝北走" },
    { from:1368,  to:1644,  label:"明",           note:"都南京后迁北京" },
    { from:1644,  to:1912,  label:"清",           note:"入关至宣统退位" },
    { from:1912,  to:1928,  label:"中华民国（北京政府）", note:"民国纪年；南北对峙" },
    { from:1928,  to:1949,  label:"中华民国（南京政府）", note:"抗战与国共内战" },
    { from:1949,   to:2026, label:"中华人民共和国", note:"1949-10-01 成立" }
  ],

  /* 1912 起民国纪年换算：民国 N 年 = 1911 + N */
  minguoEpoch: 1911,
  prcEpoch: 1949
};
