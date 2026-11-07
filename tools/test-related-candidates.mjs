/* test-related-candidates.mjs | related-candidates.mjs 的阳性/阴性对照
 * 用法: node tools/test-related-candidates.mjs
 *
 * 为什么单开一个文件而不塞进 test-gates.mjs：被检对象是「生成候选」，它的失败模式
 * 不是崩掉也不是非零退出，而是**静默少出或多出**——44102 组噪声和 0 组候选都能以
 * rc=0 收场。这类判据只能靠夹具语料验：真语料里「本应出现哪些对」没有独立答案，
 * 而合成语料里每条信号的 df 与年差都是本文件自己写的，答数可算。
 *
 * 夹具的取舍：df 阈值（DF_FIG 25 / DF_TAG 8 / DF_GEO 8 / CO_DF 6）在 4900 条真语料上
 * 无法逐项造反例，所以这里造 30 条填充条目把「高频共名/共词/标签/地望」顶过阈值线，
 * 再配同构的稀见版作正例——两支只差 df，分差只有 1，用它证明准入靠的是 strong 门
 * 而不是分数高低。
 *
 * 三段断言：
 *   一、阳性：每条 strong 信号各造一对，默认运行必须**恰好**出这 7 对（多一对即有误报）；
 *   二、阴性：过泛共名、高 df 共词/标签/地望、仅同年同维、越窗、同轨，默认必须全不出，
 *       加 --weak 必须全出（否则 strong 门是死门、--weak 是空开关）；越窗与同轨连 --weak 也不许出。
 *   三、真语料不变量：候选必跨轨、年差 ≤5、必 strong，且与 tools/related-cross.json 的
 *       accepted∪rejected 双向对账——候选多于留痕即裁定不完备，留痕多于候选即写了编造边；
 *       再拿盘上 related 与 accepted 对账——盘上有边而台账无留痕即越权边（候选器看不见年窗
 *       外的边，这一头只能直接数盘），accepted 有而盘上无即裁定未落盘。
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { loadCorpus, useRoot } from "./geo-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
useRoot(ROOT);
let pass = 0, fail = 0;
const results = [];
function expect(label, ok, detail) {
  results.push({ label, ok, detail });
  if (ok) pass++; else fail++;
}

/* ---------- 夹具语料 ---------- */
const ev = (track, y, seq, title, o = {}) => ({
  id: `${track}--${y}--q${seq}`, track, year: y, yearApprox: false,
  dim: o.dim || "politics", weight: o.weight || 3, title,
  /* summary 一律不带拉丁字母：latTokens 吃 title+summary，一处漏了就全库「共享拉丁」假阳性 */
  summary: o.summary || title + "——夹具条目，仅用于验证候选判据。",
  detail: {
    background: "夹具背景", process: "夹具过程", impact: "夹具影响",
    figures: o.fig || [], place: o.place || "", state: o.state || "",
    sources: ["夹具来源"], tags: o.tag || [],
  },
  related: [],
});

/* want: in=默认必须出；weak=默认必须不出、--weak 必须出；out=两次都不许出 */
const CASES = [
  { name: "稀见共名(强)", want: "in",
    a: ev("cn", 1900, 1, "黄河决口堤工罢", { fig: ["共名甲稀人"] }),
    b: ev("world", 1900, 1, "泰西银行券废止", { fig: ["共名甲稀人"], dim: "economy" }) },
  { name: "过泛共名(df>25)", want: "weak",
    a: ev("cn", 1902, 2, "长江水师重整", { fig: ["常名某某人"] }),
    b: ev("world", 1902, 2, "多瑙船务局设", { fig: ["常名某某人"] }) },
  { name: "低df共词(4字)", want: "in",
    a: ev("cn", 1904, 3, "对等关税协定立"),
    b: ev("world", 1904, 3, "片面关税协定批", { dim: "economy" }) },
  { name: "高df共词(世界大战)", want: "weak",
    a: ev("cn", 1906, 4, "北伐世界大战记"),
    b: ev("world", 1906, 4, "南征世界大战图") },
  { name: "稀见标签(年差4)", want: "in",
    a: ev("cn", 1908, 5, "边省铸辅币行", { tag: ["标签甲稀"] }),
    b: ev("world", 1912, 5, "岛礁塔灯兴工", { tag: ["标签甲稀"], dim: "science" }) },
  { name: "高df标签", want: "weak",
    a: ev("cn", 1914, 6, "牧区兽医站创", { tag: ["常见标签"] }),
    b: ev("world", 1914, 6, "林区火哨废弃", { tag: ["常见标签"] }) },
  { name: "稀见地望(年差4)", want: "in",
    a: ev("cn", 1916, 7, "棉布商号结盟", { place: "地望甲稀邑" }),
    b: ev("world", 1920, 7, "毛织行会罢议", { place: "地望甲稀邑", dim: "economy" }) },
  { name: "高df地望", want: "weak",
    a: ev("cn", 1922, 8, "沿海盐田增产", { place: "常见一大国" }),
    b: ev("world", 1922, 8, "内陆牧场围网", { place: "常见一大国" }) },
  { name: "共享拉丁词(年差2)", want: "in",
    a: ev("cn", 1924, 9, "ZEBRAQ丙案付议", { dim: "institution" }),
    b: ev("world", 1926, 9, "ZEBRAQ丁案存档", { dim: "institution" }) },
  { name: "窗口内边界(年差5)", want: "in",
    a: ev("cn", 1928, 10, "东非铁路贯通", { fig: ["共名戊稀人"], dim: "science" }),
    b: ev("world", 1933, 10, "南美铜矿国有", { fig: ["共名戊稀人"], dim: "science" }) },
  { name: "越窗(年差6)", want: "out",
    a: ev("cn", 1936, 11, "北极航道探入", { fig: ["共名己稀人"], dim: "explore" }),
    b: ev("world", 1942, 11, "南极冰架崩解", { fig: ["共名己稀人"], dim: "explore" }) },
  { name: "同轨共名", want: "out",
    a: ev("cn", 1944, 12, "本土预备役练", { fig: ["共名庚稀人"] }),
    b: ev("cn", 1944, 13, "本土印刷局迁", { fig: ["共名庚稀人"] }) },
  { name: "仅同年同维", want: "weak",
    a: ev("cn", 1946, 14, "驿传改归邮政", { dim: "institution" }),
    b: ev("world", 1946, 14, "电报换成微波", { dim: "institution" }) },
  /* 混合共名：一个过泛 + 一个稀见。取 df 最小值 ⇒ 强；取最大值 ⇒ 会被判过泛。
   * 本用例钉住 related-candidates.mjs 的定档方向——真语料里 8 条已裁定的真边
   * （如毛泽东逝世 ⟷ 毛泽东在北京逝世）全靠这个方向才进得了候选集。 */
  { name: "稀见+过泛混合", want: "in",
    a: ev("cn", 1948, 15, "粤海开埠立市", { fig: ["常名某某人", "共名壬稀人"] }),
    b: ev("world", 1948, 15, "沪上招商设局", { fig: ["常名某某人", "共名壬稀人"] }) },
];

/* 填充条目：把 常名某某人 / 世界大战 / 常见标签 / 常见一大国 的 df 顶过各自阈值。
 * 年份铺在 2100+ 且互差 ≥6 之外的同轨位——同轨不配对，跨轨填充对全部非 strong，
 * 因此默认运行里它们一条都不该出现，正好当「噪声不越阈」的旁证。 */
const FILL = [];
for (let i = 0; i < 30; i++) {
  FILL.push(ev(i % 2 ? "world" : "cn", 2100 + i * 2, 100 + i,
    `世界大战${"子丑寅卯辰巳午未申酉戌亥"[i % 12]}周年纪念`,
    { fig: ["常名某某人"], tag: ["常见标签"], place: "常见一大国" }));
}
/* 填充对之间的年差可能 ≤5，但它们只共享过泛信号 ⇒ 默认运行必须一条不出 */

const cnEvents = [...CASES.flatMap((c) => [c.a, c.b]), ...FILL].filter((e) => e.track === "cn");
const wdEvents = [...CASES.flatMap((c) => [c.a, c.b]), ...FILL].filter((e) => e.track === "world");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rc-fixture-"));
const DIR = path.join(TMP, "proj");
fs.mkdirSync(path.join(DIR, "tools"), { recursive: true });
fs.mkdirSync(path.join(DIR, "data", "cn"), { recursive: true });
fs.mkdirSync(path.join(DIR, "data", "wd"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "tools/related-candidates.mjs"),
  path.join(DIR, "tools/related-candidates.mjs"));
function writeShard(sub, key, arr) {
  const body = arr.map((e) => "  " + JSON.stringify(e)).join(",\n");
  fs.writeFileSync(path.join(DIR, "data", sub, `${key}.js`),
    `/* fixture */\nwindow.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\n` +
    `window.__CHRONICLE_CHUNK[${JSON.stringify(key)}] = [\n${body},\n];\n`);
}
writeShard("cn", "syn-a", cnEvents);
writeShard("wd", "syn-b", wdEvents);

function run(args, cwd) {
  try {
    return { code: 0, out: execFileSync("node", [cwd + "/tools/related-candidates.mjs", ...args], { cwd, encoding: "utf8", maxBuffer: 64 << 20 }) };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}
const key = (a, b) => [a, b].sort().join("|");
const of = (c) => c.map((p) => key(p.a, p.b));

const strict = run(["--json", "--all"], DIR);
const weak = run(["--json", "--all", "--weak"], DIR);
if (strict.code !== 0 || weak.code !== 0) {
  expect("候选器 · 夹具运行未崩溃", false,
    `strict rc=${strict.code} weak rc=${weak.code}\n    ` + (strict.out + weak.out).split("\n").filter(Boolean).slice(-4).join("\n    "));
} else {
  const S = JSON.parse(strict.out), W = new Set(of(JSON.parse(weak.out)));
  const Sset = new Set(of(S));
  const wantIn = CASES.filter((c) => c.want === "in").map((c) => key(c.a.id, c.b.id));
  const wantWeak = CASES.filter((c) => c.want === "weak").map((c) => key(c.a.id, c.b.id));
  const wantOut = CASES.filter((c) => c.want === "out").map((c) => key(c.a.id, c.b.id));

  /* 一、阳性：集合相等，而不是「每条都在」——多出来的对就是误报 */
  const extra = [...Sset].filter((k) => !wantIn.includes(k));
  const missing = wantIn.filter((k) => !Sset.has(k));
  expect("候选器 · 阳性集恰为 7 对 strong", !extra.length && !missing.length && wantIn.length === 7,
    `实出 ${Sset.size} 对${missing.length ? "，缺 " + missing.join(" ") : ""}${extra.length ? "，多 " + extra.join(" ") : ""}`);
  expect("候选器 · strong 全部为真", S.every((p) => p.strong === true),
    `非 strong 混入默认输出：${S.filter((p) => !p.strong).length} 对`);

  /* 二、阴性：四条 df 门 + 同年同维，都在 --weak 下现形 ⇒ 门是 df 起的作用，不是「根本没扫到这对」 */
  const notWeak = wantWeak.filter((k) => !W.has(k));
  expect("候选器 · 过泛信号靠 strong 门拦下", !notWeak.length,
    notWeak.length ? `--weak 仍不见：${notWeak.join(" ")}（扫不到 ≠ 拦不住，须查年窗/枚举）` :
    `过泛共名/高df共词/高df标签/高df地望/仅同年同维 ${wantWeak.length} 对：默认全不出、--weak 全出`);
  const leaked = wantOut.filter((k) => Sset.has(k) || W.has(k));
  expect("候选器 · 越窗与同轨绝不出现", !leaked.length,
    leaked.length ? `泄漏：${leaked.join(" ")}` : `年差6 与 同轨共名 ${wantOut.length} 对在两次运行里均缺席`);
  /* 逐信号证据串必须写清楚——裁定者只看标题拆不开误报 */
  const byKey = new Map(S.map((p) => [key(p.a, p.b), p]));
  const evOf = (i) => (byKey.get(key(CASES[i].a.id, CASES[i].b.id)) || {}).evidence || "";
  expect("候选器 · 证据串点名所用信号",
    /人物:/.test(evOf(0)) && /共词「/.test(evOf(2)) && /标签:/.test(evOf(4)) &&
    /地望:/.test(evOf(6)) && /拉丁:/.test(evOf(8)) && /过泛/.test((JSON.parse(weak.out).find((p) => key(p.a, p.b) === wantWeak[0]) || {}).evidence || ""),
    `共名「${evOf(0)}」｜共词「${evOf(2)}」｜标签「${evOf(4)}」｜地望「${evOf(6)}」｜拉丁「${evOf(8)}」`);
}

/* ---------- 三、真语料不变量 + 裁定留痕完备性（只读，绝不写仓库） ---------- */
{
  const r = run(["--json", "--all", "--min", "4"], ROOT);
  if (r.code !== 0) {
    expect("候选器 · 真语料阳性对照", false, `rc=${r.code}\n    ` + r.out.split("\n").filter(Boolean).slice(-3).join("\n    "));
  } else {
    const P = JSON.parse(r.out);
    expect("候选器 · 真语料不哑（候选 > 0）", P.length > 0, `--min 4 候选 ${P.length} 组`);
    const bad = P.filter((p) => (p.a.startsWith("cn--") === p.b.startsWith("cn--")) || Math.abs(p.aYear - p.bYear) > 5 || !p.strong);
    expect("候选器 · 真语料候选恒为跨轨/±5年/strong", !bad.length,
      bad.length ? `违例 ${bad.length} 组，首组 ${JSON.stringify(bad[0]).slice(0, 160)}` : `${P.length} 组全部满足三条不变量`);

    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/related-cross.json"), "utf8"));
    const disposed = new Set([...(doc.accepted || []), ...(doc.rejected || [])].map((p) => key(p.a, p.b)));
    const cand = new Set(of(P));
    const undecided = [...cand].filter((k) => !disposed.has(k));
    const invented = [...disposed].filter((k) => !cand.has(k));
    expect("候选器 · 每条候选都有裁定留痕", !undecided.length,
      undecided.length ? `未裁定 ${undecided.length} 组：${undecided.slice(0, 5).join(" ")}` : `候选 ${cand.size} 组全部落在 accepted∪rejected`);
    expect("候选器 · 裁定留痕都出自候选集（台账无编造）", !invented.length,
      invented.length ? `留痕里有候选之外的对 ${invented.length} 组：${invented.slice(0, 5).join(" ")}`
        : `accepted ${(doc.accepted || []).length} + rejected ${(doc.rejected || []).length} 未超出候选集`);

    /* 盘上跨轨边 ↔ accepted 台账：候选器看不见「没有候选资格的边」，
       所以年窗外的越权边只能靠这一条直接对账（曾经有一条 3153 年跨度的单向边静默存活） */
    const EN = loadCorpus();
    const known = new Set(EN.map((e) => e.id));
    const disk = new Set();
    for (const e of EN) for (const r of e.related || []) {
      if (!known.has(r) || (r.startsWith("cn--") === e.id.startsWith("cn--"))) continue;
      disk.add(key(e.id, r));
    }
    const acc = new Set((doc.accepted || []).map((p) => key(p.a, p.b)));
    const orphan = [...disk].filter((k) => !acc.has(k));
    const unlanded = [...acc].filter((k) => !disk.has(k));
    expect("候选器 · 盘上跨轨边与 accepted 一一对应", !orphan.length && !unlanded.length,
      orphan.length || unlanded.length
        ? `无留痕 ${orphan.slice(0, 5).join(" ") || "无"}｜未落盘 ${unlanded.slice(0, 5).join(" ") || "无"}`
        : `盘上跨轨无向边 ${disk.size} = accepted ${acc.size}，双向无差`);
  }
}

console.log("候选生成器阳性/阴性对照\n");
for (const x of results) console.log(`${x.ok ? "✅" : "✗"} ${x.label.padEnd(34)} ${x.detail || ""}`);
console.log(`\n${pass}/${results.length} 通过`);
if (fail) {
  console.log(`\n✗ ${fail} 项失败——候选集的可信度等于它的对照，不等于它的条数\n现场保留于 ${DIR}`);
  process.exit(1);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log("\n✅ 每条 strong 信号都能单独放行，每个 df 门都能单独拦下");
