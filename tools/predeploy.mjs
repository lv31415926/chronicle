#!/usr/bin/env node
/* predeploy.mjs | 发布前的一道门：工作树全绿 ≠ 别人 clone 下来也全绿
 *
 * 为什么需要它：.gitignore 是「哪些文件参与发布」的唯一裁断处，而它判错的方式
 * 很安静——被误排除的文件在本地照样存在，本地六道门照样绿，直到别人 clone 下来
 * 才炸。所以这里把工作树与「按 git 索引还原出的纯净目录」各跑一遍，
 * 两者不一致就是 .gitignore 写错了。
 *
 * 用法: node tools/predeploy.mjs
 *   退出码 0 = 可以推送；非 0 = 先看上面哪一条红了。
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATES = ["validate", "test-units", "e2e-static", "test-doc-cite", "test-gates", "test-gates-meta"];
/* clone 之后没有 author 侧脚本，这一组足以判定「少没少文件」；全跑两遍要几分钟。 */
const STAGING_GATES = ["validate", "e2e-static", "test-units", "test-doc-cite"];
const SINGLE_FILE_MAX = 5 * 1024 * 1024;

let fails = 0;
function bad(msg) { fails++; console.log("❌ " + msg); }
function good(msg) { console.log("✅ " + msg); }

/* ===== ① 工作树：六道门全跑 ===== */
function runGate(dir, name) {
  try {
    const out = execFileSync(process.execPath, [path.join(dir, "tools", name + ".mjs"),
      ...(name === "validate" ? ["--strict"] : [])], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { rc: 0, last: out.trim().split("\n").filter(Boolean).pop() || "" };
  } catch (e) {
    const s = (e.stdout || "") + (e.stderr || "");
    return { rc: e.status == null ? -1 : e.status, last: s.trim().split("\n").filter(Boolean).pop() || e.message };
  }
}

console.log("① 工作树（本地全量）");
for (const g of GATES) {
  const r = runGate(ROOT, g);
  (r.rc === 0 ? good : bad)(g.padEnd(16) + " rc=" + r.rc + "  " + r.last);
}

/* ===== ② 索引里的清单：不能有密钥，不能有巨块 ===== */
const SECRET_RE = /(^|\/)(\.env|\.npmrc|\.netrc|credentials|secrets?|tokens?)([.]|$)|[.]pem$|[.]key$|id_rsa|apikey|api[_-]?key/i;
/* 内置自审：先证明这条判据能为红，否则「0 个密钥文件」只是空话。 */
{
  const POS = ["deploy/.env", "credentials.json", "server.key", "id_rsa", "config/apikey.txt"];
  const NEG = ["data/cn/cn-01.js", "tools/test-units.mjs", "index.html", "assets/favicon.svg", "js/keymap.js"];
  const missed = POS.filter((p) => !SECRET_RE.test(p));
  const over = NEG.filter((p) => SECRET_RE.test(p));
  if (missed.length) bad("密钥判据漏网：" + missed.join(" ") + "（下面那条「0 个密钥」不可信）");
  else if (over.length) bad("密钥判据误伤正常文件名：" + over.join(" "));
  else good("密钥判据自审：5 正例全中、5 负例全不误伤");
}

function git(args) {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }); }
  catch (e) { return null; }
}
if (git(["rev-parse", "--is-inside-work-tree"]) === null) {
  bad("这里不是 git 仓库，后面的发布面检查无从做起");
  process.exit(1);
}
const staged = (git(["diff", "--cached", "--name-only"]) || "").split("\n").filter(Boolean);
if (!staged.length) { bad("git 索引是空的：先 git add -A 再跑本门"); process.exit(1); }

const leaks = staged.filter((p) => SECRET_RE.test(p));
leaks.length ? bad("索引里有疑似密钥文件，必须先移出：" + leaks.join(" "))
             : good("索引 " + staged.length + " 个文件里没有疑似密钥");

/* 未跟踪且未被忽略 = 会被漏掉的源文件 */
const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split("\n").filter(Boolean);
untracked.length ? bad("这些文件既没进索引也没被忽略，clone 之后就是少了它们：\n   " + untracked.join("\n   "))
                 : good("没有「未跟踪又未忽略」的漏网文件");

const big = staged.map((p) => [p, fs.existsSync(path.join(ROOT, p)) ? fs.statSync(path.join(ROOT, p)).size : -1])
                  .filter(([, s]) => s > SINGLE_FILE_MAX);
big.length ? bad("单文件超过 5MB（GitHub 会警告、Pages 会拖慢首屏）：\n   " +
                 big.map(([p, s]) => p + " " + (s / 1048576).toFixed(1) + "MB").join("\n   "))
           : good("最大单文件 " + (Math.max(...staged.map((p) => fs.existsSync(path.join(ROOT, p)) ? fs.statSync(path.join(ROOT, p)).size : 0)) / 1024).toFixed(0) + "KB，没有巨块");

/* ===== ③ 只按索引还原一份「别人 clone 到的样子」再跑一遍 ===== */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chronicle-staging-"));
try {
  execFileSync("git", ["checkout-index", "-a", "-f", "--prefix=" + tmp + "/"], { cwd: ROOT, encoding: "utf8" });
  const got = execFileSync("find", [tmp, "-type", "f"], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  good("已按索引还原 " + got + " 个文件到纯净目录（.gitignore 判对判错，下面这几道门说了算）");
  console.log("② 纯净 staging（等价于 fresh clone）");
  for (const g of STAGING_GATES) {
    const r = runGate(tmp, g);
    (r.rc === 0 ? good : bad)(g.padEnd(16) + " rc=" + r.rc + "  " + r.last);
    if (r.rc !== 0) console.log("   ↑ 这一条在本地工作树是全绿的 ⇒ 缺的文件被 .gitignore 挡掉了");
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(fails ? "\n不可推送：" + fails + " 条红" : "\n✅ 发布面全绿：工作树与 clone 视图同一套结论");
process.exit(fails ? 1 : 0);
