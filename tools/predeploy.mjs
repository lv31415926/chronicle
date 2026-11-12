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
const GATES = ["validate", "validate-geo", "validate-frame", "validate-achv", "validate-story", "validate-chain", "validate-dates", "validate-annals", "test-units", "test-intake", "test-related-candidates", "e2e-static", "test-doc-cite", "test-gates", "test-gates-meta", "test-geo", "test-frame", "test-achv", "test-story", "test-chain", "test-dates", "test-annals"];
/* clone 之后没有 author 侧脚本，这一组足以判定「少没少文件」；全跑两遍要几分钟。
 * test-intake 有意留在工作树这一侧：它测的是分诊台这个工具，不是发布出去的内容——
 * 纯净目录里少一个 author 侧脚本不该把发布判红，正如它多了也不该让读者多得到什么。
 * validate-story 进 staging：故事层是发布出去的内容，而且它是本站自己写句子的两层之一。
 * validate-chain 同理进 staging：涟漪层不写句子，它写的是「因为 A 所以后来有 B」——
 *   这一层一旦漏了一片或凭空多出一个材料名，读者在盘上看不出来，只能在发布出去的内容里被误导。
 * validate-dates 同理进 staging：日层是发布出去的内容，而且它是全站唯一一个「日期从哪来」
 * 能被读者验算的地方——data/dates.js 少了、或被手改过，都只能在这道门上露出来。
 * validate-annals 同理进 staging：编年层把《明史》原文整句发出去，读者能验的唯一一件事
 * 就是「这句话真在它标的那一卷里」；底本或分片少进索引，这句承诺在发布面上就断了。 */
const STAGING_GATES = ["validate", "validate-geo", "validate-frame", "validate-achv", "validate-story", "validate-chain", "validate-dates", "validate-annals", "e2e-static", "test-units", "test-doc-cite"];
const SINGLE_FILE_MAX = 5 * 1024 * 1024;

let fails = 0;
function bad(msg) { fails++; console.log("❌ " + msg); }
function good(msg) { console.log("✅ " + msg); }

/* ===== ① 工作树：GATES 全跑 ===== */
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
/* 判什么清单要想清楚：`diff --cached` 是「相对 HEAD 的暂存改动」，首次提交之后它只剩刚 add 的那一个
 * 文件——拿它当发布面，等于在 1/94 的覆盖上判「没有密钥」，而输出照样写着「索引 N 个文件里没有」。
 * 别人 clone 到的是「全部被跟踪文件」，所以这里取 `ls-files`，条数由下面的对账判据钉住。 */
const tracked = (git(["ls-files"]) || "").split("\n").filter(Boolean);
if (!tracked.length) { bad("git 索引是空的：先 git add -A 再跑本门"); process.exit(1); }

/* 还原视图的实数与被跟踪清单是两条独立通道量同一个量。不相等 ⇒ ②跑的不是①判的那批内容。 */
const reconcile = (restored, listed) => restored === listed ? null :
  `还原视图 ${restored} 个文件 / ls-files ${listed} 个（两数不等即判红）：②跑的与①判的不是同一批内容`;
/* 被跟踪却不在工作树上 = 工作树门与还原视图同题的前提破了；
 * 且 stat 失败若只记成 -1 会静默通过巨块判据，所以必须先单独拎出来变红。 */
const missingFrom = (list) => list.filter((p) => !fs.existsSync(path.join(ROOT, p)));

/* 工作树与索引*内容*不一致（已跟踪但改了没 add）：①跑的是盘上新代码，②跑的是索引里的旧 blob。
 * 本轮 validate-achv 就是「①绿②红」，真凶是 wd-01.js 没暂存，而旧提示把矛头指向 .gitignore。 */
const divergedFrom = (diffNameOnly, list) => {
  const set = new Set(String(diffNameOnly).split("\n").filter(Boolean));
  return list.filter((p) => set.has(p));
};

/* ===== 自审：这几条判据本身得能为红，否则「清单一致」只是一句没人验证的话 ===== */
{
  const dead = [];
  if (divergedFrom("README.md\n", ["README.md", "index.html"]).join() !== "README.md") dead.push("内容一致判据抓不到已跟踪但盘上改了的文件");
  if (divergedFrom("build/output.js\n", ["README.md", "index.html"]).length) dead.push("内容一致判据把不在索引里的路径也算成越界");
  if (reconcile(95, 1) === null) dead.push("对账判据在 95≠1 时不报红（清单缩到 1 个文件也没人管）");
  if (reconcile(95, 95) !== null) dead.push("对账判据在 95=95 时报红（恒红＝下一轮有人把它删掉）");
  if (!missingFrom(["tools/__probe_should_never_exist__.mjs"]).length)
    dead.push("缺失文件判据抓不到必然不存在的路径");
  if (missingFrom(["README.md"]).length) dead.push("缺失文件判据误伤在盘上的文件");
  dead.length ? bad("发布面判据漏网：" + dead.join("；") + "（下面三条「一致」不可信）")
              : good("对账、缺失与内容一致判据自审：正反各两例全对");
}

const leaks = tracked.filter((p) => SECRET_RE.test(p));
leaks.length ? bad("索引里有疑似密钥文件，必须先移出：" + leaks.join(" "))
             : good("索引 " + tracked.length + " 个文件里没有疑似密钥");

/* 未跟踪且未被忽略 = 会被漏掉的源文件 */
const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split("\n").filter(Boolean);
untracked.length ? bad("这些文件既没进索引也没被忽略，clone 之后就是少了它们：\n   " + untracked.join("\n   "))
                 : good("没有「未跟踪又未忽略」的漏网文件");

const missing = missingFrom(tracked);
missing.length ? bad("索引里有文件不在工作树上，①与②跑的已不是同一批内容：" + missing.join(" "))
               : good(`被跟踪的 ${tracked.length} 个文件全部在工作树上（工作树门与 clone 视图同题）`);

/* git 取不到就判红，不能当成「没有差异」——那正是把回执写绿的口子。 */
const diffOut = git(["diff", "--name-only"]);
const diverged = diffOut === null ? null : divergedFrom(diffOut, tracked);
if (diverged === null) bad("git diff --name-only 失败，工作树与索引的内容一致性无从判定");
else if (diverged.length) bad(`这些文件在盘上改了但没进索引，②跑的是索引里的旧内容（先 git add 再判，别只 add 新增的那批）：\n   ` +
                              diverged.join("\n   "));
else good(`已跟踪文件的工作树内容与索引一致（①与②判的是同一批内容，共 ${tracked.length} 个）`);

const big = tracked.map((p) => [p, fs.existsSync(path.join(ROOT, p)) ? fs.statSync(path.join(ROOT, p)).size : -1])
                   .filter(([, s]) => s > SINGLE_FILE_MAX);
big.length ? bad("单文件超过 5MB（GitHub 会警告、Pages 会拖慢首屏）：\n   " +
                 big.map(([p, s]) => p + " " + (s / 1048576).toFixed(1) + "MB").join("\n   "))
           : good("最大单文件 " + (Math.max(...tracked.map((p) => fs.existsSync(path.join(ROOT, p)) ? fs.statSync(path.join(ROOT, p)).size : 0)) / 1024).toFixed(0) + "KB，没有巨块");

/* ===== ③ 只按索引还原一份「别人 clone 到的样子」再跑一遍 ===== */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chronicle-staging-"));
try {
  execFileSync("git", ["checkout-index", "-a", "-f", "--prefix=" + tmp + "/"], { cwd: ROOT, encoding: "utf8" });
  const got = execFileSync("find", [tmp, "-type", "f"], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  /* 加这条对账的直接原因就是本轮抓到的那个缺陷——清单从 94 缩到 1 时，扫描仍报绿。 */
  const mismatch = reconcile(got, tracked.length);
  mismatch ? bad(mismatch)
      : good(`已按索引还原 ${got} 个文件（与 ls-files 一致）到纯净目录——` +
             `.gitignore 判对判错，下面这几道门说了算`);
  console.log("② 纯净 staging（等价于 fresh clone）");
  for (const g of STAGING_GATES) {
    const r = runGate(tmp, g);
    (r.rc === 0 ? good : bad)(g.padEnd(16) + " rc=" + r.rc + "  " + r.last);
    if (r.rc !== 0) console.log("   ↑ 这一条在本地工作树是全绿的 ⇒ ①与②判的不是同一批内容：要么文件没进索引（见上面的漏网判据），要么进了索引但盘上又改了没再 add（见上面的内容一致判据）");
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(fails ? "\n不可推送：" + fails + " 条红" : "\n✅ 发布面全绿：工作树与 clone 视图同一套结论");
process.exit(fails ? 1 : 0);
