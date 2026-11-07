/* intake.mjs | 投稿记录的分诊台：读记录 → 判格式 → 查重 → 出一张「待裁清单」
 *
 * 用法:
 *   node tools/intake.mjs --from <目录或文件>        人读报告（默认）
 *   node tools/intake.mjs --from <目录> --json        机器可读，供 CI 与脚本消费
 *   node tools/intake.mjs --from <目录> --strict      有 reject 就 rc=1（PR 上的机器门）
 *
 * 为什么要有它：README 第 10 步的并档是纯手工动作，投稿一多就会退化成
 * 「谁催得急先并谁的」。本工具把不需要人判断的那一段（格式、年份口径、
 * 是否与既有条目重复、补的出处能不能升级溯源档）先跑完，把只剩历史判断的
 * 那一小撮递到人面前。
 *
 * **本工具一条数据都不写。** 它只读 `data/`，只输出清单。
 * 「添新条目」要进时间轴必须有人按 DATA_SCHEMA 落盘并重跑必跑清单——
 * 这不是技术限制，是这套体系的唯一写入闸门；自动合并等于把闸门拆了。
 *
 * 判据零复制：合规与否用 contribute.js 的 checkRecord（站内表单同一把尺子），
 * 「补的出处能否定位」用 prov.js 的 KINDS（界面徽章同一把尺子）。
 * 在这里重写一遍正则，就有了两把尺子——而两把尺子迟早量出两个答案。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const AS_JSON = ARGS.includes("--json");
const STRICT = ARGS.includes("--strict");
const FROM_IDX = ARGS.indexOf("--from");
const FROM = FROM_IDX >= 0 ? ARGS[FROM_IDX + 1] : "";

/* ---------- 把浏览器侧的判据搬进 node（垫片形态与 test-units.mjs 一致） ---------- */
const win = {
  __CHRONICLE_META: null, __CHRONICLE_CHUNK: {}, __CHRONICLE_MANIFEST: null,
  document: { documentElement: { setAttribute() {}, getAttribute() { return null; }, style: {} },
    head: { appendChild() {} }, body: { appendChild() {} },
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
    getElementById: () => null, querySelector: () => null, addEventListener() {} },
  addEventListener() {}, localStorage: { getItem: () => null, setItem() {} },
};
win.window = win;

function load(rel, ...extra) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const names = ["window", "document", "localStorage", "CustomEvent", "setTimeout"].concat(extra.map(e => e[0]));
  const vals = [win, win.document, win.localStorage, function () {}, function () {}].concat(extra.map(e => e[1]));
  new Function(...names, src)(...vals);
}

load("data/meta.js");
load("data/manifest.js");
for (const sub of ["cn", "wd"]) {
  const dir = path.join(ROOT, "data", sub);
  for (const n of fs.readdirSync(dir).filter(x => x.endsWith(".js")).sort()) load(`data/${sub}/${n}`);
}
const EVENTS = Object.values(win.__CHRONICLE_CHUNK).flat();
const BY_ID = new Map(EVENTS.map(e => [e.id, e]));
/* ChronLoader 在浏览器里靠注入 <script> 取数据；这里给它一份现成的表，
 * 只实现 contribute.js/prov.js 真正调用的那几个面，其余一律不留（留了就是影子 API）。 */
win.ChronLoader = { eventById: (id) => BY_ID.get(id) || null, allEvents: () => EVENTS,
  byId: BY_ID, chunks: () => Object.keys(win.__CHRONICLE_CHUNK) };
load("js/time.js");
load("js/prov.js");
load("js/contribute.js");

const CC = win.ChronContribute, PV = win.ChronProv, M = win.__CHRONICLE_META;
if (!CC || !PV) { console.error("判据装载失败：ChronContribute/ChronProv 不在垫片里求值出来了"); process.exit(1); }

/* 白名单：站内 buildRecord 能写出的键。记录里出现别的键，一律丢弃并记一条告警——
 * 与表单侧「根本没有这条路」等价，只是这边面对的是人手改过的 JSON。 */
const ALLOWED = {
  head: ["schema", "kind", "at", "app", "who", "target", "locator", "note", "verdict", "event"],
  event: ["year", "yearApprox", "track", "dim", "title", "summary", "sources", "weight"],
};
/* 这些键一旦出现在提交里，无论值是什么都拒：它们声称的是「这条有多可信/多重要」，
 * 而那两个判断在本站分属 prov.js 现算与维护口径，不在投稿面。 */
const POISON = ["tier", "verified", "confidence", "score", "authority", "official", "weight"];

/* ---------- 输入解析：.json 直接读，.md 取 ```json 围栏 ---------- */
function extract(text, origin) {
  const out = [];
  const fences = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (fences.length) {
    for (const f of fences) { try { out.push({ rec: JSON.parse(f[1]), origin }); }
      catch (e) { out.push({ bad: `JSON 解析失败：${e.message}`, origin }); } }
    return out;
  }
  if (/^\s*[{[]/.test(text)) {
    try { const j = JSON.parse(text); (Array.isArray(j) ? j : [j]).forEach(r => out.push({ rec: r, origin })); }
    catch (e) { out.push({ bad: `JSON 解析失败：${e.message}`, origin }); }
    return out;
  }
  return [{ bad: "文件里没有 ```json 围栏，也没有可解析的 JSON", origin }];
}

function readFrom(target) {
  if (!target) throw new Error("缺 --from：给它一个装投稿记录的目录或文件");
  const st = fs.statSync(target);
  /* 报告里的路径以 --from 为基准，不是以仓库为基准：投稿目录常在仓库外，
   * 用 path.relative(ROOT, …) 会印出 "../../../../tmp/inbox/x.json" 这种没人能抄的东西。 */
  const base = st.isDirectory() ? target : path.dirname(path.resolve(target));
  const files = st.isDirectory()
    ? fs.readdirSync(target).filter(f => /\.(json|md|txt)$/i.test(f)).sort().map(f => path.join(target, f))
    : [target];
  const recs = [];
  for (const f of files) for (const r of extract(fs.readFileSync(f, "utf8"), path.relative(base, f))) recs.push(r);
  return { files, recs };
}

/* ---------- 判据 ---------- */
const norm = (s) => String(s || "").replace(/[，。、：；""''（）\s]/g, "").toLowerCase();
/* 与既有条目是否像同一件事：同年同轨 + 标题归一后互为子串，或共字比率 ≥0.6。
 * 阈值低是故意的——这里是「送去给人裁」的召回器，不是判同器。
 * 实测语料里 cn--1853--m01「太平军克武昌，沿江东下」与 m02「太平军克江宁，建为天京」
 * 只共 4 字，共字比率 0.3 上下，不会误并进同一组。 */
function sharedRatio(a, b) {
  const sa = new Set(norm(a)), sb = new Set(norm(b));
  let inter = 0; for (const c of sa) if (sb.has(c)) inter++;
  return inter / Math.max(1, Math.min(sa.size, sb.size));
}
function findDup(rec) {
  const e = rec.event || {};
  const cands = EVENTS.filter(x => x.track === e.track && x.year === e.year);
  const hits = [];
  for (const c of cands) {
    const a = norm(e.title), b = norm(c.title);
    if (!a || !b) continue;
    if (a === b || a.includes(b) || b.includes(a) || sharedRatio(a, b) >= 0.6) hits.push(c.id + ":" + c.title);
  }
  return hits;
}
/* 补的出处能不能升级：拿 prov.js 的六类定位器去量新 locator。
 * 量不到就如实写「补了仍停在仅书名」——那是给投稿人的回执，也是给人的排序依据。 */
function locatorUpgrades(locator) {
  const kinds = PV.KINDS.filter(k => k.re.test(String(locator || "")));
  return kinds.map(k => k.label);
}

function triage(item) {
  const row = { origin: item.origin, status: "pending", reasons: [], flags: [] };
  if (item.bad) { row.status = "unreadable"; row.reasons.push(item.bad); return row; }
  const rec = item.rec || {};
  for (const k of Object.keys(rec)) if (!ALLOWED.head.includes(k)) { row.flags.push(`丢弃未知键 ${k}`); }
  if (rec.event) for (const k of Object.keys(rec.event))
    if (!ALLOWED.event.includes(k)) row.flags.push(`丢弃未知键 event.${k}`);
  if (POISON.some(k => k === "weight" ? rec.event && rec.event.weight != null : rec[k] != null))
    row.flags.push("含自封可信/权重字段，已丢弃（等级由 prov.js 现算，权重由维护口径定）");
  if (rec.schema !== CC.SCHEMA) {
    row.status = "reject"; row.reasons.push(`schema 不是 ${CC.SCHEMA}（实得 ${JSON.stringify(rec.schema)}）`); return row;
  }
  if (!CC.KINDS[rec.kind]) { row.status = "reject"; row.reasons.push(`未知投稿类型 ${rec.kind}`); return row; }
  const clean = JSON.parse(JSON.stringify(rec));
  clean.weight = null; if (clean.event) clean.event.weight = null;
  const errs = CC.checkRecord(clean);
  if (errs.length) { row.status = "reject"; row.reasons.push(...errs); return row; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rec.at || ""))) row.flags.push("缺提交日期 at（署名与时间无从对账）");
  else if (rec.at > new Date().toISOString().slice(0, 10)) row.flags.push(`提交日期在未来（${rec.at}）`);
  if (!rec.who) row.flags.push("无署名：并档后 checks[].by 为空，读者查不到是谁核的");
  if (rec.kind === "source" || rec.kind === "check") {
    const up = locatorUpgrades(rec.locator);
    row.flags.push(up.length ? `出处可定位：${up.join("/")}` : "出处只到书名，补进去也升不了档");
    if (rec.kind === "check" && rec.verdict !== "confirm") row.status = "review";
  }
  if (rec.kind === "event") {
    const hits = findDup(rec);
    if (hits.length) { row.status = "review"; row.dups = hits; }
  }
  return row;
}

/* ---------- 输出 ---------- */
const ORDER = ["reject", "unreadable", "review", "pending"];
function report(rows, files) {
  const c = {}; for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
  if (AS_JSON) { console.log(JSON.stringify({ files: files.length, total: rows.length, counts: c, rows }, null, 2)); return; }
  console.log(`投稿分诊 | 读 ${files.length} 个文件 / ${rows.length} 条记录 | 语料 ${EVENTS.length} 条参与查重`);
  console.log(ORDER.filter(k => c[k]).map(k => `${k} ${c[k]}`).join("   "));
  for (const st of ORDER) {
    const g = rows.filter(r => r.status === st);
    if (!g.length) continue;
    console.log(`\n=== ${st} (${g.length}) ===`);
    for (const r of g) {
      const rec = r.rec || {};
      const what = rec.kind === "event" ? `${rec.event && rec.event.year} · ${rec.event && rec.event.title}`
        : `${rec.target || "?"}`;
      console.log(`- ${r.origin} [${rec.kind || "?"}] ${what}`);
      for (const x of r.reasons) console.log(`    × ${x}`);
      for (const x of r.flags) console.log(`    · ${x}`);
      for (const x of (r.dups || [])) console.log(`    ≈ 疑似同一件事：${x}`);
    }
  }
  console.log(`\n本工具不写任何数据。并档请照 README 必跑清单第 10 步逐条落盘后重跑六道门。`);
}

try {
  const { files, recs } = readFrom(FROM);
  const rows = recs.map(r => Object.assign(triage(r), { rec: r.rec }));
  if (!rows.length) {
    console.error(`=== ERRORS 1 ===\n--from ${FROM} 里一条记录都没读到。空清单会让上面所有分诊判据集体空转，` +
      `所以这里按失败收场：要么路径写错，要么目录里根本没有 .json/.md。`);
    process.exitCode = 1;
  } else {
    report(rows, files);
    const n = rows.filter(r => r.status === "reject" || r.status === "unreadable").length;
    if (STRICT && n) process.exitCode = 1;
  }
} catch (e) {
  console.error("intake 运行失败：" + e.message);
  process.exitCode = 1;
}
