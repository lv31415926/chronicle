/* related-cross.mjs | 跨轨 related 补边（唯一授权入口）+ 内置自审门
 * 用法: node tools/related-cross.mjs [pairs.json] [--write]
 *   默认 pairs.json = tools/related-cross.json
 *   形如 { "accepted": [ {"a":"cn--…","b":"world--…","why":"…"}, … ],
 *          "rejected": [ {"a":"cn--…","b":"world--…","why":"…"}, … ] }
 *
 * 为什么又要一个写入口：`related` 里跨轨边为 0（实测 5501 条全在同轨），对照视图
 * 因此只能并列两岸、连不起来。补边必须逐边裁定（编造关联是禁止项），而裁定结果
 * 一旦要落盘就面对和改权重同一类风险——手滑的批量替换会顺手改掉散文。
 * 所以本工具只认"授权边集合"：断言改后 related 恰好多出这些边、**没有任何边被删除**、
 * 除 related 外每个字段逐字节不变。裁定留痕放在同一个文件的 rejected 里（不落盘）。
 *
 * 候选由 tools/related-candidates.mjs 生成；本工具不猜候选，只执行已裁定的边。
 * 不带 --write 只 dry-run 审计。
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const pos = argv.filter((a) => !a.startsWith("--"));
if (pos.length > 1) { console.error(`未知参数: ${pos.slice(1).join(" ")}`); process.exit(2); }
const PAIRS_FILE = pos[0] ? (path.isAbsolute(pos[0]) ? pos[0] : path.join(ROOT, pos[0]))
  : path.join(ROOT, "tools/related-cross.json");
const YEAR_SPAN = 6;         // 跨轨边的年份 sanity 上限（候选窗口是 ±5，留 1 年余量给手工裁定）
const WHY_MIN = 8;
const MAX_REL = 4;           // 与 validate 的 RELATED_MANY 同线
const HEAD_RE = /^\s*\{ ?"?id"? ?: ?"([^"]+)"/;
/* 字段边界锚（纵深防御第一层）：筛掉散文里裸写的 `related:['…']`。
 * 它挡不住写成 `,related:['…']` 的散文——那种串在语法层面与真字段无从区分，
 * 行级正则不可能做字符串感知；那种情况由下面的核心自审（改后逐字段比对）拒绝落盘。 */
const REL_SEG = /(^|[{,]\s*)("?)(related)("?)(\s*:\s*)(\[[^\]]*\])/;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);

const errs = [];
const E = (m) => errs.push(m);

/* ---------- 读语料（逐行 + 解析对象并存，行是唯一的改写面） ---------- */
const shards = [];
for (const [sub, track] of [["cn", "cn"], ["wd", "world"]]) {
  for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
    const rel = path.join("data", sub, n);
    const key = path.basename(n, ".js");
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const win = { window: {} };
    try { new Function("window", buf.toString("utf8"))(win.window); }
    catch (e) { console.error(`ABORT: ${key} 解析失败: ${e.message}`); process.exit(1); }
    const arr = win.window.__CHRONICLE_CHUNK[key];
    if (!Array.isArray(arr)) { console.error(`ABORT: ${key} 未导出同名数组`); process.exit(1); }
    const lines = buf.toString("utf8").split("\n");
    const rowIdx = [];
    lines.forEach((ln, i) => { if (HEAD_RE.test(ln)) rowIdx.push(i); });
    if (rowIdx.length !== arr.length) {
      console.error(`ABORT: ${key} 条目行数 ${rowIdx.length} ≠ 条数 ${arr.length}，逐行定位不成立`);
      process.exit(1);
    }
    shards.push({ rel, key, track, arr, lines, rowIdx, h: sha(buf) });
  }
}
const byId = new Map();
for (const f of shards) f.arr.forEach((e, i) => {
  if (byId.has(e.id)) { console.error(`ABORT: id 重复 ${e.id}`); process.exit(1); }
  byId.set(e.id, { e, f, li: f.rowIdx[i] });
});

/* ---------- 授权集自检 ---------- */
if (!fs.existsSync(PAIRS_FILE)) { console.error(`ABORT: 找不到裁定文件 ${path.relative(ROOT, PAIRS_FILE)}`); process.exit(2); }
const doc = JSON.parse(fs.readFileSync(PAIRS_FILE, "utf8"));
const accepted = doc.accepted, rejected = doc.rejected || [];
if (!Array.isArray(accepted) || !accepted.length) { console.error("ABORT: accepted 必须是非空数组"); process.exit(2); }

const pairKey = (a, b) => [a, b].sort().join("|");
const seenPair = new Set();
const add = new Map();          // id -> Set(targetId)
function register(p, kind) {
  const { a, b, why } = p || {};
  if (typeof a !== "string" || typeof b !== "string") { E(`${kind} 有非字符串端点`); return; }
  if (a === b) { E(`${kind} ${a} 自连`); return; }
  const ea = byId.get(a), eb = byId.get(b);
  if (!ea) { E(`${kind} ${a} ↔ ${b}：${a} 不在语料里`); return; }
  if (!eb) { E(`${kind} ${a} ↔ ${b}：${b} 不在语料里`); return; }
  if (ea.e.track === eb.e.track) { E(`${kind} ${a} ↔ ${b}：同轨（本工具只管跨轨）`); return; }
  if (Math.abs(ea.e.year - eb.e.year) > YEAR_SPAN)
    E(`${kind} ${a}(${ea.e.year}) ↔ ${b}(${eb.e.year})：年差越 ${YEAR_SPAN} 年，超出跨轨关联的 sanity 范围`);
  if (typeof why !== "string" || why.trim().length < WHY_MIN)
    E(`${kind} ${a} ↔ ${b} 缺 why（或短于 ${WHY_MIN} 字）——无理由的边就是编造的边`);
  return { a, b };
}
for (const p of accepted) {
  const r = register(p, "accepted");
  if (!r) continue;
  const k = pairKey(r.a, r.b);
  if (seenPair.has(k)) { E(`accepted 有重复边 ${r.a} ↔ ${r.b}`); continue; }
  seenPair.add(k);
  const cur = byId.get(r.a).e.related || [];
  const other = byId.get(r.b).e.related || [];
  if (cur.includes(r.b)) E(`accepted ${r.a} → ${r.b} 已在盘上，不属变更却列入授权集`);
  if (other.includes(r.a)) E(`accepted ${r.a} ↔ ${r.b} 反向边已在盘上（重复补边）`);
  for (const [x, y] of [[r.a, r.b], [r.b, r.a]]) {
    if (!add.has(x)) add.set(x, new Set());
    add.get(x).add(y);
  }
}
/* rejected 只验格式与"确实没被误当 accepted"，不落盘 */
const rejKeys = new Set();
for (const p of rejected) {
  const r = register(p, "rejected");
  if (!r) continue;
  const k = pairKey(r.a, r.b);
  if (seenPair.has(k)) E(`同一对既 accepted 又 rejected：${r.a} ↔ ${r.b}`);
  if (rejKeys.has(k)) E(`rejected 有重复对 ${r.a} ↔ ${r.b}`);
  rejKeys.add(k);
}
for (const [id, s] of add) {
  const e = byId.get(id).e;
  const next = [...new Set([...(e.related || []), ...s])];
  if (next.length > MAX_REL) E(`${id} 补边后 related ${next.length} 项 > ${MAX_REL}（须先撤掉本轮里价值最低的那条）`);
}

/* ---------- 行内手术：只在 related 数组尾部追加 ---------- */
const touched = [];
const newLines = new Map();          // rel -> lines
for (const [id, targets] of add) {
  const { f, li, e } = byId.get(id);
  const line = f.lines[li];
  const m = REL_SEG.exec(line);
  if (!m) { E(`${id} 第 ${li + 1} 行定位不到 related 数组（schema 要求该字段必须在）`); continue; }
  const [, lead, q1, , q2, sep, lit] = m;
  const quote = q1 || q2 || '"';
  const cur = [...(e.related || [])];
  const appended = [...new Set([...cur, ...targets])].filter((x) => !cur.includes(x));
  if (!appended.length) { E(`${id} 无可追加（授权边全在盘上）`); continue; }
  const SEP = ", ";
  const rebuilt = lit === "[]" ? `[${appended.map((x) => quote + x + quote).join(SEP)}]`
    : lit.replace(/\]\s*$/, `${SEP}${appended.map((x) => quote + x + quote).join(SEP)}]`);
  const nextLine = line.slice(0, m.index) + lead + q1 + "related" + q2 + sep + rebuilt + line.slice(m.index + m[0].length);
  if (!newLines.has(f.rel)) newLines.set(f.rel, f.lines.slice());
  newLines.get(f.rel)[li] = nextLine;
  touched.push({ id, file: f.rel, line: li + 1, added: appended });
}

/* ---------- 核心自审：改完重新解析，与改前逐条逐字段比对 ---------- */
const reports = [];
if (!errs.length) {
  for (const f of shards) {
    const lines = newLines.get(f.rel) || f.lines;
    let after = null;
    try {
      const win = { window: {} };
      new Function("window", lines.join("\n"))(win.window);
      after = win.window.__CHRONICLE_CHUNK[f.key];
    } catch (e) { E(`${f.rel} 改后无法解析: ${e.message}——拒绝落盘`); continue; }
    if (!Array.isArray(after) || after.length !== f.arr.length)
      { E(`${f.rel} 条数变化 ${f.arr.length}→${after && after.length}`); continue; }
    const j = (x) => JSON.stringify(x === undefined ? null : x);
    const authorized = new Map();
    for (const t of touched) if (t.file === f.rel) authorized.set(t.id, add.get(t.id));
    for (let i = 0; i < after.length; i++) {
      const a = after[i], b = f.arr[i];
      if (a.id !== b.id) { E(`${f.rel}#${i} 顺序或 id 变了`); continue; }
      const auth = authorized.get(a.id);
      for (const k of Object.keys({ ...b, ...a })) {
        if (j(b[k]) === j(a[k])) continue;
        if (k !== "related") { E(`${a.id} 非 related 字段 ${k} 被附带改动 —— 拒绝落盘`); continue; }
        if (!auth) { E(`${a.id} related 未授权却变了`); continue; }
        const old = b.related || [], next = a.related || [];
        const gone = old.filter((x) => !next.includes(x));
        const gained = next.filter((x) => !old.includes(x));
        if (gone.length) E(`${a.id} 有既有边被删除: ${gone.join(",")} —— 本工具只许追加`);
        const want = [...auth].sort().join(","), got = [...gained].sort().join(",");
        if (want !== got) E(`${a.id} 实际新增 ${got || "∅"} ≠ 授权集 ${want}`);
        if (new Set(next).size !== next.length) E(`${a.id} related 出现重复项`);
      }
    }
    reports.push({ f, changed: [...authorized.keys()].length, after });
  }
}

console.log(`跨轨 related 补边 · 授权 ${seenPair.size} 对 → ${add.size} 个条目追加、${newLines.size} 个分片改写`);
for (const t of touched) console.log(`  ${path.basename(t.file)} L${String(t.line).padStart(3)} ${t.id} += ${t.added.join(" ")}`);
if (rejected.length) console.log(`\n留痕：rejected ${rejected.length} 对（不落盘）`);
if (errs.length) {
  console.log(`\n✗ ${errs.length} 项违规，未落盘：`);
  errs.slice(0, 40).forEach((e) => console.log("  " + e));
  if (errs.length > 40) console.log(`  …其余 ${errs.length - 40} 项`);
  process.exit(1);
}
const crossOf = (get) => [...get()].reduce((n, e) => n + (e.related || [])
  .filter((x) => x.startsWith(e.track === "cn" ? "world--" : "cn--")).length, 0);
const crossBefore = crossOf(() => [...byId.values()].map((v) => v.e));
const crossAfter = crossOf(() => reports.flatMap((r) => r.after));
console.log(`\n  跨轨有向边 ${crossBefore} → ${crossAfter} 条`);
if (!WRITE) { console.log("\n（dry-run，未落盘；加 --write 生效）"); process.exit(0); }
for (const f of shards) {
  if (!newLines.has(f.rel)) continue;
  const p = path.join(ROOT, f.rel);
  if (sha(fs.readFileSync(p)) !== f.h) { console.error(`!! ${f.rel} 运行期间被改写，中止（请重跑）`); process.exit(1); }
}
for (const f of shards) {
  if (!newLines.has(f.rel)) continue;
  const p = path.join(ROOT, f.rel);
  fs.writeFileSync(p + ".tmp", newLines.get(f.rel).join("\n"));
  fs.renameSync(p + ".tmp", p);
}
console.log("\n✅ 已落盘");
