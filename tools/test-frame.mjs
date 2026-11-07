/* test-frame.mjs | validate-frame 的可红性自审：每道门都要被定向打红一次
 * 用法: node tools/test-frame.mjs
 *
 * 视角层是本站唯一允许写评价与比较的地方，所以它的门必须比地理层更硬：
 * 一道不会红的「反造神门」等于没有——写主张的人会以为机器已经替他核过了。
 * 夹具用合成语料（不读真实分片），判据要在 4 条数据上被精确打中。
 */
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const failures = [];
function ok(c, n) { if (c) pass++; else { fail++; failures.push("✗ " + n); } }

const dump = (name, v) => `window.${name} = ${JSON.stringify(v, null, 1)};\n`;
const chunk = (id, list) => `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\nwindow.__CHRONICLE_CHUNK[${JSON.stringify(id)}] = ${JSON.stringify(list, null, 1)};\n`;

function ev(id, track, year, title, impact, sources) {
  return { id, track, year, yearApprox: false, dim: "science", weight: 5, title,
    summary: title + " 的摘要", detail: { background: "", process: "经过", impact,
      figures: [], place: "某地（今陕西西安）", state: "某", sources, tags: ["夹具"] }, related: [] };
}
const GROUND = "这是世界最早的地震仪器记载";
/* 夹具语料：每条的 impact 里都留一段可被逐字引用的原文，
 * 并把「仅书名」「跨千年」两类陷阱材料一并备齐，供下面的用例打。 */
function mk(id, track, year, title, impact, sources) { return ev(id, track, year, title, impact, sources); }
const EVENTS = () => ([
  mk("cn--132--s01", "cn", 132, "夹具·地动仪", GROUND + "；开了以器物观测的先例。", ["《后汉书·张衡传》卷五十九"]),
  mk("cn--b221--i02", "cn", -221, "夹具·郡县", "成为中国两千余年地方行政的基本框架。", ["《史记·秦始皇本纪》"]),
  mk("cn--105--s01", "cn", 105, "夹具·造纸", "书写材料第一次得到廉价而可量产的植物纤维载体。", ["《后汉书·蔡伦传》卷一〇二"]),
  mk("cn--1045--s01", "cn", 1045, "夹具·活字", "活字之法较之雕版可以重复、可以补缺，为印刷史之大变。", ["《梦溪笔谈》卷十八"]),
  mk("cn--533--s01", "cn", 533, "夹具·农书", "《齐民要术》为今存最早而最完之农书。", ["《齐民要术·自序》卷一"]),
  mk("cn--b55--i01", "cn", -55, "夹具·常平仓", "是古代中国以财政手段调节市场最早的成熟设计。", ["《汉书·食货志》卷九十"]),
  mk("cn--610--s01", "cn", 610, "夹具·运河", "全长两千余公里的大运河体系至此成型。", ["《隋书·炀帝纪》卷三"]),
  mk("cn--724--s01", "cn", 724, "夹具·测影", "这是世界天文史上最早由人力组织的大地子午线实测。", ["《旧唐书·历志》卷三十五"]),
  mk("cn--weak--s01", "cn", 1000, "夹具·仅书名", "是某项成就之最。", ["《某书》"]),
  mk("world--132--p01", "world", 132, "夹具·同年罗马", "同年帝国的另一件事。", ["《罗马帝王纪》卷十九"]),
  mk("world--751--s01", "world", 751, "夹具·纸坊东传", "廉价书写材料取代莎草与羊皮。", ["比鲁尼《著作目录》"]),
  mk("world--1854--i01", "world", 1854, "夹具·文官考试", "以考试取士在近代西方重新制度化。", ["《诺斯科特—屈维廉报告》"]),
]);
/* 每条看点用的 ground 必须是它自己那条的 impact 原文；peer 的 relation 按真实年差给。 */
const SPEC = {
  "cn--132--s01":  { ground: GROUND, peer: ["world--132--p01", "同期"] },
  "cn--b221--i02": { ground: "成为中国两千余年地方行政的基本框架", peer: ["world--1854--i01", "后继"] },
  "cn--105--s01":  { ground: "书写材料第一次得到廉价而可量产的植物纤维载体", peer: ["world--751--s01", "后继"] },
  "cn--1045--s01": { ground: "活字之法较之雕版可以重复、可以补缺，为印刷史之大变", peer: ["world--1854--i01", "后继"] },
  "cn--533--s01":  { ground: "《齐民要术》为今存最早而最完之农书", peer: ["world--1854--i01", "后继"] },
  "cn--b55--i01":  { ground: "是古代中国以财政手段调节市场最早的成熟设计", peer: ["world--132--p01", "后继"] },
  "cn--610--s01":  { ground: "全长两千余公里的大运河体系至此成型", peer: ["world--751--s01", "后继"] },
  "cn--724--s01":  { ground: "这是世界天文史上最早由人力组织的大地子午线实测", peer: ["world--751--s01", "同期"] },
};
function hl(id) {
  const sp = SPEC[id];
  return {
    id, why: "为什么值得看：夹具说明句。",
    claim: { text: "该成就在比较范围内成立", ground: sp.ground,
      basis: "以文献记载与实物为准", scope: "欧亚大陆", strength: "通行说法",
      dispute: "记载与复原方案存在分歧，本条只主张记载本身。" },
    peer: { id: sp.peer[0], relation: sp.peer[1], note: "并置说明：只作同期或后继对照，不作高下判断。" },
  };
}
const FRAME = (hs) => ({ version: 1, stance: "本站有明确的编辑立场，立场只写在这一层。",
  highlights: hs || Object.keys(SPEC).map(hl) });

function fixture(mutate, after) {
  const data = { events: EVENTS(), frame: FRAME() };
  if (mutate) mutate(data);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chron-frame-"));
  fs.mkdirSync(path.join(dir, "data/cn"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/wd"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/frame"), { recursive: true });
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/cn/cn-01.js"), chunk("cn-01", data.events.filter((e) => e.track === "cn")));
  fs.writeFileSync(path.join(dir, "data/wd/wd-01.js"), chunk("wd-01", data.events.filter((e) => e.track === "world")));
  fs.writeFileSync(path.join(dir, "data/frame/highlights.js"), dump("__CHRONICLE_FRAME", data.frame));
  fs.copyFileSync(path.join(ROOT, "js/prov.js"), path.join(dir, "js/prov.js"));
  /* after 在文件写完之后才跑：注入器用例要改的是「已落盘的产物」，
   * 在 mutate 阶段目录还不存在，写出来只会是 ReferenceError。 */
  if (after) after(dir);
  return dir;
}
function run(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "validate-frame.mjs"), "--root", dir], { encoding: "utf8" });
  return { rc: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function mustRed(name, code, mutate) {
  const dir = fixture(mutate);
  const { rc, out } = run(dir);
  ok(rc === 1 && out.includes(code), `${name} → 变红并点名 ${code}`);
  if (!(rc === 1 && out.includes(code))) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 5).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ⓪ 正控制 */
{
  const dir = fixture();
  const { rc, out } = run(dir);
  ok(rc === 0, `基线夹具判绿（rc=${rc}）\n${out}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
/* ① 注入器自审：全局名写错必须红，否则上面那条绿可能是读空气 */
{
  const dir = fixture(null, (d) => {
    fs.writeFileSync(path.join(d, "data/frame/highlights.js"),
      fs.readFileSync(path.join(d, "data/frame/highlights.js"), "utf8").replace("__CHRONICLE_FRAME", "__CHRONICLE_FRAMEZ"));
  });
  const { rc, out } = run(dir);
  ok(rc === 1 && out.includes("FRAME_SCHEMA"), "全局名写错时门变红（证明门真在读这个全局）");
  fs.rmSync(dir, { recursive: true, force: true });
}
/* ② 各门 */
mustRed("看点 id 不存在", "FRAME_SCHEMA", (d) => { d.frame.highlights[0].id = "cn--9999--s99"; });
mustRed("缺 why", "FRAME_SCHEMA", (d) => { delete d.frame.highlights[0].why; });
mustRed("缺 ground", "FRAME_SCHEMA", (d) => { delete d.frame.highlights[0].claim.ground; });
mustRed("立场声明缺失", "FRAME_STANCE", (d) => { delete d.frame.stance; });
mustRed("看点过少（空壳功能）", "FRAME_EMPTY", (d) => { d.frame.highlights = d.frame.highlights.slice(0, 3); });
mustRed("ground 不是条目原文（反造神主判据）", "FRAME_GROUND", (d) => {
  /* 只改一个字：原文写「记载」，主张引成「记录」——逐字比对必须抓到 */
  d.frame.highlights[0].claim.ground = "这是世界最早的地震仪器记录";
});
mustRed("把 A 条的原文当作 B 条的依据", "FRAME_GROUND", (d) => {
  d.frame.highlights[1].claim.ground = GROUND;   // 郡县那条不可能写着地动仪的话
});
mustRed("极限词缺判据", "FRAME_SUPERLATIVE", (d) => { delete d.frame.highlights[0].claim.basis; });
mustRed("极限词缺范围", "FRAME_SUPERLATIVE", (d) => { delete d.frame.highlights[0].claim.scope; });
mustRed("极限词缺强度", "FRAME_SUPERLATIVE", (d) => { delete d.frame.highlights[0].claim.strength; });
mustRed("强度越枚举", "FRAME_STRENGTH", (d) => { d.frame.highlights[0].claim.strength = "毫无疑问"; });
mustRed("非确证却不写争议", "FRAME_DISPUTE", (d) => { delete d.frame.highlights[0].claim.dispute; });
mustRed("仅书名材料不得立成就论", "FRAME_PROV", (d) => {
  d.frame.highlights[0] = { id: "cn--weak--s01", why: "夹具：仅书名材料",
    claim: { text: "某项成就之最", ground: "是某项成就之最。",
      basis: "以文献为准", scope: "全球", strength: "通行说法", dispute: "出处只到书名，无从定位。" } };
});
mustRed("对照侧 id 不存在", "FRAME_PEER", (d) => { d.frame.highlights[0].peer.id = "world--9999--p99"; });
mustRed("relation 越枚举", "FRAME_PEER", (d) => { d.frame.highlights[0].peer.relation = "同时代"; });
mustRed("对照缺 id", "FRAME_PEER", (d) => { delete d.frame.highlights[0].peer.id; });
mustRed("标「同期」却跨千年", "FRAME_PEER", (d) => {
  d.frame.highlights[0].peer = { id: "world--1854--i01", relation: "同期", note: "把一千七百年说成同期，正是最容易混过去的那种错。" };
});
mustRed("对照缺并置说明", "FRAME_PEER", (d) => { d.frame.highlights[0].peer.note = ""; });

/* ③ 生产数据实测 */
{
  const { rc, out } = run(ROOT);
  ok(rc === 0, `真实视角层判绿\n${out.split("\n").slice(0, 3).join("\n")}`);
  const m = /看点 (\d+) 条 · 带对照 (\d+) 条 · 自带争议标注 (\d+) 条/.exec(out);
  ok(!!m && Number(m[1]) >= 8, `真实看点条数 ${m ? m[1] : "?"} ≥ 8`);
}
console.log(`\n视角层门自审：${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`);
if (fail) { console.log(failures.join("\n")); process.exitCode = 1; }
else console.log("✅ 每道视角层门都被定向打红过一次，且真实看点判绿");
