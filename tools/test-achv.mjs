/* test-achv.mjs | validate-achv 的可红性自审：四个检查码都要被定向打红一次
 * 用法: node tools/test-achv.mjs
 *
 * 成就线门管的是「地基还在不在」，所以它的用例全是对地基的破坏动作：
 * 删线、清空成员、把锚点降级、把成就维的出处抽成书名、把评价词写进正文。
 * 棘轮那条只能在**全量级夹具**上测——基线是个绝对数，30 条的小夹具永远推不过去，
 * 于是这里备两套语料：紧凑夹具测线与立场，200 条夹具测棘轮。
 * 另外三条「不该红」的用例（引号内评价词 / 名词性字段里的评价词 / 非成就线塌方）
 * 同样必须写：豁免如果被写坏了，门会变成一台只会叫的机器，那和没有门一样糟。
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const failures = [];
function ok(c, n) { if (c) pass++; else { fail++; failures.push("✗ " + n); } }

/* 与 tools/validate-achv.mjs 里的 ACHV_LINES 同一份名单 */
const ACHV_LINES = [
  "bronze-ritual", "silk-ceramic", "hydraulic", "calendar-math", "medicine-agri",
  "exam-bureaucracy", "writing-painting", "grain-relief", "maritime"
];
const DIMS = ["science", "culture", "art", "institution", "explore", "economy"];
const KW = "夹具关键词";

/* 棘轮基线只有一份，住在 tools/validate-achv.mjs。夹具从它的源码里把数读出来，
 * 不再抄第二个——抄了就意味着每次降基线都得记得同步改夹具，
 * 忘了的话「压在基线上判绿」这条正控制会先变红，看起来像门坏了一样。 */
const BASELINE = (() => {
  const src = fs.readFileSync(path.join(ROOT, "tools", "validate-achv.mjs"), "utf8");
  const m = /const PROV_BASELINE = (\d+);/.exec(src);
  if (!m) throw new Error("未能从 validate-achv.mjs 读出 PROV_BASELINE");
  const n = Number(m[1]);
  /* 棘轮夹具是 200 条，基线一旦 ≥199 就压不出「比基线多一条」的红——必须当场喊，不能静默失效 */
  if (n >= 199) throw new Error(`棘轮夹具 200 条装不下基线 ${n}：加大夹具或改回读真实语料`);
  return n;
})();

const dump = (name, v) => `window.${name} = ${JSON.stringify(v, null, 1)};\n`;
const chunk = (id, list) => `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\n` +
  `window.__CHRONICLE_CHUNK[${JSON.stringify(id)}] = ${JSON.stringify(list, null, 1)};\n`;

function mkEv(i, opt) {
  const o = Object.assign({ dim: DIMS[i % DIMS.length], weight: i % 3 === 0 ? 4 : 3,
    track: i % 2 === 0 ? "cn" : "world", titled: false, impact: "影响与意义，只陈述事实。" }, opt);
  const year = 1000 + i;
  return {
    id: `${o.track}--${year}--s01`, track: o.track, year, yearApprox: false,
    dim: o.dim, weight: o.weight, title: "夹具条目" + i, summary: "夹具摘要" + i,
    detail: { background: "缘起。", process: "经过。", impact: o.impact,
      figures: [], place: "某地（今陕西西安）", state: "某",
      /* 《夹具书》只到书名；《夹具书·卷三》给了篇目——溯源档差全靠这两条 sources 拉开 */
      sources: o.titled ? ["《夹具书》"] : ["《夹具书·卷三》"], tags: [KW] },
    related: [],
  };
}

/* 紧凑夹具 30 条：够把 FLOOR（成员 15／w≥4 两条／w≥3 十条／中国侧五条）全部站上，
 * 且成就维 w≥4 全部 locatable，棘轮余量为零干扰。 */
function compactEvents() {
  return Array.from({ length: 30 }, (_, i) => mkEv(i));
}
/* 棘轮夹具 200 条：全部落在成就维、全部 w≥4，其中 BASELINE 条只到书名——正压在基线上。 */
function ratchetEvents(titled) {
  return Array.from({ length: 200 }, (_, i) => mkEv(i, { dim: "science", weight: 4, titled: i < titled }));
}

function themes(extra) {
  const list = ACHV_LINES.map((id) => ({
    id, label: "夹具线·" + id, from: -3000, to: 2026, minScore: 2, max: 400, keywords: [KW],
  }));
  if (extra) list.push({ id: "not-an-achv-line", label: "夹具·非成就线", from: -3000, to: 2026, minScore: 2, max: 400, keywords: [KW] });
  return list;
}

function fixture(mutate, opts) {
  const o = Object.assign({ mode: "compact", titled: BASELINE, extraTheme: true }, opts);
  const data = {
    events: o.mode === "ratchet" ? ratchetEvents(o.titled) : compactEvents(),
    themes: themes(o.extraTheme),
  };
  if (mutate) mutate(data);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chron-achv-"));
  fs.mkdirSync(path.join(dir, "data/cn"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/wd"), { recursive: true });
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/cn/cn-01.js"), chunk("cn-01", data.events.filter((e) => e.track === "cn")));
  fs.writeFileSync(path.join(dir, "data/wd/wd-01.js"), chunk("wd-01", data.events.filter((e) => e.track === "world")));
  fs.writeFileSync(path.join(dir, "data/themes.js"), dump("__CHRONICLE_THEMES", data.themes));
  fs.copyFileSync(path.join(ROOT, "js/prov.js"), path.join(dir, "js/prov.js"));
  return dir;
}
function run(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "validate-achv.mjs"), "--root", dir], { encoding: "utf8" });
  return { rc: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function mustRed(name, code, mutate, opts) {
  const dir = fixture(mutate, opts);
  const { rc, out } = run(dir);
  ok(rc === 1 && out.includes(code), `${name} → 变红并点名 ${code}`);
  if (!(rc === 1 && out.includes(code))) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 6).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}
function mustGreen(name, mutate, opts) {
  const dir = fixture(mutate, opts);
  const { rc, out } = run(dir);
  ok(rc === 0, `${name} → 判绿（rc=${rc}）`);
  if (rc !== 0) failures.push("    实得红：\n" + out.split("\n").slice(-8).join("\n"));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ⓪ 正控制：两套夹具都得先绿，否则下面的「变红」可能只是夹具本来就没跑通 */
mustGreen("紧凑夹具基线判绿");
mustGreen(`棘轮夹具压在基线 ${BASELINE} 上判绿`, null, { mode: "ratchet", titled: BASELINE });

/* ① 注入器自审：全局名写错必须红，证明门真在读 data/themes.js */
{
  const dir = fixture();
  fs.writeFileSync(path.join(dir, "data/themes.js"),
    fs.readFileSync(path.join(dir, "data/themes.js"), "utf8").replace("__CHRONICLE_THEMES", "__CHRONICLE_THEMESZ"));
  const { rc, out } = run(dir);
  ok(rc === 1 && out.includes("ACHV_LINE"), "主题线全局名写错时门变红（证明门真在读这份文件）");
  if (!(rc === 1 && out.includes("ACHV_LINE"))) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 4).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ② ACHV_LINE：成就线被删或被改名 */
mustRed("成就线整条被删", "ACHV_LINE", (d) => { d.themes = d.themes.filter((t) => t.id !== "silk-ceramic"); });
mustRed("成就线被改名", "ACHV_LINE", (d) => { const t = d.themes.find((x) => x.id === "hydraulic"); t.id = "hydraulics"; });

/* ③ ACHV_GAP：成员塌方／锚点清零／中国侧消失 */
mustRed("成就线成员清零", "ACHV_GAP", (d) => { const t = d.themes.find((x) => x.id === "maritime"); t.from = 1; t.to = 1; });
mustRed("成就线只剩过程流水（w≥4 清零）", "ACHV_GAP", (d) => { d.events.forEach((e) => { e.weight = 3; }); });
mustRed("成就线整体降级到 w2", "ACHV_GAP", (d) => { d.events.forEach((e) => { e.weight = 2; }); });
mustRed("名为中国成就却几乎全是别国的故事", "ACHV_GAP", (d) => {
  d.events.forEach((e) => { e.track = "world"; e.id = "world--" + e.year + "--s01"; });
});
mustGreen("非成就线塌方不牵连成就门", (d) => {
  const t = d.themes.find((x) => x.id === "not-an-achv-line"); t.from = 1; t.to = 1;
});

/* ④ ACHV_PROV_RATCHET：只许降不许升——在 200 条的全量级夹具上才测得动 */
mustRed("仅书名的成就锚点越过基线一条", "ACHV_PROV_RATCHET", null, { mode: "ratchet", titled: BASELINE + 1 });
mustGreen("把一条锚点补到可定位（棘轮允许的方向）", null, { mode: "ratchet", titled: BASELINE - 1 });

/* ⑤ ACHV_STANCE：评价词漏进事实层
 * 用例都打在 impact 上是因为 impact 最容易写顺——「影响与意义」正是形容词藏身的地方。 */
mustRed("impact 里写「辉煌」", "ACHV_STANCE", (d) => { d.events[0].detail.impact = "这是辉煌的成就。"; });
mustRed("title 里写「瑰宝」", "ACHV_STANCE", (d) => { d.events[3].title = "夹具·一件瑰宝"; });
mustRed("summary 里写「遥遥领先」", "ACHV_STANCE", (d) => { d.events[6].summary = "其工艺遥遥领先于同期。"; });
mustGreen("同一评价词落在引号对内（转述原文合法）", (d) => {
  d.events[0].detail.impact = "报告称「这是辉煌的成就」。";
});
mustGreen("名词性字段里的专名不误报", (d) => {
  /* 扫描域之外的用例：写坏了也不会红，所以必须钉在这里——
   * 「吴伟业之纪事」「光荣之革命」这类专名一旦进扫描域，门就叫个不停。 */
  d.events[1].detail.tags.push("吴伟业之纪事", "光荣之革命");
  d.events[1].detail.sources.push("《伟大征程》汇编");
});

/* ⑥ 生产数据实测 */
{
  const { rc, out } = run(ROOT);
  ok(rc === 0, `真实语料判绿\n${out.split("\n").slice(-3).join("\n")}`);
  const m = /成就维 w≥4 锚点 (\d+) 条，其中只到书名 (\d+) 条/.exec(out);
  ok(!!m && Number(m[2]) <= BASELINE, `真实棘轮读数 ${m ? m[2] : "?"} ≤ 基线 ${BASELINE}（锚点共 ${m ? m[1] : "?"} 条）`);
  const s = /事实层评价词越界 (\d+) 处/.exec(out);
  ok(!!s && Number(s[1]) === 0, `真实事实层评价词越界 ${s ? s[1] : "?"} 处`);
}

console.log(`\n成就线门自审：${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`);
if (fail) { console.log(failures.join("\n")); process.exitCode = 1; }
else console.log("✅ 四个检查码都被定向打红过一次，三条豁免边界都验过，真实语料判绿");
