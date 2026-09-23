/* test-doc-cite.mjs | 证明「文档引用对账」这道门真的会红
 * 用法: node tools/test-doc-cite.mjs
 *
 * doc-cite.mjs 管的是文档里每一处「`id` + wN」必须与语料一致。它自己是新写的门，
 * 按本仓库的规矩，新门未证明能红 = 该门不存在。这里刻意不去改 doc-cite 的代码
 * （那是 test-gates-meta.mjs 的路子），而是**改输入**：在副本里把文档写错，
 * 看门是否点名。改输入的证明比改代码更强——它同时覆盖正则、窗口、告警/错误分级。
 *
 * 五条用例分别钉住五个可以各自死掉的分支：
 *   基线绿（无此条则其余全是空话）/ 权重过期 → ERROR / id 不存在 → ERROR /
 *   权重缺失 → 只 WARN 不 ERROR / 权重超出窗口 → 只 WARN（证明窗口常量真的在起作用）/
 *   围栏豁免 → 围栏内不报、围栏外照报（证明豁免没有变成整节的免死金牌）/ 文档缺失 → ERROR
 * 全程只在 mkdtemp 副本里操作，绝不写仓库工作区。
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "tools/DATA_SCHEMA.md";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "doc-cite-mut-"));
{
  const parent = path.dirname(TMP), base = path.basename(TMP);
  const stale = fs.readdirSync(parent).filter((n) => n.startsWith("doc-cite-mut-") && n !== base);
  for (const n of stale) fs.rmSync(path.join(parent, n), { recursive: true, force: true });
  if (stale.length) console.log(`已回收上次运行遗留的 ${stale.length} 份现场副本`);
}

function fresh() {
  const dir = path.join(TMP, "run");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(ROOT, dir, { recursive: true, filter: (s) => !/(^|\/)(\.git|node_modules|__pycache__)(\/|$)/.test(s) });
  return dir;
}
const readIn = (d, p) => fs.readFileSync(path.join(d, p), "utf8");
const putIn = (d, p, s) => fs.writeFileSync(path.join(d, p), s);

function run(dir) {
  try {
    return { code: 0, out: execFileSync("node", ["tools/doc-cite.mjs"], { cwd: dir, encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}
const tally = (out) => {
  const m = /=== ERRORS (\d+) ===\s+WARNINGS (\d+) ===/.exec(out);
  if (!m) throw new Error("没解析到 ERRORS/WARNINGS 汇总行——门可能根本没跑起来");
  return { errs: Number(m[1]), warns: Number(m[2]) };
};

/* §4 的 5 级首例行；用例以此为靶，但先确认它确实在盘上（前置条件不成立判失败，不静默跳过） */
const TARGET_ID = "cn--b221--p01";
const TARGET_TAIL = "秦灭六国成一统 w5";

let pass = 0, fail = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : " — " + detail}`);
  if (ok) pass++; else fail++;
}

/* ① 基线：仓库现状必须全绿，且确实扫到了引用（否则「绿」只是没跑） */
{
  const r = run(fresh());
  const t = tally(r.out);
  check("基线：ERRORS 0 / WARNINGS 0 / rc=0", t.errs === 0 && t.warns === 0 && r.code === 0, `实为 ${JSON.stringify(t)} rc=${r.code}`);
  const refs = (r.out.match(/语料 \d+ 条/g) || []).length;
  const scanned = /文档 tools\/DATA_SCHEMA\.md \+ README\.md/.test(r.out) && refs === 1;
  check("基线：确实读取了两份文档并对账语料（反空转对照）", scanned, r.out.split("\n")[0]);
}

/* ② 文档写错权重 → ERROR */
{
  const d = fresh(), src = readIn(d, DOC);
  if (!src.includes(TARGET_TAIL)) throw new Error(`前置条件失败：${DOC} 里找不到「${TARGET_TAIL}」，用例须同步更新`);
  putIn(d, DOC, src.replace(TARGET_TAIL, TARGET_TAIL.replace("w5", "w3")));
  const r = run(d), t = tally(r.out);
  check("文档把 w5 写成 w3 → ERROR 且 rc≠0", t.errs >= 1 && r.code === 1, JSON.stringify(t) + " rc=" + r.code);
  check("  错误点名 id 与盘上真值", r.out.includes(TARGET_ID) && /盘上实为 w5/.test(r.out), r.out);
}

/* ③ id 已不存在 → ERROR */
{
  const d = fresh(), src = readIn(d, DOC);
  putIn(d, DOC, src.replace(TARGET_ID, TARGET_ID.replace("p01", "p99")));
  const r = run(d), t = tally(r.out);
  check("引用语料里没有的 id → ERROR 且 rc≠0", t.errs >= 1 && r.code === 1, JSON.stringify(t) + " rc=" + r.code);
  check("  错误点名该 id", r.out.includes("cn--b221--p99"), r.out);
}

/* ④ 引用没带权重 → 只 WARN，不算错 */
{
  const d = fresh(), src = readIn(d, DOC);
  putIn(d, DOC, src.replace(TARGET_TAIL, TARGET_TAIL.replace(" w5", "")));
  const r = run(d), t = tally(r.out);
  check("删掉 wN → WARN≥1 且 ERRORS 0（rc=0）", t.errs === 0 && t.warns >= 1 && r.code === 0, JSON.stringify(t) + " rc=" + r.code);
  check("  告警点名该 id", r.out.includes(TARGET_ID), r.out);
}

/* ⑤ 权重写得离 id 太远 → 视同没带（证明 WEIGHT_WINDOW 常量真的参与判定） */
{
  const d = fresh(), src = readIn(d, DOC);
  putIn(d, DOC, src.replace(TARGET_TAIL, "秦灭六国成一统（此处插入一段足以把权重推出窗口的中文说明文字若干字若干字）w5"));
  const r = run(d), t = tally(r.out);
  check("wN 被推出权重窗口 → 降为 WARN 而非误判为一致", t.errs === 0 && t.warns >= 1, JSON.stringify(t) + "\n" + r.out);
}

/* ⑥ 围栏豁免：围栏内不报，围栏外照报 */
{
  const d = fresh();
  putIn(d, DOC, readIn(d, DOC) + [
    "", "## 探针（本用例注入）", "",
    "围栏外假引用：`cn--9999--p01` w1", "",
    "```", "围栏内假引用：`cn--9998--p01` w1", "```", "",
  ].join("\n"));
  const r = run(d);
  check("围栏外的假 id 照报 ERROR", r.out.includes("cn--9999--p01"), r.out);
  check("围栏内的语法示例不报（豁免生效）", !r.out.includes("cn--9998--p01"), r.out);
}

/* ⑦ 文档缺失 → ERROR（防止有人挪走文件让门变哑） */
{
  const d = fresh();
  fs.rmSync(path.join(d, "README.md"));
  const r = run(d), t = tally(r.out);
  check("README 缺失 → ERROR 且 rc≠0", t.errs >= 1 && r.code === 1, JSON.stringify(t) + " rc=" + r.code);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} 通过`);
if (fail) { console.log("❌ doc-cite 存在失效分支，见上方 ✗"); process.exit(1); }
console.log("✅ doc-cite 各分支均可红");
