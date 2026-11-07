/* test-intake.mjs | 投稿分诊台 tools/intake.mjs 的功能门与可红性前置证据
 * 用法: node tools/test-intake.mjs
 *
 * 本仓库的规矩是「新门必须先被证明能变红」。intake 自己就是门，所以它得先过这一关：
 * 下面每条断言都配一个「它若不工作就会立刻变红」的夹具，而不是跑一遍看看有没有崩。
 *
 * 四个刻意的设计：
 * 1) 夹具里的年份、标题、target id、locator 全部从盘上语料现推或按 meta 边界推，
 *    不手抄会腐坏的坐标——条目改名、并档、降权之后，抄进来的字面量就是假阴性。
 * 2) 查重的召回用「把语料自身当投稿喂回去」来测：一条已存在的大事若被判成新条目，
 *    就是并档事故，所以必须 100%，且样本非空要先断言。
 * 3) intake 的承诺是「一条数据都不写」。承诺必须有机甲：跑完对 data/ 取指纹比对。
 * 4) 任何一次子进程调用若没吐出 JSON，都以 ok(false, …) 点名收场，而不是让
 *    `rows[0]` 抛 TypeError——异常退出时管道里的失败清单会被截掉，「门变红」会被误读成「用例点名了」。
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "intake-test-"));

let pass = 0, fail = 0;
const failures = [];
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) pass++;
  else { fail++; failures.push(`✗ ${name}\n     期望 ${b}\n     实得 ${a}`); }
}
function ok(cond, name) { eq(!!cond, true, name); }

/* ---------- 读语料：夹具的事实来源 ---------- */
const win = { __CHRONICLE_CHUNK: {}, __CHRONICLE_MANIFEST: null, __CHRONICLE_META: null,
  document: { documentElement: { setAttribute() {}, getAttribute() { return null; }, style: {} },
    getElementById: () => null, querySelector: () => null, addEventListener() {} } };
win.window = win;
function load(rel) {
  new Function("window", "document", fs.readFileSync(path.join(ROOT, rel), "utf8"))(win, win.document);
}
load("data/meta.js"); load("data/manifest.js");
for (const sub of ["cn", "wd"])
  for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter(x => x.endsWith(".js")).sort())
    load(`data/${sub}/${n}`);
load("js/time.js"); load("js/prov.js");
const EVENTS = Object.values(win.__CHRONICLE_CHUNK).flat();
const M = win.__CHRONICLE_META, PV = win.ChronProv;

/* ---------- data/ 指纹：证明 intake 真的只读 ---------- */
function fingerprint(dir) {
  const out = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p); else out.push(`${path.relative(ROOT, p)}:${st.size}`);
    }
  };
  walk(dir);
  return out.join("|");
}
const fpBefore = fingerprint(path.join(ROOT, "data"));
const fpCount = fpBefore.split("|").length;
ok(fpCount > 20, `data/ 指纹收得到 ${fpCount} 个文件（少于 20=指纹本身在空转，下面的「没写」就不成立）`);

/* ---------- 跑 intake ---------- */
let boxSeq = 0;
function makeBox(files) {
  const dir = path.join(TMP, "inbox-" + (++boxSeq));
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}
function runDir(dir, flags = []) {
  const r = spawnSync("node", [path.join(ROOT, "tools/intake.mjs"), "--from", dir, "--json", ...flags],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (e) { /* 交给 rowsOf 点名，不在此抛 */ }
  return { rc: r.status, stdout: r.stdout, stderr: r.stderr, out: parsed };
}
function run(files, flags = []) { return runDir(makeBox(files), flags); }
/* 拿不到 JSON 必须以断言失败收场：静默 return [] 会让后面每一条都「通过」 */
function rowsOf(r, tag) {
  if (!r.out) {
    ok(false, `${tag}：intake 没吐出可解析的 JSON（rc=${r.rc}，stderr=${(r.stderr || "").replace(/\s+/g, " ").slice(0, 200)}）`);
    return [];
  }
  return r.out.rows || [];
}
const row0 = (r, tag) => rowsOf(r, tag)[0] || { status: "?", reasons: ["<无记录>"], flags: [] };

const rec = (o) => JSON.stringify(Object.assign({ schema: "chronicle-contribution/1",
  at: "2026-10-15", app: "时间长河" }, o));
const eventRec = (o) => rec({ kind: "event", who: "测试甲（翻《夹具书》卷一）",
  event: Object.assign({ yearApprox: false, sources: ["《夹具书》卷一"], weight: null }, o) });

/* ============ A. 装载：判据必须来自站内那两个模块，而非第二套 ============ */
{
  const src = fs.readFileSync(path.join(ROOT, "tools/intake.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  ok(EVENTS.length > 0 && EVENTS.length === win.__CHRONICLE_MANIFEST.total,
     `语料装载对账 ${EVENTS.length} === manifest.total（读不到语料的查重器等于什么都没查）`);
  ok(/CC\.checkRecord\(/.test(src), "intake 的合规判据调 ChronContribute.checkRecord（与站内表单同一把尺子）");
  ok(/PV\.KINDS/.test(src), "intake 的「出处能否定位」调 ChronProv.KINDS（与界面徽章同一把尺子）");
  ok(!/\byear(Min|Max)\s*(===|<=|>=|<|>)\s*-?\d{3,}/.test(src),
     "intake 里没把年份边界写成字面量（越界判据只从 __CHRONICLE_META 取）");
  ok(!!PV && !!PV.KINDS && typeof PV.KINDS.filter === "function",
     "prov.js 在本测试垫片里也装载成功（拿不到 KINDS 就无法与 intake 对账，D 段会空转）");
}

/* ============ B. 正例：站内表单能产出的记录必须落 pending ============ */
{
  const r = run({ "good.json": eventRec({ year: 1405, track: "world", dim: "explore",
    title: "此题只用于夹具校验", summary: "这是一条故意不与任何既有条目重合的夹具记录。" }) }, []);
  eq(r.rc, 0, `合规记录不该让进程失败（rc=${r.rc}，stderr=${(r.stderr || "").trim().slice(0, 160)}）`);
  const row = row0(r, "B 正例");
  eq(row.status, "pending", "合规新条目落 pending（不落=正例被误杀，后面整段负例的绿都不可信）");
  eq(row.reasons.length, 0, "合规记录一条拒绝理由都没有（有=表单产得出、工具却拒收的畸形对）");
  eq(row.flags.filter(f => /无署名|缺提交日期|未来/.test(f)).length, 0,
     "带署名带当日日期的合规记录不该吃这三条告警");
}

/* ============ C. 负例：六条硬约束逐个点名 + --strict 的 rc ============ */
{
  const neg = [
    ["year0.json", eventRec({ year: 0, track: "cn", dim: "politics",
      title: "公元零年的条目", summary: "这条要卡在无公元 0 年的口径上，前后一年直接相邻。" }), "没有公元 0 年"],
    ["over.json", eventRec({ year: M.yearMin - 1, track: "cn", dim: "politics",
      title: "超出本站收录起点", summary: "年份早于本站口径下限，必须被拒，不然时间轴画不下。" }), "超出本站范围"],
    ["dim.json", eventRec({ year: 1500, track: "cn", dim: "magic",
      title: "维度不在枚举内", summary: "dim 写了个不存在的枚举，必须被拒而不是被静默归类。" }), "必须选择一个维度"],
    ["track.json", eventRec({ year: 1501, track: "mars", dim: "politics",
      title: "轨道不在枚举内", summary: "track 写了个不存在的轨道，同样必须被拒。" }), "中国或世界轨道"],
    ["short.json", eventRec({ year: 1502, track: "cn", dim: "politics",
      title: "短题", summary: "标题不足四个字的记录无法据以判断是哪件事，必须拒。" }), "标题太短"],
    ["ghost.json", rec({ kind: "check", target: "cn--1949--p99", verdict: "confirm",
      locator: "《人民日报》1949 年 10 月 2 日第 1 版" }), "目标条目在本站数据里不存在"],
  ];
  for (const [name, body, want] of neg) {
    const x = run({ [name]: body }, []);
    const row = row0(x, name);
    eq(row.status, "reject", `${name} 判 reject（缺陷形态：${want}）`);
    ok(row.reasons.join("；").includes(want),
       `${name} 的拒绝理由点名「${want}」（只判 reject 不说哪条=维护者无法回执给投稿人）`);
    eq(runDir(makeBox({ [name]: body }), ["--strict"]).rc, 1,
       `${name} 在 --strict 下让进程失败（CI 只读 rc，报告写得再细也没用）`);
  }
  const badSchema = run({ "s.json": rec({ schema: "chronicle-contribution/9", kind: "event",
    event: { year: 1503, track: "cn", dim: "politics", title: "schema 版本不符",
      summary: "版本号对就不该被当作本站的记录，先于内容判定。", sources: ["《书》卷一"], weight: null } }) }, []);
  const sr = row0(badSchema, "schema 版本");
  eq(sr.status, "reject", "schema 版本不符判 reject（未来的表单版本不能拿今天的判据量）");
  ok(sr.reasons.join("；").includes("schema"), "schema 不符的理由点名 schema（说得出版本号才拦得住整批旧记录）");

  const u = run({ "empty.md": "这里只有一段抱怨，没有 JSON 围栏。\n" }, []);
  eq(row0(u, "无围栏 issue").status, "unreadable", "issue 正文里没有 JSON 围栏时判 unreadable（静默丢弃=投稿蒸发）");
  const broken = run({ "broken.json": "{ 这不是合法 JSON " }, []);
  eq(row0(broken, "半截 JSON").status, "unreadable", "半截 JSON 判 unreadable 且进程不崩（rc=" + broken.rc + "）");
}

/* ============ D. 自封字段：没有这条路，而不是这条路被拒 ============ */
{
  const r = run({ "poison.json": JSON.stringify({ schema: "chronicle-contribution/1", kind: "event",
    at: "2026-10-15", app: "时间长河", who: "乙",
    event: { year: 1406, track: "world", dim: "explore", title: "带自封权重的夹具条目",
      summary: "这条自带 weight 与 tier，两者都必须被丢掉并说出来。",
      sources: ["《某书》卷二"], weight: 5, tier: "已核实", verified: true } }) }, []);
  const row = row0(r, "自封字段");
  ok(row.flags.some(f => /自封/.test(f)), "自封可信/权重字段被点名（不点名=维护者看不见投稿人在声称什么）");
  ok(row.flags.some(f => /丢弃未知键 event\.tier/.test(f)), "event.tier 被丢弃并登记");
  ok(row.status !== "reject", "丢掉自封字段后仍按内容判定，不因「曾带 weight」被拒（拒了会把可用投稿误杀）");
  const chk = run({ "p2.json": rec({ kind: "check", target: "cn--1853--m01", verdict: "confirm",
    locator: "《清史稿》卷一一·太平天国传", who: "丙", confidence: 0.99 }) }, []);
  ok(row0(chk, "顶层 confidence").flags.some(f => /丢弃未知键 confidence/.test(f)),
     "顶层 confidence 被丢弃并登记（等级只能由 prov.js 现算）");
  const undated = run({ "d1.json": JSON.stringify({ schema: "chronicle-contribution/1", kind: "source",
    app: "时间长河", who: "丁", target: "cn--1853--m01", locator: "《清史稿》卷一一" }) }, []);
  ok(row0(undated, "缺 at").flags.some(f => /缺提交日期/.test(f)), "没有 at 的记录被点名（署名与时间无从对账）");
  const future = run({ "d2.json": JSON.stringify({ schema: "chronicle-contribution/1", kind: "source",
    at: "2099-01-01", app: "时间长河", who: "丁", target: "cn--1853--m01", locator: "《清史稿》卷一一" }) }, []);
  ok(row0(future, "at 在未来").flags.some(f => /未来/.test(f)), "at 写在未来被点名（把自己的记录标成三年前，是同一类造假）");
}

/* ============ E. 出处升级判据与 prov.js 结论一致 ============ */
{
  const weak = run({ "weak.json": rec({ kind: "source", target: "cn--1853--m01", who: "丁",
    locator: "《清史稿》" }) }, []);
  ok(row0(weak, "只到书名").flags.some(f => /升不了档/.test(f)),
     "只写书名的补出处标「补进去也升不了档」（读者仍查不到位置，这条投稿的性价比要说清）");
  const STRONG = "《清史稿》卷一一·洪秀全传，页一六二";
  const strong = run({ "strong.json": rec({ kind: "source", target: "cn--1853--m01", who: "丁",
    locator: STRONG }) }, []);
  const row = row0(strong, "写到卷册");
  ok(row.flags.some(f => /出处可定位/.test(f)), "写到卷册页码的补出处标「可定位」并列出命中的定位类型");
  /* 与 prov.js 独立对账：intake 说可定位的那些类型，必须等于 KINDS 现量的集合 */
  const mine = PV.KINDS.filter(k => k.re.test(STRONG)).map(k => k.label).sort().join(",");
  const said = (row.flags.find(f => /出处可定位/.test(f)) || "").replace(/^出处可定位：/, "").split("/").sort().join(",");
  eq(said, mine, `intake 报出的定位类型与 prov.js 现量的一致（实测量到：${mine || "<空>"}）`);
}

/* ============ F. 查重器：回喂语料自身，召回必须 100% ============ */
{
  const samples = EVENTS.filter((_, i) => i % 120 === 0).slice(0, 40);
  ok(samples.length >= 20, `回喂样本取到 ${samples.length} 条（少于 20=下面的 100% 召回是小样本自欺）`);
  const files = {}, selfIds = [];
  samples.forEach((e, i) => {
    files[`s${String(i).padStart(3, "0")}.json`] = eventRec({ year: e.year, track: e.track, dim: e.dim,
      title: e.title, summary: e.summary.length > 12 ? e.summary : e.summary + "（夹具补足长度下限）" });
    selfIds.push(e.id);
  });
  const rr = run(files, []);
  const rows = rowsOf(rr, "回喂样本");
  eq(rows.length, samples.length, `回喂 ${samples.length} 条全部被读到（漏读=分诊数与投稿数对不上）`);
  const missed = [], multi = [];
  rows.forEach((row, i) => {
    const hit = (row.dups || []).some(d => d.startsWith(selfIds[i] + ":"));
    if (row.status !== "review" || !hit) missed.push(selfIds[i] + "→" + row.status);
    if ((row.dups || []).length > 1) multi.push(selfIds[i]);
  });
  eq(missed, [], "回喂已存在的大事必须 100% 被认成重复并附上撞上的 id（认不出=并档会造出双条目）");
  const collide = multi.length / Math.max(1, rows.length);
  ok(collide <= 0.5, `样本里同时挂到多条既有条目的比例 ${(collide * 100).toFixed(0)}% ≤ 50%` +
     `（阈值被改到「同年即疑似重复」时这里先炸——查重是召回网，不是判同器）`);

  /* 精确侧对照：同轨同年确有两件不同的事时，喂一件不得把另一件拖进来 */
  const pair = (() => {
    const byKey = new Map();
    for (const e of EVENTS) { const k = e.track + "|" + e.year; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); }
    for (const [, v] of byKey) if (v.length >= 2) {
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
        const sa = new Set(v[i].title.replace(/[，。、：；]/g, ""));
        const sb = new Set(v[j].title.replace(/[，。、：；]/g, ""));
        let inter = 0; for (const c of sa) if (sb.has(c)) inter++;
        if (inter / Math.min(sa.size, sb.size) <= 0.4) return [v[i], v[j]];
      }
    }
    return null;
  })();
  ok(!!pair, "语料里找得到「同年且标题只少量共字」的对照对（找不到=精确侧无从验证，下面两条是空门）");
  if (pair) {
    const [A, B] = pair;
    const pr = run({ "a.json": eventRec({ year: A.year, track: A.track, dim: A.dim, title: A.title,
      summary: A.summary.length > 12 ? A.summary : A.summary + "夹具补足" }) }, []);
    const row = row0(pr, "精确侧对照");
    ok((row.dups || []).some(d => d.startsWith(A.id + ":")),
       `对照实验里自身仍必须被抓到（抓不到=下面那条「不拖别人」是因为压根没查）`);
    eq((row.dups || []).some(d => d.startsWith(B.id + ":")), false,
       `喂「${A.id}」时不该把不同的一件事「${B.id}」拖进候选（拖进来就是并档误杀的起点）`);
  }
}

/* ============ G. 空清单与错误路径（本仓库最认这条） ============ */
{
  const emptyDir = path.join(TMP, "empty"); fs.mkdirSync(emptyDir, { recursive: true });
  const e = runDir(emptyDir, []);
  eq(e.rc, 1, "空目录必须 rc=1：空清单会让所有分诊判据集体空转，绿着退出等于伪装成「没有投稿问题」");
  ok(/空清单|一条记录都没读到/.test(e.stderr), "空目录要说清是「没读到记录」而不是静默出一份空报告");
  const noargs = spawnSync("node", [path.join(ROOT, "tools/intake.mjs")], { encoding: "utf8" });
  eq(noargs.status, 1, "缺 --from 时 rc=1（不给默认扫描面，免得一条命令误跑全仓）");
  const missing = runDir(path.join(TMP, "no-such-dir"), []);
  eq(missing.rc, 1, "--from 指向不存在的路径时 rc=1，而不是报「0 条合规」");

  eq(fingerprint(path.join(ROOT, "data")), fpBefore,
     "跑完 intake 后 data/ 指纹一字未动（「本工具不写任何数据」必须可证，不是注释里的客气话）");
}

console.log(`\nintake 分诊台测试：${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`);
if (fail) { console.log("\n" + failures.join("\n")); process.exitCode = 1; }
else console.log("✅ 全部通过");
fs.rmSync(TMP, { recursive: true, force: true });
