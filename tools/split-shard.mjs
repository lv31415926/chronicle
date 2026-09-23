/* 按年份把一个超体积分片一分为二，并证明「零丢失、正文零改动」。
 * 用法: node tools/split-shard.mjs data/cn/cn-07.js 1978 cn-13
 *   → 左片留在原文件（沿用原 chunk key），右片写入 data/<dir>/cn-13.js
 * 需要三道闸门（都是实测踩过的坑）：
 *   1. 行首要同时认 `{ id:` 和 `{id:`——只认一种会让某些分片整片解析不到行，
 *      而「空集 vs 空集」的守恒检查照样通过，结果是静默把源片写成空文件。
 *   2. 逐行条数必须等于 Function 垫片加载出的权威条数。
 *   3. 读盘与写盘之间比对源文件 sha，有代理正在写就停手。 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const [SRC, CUT_S, NEW_ID] = process.argv.slice(2);
const fail = (m) => { console.error("ABORT: " + m); process.exit(1); };
if (!SRC || !CUT_S || !NEW_ID) fail("用法: split-shard.mjs <源分片> <切点年> <新chunkId>");
const CUT = Number(CUT_S);
if (!Number.isInteger(CUT)) fail(`切点 ${CUT_S} 不是整数年`);
if (NEW_ID === path.basename(SRC, ".js")) fail("新 chunk id 与源分片同名");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
const before = fs.readFileSync(SRC);
const h0 = sha(before);
const src = before.toString("utf8");

const HEAD_RE = /^\s*\{\s*id:/;
const rows = [], other = [];
for (const ln of src.split("\n")) (HEAD_RE.test(ln) ? rows : other).push(ln);

const idRe = /\{\s*id:\s*"([^"]+)"/;
const yrRe = /(?:^|[,{\s])year:\s*(-?\d+)/;
const parsed = rows.map((ln) => ({ ln, id: (idRe.exec(ln) || [])[1], year: Number((yrRe.exec(ln) || [])[1]) }));

const w = { window: {} };
try { new Function("window", src)(w.window); } catch (e) { fail("垫片解析失败: " + e.message); }
const OLD_ID = Object.keys(w.window.__CHRONICLE_CHUNK || {})[0];
if (!OLD_ID) fail("垫片没加载出 chunk key");
if (!new RegExp(`__CHRONICLE_CHUNK\\["${OLD_ID}"\\]\\s*=\\s*\\[`).test(src)) fail("chunk key 与文件头不符");
const AUTH = w.window.__CHRONICLE_CHUNK[OLD_ID];
if (parsed.length === 0) fail(`行首正则没认出任何事件行，本片实有 ${AUTH.length} 条；照切会清空源片`);
if (parsed.length !== AUTH.length) fail(`逐行认出 ${parsed.length} 条 ≠ 垫片加载 ${AUTH.length} 条，有行未被识别`);
if (parsed.some((p) => !p.id || !Number.isInteger(p.year))) fail("有行未能解析出 id/year");
const asArr = AUTH.map((e) => e.id).sort();
if (JSON.stringify(asArr) !== JSON.stringify(parsed.map((p) => p.id).sort())) fail("逐行 id 集与垫片 id 集不一致");

const A = parsed.filter((p) => p.year < CUT);
const B = parsed.filter((p) => p.year >= CUT);
if (!A.length || !B.length) fail(`切点 ${CUT} 未能把 ${parsed.length} 条分成非空两半（跨度 ${Math.min(...parsed.map(p => p.year))}..${Math.max(...parsed.map(p => p.year))}）`);
const srt = (a) => a.map((p) => p.id).sort();
if (new Set([...srt(A), ...srt(B)]).size !== parsed.length) fail("切分后 id 有重合");
if (JSON.stringify([...srt(A), ...srt(B)]) !== JSON.stringify(srt(parsed))) fail("切分后 id 多重集与原片不等，有条目丢失或复制");
for (const [name, half] of [["A", A], ["B", B]]) {
  const ys = half.map((p) => p.year);
  if (ys.some((y) => name === "A" ? y >= CUT : y < CUT)) fail(`${name} 侧混入越界年份，切点失效`);
}

function render(chunkId, comment, arr) {
  return [
    `/* chronicle data chunk: ${chunkId} | ${comment} | 拆分自 ${path.basename(SRC, ".js")}，切点 ${CUT} 年，逐行原文照搬 | 生成于 2026-09-21 */`,
    "window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};",
    `window.__CHRONICLE_CHUNK["${chunkId}"] = [`,
    ...arr.map((p) => p.ln),
    "];",
    "",
  ].join("\n");
}
const yr = (a) => [Math.min(...a.map((p) => p.year)), Math.max(...a.map((p) => p.year))];
const [a0, a1] = yr(A), [b0, b1] = yr(B);
const textA = render(OLD_ID, `${a0}–${a1}`, A);
const textB = render(NEW_ID, `${b0}–${b1}`, B);

const bA = Buffer.byteLength(textA, "utf8"), bB = Buffer.byteLength(textB, "utf8"), bO = before.length;
const sortLs = (a) => a.map((p) => p.ln).sort();
/* 多重集要「两侧各自整体排序」再比；分开排再拼接是另一种东西，会把干净的拆分判成改动正文 */
const proseSame = JSON.stringify(sortLs([...A, ...B])) === JSON.stringify(sortLs(parsed));
if (!proseSame) fail("自检：行文本多重集不等，拆分改动了正文——未写盘");

if (sha(fs.readFileSync(SRC)) !== h0) fail(`源文件在计算期间被改写（${h0} → 新值），有代理正在写它`);
const DST = path.join(path.dirname(SRC), NEW_ID + ".js");
if (fs.existsSync(DST)) fail(`${DST} 已存在，不覆盖`);
const atomic = (p, text) => { const t = p + ".splitting"; fs.writeFileSync(t, text, { encoding: "utf8", flag: "wx" }); fs.renameSync(t, p); };
atomic(DST, textB);
atomic(SRC, textA);

console.log(`源 ${SRC} ${bO}B / ${parsed.length} 条 (${yr(parsed).join("..")})`);
console.log(`左片 ${SRC} ${bA}B / ${A.length} 条 (${a0}..${a1})  key=${OLD_ID}`);
console.log(`右片 ${DST} ${bB}B / ${B.length} 条 (${b0}..${b1})  key=${NEW_ID}`);
console.log(`条数守恒: ${A.length + B.length === parsed.length}  正文逐行零改动: ${proseSame}  字节增量(仅头部): ${bA + bB - bO}B`);
for (const [p, t] of [[SRC, textA], [DST, textB]]) {
  if (Buffer.byteLength(t, "utf8") > 320 * 1024) console.log(`⚠ ${p} 仍 ${(Buffer.byteLength(t, "utf8") / 1024).toFixed(0)}KB > 320KB，需再切一刀`);
}
