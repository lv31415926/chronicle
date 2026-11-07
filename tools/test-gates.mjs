/* test-gates.mjs | 门禁可红性自审（mutation testing）
 * 用法: node tools/test-gates.mjs
 *
 * 为什么必须有这个文件：validate.mjs / e2e-static.mjs / weight-change.mjs 里
 * 任何一条「永远不变红」的检查，其效果等同于该检查不存在——但它会让后来者以为
 * 已经查过了。本轮审计实际抓到两条这种门（CHRON_ORDER 的深度过滤把全部读取点
 * 滤光；W5_LOW 的文案报 8–15% 而代码判 <5%），都是靠注入变异才发现的。
 * 所以每个门的红性证明必须是仓库里的可重跑资产，不能只活在 /tmp。
 *
 * 三条硬约束：
 *   1) 全程只在 mkdtemp 副本上操作，绝不写仓库工作区（曾有一版直接改 cn-13.js
 *      再手工还原，进程中途被杀就会留下损坏数据）。
 *   2) 测试数据从分片运行时推导，不硬编码 id/权重——数据会变，硬编码必腐。
 *   3) 变异前置条件构造不出来时判为失败，不允许静默 skip
 *      （静默 skip 会让用例数悄悄变少，看起来仍然「全绿」）。
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { markOwner, reclaimStale, ownerAlive } from "./tmp-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gate-mut-"));

/* 失败时刻意保留现场（见文末），一份副本 30MB+，只留不清必积累成几百兆。
 * 但「前缀 gate-mut- 由本文件独占」不等于「同一时刻只有一份」：另一个终端正在跑门禁、
 * 或 test-gates-meta 在它的副本里拉起本文件时，无差别回收会删掉对方正在用的目录——
 * 实测两种后果：一边 ENOTEMPTY 当场崩，另一边更坏，副本半途没了而门禁照样判绿。
 * 所以回收判据搬到 tools/tmp-sweep.mjs（带归属文件 + pid 存活），两个 runner 共用一份。 */
const SWEEP_PARENT = path.dirname(TMP), SWEEP_BASE = path.basename(TMP);
{
  markOwner(TMP);
  const r = reclaimStale("gate-mut-", SWEEP_PARENT, SWEEP_BASE);
  if (r.reclaimed) console.log(`已回收上次运行遗留的 ${r.reclaimed} 份现场副本` +
    (r.kept ? `；另 ${r.kept} 份正被别的会话占用，不动` : ""));
}

function fresh(name) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  /* 整项目拷贝：曾只拷 js/css/data，漏 assets/ 导致基线被 ASSET_MISSING 污染误判 */
  fs.cpSync(ROOT, dir, {
    recursive: true,
    filter: (s) => !/(^|\/)(\.git|node_modules|__pycache__)(\/|$)/.test(s),
  });
  return dir;
}

const readIn = (dir, p) => fs.readFileSync(path.join(dir, p), "utf8");
const putIn = (dir, p, s) => fs.writeFileSync(path.join(dir, p), s);

/** 跑一个门，返回 {code, out}；门本身 exit(1) 是正常输出通道 */
function gate(cmd, args, cwd) {
  try {
    return { code: 0, out: execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 << 20 }) };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}

let pass = 0, fail = 0;
const results = [];
function expect(label, ok, detail) {
  results.push({ label, ok, detail });
  if (ok) pass++;
  else fail++;
}

/* ───────── 〇、现场回收判据：清理程序自己也得能被验红 ─────────
 * 回收逻辑是个会删文件的循环，它有两种相反的失效：把别人正在用的副本删了
 * （对端表现为崩溃，或更坏——副本没了却仍打印通过），以及谁都不删（几百兆堆在 tmp）。
 * 两种都不能靠「看起来没事」来确认，所以在这里造三个探针目录现跑一遍：
 * 活 pid 归属的必须留下，归属无效和没有归属文件的必须被回收。
 * 探针只碰 tmp 下自建的 gate-mut-selfcheck-* 空目录，不动任何真副本。 */
{
  const mk = (n, pid) => {
    const dir = path.join(SWEEP_PARENT, n);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    if (pid !== null) markOwner(dir, pid);
    return dir;
  };
  const live = mk("gate-mut-selfcheck-live", process.pid);
  const dead = mk("gate-mut-selfcheck-dead", 0);            // pid 0 不是可存活的进程号
  const orphan = mk("gate-mut-selfcheck-noowner", null);    // 老版本现场：没有 .owner
  const again = reclaimStale("gate-mut-", SWEEP_PARENT, SWEEP_BASE);
  expect("现场回收 · 存活会话的副本不得被删（否则对端假绿）", fs.existsSync(live),
    `本进程 pid=${process.pid} 归属的探针目录${fs.existsSync(live) ? "留下" : "被删了"}；判据见 tools/tmp-sweep.mjs`);
  expect("现场回收 · 归属无效与无主旧现场仍要回收",
    !fs.existsSync(dead) && !fs.existsSync(orphan) && again.reclaimed >= 2,
    `死归属=${fs.existsSync(dead) ? "未回收" : "已回收"} 无主=${fs.existsSync(orphan) ? "未回收" : "已回收"} 本轮回收数=${again.reclaimed}`);
  fs.rmSync(live, { recursive: true, force: true });
  expect("现场回收 · 归属读取只认 .owner（判据与 tools/tmp-sweep.mjs 同源）",
    ownerAlive(SWEEP_PARENT) === false, `把父目录（没有 .owner）读成有主 = 回收会永久空转`);
}

/* ───────── 一、e2e-static.mjs：七项静态不变量 + 干净基线 ───────── */
const E2E_CASES = [
  ["ASSET_MISSING", (d) => putIn(d, "index.html", readIn(d, "index.html").replace(
    /(<script src="js\/palette\.js"><\/script>)/,
    '<script src="js/no-such-module.js"></script>$1')), "ASSET_MISSING"],
  ["ASSET_REMOTE", (d) => putIn(d, "index.html", readIn(d, "index.html").replace(
    /(<script src="js\/palette\.js"><\/script>)/,
    '<script src="https://cdn.example.com/x.js"></script>$1')), "ASSET_REMOTE"],
  ["FILE_URL_BREAK (js)", (d) => putIn(d, "js/loader.js",
    readIn(d, "js/loader.js") + "\nfunction __probe(){ return fetch('/x'); }\n"), "FILE_URL_BREAK"],
  ["FILE_URL_BREAK (内联)", (d) => putIn(d, "index.html", readIn(d, "index.html").replace(
    /<\/body>/, '<script>window.__p=fetch("/x");</script></body>')), "FILE_URL_BREAK"],
  /* 把 palette.js 挪到它所有消费者之后——加载期读 window.ChronPalette 必炸 */
  ["CHRON_ORDER", (d) => {
    let h = readIn(d, "index.html");
    const tag = /<script src="js\/palette\.js"><\/script>/;
    if (!tag.test(h)) throw new Error("找不到 palette.js 的 script 标签，变异前提不成立");
    h = h.replace(tag, "");
    putIn(d, "index.html", h.replace(/<\/body>/, '<script src="js/palette.js"></script></body>'));
  }, "CHRON_ORDER"],
  ["CSS_URL", (d) => putIn(d, "css/base.css",
    readIn(d, "css/base.css") + "\n.probe{background:url(./no-such-font.woff2)}\n"), "CSS_URL"],
  /* 下面两条变异把路径前缀改成 /，指向的仍是盘上真实存在的文件：
   * ASSET_MISSING / CSS_URL 这类「文件不在」的门对它全盲，只有 ABS_PATH 会红 */
  ["ABS_PATH (html)", (d) => putIn(d, "index.html", readIn(d, "index.html").replace(
    /<script src="js\/palette\.js"><\/script>/, '<script src="/js/palette.js"></script>')), "ABS_PATH"],
  ["ABS_PATH (css)", (d) => putIn(d, "css/base.css",
    readIn(d, "css/base.css") + "\n.probe{background:url(/assets/favicon.svg)}\n"), "ABS_PATH"],
  ["SHARD_UNLISTED", (d) => putIn(d, "data/manifest.js", readIn(d, "data/manifest.js").replace(
    /(\{[^{}]*?file\s*:\s*")([^"]+\.js")/, '$1ghost-shard.js"')), "SHARD_UNLISTED"],
];
for (const [label, mutate, code] of E2E_CASES) {
  const dir = fresh("e2e");
  let pre = null;
  try { mutate(dir); } catch (e) { pre = e.message; }
  if (pre) { expect(`e2e · ${label}`, false, `前置条件失败: ${pre}`); continue; }
  const r = gate("node", [`${dir}/tools/e2e-static.mjs`], dir);
  expect(`e2e · ${label}`, r.code === 1 && r.out.includes(code),
    `rc=${r.code} 命中=${r.out.includes(code)}` + (r.code !== 1 ? "\n    " + r.out.split("\n").filter(Boolean).slice(-3).join("\n    ") : ""));
}
{
  const dir = fresh("e2e-clean");
  const r = gate("node", [`${dir}/tools/e2e-static.mjs`], dir);
  expect("e2e · 无变异基线必须绿", r.code === 0, `rc=${r.code}\n    ` + r.out.split("\n").filter(Boolean).slice(0, 6).join("\n    "));
}
/* ABS_PATH 的正对照：这条判据的全部价值在于「文件明明在，只是路径写法在子路径部署下会 404」。
 * 如果哪天它其实只是被 ASSET_MISSING 顺手抓到，这条断言会先炸——那时 ABS_PATH 就是条寄生门。 */
{
  const dir = fresh("e2e-abs");
  putIn(dir, "index.html", readIn(dir, "index.html").replace(
    /<script src="js\/palette\.js"><\/script>/, '<script src="/js/palette.js"></script>'));
  expect("e2e · ABS_PATH 变异指向的文件确实存在（排除 ASSET_MISSING 冒充）",
    fs.existsSync(path.join(dir, "js/palette.js")),
    "js/palette.js 在副本里不存在，该用例退化为 ASSET_MISSING");
  const r = gate("node", [`${dir}/tools/e2e-static.mjs`], dir);
  expect("e2e · ABS_PATH 独占命中（输出里不得出现 ASSET_MISSING/CSS_URL）",
    r.code === 1 && r.out.includes("ABS_PATH") && !/ASSET_MISSING|CSS_URL/.test(r.out),
    `rc=${r.code}\n    ` + r.out.split("\n").filter(Boolean).slice(-4).join("\n    "));
}

/* CHRON_ORDER 的反噪声对照：模块头普遍写着「发布：window.ChronX」这类散文。
 * 若整行注释也算读取，门会为注释变红，人们改的是注释而不是脚本顺序——
 * 那扇门从此只会教人绕路。这里要求「只有注释提到」时门必须保持绿。 */
{
  const dir = fresh("e2e-chron-comment");
  putIn(dir, "js/palette.js", "/* 依赖：window.ChronMeta ｜ 发布：window.ChronPalette */\n" + readIn(dir, "js/palette.js"));
  const r = gate("node", [`${dir}/tools/e2e-static.mjs`], dir);
  expect("e2e · CHRON_ORDER 不把整行注释当读取（反噪声对照）",
    r.code === 0, `rc=${r.code}\n    ` + r.out.split("\n").filter(Boolean).slice(0, 5).join("\n    "));
}

/* ───────── 二、weight-change.mjs：授权集合的每条拒绝分支 ───────── */
const SHARD_REL = "data/cn/cn-13.js";
function loadShard(p) {
  global.window = {};
  new Function("window", fs.readFileSync(p, "utf8"))(global.window);
  return Object.values(global.window.__CHRONICLE_CHUNK)[0];
}
const WHY = "§4 之判定：变异自审用的占位理由，长度足够通过 why 校验";

/* 以下两件是「改分片里某一条」的通用地基，五 与 五·乙 共用，故放在模块层：
 * 各写一份的话，其中一份的求值回读迟早被改哑，用例就退化成「把语法写坏也当门红」。 */
const lineId = (l) => (/^\s*\{ ?"?id"? ?: ?"([^"]+)"/.exec(l) || [])[1];
/** 写盘前先回读求值，并返回解析结果：分片一旦被变异写坏（键名丢失、引号失衡），
 *  validate 会在解析阶段崩掉、所有门都跑不到，用例就会把「语法坏了」误判成「门不会红」。 */
function putChecked(dir, rel, text) {
  const w = { window: {} };
  try { new Function("window", text)(w.window); }
  catch (e) { throw new Error(`变异后的分片无法解析（用例作废；别把崩溃当成门红）：${e.message}`); }
  putIn(dir, rel, text);
  return Object.values(w.window.__CHRONICLE_CHUNK)[0] || [];
}

/* 运行时从分片推导用例目标，不硬编码 id 与权重 */
const baseDir = fresh("wt");
const baseArr = loadShard(path.join(baseDir, SHARD_REL));
const target = baseArr.find((e) => Number.isInteger(e.weight) && e.weight >= 3 && e.weight <= 4);
const other = baseArr.find((e) => e.id !== target.id && Number.isInteger(e.weight));
if (!target || !other) {
  expect("weight-change · 目标条目可推导", false, "分片内找不到 weight∈[3,4] 的条目，无法构造用例");
} else {
  const legalW = target.weight === 5 ? 4 : 5;
  const runW = (label, shardText, patch, wantOut, wantCode = 1) => {
    const dir = fresh("wt");
    const sp = path.join(dir, SHARD_REL);
    putIn(dir, SHARD_REL, shardText);
    const pp = path.join(dir, "patch.json");
    fs.writeFileSync(pp, JSON.stringify(patch));
    const r = gate("node", [`${dir}/tools/weight-change.mjs`, sp, pp], dir);
    expect(`weight-change · ${label}`, r.code === wantCode && r.out.includes(wantOut),
      `rc=${r.code}(期望${wantCode}) 命中「${wantOut}」=${r.out.includes(wantOut)}`);
  };
  const orig = readIn(baseDir, SHARD_REL);
  const P = (id, w) => ({ [id]: { weight: w, why: WHY } });

  runW("weight 越界(6)", orig, { [target.id]: { weight: 6, why: WHY } }, "补丁 weight 非法");
  runW("缺 why", orig, { [target.id]: { weight: legalW } }, "缺 why");
  runW("未知 id", orig, P("cn--9999--z99", 5), "未知 id");
  runW(`与现值相同(${target.weight}→${target.weight})`, orig, P(target.id, target.weight), "补丁与现值相同");
  runW("干净补丁 dry-run 放行", orig, P(target.id, legalW), "dry-run", 0);

  /* 毒化 summary：曾真实产出非法 JS——正则把 `"?weight"?` 分开捕获再丢弃，
   * 遇 summary:"weight:2, 会吞掉前引号变成 summary:weight:5, 语法全坏。
   * 语料有四种序列化风格且键序不固定，所以必须先把 summary 重排到 weight 之前，
   * 否则首次正则命中落在真 weight 上，这个用例等于什么都没测。 */
  const lines = orig.split("\n");
  const li = lines.findIndex((l) => new RegExp(`^\\s*\\{ ?"?id"? ?: ?"${target.id}"`).test(l));
  const L = li < 0 ? "" : lines[li];
  const mSum = L.match(/"?summary"? ?: ?"(?:[^"\\]|\\.)*"/);
  const mW = L.match(/,?"?\s*weight"?\s*:\s*[1-5]/);
  if (li < 0 || !mSum || !mW) {
    expect("weight-change · 毒化 summary", false, `前置条件失败 li=${li} summary=${!!mSum} weight=${!!mW}`);
  } else {
    let R = L.replace(mW[0], "");
    R = R.replace(mSum[0], mSum[0] + mW[0]);
    R = R.replace(/"?summary"? ?: ?"/, 'summary:"weight:2,毒');
    lines[li] = R;
    runW("毒化 summary 致附带改动", lines.join("\n"), P(target.id, legalW), "非 weight 字段");
  }

  /* 行内删掉 weight 字段：定位必须按行首精确匹配条目起点，
   * 用 includes('"id"') 会撞上别的条目 related 数组里的同名字串（实测踩过）。 */
  const l2 = orig.split("\n");
  const j = l2.findIndex((l) => new RegExp(`^\\s*\\{ ?"?id"? ?: ?"${other.id}"`).test(l));
  const stripped = j < 0 ? "" : l2[j].replace(/"?weight"?\s*:\s*[1-5]\s*,?/, "");
  if (j < 0 || stripped === l2[j]) {
    expect("weight-change · 行内无 weight", false, "无法构造缺 weight 字段的行");
  } else {
    l2[j] = stripped;
    runW("行内无 weight 字段", l2.join("\n"), P(other.id, other.weight === 5 ? 4 : 5), "定位不到 weight");
  }
}

/* ───────── 三、validate.mjs 权重带：文案自洽 + 低带分支仍可红 ───────── */
{
  /* 基线：只要求「文案不得用一条带的措辞报另一条带的判定」——
   * 即任何 W5_/W4_ 违规行都必须同时写出触发线与 §4 目标带。 */
  const dir = fresh("band");
  /* dir 稍后会被就地降权污染，基线断言必须用另一份未变异的副本 */
  const base = fresh("band0");
  const r = gate("node", [`${dir}/tools/validate.mjs`], dir);
  const bandLines = r.out.split("\n").filter((l) => /\[(cn|wd)-\d+\].*(weight5|weight≥4)/.test(l));
  const unsound = bandLines.filter((l) => !/触发线/.test(l) || !/目标带/.test(l));
  expect("validate · 权重带文案自洽", r.code >= 0 && !unsound.length,
    `检出 ${bandLines.length} 条权重带违规行，其中 ${unsound.length} 条措辞不自洽` +
    (unsound.length ? "\n    " + unsound.slice(0, 3).join("\n    ") : ""));

  /* W5_LOW 可红：把某个够大的分片内全部 weight=5 降为 4，占比必然归零。
   * 降幅可达性先算过：分片 arr.length>=20 才进入统计带，降完后 p5=0 < 5% 必触发。 */
  const srcPath = path.join(dir, SHARD_REL);
  const arr = loadShard(srcPath);
  if (arr.length < 20) {
    expect("validate · W5_LOW 可红", false, `${SHARD_REL} 仅 ${arr.length} 条，不进入统计带，换分片`);
  } else {
    const five = arr.filter((e) => e.weight === 5);
    if (!five.length) {
      expect("validate · W5_LOW 可红", false, `${SHARD_REL} 无 weight=5 条目，无法用降权把 p5 推到底`);
    } else {
      const patch = {};
      for (const e of five) patch[e.id] = { weight: 4, why: WHY };
      const pp = path.join(dir, "revert.json");
      fs.writeFileSync(pp, JSON.stringify(patch));
      const w = gate("node", [`${dir}/tools/weight-change.mjs`, srcPath, pp, "--write"], dir);
      if (w.code !== 0) {
        expect("validate · W5_LOW 可红", false, `降权落盘失败 rc=${w.code}\n    ` + w.out.split("\n").filter(Boolean).slice(-3).join("\n    "));
      } else {
        const r2 = gate("node", [`${dir}/tools/validate.mjs`], dir);
        const hit = new RegExp(`\\[cn-13\\] weight5 \\d+\\.\\d% 跌破触发线 5%（§4 目标带 8–15%）`).test(r2.out);
        expect("validate · W5_LOW 可红", hit,
          `降掉 ${five.length} 条 w5 → ` +
          (hit ? "W5_LOW 如期变红" : "仍不见 W5_LOW，低带分支是死门"));
        /* W5_NONE 双向：降到 0 条必须亮（不是永真门），基线必须只对 cn-16 亮一次。
         * 注意 validate 的 code 名只在 `W5_NONE ×N` 汇总行出现，明细行不含该串，
         * 所以按 code 名计数会恒为 1——那是断言的错，不是门的错。改按明细行计数，
         * 并核对 ×N 与明细行数一致（防 detail 被 slice(0,5) 截断后 N 与明细脱节）。 */
        const noneLines = (s) => (s.match(/\[\S+\] \S+: \d+ 条中 0 条 weight=5/g) || []);
        const noneN = (s) => { const m = s.match(/W5_NONE ×(\d+)/); return m ? Number(m[1]) : -1; };
        const nLines = noneLines(r2.out), nClaim = noneN(r2.out);
        expect("validate · W5_NONE 随 n5 归零而亮",
          nLines.some((l) => /\[cn-13\]/.test(l)) && nLines.length >= 2 && nClaim === nLines.length,
          `明细 ${nLines.length} 行（${nLines.map((s) => s.slice(1, s.indexOf("]"))).join(",")}），汇总 ×${nClaim}`);
        const rb = gate("node", [`${base}/tools/validate.mjs`], base);
        const baseNone = noneLines(rb.out);
        expect("validate · W5_NONE 基线不恒亮", baseNone.length === 1 && /\[cn-16\]/.test(baseNone[0]),
          `基线亮 ${baseNone.length} 次：${baseNone.map((s) => s.slice(1, s.indexOf("]"))).join(",") || "（无）"}`);
      }
    }
  }
}

/* ───────── 四、validate.mjs manifest 对账门 ───────── */
{
  const dir = fresh("man");
  const base = gate("node", [`${dir}/tools/validate.mjs`], dir);
  /* 先证明门真的在跑：输出里没有 `=== ERRORS` 就是脚本崩了，不是通过。
   * 这个断言存在的理由——一次探针求值抛错被当成「0 项不一致」，差点头标绿。 */
  expect("validate · 跑起来了（非崩溃式假绿）", base.out.includes("=== ERRORS"),
    `rc=${base.code}，` + (base.out.includes("=== ERRORS") ? "报告标题在场，确已执行" : "未见 === ERRORS 标题——可能崩溃或被截断"));

  const M = "data/manifest.js";
  const manCases = [
    ["count 与实态不符", (s) => s.replace(/(\{ id: "cn-07", file: "cn\/cn-07\.js", track: "cn", count: )\d+/, "$1999"), "MANIFEST_STALE"],
    ["登记不存在的分片", (s) => s.replace(/(chunks: \[\n)/, '$1    { id: "cn-99", file: "cn/cn-99.js", track: "cn", count: 1, yearFrom: 1, yearTo: 1 },\n'), "不存在的分片"],
    ["实存分片未登记", (s) => s.split("\n").filter((l) => !/file: "cn\/cn-07\.js"/.test(l)).join("\n"), "未登记实存分片"],
  ];
  for (const [label, mutate, needle] of manCases) {
    const d = fresh("man");
    const src = readIn(d, M);
    const out = mutate(src);
    if (out === src) { expect(`validate · ${label}`, false, "变异锚串没匹配上，用例失效"); continue; }
    putIn(d, M, out);
    const r = gate("node", [`${d}/tools/validate.mjs`], d);
    expect(`validate · ${label}`, r.code === 1 && r.out.includes(needle),
      `rc=${r.code} 命中「${needle}」=${r.out.includes(needle)}`);
  }
}

/* ───────── 五、本轮新增门与「文案随常量走」─────────
 * 两类断言各有其故：
 *   · 新门（EVENT_DUP_DIM / XTRACK_LEVEL）必须先证明能红——绿门里最危险的就是
 *     永远不响的那一种，本轮审计抓到的两条死门都是这么来的；
 *   · 文案与判据同线：把常量改掉，报告里的线必须跟着变。W5_LOW 曾因文案写
 *     「8–15%」而代码判 5%，cn-13 升到 6.35% 即静默过关，这组用例钉的就是那类缺陷。
 * 目标一律运行时从分片推导（同年异维对、跨轨同年对），不硬编码 id；
 * 前置条件构造不出来时判失败，不静默 skip。 */
{
  const CN = "data/cn/cn-13.js";
  const WD = "data/wd/wd-10.js";
  const FIELD = (k) => new RegExp('((?:[{,]\\s*)"?' + k + '"?:\\s*)"((?:[^"\\\\]|\\\\.)*?)"(?=\\s*[,}])');
  const norm = (s) => String(s).replace(/[^\p{Script=Han}0-9A-Za-z]/gu, "");
  const groupBy = (arr, f) => { const m = new Map(); for (const e of arr) { const k = f(e); if (!m.has(k)) m.set(k, []); m.get(k).push(e); } return m; };

  /** 解析结果里必须确实躺着新值——键名被写丢时求值照样通过，只有回读能抓到 */
  function landed(arr, id, key, want) {
    const e = arr.find((x) => x.id === id);
    if (!e) throw new Error(`变异后条目 ${id} 消失了`);
    const v = e[key] !== undefined ? e[key] : (e.detail || {})[key];   // sources 一类住在 detail 下
    if (v === undefined) throw new Error(`变异后条目 ${id} 没有 ${key} 字段`);
    const got = Array.isArray(v) ? JSON.stringify(v) : String(v);
    if (got !== want) throw new Error(`变异没落到 ${id}.${key} 上：期望 ${want}，实为 ${got}`);
  }
  /** 改分片里某一条的字符串字段值；换不动即抛（否则用例等于什么都没测） */
  function setField(dir, rel, id, key, val) {
    const text = readIn(dir, rel);
    const lines = text.split("\n");
    const i = lines.findIndex((l) => lineId(l) === id);
    if (i < 0) throw new Error(`行首找不到条目 ${id}`);
    if (val.includes('"')) throw new Error(`注入值含双引号，会写坏分片：${val}`);
    const m = FIELD(key).exec(lines[i]);
    if (!m) throw new Error(`${id} 行内定位不到 ${key} 字段`);
    const out = lines[i].replace(m[0], m[1] + '"' + val + '"');
    if (out === lines[i]) throw new Error(`${id} 的 ${key} 已是目标值，变异无效`);
    lines[i] = out;
    landed(putChecked(dir, rel, lines.join("\n")), id, key, val);
  }
  /** 整体替换某个数组字段（sources 一类）；literal 须是可直接求值的数组字面量 */
  function setArray(dir, rel, id, key, literal) {
    const lines = readIn(dir, rel).split("\n");
    const i = lines.findIndex((l) => lineId(l) === id);
    if (i < 0) throw new Error(`行首找不到条目 ${id}`);
    const m = new RegExp('((?:[{,]\\s*"?)' + key + '"?(?:\\s*:\\s*))\\[[^\\]]*\\]').exec(lines[i]);
    if (!m) throw new Error(`${id} 行内定位不到 ${key} 数组`);
    const out = lines[i].replace(m[0], m[1] + literal);
    if (out === lines[i]) throw new Error(`${id} 的 ${key} 已是目标值，变异无效`);
    lines[i] = out;
    landed(putChecked(dir, rel, lines.join("\n")), id, key, JSON.stringify(new Function("return " + literal)()));
  }

  /* ---- EVENT_DUP_DIM：同轨、同年、归一化标题相同而 dim 不同 ---- */
  const dupDir = fresh("dup");
  const dupArr = loadShard(path.join(dupDir, CN));
  let pair = null;
  outer: for (const [, g] of groupBy(dupArr, (e) => e.year))
    for (const a of g) for (const b of g)
      if (a !== b && a.dim !== b.dim && norm(a.title) !== norm(b.title)) { pair = { a, b }; break outer; }
  if (!pair) {
    expect("validate · EVENT_DUP_DIM 可红", false, `${CN} 内找不到同年异维的条目对，无法构造`);
  } else {
    const { a, b } = pair;                       // 把 a 的标题换成 b 的：a 的 id 仍编码自己的 dim，故两 dim 并存
    let pre = null;
    try { setField(dupDir, CN, a.id, "title", b.title); } catch (e) { pre = e.message; }
    if (pre) {
      expect("validate · EVENT_DUP_DIM 可红", false, `前置条件失败: ${pre}`);
    } else {
      const r = gate("node", [`${dupDir}/tools/validate.mjs`], dupDir);
      expect("validate · EVENT_DUP_DIM 可红", r.code === 1 && r.out.includes("EVENT_DUP_DIM"),
        `${a.id}(${a.dim}) 换上 ${b.id}(${b.dim}) 的标题 → rc=${r.code} 命中=${r.out.includes("EVENT_DUP_DIM")}`);

      /* 反向：把 a 的 dim 也改成 b 的，该门必须闭嘴、EVENT_DUP 必须接手。
       * 不测这一支，就无法排除「判据其实把同维重复也算进来」——那是误报的温床。 */
      const d2 = fresh("dup2");
      let pre2 = null;
      try { setField(d2, CN, a.id, "title", b.title); setField(d2, CN, a.id, "dim", b.dim); } catch (e) { pre2 = e.message; }
      if (pre2) expect("validate · 同题同维交给 EVENT_DUP", false, `前置条件失败: ${pre2}`);
      else {
        const r2 = gate("node", [`${d2}/tools/validate.mjs`], d2);
        const ran2 = r2.out.includes("=== ERRORS");
        expect("validate · 同题同维交给 EVENT_DUP",
          ran2 && r2.out.includes("EVENT_DUP") && !r2.out.includes("EVENT_DUP_DIM"),
          `dim 归一后 EVENT_DUP=${r2.out.includes("EVENT_DUP")}、EVENT_DUP_DIM=${r2.out.includes("EVENT_DUP_DIM")}（后者仍响即判据掺误报）` +
          (ran2 ? "" : "——报告无 === ERRORS，缺席断言不成立"));
      }
    }
  }

  /* ---- XTRACK_LEVEL：跨轨同年、归一化标题相同、权重不等（WARN，不动退出码）---- */
  {
    const d = fresh("xt");
    const cn = loadShard(path.join(d, CN)), wd = loadShard(path.join(d, WD));
    const wdByYear = groupBy(wd, (e) => e.year);
    let xp = null;
    outer: for (const a of cn) for (const b of (wdByYear.get(a.year) || []))
      if (a.weight !== b.weight && norm(a.title) !== norm(b.title)) { xp = { a, b }; break outer; }
    if (!xp) expect("validate · XTRACK_LEVEL 可红", false, `${CN} 与 ${WD} 无「同年且权重不等」的条目对`);
    else {
      let pre = null;
      try { setField(d, CN, xp.a.id, "title", xp.b.title); } catch (e) { pre = e.message; }
      if (pre) expect("validate · XTRACK_LEVEL 可红", false, `前置条件失败: ${pre}`);
      else {
        const r = gate("node", [`${d}/tools/validate.mjs`], d);
        expect("validate · XTRACK_LEVEL 可红", r.out.includes("XTRACK_LEVEL"),
          `${xp.a.id}(w${xp.a.weight}) 换上 ${xp.b.id}(w${xp.b.weight}) 的标题 → 命中=${r.out.includes("XTRACK_LEVEL")}`);
      }
    }
  }

  /* ---- XTRACK_NEAR：换了措辞的跨轨同事件候选 ----
   * XTRACK_LEVEL 只认「归一化标题完全相同」，同一件事换一种说法它就静默——
   * 2026-09-22 的入世倒挂（相差两级）正是这么漏掉的。本用例造一个共词≥6 字
   * 但标题不全同的对，要求这条候选门接手。 */
  {
    const d = fresh("xt-near");
    const cn = loadShard(path.join(d, CN)), wd = loadShard(path.join(d, WD));
    const wdByYear = groupBy(wd, (e) => e.year);
    const hanN = (t) => ((t || "").match(/[\p{Script=Han}]/gu) || []).length;
    let np = null;
    outerNear: for (const a of cn) for (const b of (wdByYear.get(a.year) || []))
      if (a.weight !== b.weight && hanN(b.title) >= 6 && norm(a.title) !== norm(b.title)) { np = { a, b }; break outerNear; }
    if (!np) expect("validate · XTRACK_NEAR 可红", false, `${CN} 与 ${WD} 无「同年、权重不等、世界轨标题汉字≥6」的条目对，无法构造`);
    else {
      const t = np.b.title + "补";           // 多一个字：破坏全同，保住共词
      let pre = t.length > 24 ? `夹具标题 ${t.length} 字 > 24，会先撞 TITLE_LEN` : null;
      if (!pre) { try { setField(d, CN, np.a.id, "title", t); } catch (e) { pre = e.message; } }
      if (pre) expect("validate · XTRACK_NEAR 可红", false, `前置条件失败: ${pre}`);
      else {
        const r = gate("node", [`${d}/tools/validate.mjs`], d);
        expect("validate · XTRACK_NEAR 可红", r.out.includes("XTRACK_NEAR"),
          `${np.a.id}(w${np.a.weight}) 换成「${t}」（与 ${np.b.id} 共词）→ 命中=${r.out.includes("XTRACK_NEAR")}`);
      }
    }
  }

  /* ---- NEAR_EXEMPT 必须是有承重的那颗螺丝，不是装饰 ----
   * 干净副本里 XTRACK_NEAR 一条不响，有两种可能：判据真的没候选，或豁免表把它们按住了。
   * 删掉一条豁免，真实候选必须现形——否则「豁免表」就成了藏污纳垢的静默开关。 */
  {
    const d = fresh("xt-near-exempt");
    const clean = gate("node", [`${d}/tools/validate.mjs`], d);
    expect("validate · 干净副本不响 XTRACK_NEAR", clean.out.includes("=== ERRORS") && !clean.out.includes("XTRACK_NEAR"),
      `len=${clean.out.length} 命中=${clean.out.includes("XTRACK_NEAR")}（有响即豁免表没兜住，须先裁定再收线）`);
    const VP = "tools/validate.mjs";
    const src = readIn(d, VP);
    const cut = src.replace(/^.*cn--1997--e01\|world--1997--e01.*\n/m, "");
    if (cut === src) expect("validate · 豁免表承重（删一条即现形）", false, "豁免条目锚串没匹配上——NEAR_EXEMPT 已改动，本用例失效");
    else {
      putIn(d, VP, cut);
      const r = gate("node", [`${d}/tools/validate.mjs`], d);
      expect("validate · 豁免表承重（删一条即现形）",
        r.out.includes("XTRACK_NEAR") && r.out.includes("cn--1997--e01"),
        `命中 XTRACK_NEAR=${r.out.includes("XTRACK_NEAR")}、点名 1997=${r.out.includes("cn--1997--e01")}`);
    }
  }
  /* ---- 文案里的线必须跟着常量走（复用一份副本，跑完还原 validate.mjs）---- */
  {
    const d = fresh("msg");
    const VP = "tools/validate.mjs";
    const pristine = readIn(d, VP);
    const LP = "tools/limits.mjs";
    const pristineLimits = readIn(d, LP);
    const valCase = (label, from, to, needle, anti, file = VP) => {
      putIn(d, VP, pristine);
      putIn(d, LP, pristineLimits);
      const src = readIn(d, file);
      if (!src.includes(from)) { expect(`validate · ${label}`, false, `常量锚串没匹配上（${file}）：${from}`); return; }
      putIn(d, file, src.replace(from, to));
      const r = gate("node", [`${d}/tools/${"validate.mjs"}`], d);
      const ran = r.out.includes("=== ERRORS");     // 空输出≠通过：门没跑起来时两条断言都会假绿
      const hit = ran && r.out.includes(needle), clean = !anti || (ran && !r.out.includes(anti));
      expect(`validate · ${label}`, hit && clean,
        `rc=${r.code} len=${r.out.length} 命中「${needle}」=${hit}` + (anti ? `、不现旧线「${anti}」=${clean}` : "") +
        (ran ? "" : "——报告里没有 === ERRORS，门未真正执行") +
        (r.code === -1 ? "\n    " + r.out.split("\n").filter(Boolean).slice(-2).join("\n    ") : ""));
    };
    valCase("TITLE_LEN 上限随常量走", "export const MAX_TITLE = 24;", "export const MAX_TITLE = 12;", "字 > 12", "> 24", LP);
    valCase("REG_THIN 均长线随常量走", "const MIN_SUMMARY_AVG = 10;", "const MIN_SUMMARY_AVG = 40;", "< 40", "< 10");
    valCase("语域错误线随常量走", "const REG_WARN = 2.6, REG_ERR = 4.0;", "const REG_WARN = 0.2, REG_ERR = 2.0;", "越过错误线 >2", null);
    valCase("语域告警线随常量走", "const REG_WARN = 2.6, REG_ERR = 4.0;", "const REG_WARN = 1.1, REG_ERR = 9;", "告警线 >1.1", null);
    putIn(d, VP, pristine);
    putIn(d, LP, pristineLimits);
  }

  /* ---- ID_SEQ：序号位数只是软提示，不得升级成硬错（严重度与文案同线）---- */
  {
    const d = fresh("seq");
    const arr = loadShard(path.join(d, CN));
    const one = arr.find((e) => /[a-z]01$/.test(e.id)) || arr[0];
    const before = readIn(d, CN);
    const lines = before.split("\n");
    const i = lines.findIndex((l) => lineId(l) === one.id);
    let pre = null;
    if (i < 0) pre = `找不到 ${one.id}`;
    else {
      lines[i] = lines[i].replace(new RegExp('("|\\{ ?)"?id"? ?: ?"' + one.id + '"'), (mm) => mm.replace(one.id, one.id.replace(/(\d{2})$/, "1")));
      if (lines[i] === before.split("\n")[i]) pre = "id 替换无效";
      else putIn(d, CN, lines.join("\n"));
    }
    if (pre) expect("validate · ID_SEQ 仍是软提示", false, `前置条件失败: ${pre}`);
    else {
      const r = gate("node", [`${d}/tools/validate.mjs`], d);
      expect("validate · ID_SEQ 仍是软提示",
        r.code === 0 && /ID_SEQ/.test(r.out) && /软提示/.test(r.out),
        `seq 由两位改一位 → rc=${r.code}（0=只有告警）、出 ID_SEQ=${/ID_SEQ/.test(r.out)}、带「软提示」=${/软提示/.test(r.out)}`);
    }
  }

  /* ---- SOURCE_WIKI：判据是「唯一来源」，双源并存时不得报（R4 的双向证明）---- */
  {
    const probe = fresh("w0");
    const target = loadShard(path.join(probe, CN)).find((e) => Array.isArray(e.detail?.sources) && e.detail.sources.length >= 1);
    if (!target) expect("validate · SOURCE_WIKI 判据口径", false, `${CN} 内找不到带 sources 的条目`);
    else for (const [label, arrLit, want] of [
      ["维基为唯一来源时报", `["维基百科条目"]`, true],
      ["维基与官方档案并存时不报", `["外交部声明", "维基百科条目"]`, false],
    ]) {
      const d = fresh("wiki");
      let pre = null;
      try { setArray(d, CN, target.id, "sources", arrLit); } catch (e) { pre = e.message; }
      if (pre) { expect(`validate · SOURCE_WIKI ${label}`, false, `前置条件失败: ${pre}`); continue; }
      const r = gate("node", [`${d}/tools/validate.mjs`], d);
      const ran = r.out.includes("=== ERRORS");
      const got = ran && r.out.includes("SOURCE_WIKI");
      expect(`validate · SOURCE_WIKI ${label}`, ran && got === want,
        `sources=${arrLit} 报出=${got} 期望=${want} rc=${r.code}` +
        (ran ? "" : "（门未执行，报告无 === ERRORS）") +
        (want ? "" : "（文案写「唯一来源」，判据就必须只认唯一来源）"));
    }
  }

  /* ---- 溯源门禁：等级写不出、核对记录废不掉 ----
   * 四级由 js/prov.js 从 sources/checks 现算，数据里没有一个「等级」字段可写；
   * prov.js 对坏记录是静默丢弃（validCheck 为假就不计数）。两条线合起来的失败态是：
   * 投稿人填了核对记录、标签毫无变化，也没有任何东西告诉他为什么。
   * 所以这里既证明坏输入必红，也证明合式输入绝不红——后者才守住「不敢报错的门」。 */
  {
    const CODES = ["TIER_FIELD", "CHECK_SHAPE", "CHECK_BY_LOCATOR", "CHECK_WITHOUT_SOURCE"];
    const d0 = fresh("pv0");
    const clean = gate("node", [`${d0}/tools/validate.mjs`], d0);
    const ranClean = clean.out.includes("=== ERRORS");
    const silent = CODES.filter((c) => clean.out.includes(c));
    expect("validate · 溯源门基线静默", ranClean && clean.code === 0 && !silent.length,
      `rc=${clean.code} 门已执行=${ranClean} 误报=[${silent.join(",")}]`);

    /** 在条目 id 字段之后插入一段顶层字面量；写坏分片即抛，不把崩溃当门红 */
    function inject(dir, id, literal) {
      const lines = readIn(dir, CN).split("\n");
      const i = lines.findIndex((l) => lineId(l) === id);
      if (i < 0) throw new Error(`行首找不到条目 ${id}`);
      const m = /^\s*\{ ?"?id"? ?: ?"[^"]+"/.exec(lines[i]);
      if (!m) throw new Error(`${id} 行首定位不到 id 字段`);
      lines[i] = lines[i].replace(m[0], m[0] + "," + literal);
      putChecked(dir, CN, lines.join("\n"));
      return dir;
    }
    const srcArr = loadShard(path.join(fresh("pvsrc"), CN));
    const withSrc = srcArr.find((e) => Array.isArray(e.detail && e.detail.sources) && e.detail.sources.length > 0);
    if (!withSrc) expect("validate · 溯源门目标可推导", false, `${CN} 内找不到带非空 sources 的条目`);
    else {
      const CASES = [
        ["手写等级立现形", () => inject(fresh("pv1"), withSrc.id, 'tier:"verified"'), "TIER_FIELD", true],
        ["checks 非数组立现形", () => inject(fresh("pv2"), withSrc.id, 'checks:"2026-09-01"'), "CHECK_SHAPE", true],
        ["残缺记录（日期非 ISO）立现形", () => inject(fresh("pv3"), withSrc.id, 'checks:[{by:"某某",at:"2026年9月"}]'), "CHECK_SHAPE", true],
        ["残缺记录（缺 by）立现形", () => inject(fresh("pv4"), withSrc.id, 'checks:[{at:"2026-09-01"}]'), "CHECK_SHAPE", true],
        /* 下面两条形状完全合式，缺的是「位置」。放过它们，「已核」就退化成一句
         * 无从对质的话——而徽章的说明已向读者承诺「写明查的是哪一处」。 */
        ["署名不带位置立现形", () => inject(fresh("pv7"), withSrc.id, 'checks:[{by:"某某核过",at:"2026-09-01"}]'), "CHECK_BY_LOCATOR", true],
        ["署名只写日期立现形", () => inject(fresh("pv8"), withSrc.id, 'checks:[{by:"某某（2026年9月1日核过）",at:"2026-09-01"}]'), "CHECK_BY_LOCATOR", true],
        ["合式空数组不误报", () => inject(fresh("pv5"), withSrc.id, "checks:[]"), null, false],
        ["人核记录不误报", () => inject(fresh("pv6"), withSrc.id, 'checks:[{by:"某某（翻中华书局点校本《资治通鉴》卷二百一十二）",at:"2026-09-01",note:"原文作二年"}]'), null, false],
        ["工具核对不误报", () => inject(fresh("pv9"), withSrc.id, 'checks:[{by:"本站·维基文库比对（史记/卷001 三家注版）",at:"2026-11-07",note:"逐字比对通过"}]'), null, false],
      ];
      for (const [label, mut, code, want] of CASES) {
        let dir, pre = null;
        try { dir = mut(); } catch (e) { pre = e.message; }
        if (pre) { expect(`validate · 溯源 ${label}`, false, `前置条件失败: ${pre}`); continue; }
        const r = gate("node", [`${dir}/tools/validate.mjs`], dir);
        const ran = r.out.includes("=== ERRORS");
        const fired = CODES.filter((c) => r.out.includes(c));
        if (want)
          expect(`validate · 溯源 ${label}`, ran && fired.includes(code) && r.out.includes(withSrc.id),
            `rc=${r.code} 命中=[${fired.join(",")}] 期望含 ${code}、点名 ${withSrc.id}=${r.out.includes(withSrc.id)}` +
            (ran ? "" : "（门未执行，报告无 === ERRORS）"));
        else
          expect(`validate · 溯源 ${label}`, ran && !fired.length,
            `rc=${r.code} 误报=[${fired.join(",")}]` +
            (ran ? (fired.length ? "——合式输入被报错，投稿人学会的不是严谨，是把记录填得更随意" : "") : "（门未执行，报告无 === ERRORS）"));
      }

      /* 有核对记录却没有任何出处：warn 级（记录不是假的，只是没有可核的对象） */
      const dw = fresh("pvsrc0");
      let pw = null;
      try {
        inject(dw, withSrc.id, 'checks:[{by:"某某（核《资治通鉴》卷二百一十二）",at:"2026-09-01"}]');
        setArray(dw, CN, withSrc.id, "sources", "[]");
      } catch (e) { pw = e.message; }
      if (pw) expect("validate · 溯源 记录无出处可报", false, `前置条件失败: ${pw}`);
      else {
        const rw = gate("node", [`${dw}/tools/validate.mjs`], dw);
        const ranW = rw.out.includes("=== ERRORS");
        expect("validate · 溯源 记录无出处可报",
          ranW && rw.out.includes("CHECK_WITHOUT_SOURCE") && rw.out.includes(withSrc.id),
        `rc=${rw.code} 命中 CHECK_WITHOUT_SOURCE=${ranW && rw.out.includes("CHECK_WITHOUT_SOURCE")} 点名=${rw.out.includes(withSrc.id)}` +
        (ranW ? "" : "（门未执行）"));
      }
    }
  }
}

/* ───────── 五·乙、正文内联引用与相对年份（XREF_DANGLING / REL_YEAR）─────────
 * 散文里手写的「（见 cn--xxxx）」不归 related 那几道门管，2026-11-07 实测盘上
 * 122 处内联引用中 6 处年差算错、1 处指向作废 id，全是加这对门之前无人可见的。
 * 用例只从「干净副本双零」这个前提出发把一条改错，不在测试里重算锚年——
 * 重算一遍等于养第二把尺子，两把尺子迟早分家（§W5_LOW 那类缺陷就是这么来的）。
 * 挑靶子用的配对模式与门里同形状，但它只选位置、不做判据。
 * 四条变异各钉一种只有绿门才会漏的失效：断链不重复报、指错条目要红、
 * 「（见 a、b）」的第二个 id 要算、单目标不得报两遍、裸「见 id」要在扫描域内。 */
{
  const REL_SHARD = "data/cn/cn-03.js";
  const INLINE_ID = String.raw`(?:cn|world)--b\d+--[pfscmeixad]\d{2}|(?:cn|world)--\d{1,4}--[pfscmeixad]\d{2}`;
  const relAlt = "又明年|明年|次年|后年|后(?:\\d{1,4}|[一二三四五六七八九十]{1,3})年|(?:\\d{1,4}|[一二三四五六七八九十]{1,3})年后";
  const pairRe = new RegExp(`(${relAlt})[^。；！？]{0,30}（见\\s*(${INLINE_ID})(?=）)`, "g");
  const GHOST = "cn--b9999--p99";

  const clean = fresh("xref0");
  const base = gate("node", [`${clean}/tools/validate.mjs`, "--json"], clean);
  let baseJson = null;
  try { baseJson = JSON.parse(base.out); } catch { /* 报告缺失时走下面的断言 */ }
  expect("validate · 内联引用门跑起来了（非崩溃式假绿）", !!baseJson,
    `rc=${base.code}，` + (baseJson ? `--json 可解析，errors ${baseJson.errors.length} 项` : "报告解析失败——脚本崩了或输出被截断，别当成 0 项不一致"));
  const baseHit = baseJson ? baseJson.errors.filter((e) => /XREF_DANGLING|REL_YEAR/.test(e.code)) : [];
  expect("validate · 干净副本内联引用双零", !!baseJson && baseHit.length === 0,
    baseJson ? `现存 REL_YEAR/XREF_DANGLING ${baseHit.length} 项：` + baseHit.map((e) => e.msg.slice(0, 60)).join(" | ")
      : "拿不到基线，后面所有「改错一条」的断言都失去前提");

  /* 靶子：一个「相对词 +（见 单个 id）」配对，且该 id 在本片内有同形状可换的兄弟 */
  const arr = loadShard(path.join(clean, REL_SHARD));
  const byId = new Map(arr.map((e) => [e.id, e]));
  let fx = null;
  for (const e of arr) {
    for (const k of ["background", "process", "impact"]) {
      const txt = (e.detail || {})[k];
      if (typeof txt !== "string") continue;
      pairRe.lastIndex = 0;
      for (const m of txt.matchAll(pairRe)) {
        const idA = m[2];
        if (!byId.has(idA)) continue;
        const alt = arr.find((x) => x.id !== idA && x.year !== byId.get(idA).year && /--p\d\d$/.test(x.id));
        if (!alt) continue;
        fx = { id: e.id, key: k, match: m[0], idA, id2: alt.id, yearA: byId.get(idA).year, year2: alt.year };
        break;
      }
      if (fx) break;
    }
    if (fx) break;
  }
  if (!fx) {
    expect("validate · 内联引用可红（四条变异）", false, `${REL_SHARD} 里挑不出「相对词+（见 单 id）」配对或同片换靶条目，用例无法构造（不得静默 skip）`);
  } else {
    const relErrs = (r) => {
      let j;
      try { j = JSON.parse(r.out); } catch { return null; }
      return j.errors.filter((e) => e.code === "REL_YEAR");
    };
    const xrefErrs = (r) => {
      let j;
      try { j = JSON.parse(r.out); } catch { return null; }
      return j.errors.filter((e) => e.code === "XREF_DANGLING");
    };
    /** 在副本里把这条配对改坏：old→new 须在目标行内恰出现一次 */
    const mutate = (name, oldFrag, newFrag) => {
      const dir = fresh(name);
      const lines = readIn(dir, REL_SHARD).split("\n");
      const i = lines.findIndex((l) => lineId(l) === fx.id);
      if (i < 0) throw new Error(`行首找不到条目 ${fx.id}`);
      const n = lines[i].split(oldFrag).length - 1;
      if (n !== 1) throw new Error(`靶串在 ${fx.id} 行内命中 ${n} 次（应为 1），换靶子或收紧锚串`);
      lines[i] = lines[i].replace(oldFrag, newFrag);
      putChecked(dir, REL_SHARD, lines.join("\n"));
      const r = gate("node", [`${dir}/tools/validate.mjs`, "--json"], dir);
      /* --json 模式下没有 === ERRORS 标题，「跑起来了」的唯一硬证是报告能解析；
       * 解析失败时补跑一次文本模式，把崩在哪一行带回断言详情。 */
      try { JSON.parse(r.out); } catch {
        const r2 = gate("node", [`${dir}/tools/validate.mjs`], dir);
        throw new Error(`变异后 validate 未产出可解析的报告（rc=${r.code}）：${r2.out.slice(0, 160)}`);
      }
      return r;
    };
    const lineOf = (r, code) => `${code} ${relErrs(r) === null ? "解析失败" : (relErrs(r) || []).length + " 条"}`;

    /* A 断链：指向不存在的 id，须报 XREF_DANGLING，且不重复报 REL_YEAR */
    let pre = null, r = null;
    try { r = mutate("xrefA", fx.match, fx.match.replace(fx.idA, GHOST)); } catch (e) { pre = e.message; }
    if (pre) expect("validate · XREF_DANGLING 可红（断链）", false, `前置条件失败: ${pre}`);
    else {
      const xs = xrefErrs(r), rel = relErrs(r);
      expect("validate · XREF_DANGLING 可红（断链）", r.code === 1 && xs.length === 1 && xs[0].msg.includes(fx.id) && rel.length === 0,
        `rc=${r.code} XREF=${xs.length} REL=${rel.length}（断链只该由 XREF 报一次，REL 不得跟着重复）；${xs.map((x) => x.msg.slice(0, 70)).join(" | ")}`);
    }

    /* B 指错条目：换成同片异年的 id，须红且恰报一条（单目标报两遍 = 组号数错） */
    pre = null; r = null;
    try { r = mutate("xrefB", fx.match, fx.match.replace(fx.idA, fx.id2)); } catch (e) { pre = e.message; }
    if (pre) expect("validate · REL_YEAR 可红（指错条目）", false, `前置条件失败: ${pre}`);
    else {
      const rel = relErrs(r);
      expect("validate · REL_YEAR 可红（指错条目）", r.code === 1 && rel.length === 1 && rel[0].msg.includes(fx.id2) && rel[0].msg.includes(fx.id),
        `rc=${r.code} ${lineOf(r, "REL_YEAR")} 点名 ${fx.id}/${fx.id2}=${rel.map((x) => x.msg.includes(fx.id2)).join(",")}（单目标报两条=多目标组号会漏）；${rel.map((x) => x.msg.slice(0, 80)).join(" | ")}`);
    }

    /* C 多目标：追加第二个异年 id，门必须把它也算进去（只查第一个时本用例为绿） */
    pre = null; r = null;
    try { r = mutate("xrefC", fx.match, fx.match + "、" + fx.id2); } catch (e) { pre = e.message; }
    if (pre) expect("validate · REL_YEAR 多目标（见 a、b）逐个算", false, `前置条件失败: ${pre}`);
    else {
      const rel = relErrs(r);
      expect("validate · REL_YEAR 多目标（见 a、b）逐个算", r.code === 1 && rel.length === 1 && rel[0].msg.includes(fx.id2),
        `rc=${r.code} ${lineOf(r, "REL_YEAR")} 点名第二个 id=${rel.map((x) => x.msg.includes(fx.id2)).join(",")}（第一条仍正确，报出的必须是指向 ${fx.id2} 的那条）；${rel.map((x) => x.msg.slice(0, 80)).join(" | ")}`);
    }

    /* D 裸引用：去掉括号写成「，见 id」，仍在扫描域内（只查括号形式时本用例为绿） */
    pre = null; r = null;
    try { r = mutate("xrefD", fx.match, fx.match.replace(`（见 ${fx.idA}`, `，见 ${fx.id2}`)); } catch (e) { pre = e.message; }
    if (pre) expect("validate · REL_YEAR 裸「见 id」也在扫描域内", false, `前置条件失败: ${pre}`);
    else {
      const rel = relErrs(r);
      expect("validate · REL_YEAR 裸「见 id」也在扫描域内", r.code === 1 && rel.length >= 1 && rel.some((x) => x.msg.includes(fx.id2)),
        `rc=${r.code} ${lineOf(r, "REL_YEAR")}（盘上裸「见 id」18 处，只认（见 时这些年差全静默）；${rel.map((x) => x.msg.slice(0, 80)).join(" | ")}`);
    }
    console.log(`内联引用靶子：${fx ? `${fx.id}.${fx.key} 「${fx.match}」→ ${fx.id2}` : "未构造出来"}`);
  }
}

/* ───────── 六、related-cross.mjs：跨轨唯一授权写入口的每条拒绝分支 ─────────
 * 与 weight-change 同族风险：裁定结果要落盘，手滑的批量替换就会顺手改掉散文。
 * 差别在于本工具的授权对象是「边」，所以除了「diff 恰等于授权集」，还必须证明
 * 既有边一条没少（只许追加）——删边是本工具最危险的失效模式，validate 只看引用
 * 完整性，看不出「一条本来存在的边不见了」。
 * 跨轨对、满 4 项的条目、年差越界的对，全部从副本语料运行时推导，不硬编码 id。 */
function loadCorpus(dir) {
  const out = [];
  for (const sub of ["cn", "wd"]) {
    for (const n of fs.readdirSync(path.join(dir, "data", sub)).filter((x) => x.endsWith(".js")).sort())
      for (const e of loadShard(path.join(dir, "data", sub, n))) out.push({ ...e, __rel: `data/${sub}/${n}` });
  }
  return out;
}
{
  const WHYX = "§4 之判定：跨轨补边探针用理由，长度足够通过 why 校验";
  const relOf = (e) => e.related || [];
  const base = fresh("rc0");
  const corpus = loadCorpus(base);
  const listCn = corpus.filter((e) => e.track === "cn");
  const listWd = corpus.filter((e) => e.track === "world");
  const connected = (x, y) => relOf(x).includes(y.id) || relOf(y).includes(x.id);
  const findPair = (pred) => {
    for (const a of listCn) { const b = listWd.find((o) => pred(a, o)); if (b) return { a, b }; }
    return null;
  };
  /* 干净对必须一端已有边：否则「只追加不覆盖」那条断言拿空数组当基线，等于没验。
   * 年份也要卡住——越过 sanity 线的话工具在第一道自检就退回，后面的用例全落在错误分支上。 */
  const clean = findPair((a, b) => !connected(a, b) && Math.abs(a.year - b.year) <= 5 &&
    relOf(a).length >= 1 && relOf(a).length <= 2 && relOf(b).length <= 2);
  const far = findPair((a, b) => Math.abs(a.year - b.year) > 6);
  const fullPair = findPair((a, b) => !connected(a, b) && Math.abs(a.year - b.year) <= 5 &&
    ((relOf(a).length === 4 && relOf(b).length <= 3) || (relOf(b).length === 4 && relOf(a).length <= 3)));
  const sameTrack = listCn.find((a) => listCn.some((o) => o.id !== a.id && !relOf(a).includes(o.id)));
  const pre = (msg) => expect("related-cross · 夹具可推导", false, msg);
  const fixtureOk = !!clean && !!far && !!fullPair && !!sameTrack;
  if (!fixtureOk) {
    pre(`缺夹具：跨轨可补对=${!!clean} 年差越界对=${!!far} 满4项端点=${!!fullPair} 同轨对=${!!sameTrack}`);
  } else {
    /** 行内变异：定位失败或变异后无法解析都判用例失败，不把「分片写坏」当成「门变红」 */
    function mutateLine(dir, id, fn) {
      const e = corpus.find((x) => x.id === id);
      const file = path.join(dir, e.__rel);
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const i = lines.findIndex((l) => (/^\s*\{ ?"?id"? ?: ?"([^"]+)"/.exec(l) || [])[1] === id);
      if (i < 0) return `行首找不到条目 ${id}，定位锚失效`;
      const out = fn(lines[i]);
      if (!out) return `条目 ${id} 行内锚串没匹配上，变异无效`;
      lines[i] = out;
      try { const w = { window: {} }; new Function("window", lines.join("\n"))(w.window); }
      catch (err) { return `变异后的分片无法解析（别把崩溃当成门红）: ${err.message}`; }
      fs.writeFileSync(file, lines.join("\n"));
      return null;
    }
    const P = (a, b, why = WHYX) => ({ accepted: [{ a: a.id, b: b.id, why }], rejected: [] });
    function runX(label, pairs, wantOut, wantCode = 1, opts = {}) {
      const dir = opts.dir || fresh("rc");
      if (opts.prep) { const bad = opts.prep(dir); if (bad) { expect(`related-cross · ${label}`, false, `前置条件失败: ${bad}`); return { dir, r: { code: -1, out: "" } }; } }
      const pp = path.join(dir, "probe-pairs.json");
      fs.writeFileSync(pp, JSON.stringify(pairs));
      const r = gate("node", [`${dir}/tools/related-cross.mjs`, pp, ...(opts.write ? ["--write"] : [])], dir);
      expect(`related-cross · ${label}`, r.code === wantCode && r.out.includes(wantOut),
        `rc=${r.code}(期望${wantCode}) 命中「${wantOut}」=${r.out.includes(wantOut)}` +
        (r.code !== wantCode ? "\n    " + r.out.split("\n").filter(Boolean).slice(-3).join("\n    ") : ""));
      return { dir, r };
    }

    runX("干净单对 dry-run 放行", P(clean.a, clean.b), "dry-run", 0);
    runX("未知 id", P(clean.a, { id: "cn--9999--z99" }), "不在语料里");
    runX("同轨边", { accepted: [{ a: sameTrack.id, b: listCn.find((o) => o.id !== sameTrack.id && !relOf(sameTrack).includes(o.id)).id, why: WHYX }], rejected: [] }, "同轨");
    runX(`年差越界(${Math.abs(far.a.year - far.b.year)} 年)`, P(far.a, far.b), "年差越");
    runX("缺 why", { accepted: [{ a: clean.a.id, b: clean.b.id }], rejected: [] }, "缺 why");
    runX("授权集内重复边", { accepted: [{ a: clean.a.id, b: clean.b.id, why: WHYX }, { a: clean.a.id, b: clean.b.id, why: WHYX }], rejected: [] }, "重复边");
    runX("补边后超 4 项上限", P(fullPair.a, fullPair.b), "补边后 related");
    runX("行内无 related 字段", P(clean.a, clean.b), "定位不到 related 数组",
      1, { prep: (d) => mutateLine(d, clean.a.id, (l) => { const t = l.replace(/,?"?related"?\s*:\s*\[[^\]]*\]/, ""); return t === l ? null : t; }) });
    /* 毒化 summary：往散文里塞一段与真字段同形的假 related。三支各自钉住一道不同的闸：
     *   · 裸键 `,related:['伪']`：锚认它（前面是逗号），追加回落双引号 → 提前终结 summary
     *     字符串 → 产物非法 JS，由「改后无法解析」这道闸拦住；
     *   · 同上但包在单引号 summary 里：产物仍是合法 JS 且语义已坏 → 只能由改后逐字段比对抓到；
     *   · 假字段前无逗号/花括号（紧贴 summary 值的开引号）：锚把它筛掉，手术落到真字段。
     *     这一支是**锚的承重证明**——摘掉锚，注入即生效、rc 从 0 转 1。
     * 顺带一条实测否证：键写成 `'related'` 的假字段对有无锚两版正则都不可见（键后的引号
     * 挡住了冒号），拿它钉锚等于没钉，故改用第三种形状。 */
    const poison = (inj) => (d) => mutateLine(d, clean.a.id,
      (l) => { const t = l.replace(/("?summary"?\s*:\s*")/, `$1${inj}`); return t === l ? null : t; });
    runX("毒化 summary(裸键) 产出非法 JS", P(clean.a, clean.b), "改后无法解析", 1,
      { prep: poison(",related:['伪'],某事又某事") });
    runX("毒化 summary(单引号串) 致附带改动", P(clean.a, clean.b), "非 related 字段", 1, {
      prep: (d) => mutateLine(d, clean.a.id, (l) => {
        const m = /"?summary"?\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(l);
        if (!m) return null;
        return l.slice(0, m.index) + `summary:'${m[1]}，记载,related:["伪"],另说'` + l.slice(m.index + m[0].length);
      }),
    });
    runX("散文里的假字段被字段边界锚筛掉", P(clean.a, clean.b), "dry-run", 0,
      { prep: poison("related:['伪'],某事又某事") });

    /* ---- --write 全链路：真落盘到副本，逐字段对账，产物过 validate，重跑必拒 ---- */
    {
      const dir = fresh("rcw");
      const preSnap = loadCorpus(dir);
      const pa = preSnap.find((e) => e.id === clean.a.id), pb = preSnap.find((e) => e.id === clean.b.id);
      runX("--write 落盘", P(pa, pb), "已落盘", 0, { dir, write: true });
      const post = loadCorpus(dir);
      const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      const strip = (e) => { const c = { ...e }; delete c.related; delete c.__rel; return c; };
      const A = post.find((e) => e.id === pa.id), B = post.find((e) => e.id === pb.id);
      const collateral = post.filter((e) => { const o = preSnap.find((x) => x.id === e.id); return !o || !eq(strip(o), strip(e)); });
      expect("related-cross · --write 无附带损伤", collateral.length === 0,
        `${collateral.length} 条非 related 字段被改动：${collateral.slice(0, 2).map((e) => e.id).join(",")}`);
      expect("related-cross · 只追加不覆盖",
        eq(A.related, [...relOf(pa), pb.id]) && eq(B.related, [...relOf(pb), pa.id]),
        `盘上 ${pa.id}=${JSON.stringify(A.related)}、${pb.id}=${JSON.stringify(B.related)}｜原 ${JSON.stringify(relOf(pa))} / ${JSON.stringify(relOf(pb))}`);
      const crossN = (arr) => arr.reduce((n, e) => n + relOf(e)
        .filter((x) => x.startsWith(e.track === "cn" ? "world--" : "cn--")).length, 0);
      expect("related-cross · 跨轨有向边恰增 2", crossN(post) - crossN(preSnap) === 2,
        `${crossN(preSnap)} → ${crossN(post)}（一对无向授权 = 2 条有向边）`);
      const v = gate("node", [`${dir}/tools/validate.mjs`, "--strict"], dir);
      expect("related-cross · 落盘产物过 validate --strict", v.code === 0,
        `rc=${v.code}` + (v.code ? "\n    " + v.out.split("\n").filter((l) => /ERROR|✗/.test(l)).slice(0, 4).join("\n    ") : ""));
      runX("同一授权集重跑必须拒", P(pa, pb), "已在盘上", 1, { dir });
    }
  }
}

/* ───────── 汇总 ───────── */
console.log("门禁可红性自审\n");
for (const r of results) console.log(`${r.ok ? "✅" : "✗"} ${r.label.padEnd(38)} ${r.detail || ""}`);
console.log(`\n${pass}/${results.length} 通过`);
if (fail) {
  /* 失败时保留副本现场：这些目录里能看到门到底吃进了什么 */
  console.log(`\n✗ ${fail} 个门无法变红或基线不干净——这些门等于不存在\n现场保留于 ${TMP}`);
  process.exit(1);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log("\n✅ 每个检查码都有至少一个能命中它的变异；干净副本全绿");
