/* test-dates.mjs | 日层门的可红性自审：每条判据都要被定向打红过一次
 * 用法: node tools/test-dates.mjs
 *
 * 为什么这道自审必须存在：日层的门不像一般格式门那样「改了才会红」——它的核心判据是
 * 「现算并与盘上逐字对账」。这意味着它对两侧都敏感：改 data/dates.js 会红，改条目正文
 * 里那句纪日也会红。两侧都能红、以及**改完正文重跑 --apply 就能绿**，是三件不同的事，
 * 每一件都得有人证明它真的会发生；否则哨兵自己就是假门。
 *
 * 三条硬约束（与 test-gates.mjs 同）：
 *   1) 全程只在 mkdtemp 副本的 data/ 上操作，绝不写仓库工作区；
 *   2) 夹具条目从当前日层运行时挑，不硬编码 id——数据会变，硬编码必腐；
 *   3) 变异前置条件构造不出来即判失败，不允许静默 skip。
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { loadCorpus } from "./geo-lib.mjs";
import { deriveAll, deriveOne, validMD, DATE_RULE } from "./date-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "dates-mut-"));
{
  const parent = path.dirname(TMP), base = path.basename(TMP);
  const stale = fs.readdirSync(parent).filter((n) => n.startsWith("dates-mut-") && n !== base);
  for (const n of stale) fs.rmSync(path.join(parent, n), { recursive: true, force: true });
  if (stale.length) console.log(`已回收上次运行遗留的 ${stale.length} 份现场副本`);
}

/* ---------- 副本与跑门 ---------- */
function freshData(name) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(ROOT, "data"), path.join(dir, "data"), { recursive: true });
  return dir;
}
/* 出错时 Node 把 error.stdout 截在 64 KB（实测与 maxBuffer 无关：1 MB／4 MB／64 MB 三档都断在同一个字节数）。
 * 日层文件一旦缺失，现算的 1553 条全成 DATES_MISSING，回执十几万字——截断的 JSON 解析不了，
 * 用例就报「门未按 --json 输出」，看起来像门的错，其实是回执自己把自己切断了。
 * 所以门在 --json 下按码取样（见 validate-dates.mjs 末段），这边同时把缓冲开到最大以防别的调用方。 */
const BUF = 64 * 1024 * 1024;
function gate(dir) {
  try {
    const out = execFileSync("node", [path.join(ROOT, "tools/validate-dates.mjs"), "--root", dir, "--json"], { encoding: "utf8", maxBuffer: BUF });
    return { code: 0, json: JSON.parse(out) };
  } catch (e) {
    const so = (e.stdout || "").toString();
    let json = null;
    try { json = JSON.parse(so); } catch (_) { /* 门自己崩了，下面按崩溃处理 */ }
    return { code: e.status, json, raw: so || (e.stderr || "").toString() };
  }
}
function apply(dir) {
  execFileSync("node", [path.join(ROOT, "tools/date-candidates.mjs"), "--root", dir, "--apply"], { encoding: "utf8", maxBuffer: BUF });
}
const DF = (dir) => path.join(dir, "data/dates.js");
/* 记录之间的逗号写在行尾、末行没有（生成器就这么排）。
 * 所以删行/插行不能只用 replace(l + ",")——那样要么删不掉，要么拼出一个数组的洞，
 * 门报的是 DATES_FILE 而不是本用例要测的那个码。走 rebuild 才能只动「记录集合」。 */
function readRecs(dir) {
  const t = fs.readFileSync(DF(dir), "utf8");
  const all = t.split("\n");
  const lines = all.map((l, i) => ({ l, i })).filter((x) => /^\s*\{ id: /.test(x.l));
  const body = lines.map((x) => x.l.replace(/,\s*$/, ""));
  return { text: t, lines, body, first: lines[0].i, last: lines[lines.length - 1].i, indent: /^\s*/.exec(lines[0].l)[0] };
}
function rebuild(dir, keep) {
  const r = readRecs(dir);
  const body = keep.map((l) => l.replace(/^\s*/, "").replace(/,\s*$/, "")).map((l, i) => r.indent + l + (i < keep.length - 1 ? "," : ""));
  const lines = fs.readFileSync(DF(dir), "utf8").split("\n");
  fs.writeFileSync(DF(dir), [...lines.slice(0, r.first), ...body, ...lines.slice(r.last + 1)].join("\n"));
  return body.length;
}
function writeText(dir, t) { fs.writeFileSync(DF(dir), t); }
/* 语料分片里条目是一行一个对象：变异只在所属那一行内做，绝不越界碰到别条的正文 */
function locateEntry(dir, id) {
  for (const sub of ["cn", "wd"]) {
    const d = path.join(dir, "data", sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const lines = fs.readFileSync(path.join(d, f), "utf8").split("\n");
      const i = lines.findIndex((l) => l.includes(`id: "${id}"`));
      if (i >= 0) return { file: path.join(sub, f), i };
    }
  }
  return null;
}
/* 对定位到的那一行做改写；返回 false 即「变异没落盘」，由调用方判失败 */
function mutateEntry(dir, loc, fn) {
  const abs = path.join(dir, "data", loc.file);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const before = lines[loc.i];
  const after = fn(before);
  if (!after || before === after) return false;
  lines[loc.i] = after;
  fs.writeFileSync(abs, lines.join("\n"));
  return true;
}

/* ---------- 夹具：从当前日层运行时挑 ---------- */
const corpus = loadCorpus();
const byId = new Map(corpus.map((e) => [e.id, e]));
const { recs: FRESH, ambiguous: FRESH_AMB } = deriveAll(corpus);
const pick = (how) => FRESH.find((r) => r.how === how && byId.get(r.id));
const FIX = {
  any: FRESH[0],
  process: pick("process"),
  text: pick("text"),
  src: pick("src"),
};
for (const k of ["any", "process", "text", "src"]) {
  if (!FIX[k]) { console.log(`夹具构造失败：现算日层里没有 how=${k} 的条目，本自审无从下手`); process.exit(1); }
}
/* process 夹具的三个前置条件（在 ROOT 上判，副本内容逐字相同）：
 *   1) 纪日确在 detail.process 里（不是别的层）；
 *   2) 该条目能在某个分片里定位到唯一一行；
 *   3) process 文本在那一行里逐字出现——含转义引号的条目改不动，拿它做夹具只会让自审变哑。 */
const AR_IN = /(0?[1-9]|1[0-2])\s*月\s*(0?[1-9]|[12][0-9]|3[01])\s*日/;
function procFixture() {
  for (const r of FRESH.filter((x) => x.how === "process")) {
    const e = byId.get(r.id);
    const proc = e && e.detail && e.detail.process;
    if (!proc || !AR_IN.test(proc)) continue;
    const loc = locateEntry(ROOT, r.id);
    if (!loc) continue;
    const line = fs.readFileSync(path.join(ROOT, "data", loc.file), "utf8").split("\n")[loc.i];
    if (!line.includes(proc)) continue;
    return { rec: r, entry: e, proc, loc };
  }
  return null;
}
const PF = procFixture();
if (!PF) {
  console.log("夹具构造失败：现算日层里没有「纪日确在 detail.process、且能逐字定位到分片行」的条目——改正文族变异构造不出来，本自审无从下手");
  process.exit(1);
}
const procEntry = PF.entry;
/* 只在夹具条目自己的 process 文本范围内改写日期，别碰到同一条的其他字段 */
function withProc(line, fn) {
  const newProc = fn(PF.proc);
  return newProc === PF.proc ? null : line.replace(PF.proc, newProc);
}
const PROC_DATE_RE = new RegExp(`(${procEntry.year})\\s*年\\s*(?:${AR_IN.source})`, "g");

let ok = 0, fail = 0;
function t(label, fn) {
  try {
    const r = fn();
    if (r && r.skip) { fail++; console.log(`✗ ${label}：前置条件构造不出来（${r.skip}），不允许静默 skip`); return; }
    ok++; console.log(`✅ ${label}${r && r.note ? `　—　${r.note}` : ""}`);
  } catch (e) {
    fail++; console.log(`✗ ${label}：${e.message}`);
  }
}
/* 每个用例都先证明「变异真的落盘了」，再要求目标检查码出现 */
function mustRed(dir, code, mutated) {
  if (!mutated) return { skip: "变异未改变文件内容" };
  const g = gate(dir);
  if (!g.json) return { skip: `门未按 --json 输出（exit ${g.code}）：${String(g.raw).slice(0, 160)}` };
  if (g.json.ok) return { skip: "判绿了——该检查码打不红，这就是假门" };
  const hit = g.json.errors.filter((x) => x.startsWith(code + " "));
  if (!hit.length) return { skip: `红了但没有 ${code}（实发：${[...new Set(g.json.errors.map((x) => x.split(" ")[0]))].join(",")}）` };
  return { note: `${code} ×${hit.length}` };
}
function mustGreen(dir, mutated) {
  if (!mutated) return { skip: "变异未改变文件内容" };
  const g = gate(dir);
  if (!g.json) return { skip: `门未按 --json 输出：${String(g.raw).slice(0, 160)}` };
  if (!g.json.ok) return { skip: `重跑 --apply 后仍判红：${g.json.errors.slice(0, 2).join(" / ")}` };
  return { note: `回绿 ${g.json.recs} 条` };
}

/* ---------- ① 文件在不在、能不能求值 ---------- */
t("DATES_FILE：日层文件被删", () => {
  const dir = freshData("file-gone");
  const p = DF(dir);
  fs.rmSync(p);
  return mustRed(dir, "DATES_FILE", true);
});
t("DATES_FILE：语法塌了（求值失败）", () => {
  const dir = freshData("file-syntax");
  writeText(dir, fs.readFileSync(DF(dir), "utf8") + "\n}}}\n");
  return mustRed(dir, "DATES_FILE", true);
});
t("DATES_FILE：recs 不是数组", () => {
  const dir = freshData("file-notarray");
  writeText(dir, `window.__CHRONICLE_DATES = { version: 1, rule: ${JSON.stringify(DATE_RULE)}, recs: {} };\n`);
  return mustRed(dir, "DATES_FILE", true);
});
/* ---------- ② 口径版本必须与 date-lib 同步 ---------- */
t("DATES_RULE：改了口径没重生成", () => {
  const dir = freshData("rule-drift");
  const t0 = fs.readFileSync(DF(dir), "utf8");
  writeText(dir, t0.replace(`rule: ${JSON.stringify(DATE_RULE)}`, `rule: "same-year|v0"`));
  return mustRed(dir, "DATES_RULE", t0 !== fs.readFileSync(DF(dir), "utf8"));
});
t("DATES_RULE：历表分界被界面抄走了一份（prolepticBefore 漂移）", () => {
  const dir = freshData("rule-prol");
  const t0 = fs.readFileSync(DF(dir), "utf8");
  if (!/prolepticBefore: \d+/.test(t0)) return { skip: "盘上没有 prolepticBefore 字段——生成器还没补这一项" };
  writeText(dir, t0.replace(/prolepticBefore: \d+/, "prolepticBefore: 1582"));
  return mustRed(dir, "DATES_RULE", t0 !== fs.readFileSync(DF(dir), "utf8"));
});
t("DATES_DERIVE：页脚印的弃收条数与现算不符", () => {
  const dir = freshData("dv-ambigcount");
  const t0 = fs.readFileSync(DF(dir), "utf8");
  if (!/ambiguousCount: \d+/.test(t0)) return { skip: "盘上没有 ambiguousCount——页脚那个数字没处取" };
  writeText(dir, t0.replace(/ambiguousCount: \d+/, "ambiguousCount: 9999"));
  return mustRed(dir, "DATES_DERIVE", true);
});
/* blankDays 是页脚「空 N 天」的唯一来源。它一旦与盘上这份 recs 对不上，
 * 读者看见的就是一个数出来的假缺口（旧写法按 d<=31 数，把 4/31 也算成空一天）。 */
t("DATES_DERIVE：页脚印的空天数被手改", () => {
  const dir = freshData("dv-blankdays");
  const t0 = fs.readFileSync(DF(dir), "utf8");
  if (!/blankDays: \d+/.test(t0)) return { skip: "盘上没有 blankDays——生成器还没把这一项落进日层" };
  writeText(dir, t0.replace(/blankDays: \d+/, "blankDays: 9999"));
  return mustRed(dir, "DATES_DERIVE", true);
});
t("DATES_DERIVE：blankDays 字段整项没有（界面只能自己数格子）", () => {
  const dir = freshData("dv-blankmissing");
  const t0 = fs.readFileSync(DF(dir), "utf8");
  if (!/blankDays: \d+,/.test(t0)) return { skip: "盘上没有 blankDays 可删" };
  writeText(dir, t0.replace(/blankDays: \d+,\n/, ""));
  return mustRed(dir, "DATES_DERIVE", true);
});
/* mdays 是「这一天到底存不存在」的唯一凭据：深链会写 #/today/4/31，
 * 界面要么照实说不存在，要么就得自己猜 4 月有几天——猜出来的那个日期会被读者当成史实。 */
t("DATES_RULE：各月天数表被改（把 4 月说成 31 天）", () => {
  const dir = freshData("dv-mdays");
  const t0 = fs.readFileSync(DF(dir), "utf8");
  if (!/mdays: \[31,29,31,30,/.test(t0)) return { skip: "盘上没有 mdays——生成器还没把历表落进日层" };
  writeText(dir, t0.replace("mdays: [31,29,31,30,", "mdays: [31,29,31,31,"));
  return mustRed(dir, "DATES_RULE", true);
});
t("DATES_SCHEMA：mdays 整项没有（界面无从判断 4/31 存不存在）", () => {
  const dir = freshData("dv-mdaysdrop");
  const t0 = fs.readFileSync(DF(dir), "utf8");
  if (!/mdays: \[[^\]]*\],/.test(t0)) return { skip: "盘上没有 mdays 可删" };
  writeText(dir, t0.replace(/mdays: \[[^\]]*\],\n/, ""));
  return mustRed(dir, "DATES_SCHEMA", true);
});

/* ---------- ③ 单条记录的形 ---------- */
function editRec(dir, idx, replacer) {
  const { text, lines } = readRecs(dir);
  const target = lines[idx];
  if (!target) return false;
  const next = text.slice(0, text.indexOf(target.l)) + replacer(target.l) + text.slice(text.indexOf(target.l) + target.l.length);
  if (next === text) return false;
  writeText(dir, next);
  return true;
}
t("DATES_SCHEMA：二月三十（月日越界）", () => {
  const dir = freshData("sch-day");
  const m = editRec(dir, 0, (l) => l.replace(/m: \d+, d: \d+/, "m: 2, d: 30"));
  return mustRed(dir, "DATES_SCHEMA", m);
});
t("DATES_SCHEMA：四月三十一（小月无 31）", () => {
  const dir = freshData("sch-apr");
  const m = editRec(dir, 0, (l) => l.replace(/m: \d+, d: \d+/, "m: 4, d: 31"));
  return mustRed(dir, "DATES_SCHEMA", m);
});
t("DATES_SCHEMA：how 造一个第五层", () => {
  const dir = freshData("sch-how");
  const m = editRec(dir, 0, (l) => l.replace(/how: "[^"]+"/, 'how: "传说"'));
  return mustRed(dir, "DATES_SCHEMA", m);
});
t("DATES_SCHEMA：日子写成字符串", () => {
  const dir = freshData("sch-type");
  const m = editRec(dir, 0, (l) => l.replace(/d: (\d+)/, 'd: "$1"'));
  return mustRed(dir, "DATES_SCHEMA", m);
});
t("DATES_SCHEMA：二月二十九合法（只该报派生不一致，不该报形）", () => {
  const dir = freshData("sch-feb29");
  const m = editRec(dir, 0, (l) => l.replace(/m: \d+, d: \d+/, "m: 2, d: 29"));
  if (!m) return { skip: "变异未改变文件内容" };
  const g = gate(dir);
  if (!g.json) return { skip: "门未按 --json 输出" };
  const schema = g.json.errors.filter((x) => x.startsWith("DATES_SCHEMA "));
  if (schema.length) return { skip: `2-29 被判成形错误：${schema[0]}` };
  if (g.json.ok) return { skip: "改了一条记录却没判红，说明派生对账没生效" };
  return { note: "2-29 未被当成越界，仍由 DATES_DERIVE 抓到改数" };
});

/* ---------- ④ id 与重复 ---------- */
t("DATES_DUP：同一 id 登记两次", () => {
  const dir = freshData("dup");
  const { body } = readRecs(dir);
  rebuild(dir, [body[0], body[0], ...body.slice(1)]);
  return mustRed(dir, "DATES_DUP", true);
});
t("DATES_SCHEMA：记录之间多一个逗号（数组的洞）", () => {
  const dir = freshData("hole");
  const r = readRecs(dir);
  const lines = fs.readFileSync(DF(dir), "utf8").split("\n");
  lines[r.lines[0].i] = lines[r.lines[0].i].replace(/,\s*$/, ",,");
  fs.writeFileSync(DF(dir), lines.join("\n"));
  /* 这一例真正测的是门自己别崩：语法合法但元素是 undefined，崩了的门等于没有门 */
  return mustRed(dir, "DATES_SCHEMA", true);
});
t("DATES_ID：条目被删而日层留着", () => {
  const dir = freshData("id-gone");
  const victim = FIX.any.id;
  const m = editRec(dir, 0, (l) => l.replace(/id: "[^"]+"/, 'id: "cn--9999--z99"'));
  void victim;
  return mustRed(dir, "DATES_ID", m);
});

/* ---------- ⑤ 现算对账（门的核心）---------- */
t("DATES_DERIVE：手改一个数字", () => {
  const dir = freshData("dv-num");
  const m = editRec(dir, 0, (l) => l.replace(/d: (\d+)/, (s, d) => `d: ${Number(d) === 1 ? 2 : Number(d) - 1}`));
  return mustRed(dir, "DATES_DERIVE", m);
});
t("DATES_DERIVE：条目正文里的纪日被改写没了", () => {
  const dir = freshData("dv-gone");
  const m = mutateEntry(dir, PF.loc, (line) =>
    withProc(line, (p) => p.replace(PROC_DATE_RE, "$1年秋")));
  return mustRed(dir, "DATES_DERIVE", m);
});
t("DATES_DERIVE：往正文里再塞一个同年日子（判歧义，不许手挑）", () => {
  const dir = freshData("dv-ambig");
  const r = PF.rec;
  const alt = validMD(r.m, r.d + 1) ? { m: r.m, d: r.d + 1 } : { m: r.m === 12 ? 1 : r.m + 1, d: 1 };
  const m = mutateEntry(dir, PF.loc, (line) =>
    withProc(line, (p) => p + `又作${procEntry.year}年${alt.m}月${alt.d}日。`));
  const hit = mustRed(dir, "DATES_DERIVE", m);
  if (hit.skip) return hit;
  const g = gate(dir);
  const line = g.json.errors.find((x) => x.startsWith("DATES_DERIVE ") && x.includes("歧义"));
  return line ? { note: "并点名「歧义」，给出两个候选" } : { skip: "红了但没写明是歧义，读者不知道该怎么办" };
});
t("DATES_MISSING：生成器没跑完就提交", () => {
  const dir = freshData("missing");
  const { body } = readRecs(dir);
  const before = body.length;
  rebuild(dir, body.slice(0, before - 1));
  const g = gate(dir);
  if (!g.json) return { skip: `门未按 --json 输出：${String(g.raw).slice(0, 160)}` };
  const hit = g.json.errors.filter((x) => x.startsWith("DATES_MISSING "));
  if (!hit.length) return { skip: `少登记一条没报 DATES_MISSING（实发：${[...new Set(g.json.errors.map((y) => y.split(" ")[0]))].join(",")}）` };
  if (g.json.ok) return { skip: "少一条还判绿，覆盖线形同虚设" };
  return { note: `DATES_MISSING ×${hit.length}（${hit[0].slice(0, 60)}…）` };
});

/* ---------- ⑥ 覆盖回归线 ---------- */
t("DATES_COVERAGE：总量掉到线以下", () => {
  const dir = freshData("cov-total");
  const { body } = readRecs(dir);
  const keep = 1200;
  if (body.length <= keep) return { skip: `日层只有 ${body.length} 条，减不到 ${keep} 以下` };
  rebuild(dir, body.slice(0, keep));
  return mustRed(dir, "DATES_COVERAGE", true);
});
t("DATES_COVERAGE：只剩几天（日历格塌了）", () => {
  const dir = freshData("cov-slots");
  const { body } = readRecs(dir);
  const keep = body.filter((l) => { const m = /m: (\d+), d: (\d+)/.exec(l); return m && Number(m[2]) <= 3; });
  if (keep.length === body.length) return { skip: "构造不出「只剩几号」的样本" };
  rebuild(dir, keep);
  const g = gate(dir);
  if (!g.json) return { skip: `门未按 --json 输出：${String(g.raw).slice(0, 160)}` };
  const cov = g.json.errors.filter((x) => x.startsWith("DATES_COVERAGE "));
  const bySlot = cov.filter((x) => /格|日历|命中/.test(x));
  if (!cov.length) return { skip: `格子塌了却没报覆盖（实发：${[...new Set(g.json.errors.map((y) => y.split(" ")[0]))].join(",")}）` };
  return { note: bySlot.length ? `报了格数：${bySlot[0].slice(0, 70)}` : `DATES_COVERAGE ×${cov.length}` };
});

/* ---------- ⑥′ 回执本身要能用（这一族栽过一次） ---------- */
t("--json 在千条错误下仍可解析（截断的回执就是假门）", () => {
  const dir = freshData("json-bounded");
  rebuild(dir, []);                    // 日层清空：现算的一千多条全成 DATES_MISSING
  const g = gate(dir);
  if (!g.json) return { skip: `千条错误时 --json 解析不了：…${String(g.raw).slice(-70)}` };
  const n = (g.json.codes || {}).DATES_MISSING;
  if (!n) return { skip: "清空日层却没报 DATES_MISSING" };
  if (!g.json.errors.some((e) => e.startsWith("DATES_MISSING "))) return { skip: "计数报了、样句一条没带，人不知道去查哪条" };
  const bytes = Buffer.byteLength(JSON.stringify(g.json));
  if (bytes > 60000) return { skip: `--json 回执 ${bytes} B，逼近 stdout 被截断的 64 KB 线` };
  return { note: `${n} 条缺失只留 ${g.json.errors.length} 条样句／${bytes} B` };
});

/* ---------- ⑦ 自愈：改完正文重跑 --apply 就该绿 ---------- */
t("回绿路径：正文改了日期，--apply 之后门判绿", () => {
  const dir = freshData("heal");
  const m = mutateEntry(dir, PF.loc, (line) =>
    withProc(line, (p) => p.replace(
      new RegExp(`(${procEntry.year}\\s*年\\s*)(0?[1-9]|1[0-2])(\\s*月\\s*)(0?[1-9]|[12][0-9]|3[01])(\\s*日)`),
      (s, y, mo, sp, d, r) => `${y}${Number(mo) === 12 ? 11 : Number(mo) + 1}${sp}${d}${r}`
    )));
  if (!m) return { skip: "纪日改不动" };
  const red = gate(dir);
  if (!red.json || red.json.ok) return { skip: "改了正文门却没红——派生对账根本没看着正文" };
  apply(dir);
  return mustGreen(dir, true);
});
t("基线：仓库现状判绿（对照用例，防整套自审只在红里打转）", () => {
  const dir = freshData("baseline");
  const g = gate(dir);
  if (!g.json) return { skip: `门未按 --json 输出：${String(g.raw).slice(0, 160)}` };
  if (!g.json.ok) return { skip: `仓库现状判红：${g.json.errors.slice(0, 2).join(" / ")}` };
  return { note: `${g.json.recs} 条 / ${g.json.slots} 格` };
});

/* 接线对账是「读现文件 + 一条布尔判据」，不跑门，所以不进 t()（t() 的 skip 说的是
 * 夹具构造不出来）。这里单独记一笔，失败与变异用例同样计入红。 */
function chk(cond, msg) {
  if (cond) { ok++; console.log(`✅ ${msg}`); }
  else { fail++; console.log(`✗ ${msg}`); }
}

/* ---------- ⑧ 界面接线：门判得再对，没人渲染就等于这一层不存在 ----------
 * 前面全在 data/dates.js 与条目正文上做文章；这一节盯着 js/、css/ 与 index.html。
 * 判据一律从文件里现取，不抄行号、不抄 z 值、不抄名单：改动即换结论。 */
{
  const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
  const html = read("index.html");
  const app = read("js/app.js"), route = read("js/router.js"),
        keys = read("js/interaction.js"), ui = read("js/today.js"), css = read("css/today.css");

  chk(html.includes('<script src="js/today.js"></script>') && html.includes('href="css/today.css"'),
     "日层的模块与样式都被 index.html 挂上（孤儿文件＝功能不存在）");
  const iData = html.indexOf('<script src="data/dates.js">'), iUi = html.indexOf('<script src="js/today.js">');
  chk(iData >= 0 && iUi >= 0 && iData < iUi,
     `data/dates.js 排在 js/today.js 之前（实测 ${iData} < ${iUi}：站里零构建、file:// 下也不能指望异步顺序，数据排在消费它的模块后面就是首帧读到 undefined）`);
  chk(/name === "today"/.test(route) && /ChronToday\.open\(/.test(route),
     "路由认得 #/today：parse 有分支、apply 有落点（缺一个就是打不开的深链）");
  chk(/ChronStory\.close\(\);\s*\n\s*if \(window\.ChronToday\) ChronToday\.close\(\);/.test(route),
     "路由的兜底分支（切回时间轴）把今天抽屉一起收掉：抽屉有开就要有收，漏一层就是关掉故事后「今天」还杵在屏上");
  chk(/ChronToday\.isOpen\(\)[\s\S]{0,40}ChronToday\.close\(\)/.test(keys),
     "Esc 阶梯里有今天抽屉（不收它，键盘用户关不掉这一层）");
  chk(/case "t": case "T":/.test(keys) && /#\/today/.test(keys),
     "有 t/T 开关，且走路由而不是直接 open()：按钮、快捷键、深链三条入口必须共用一份状态");
  chk(/\$\("btn-today"\)\.addEventListener/.test(app) && /\$\("btn-today"\)\.classList\.toggle/.test(app),
     "顶栏有今天按钮的点击落点，且亮灭在 syncToggles 里由状态反推（只在回调里改类名会停在写死的默认值上）");
  chk(/\.td-drawer\[hidden\]\s*\{[^}]*display:\s*none/.test(css),
     ".td-drawer[hidden] 显式 display:none（只有 hidden 属性时，class 上的 display 会赢过 UA，关掉后抽屉还杵在屏上）");

  /* how 四层两侧必须同源：门改了名而界面还用旧名，那一层就没了标签——
   * 读者看见的仍是「今天的事」，而「这是文书落款日」那句警告悄悄消失。 */
  const gm = /const HOWS = \[([^\]]+)\]/.exec(read("tools/validate-dates.mjs"));
  const um = /var HOW_LABEL = \{([\s\S]*?)\};/.exec(ui);
  chk(!!gm && !!um, `两侧的 how 名单都解析得到（门 ${gm ? "有" : "无"}／界面 ${um ? "有" : "无"}：解析不到下面的对账就是空对账）`);
  if (gm && um) {
    const norm = (s) => [...s.matchAll(/["']?([a-z][a-z-]*)["']?\s*(?:,|$)/g)].map((x) => x[1]).filter(Boolean).sort().join("|");
    const gset = norm(gm[1]);
    const ukeys = [...um[1].matchAll(/(?:^|,)\s*"?([a-z][a-z-]*)"?\s*:/g)].map((x) => x[1]).sort().join("|");
    chk(gset === ukeys, `界面 HOW_LABEL 的键与门 HOWS 逐字相同（门「${gset}」／界面「${ukeys}」）`);
    const unlabeled = [...um[1].matchAll(/(?:^|,)\s*"?([a-z][a-z-]*)"?\s*:\s*"([^"]*)"/g)]
      .filter((x) => !x[2].trim()).map((x) => x[1]);
    chk(!unlabeled.length, `四层都有标签文案${unlabeled.length ? "（空标签：" + unlabeled.join(",") + "）" : ""}`);
  }

  /* 界面不许抄数字：1583 与 72 都只能读盘上的 data/dates.js。
   * 抄一份就有了第二份，两份打架时没人知道该信哪个——prolepticBefore 进 DATES_RULE 就是为这个。 */
  chk(!/\b158[0-9]\b|\b1599\b/.test(ui), "js/today.js 里没有写死的历表分界年（须读 D.prolepticBefore）");
  chk(/prolepticBefore/.test(ui), "js/today.js 确实从日层读 prolepticBefore（不读就是上面那条判据在自欺）");

  /* 空天数也是同一件事：各月有几天这张表归 date-lib 管。界面自己写一遍 d<=31，
   * 就会把 4/31、6/31、9/31、11/31 当成「空着的一天」报给读者——实测虚报 14 天，实况 10 天。
   * 这条与上一条同形：一个负判据必须配一个正判据，否则把整段代码删了也能过。 */
  chk(!/29\s*:\s*31/.test(ui), "js/today.js 不自己数日历格（各月天数只有 date-lib 一份）");
  chk(/D\.blankDays/.test(ui), "页脚的空天数确实从日层读 D.blankDays（不读就是上面那条判据在自欺）");
  chk(/blanks === null \? ""/.test(ui), "读不到 blankDays 就省掉这半句——宁可少一句账，也不印一个编出来的 0");

  /* 深链能写出日历上没有的日子（#/today/4/31）。这一层要是照画，画出来的就是一个会被当成史实的假日期；
   * 而「月份天数」这张表一旦在界面里抄一份，date-lib 改了它就永远停在旧口径上——所以判据两头都要钉。 */
  chk(/D\.mdays/.test(ui), "这一天存不存在判自盘上的 mdays（历表只有 date-lib 一份）");
  chk(!/\[\s*31\s*,\s*2[89]\s*,/.test(ui), "js/today.js 里没有自己抄的历表（抄了就有第二份，两份打架时没人知道该信哪个）");
  chk(/ghost = \{ m: opts\.m, d: opts\.d \}; day = todayMD\(\);/.test(ui),
     "不存在的日子落回读者的今天，并留下 ghost 供页面说明（默默画一个 4 月 31 日就是造假）");
  chk(/if \(ghost\)[\s\S]{0,240}链接里写的是/.test(ui), "页面当着读者说出「这个日子不存在」，不是只把标题换掉");
  chk(/m < 1 \|\| m > 12/.test(ui) && /一年只有 12 个月/.test(ui),
     "越界的月份（13 月）与越界的日（4/31）都判得出、也说得出——只查「这个月几天」会把 13 月当成没载入而放过去");
  /* 判据不能两头各一份：路由原先抄了一张 `=== 2 ? 29 : 31`，结果 4/31 到了界面（界面说得清），
   * 2/30 被路由吞掉（读者被送回今天，不知道为什么）。同一条地址两条路，就是两个口径在打架。 */
  chk(!/\b29\s*:\s*31\b/.test(route),
     "js/router.js 不自己抄历表：月日存不存在整个交出去，由 ChronToday 按盘上 mdays 判并说明");

  /* 标题栏上的按钮不该有点了没反应的：空白天的「铺成长河」铺不出东西，但必须说一句为什么。 */
  chk(/if \(!ids\.length\)[\s\S]{0,160}flash\(/.test(ui),
     "空白天的「铺成长河」有话说——按钮杵在那里而点下去一声不响，读者只会以为自己没点到");
}


/* ---------- ⑨ 派生口径自身的边界（这几条不打门，打 date-lib） ---------- */
function mkEvo(over) {
  return Object.assign({ id: "cn--test--p01", year: 1920, title: "一件测试的事", summary: "摘要。", detail: { process: "", sources: [] } }, over);
}
t("口径：1912 年前的中文月日不收（那是农历，本库不做历表换算）", () => {
  const r1911 = deriveOne(mkEvo({ year: 1911, detail: { process: "宣统三年九月初三日事", sources: [] } }));
  const r1920 = deriveOne(mkEvo({ year: 1920, detail: { process: "1920年三月初三的事", sources: [] } }));
  void r1920;
  const lunar = deriveOne(mkEvo({ year: 1920, detail: { process: "是日据农历九月初三计之", sources: [] } }));
  if (r1911) return { skip: "1911 年的中文月日被收了" };
  if (lunar) return { skip: "带「农历」字样的中文月日被当成公历收了" };
  return { note: "1911 与「农历」两种写法都不入层" };
});
t("口径：阿拉伯年月日必须与条目 year 同年才收", () => {
  const wrong = deriveOne(mkEvo({ year: 1920, detail: { process: "1919年5月4日另起一事", sources: [] } }));
  const right = deriveOne(mkEvo({ year: 1920, detail: { process: "1920年5月4日开会", sources: [] } }));
  if (wrong) return { skip: "异年的日子被挂到本条上了：" + JSON.stringify(wrong) };
  if (!right || right.m !== 5 || right.d !== 4 || right.how !== "process") return { skip: "本年的日子反而没收：" + JSON.stringify(right) };
  return { note: "异年不收、本年按 process 层收" };
});
t("口径：出处里的日期落在 src 层，不与事件日混为一谈", () => {
  const r = deriveOne(mkEvo({ year: 1920, detail: { process: "开会在是年五月", sources: ["《晨报》1920年6月1日"] } }));
  if (!r || r.how !== "src" || r.m !== 6 || r.d !== 1) return { skip: "出处纪日没有按 src 层收：" + JSON.stringify(r) };
  return { note: "界面须标「出处纪日」" };
});
t("口径：同年两个日子 ⇒ 判歧义，一个都不收", () => {
  const r = deriveOne(mkEvo({ year: 1920, detail: { process: "1920年3月1日开始，1920年3月9日结束", sources: [] } }));
  if (!r || !r.ambiguous || r.ambiguous.length !== 2) return { skip: "没判成歧义：" + JSON.stringify(r) };
  return { note: "两个候选都交给写正文的人" };
});

console.log(`\n日层门自审：${ok} 通过，${fail} 失败（共 ${ok + fail} 项）`);
if (fail) {
  console.log(`现场保留在 ${TMP}，改完再跑（下次运行会自动回收 dates-mut-* 旧现场）`);
  process.exit(1);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`✅ 8 个检查码都各有用例能定向打红，形合法/口径边界（1912、异年、src、歧义）各有用例保证不误收，真实日层判绿；界面接线（⑧）的每一条都有 test-gates-meta 的哨兵对着它`);
