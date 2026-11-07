/* validate-frame.mjs | 视角层门：立场可以选，但不许替史料说话
 * 用法: node tools/validate-frame.mjs [--json]
 *
 * 这一层是本站唯一允许写评价与比较的地方。它换来的代价必须用门还上：
 * 一旦「领先／最早」可以随口写，视角层就会把整个站点的可信度抵押出去。
 *
 * 检查码：
 *   FRAME_SCHEMA    缺 id/why/claim 字段，或 id 不存在
 *   FRAME_GROUND    claim.ground 不是该条目原文里逐字出现过的一段（**反造神主判据**）
 *   FRAME_SUPERLATIVE 用了最早/第一/领先/之最/唯一/最大，却没写判据、范围或强度
 *   FRAME_STRENGTH  strength 越枚举
 *   FRAME_DISPUTE   强度不是「确证」却没写争议/反例
 *   FRAME_PROV      被用来立论的条目溯源低于「可定位」（仅书名的材料不许当成就证据）
 *   FRAME_PEER      对照侧 id 不存在／relation 越枚举／标「同期」却差超过 160 年／缺并置说明
 *   FRAME_STANCE    立场声明缺失（视角层必须自报是立场）
 *   FRAME_EMPTY     看点为空或过少（功能存在但没内容，等于给读者一个空按钮）
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { loadCorpus, loadPlaces, useRoot } from "./geo-lib.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* 只有一个根：语料、派生器、视角层文件都从同一个目录读。
 * 夹具测的必须是生产那份判据，否则「门能红」测的是另一段代码。 */
const rootArg = process.argv.indexOf("--root");
const ROOT = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : DEFAULT_ROOT;
/* 根只有一个：本门读视角层文件用哪个目录，读语料与派生器就必须用同一个。
 * 曾各走各的——夹具的 frame 配上真实语料，于是夹具「判绿」，测的却不是夹具。 */
if (rootArg > 0) useRoot(ROOT);
const errs = [], warns = [];
const bad = (c, m) => errs.push(`${c} ${m}`);

const SUPER = /最早|第一|首次|领先|之最|唯一|最大|最完|最持久/;
const STRENGTHS = ["确证", "通行说法", "有争议"];
const RELATIONS = ["同期", "先行", "后继"];
const RANK_MIN = 2;   // 可定位

function evalFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const sb = { window: {} }; sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(abs, "utf8"), sb, { filename: rel });
  return sb;
}

const corpus = loadCorpus();   // 经 geo-lib 的当前根
const byId = new Map(corpus.map((e) => [e.id, e]));
const PV = evalFile("js/prov.js").ChronProv;
const F = evalFile("data/frame/highlights.js");
const frame = F && F.__CHRONICLE_FRAME;

if (!frame) {
  bad("FRAME_SCHEMA", "data/frame/highlights.js 读不到 __CHRONICLE_FRAME");
} else {
  if (!frame.stance || String(frame.stance).length < 12) bad("FRAME_STANCE", "缺 stance：视角层必须自报这是编辑立场，不能装作中立");
  const hs = frame.highlights || [];
  if (hs.length < 8) bad("FRAME_EMPTY", `看点只有 ${hs.length} 条（少于 8 条时顶栏「看点」是个空壳）`);

  hs.forEach((h, i) => {
    const at = `看点#${i + 1} ${h && h.id ? h.id : "(无 id)"}`;
    const e = h && h.id ? byId.get(h.id) : null;
    if (!e) { bad("FRAME_SCHEMA", `${at}: 条目不存在`); return; }
    if (!h.why || h.why.length < 6) bad("FRAME_SCHEMA", `${at}: 缺 why（为什么值得看）`);
    const c = h.claim || {};
    if (!c.text) bad("FRAME_SCHEMA", `${at}: claim 缺 text`);
    if (!c.ground) bad("FRAME_SCHEMA", `${at}: claim 缺 ground（必须引条目原文）`);

    /* 反造神主判据：ground 必须是条目正文里逐字出现过的一段。
     * 「本站可以选它要突出的东西，但不许替史料说话」——这条把它变成机器判据。 */
    if (c.ground) {
      const hay = [e.summary, e.detail.background, e.detail.process, e.detail.impact].join("\n");
      if (hay.indexOf(c.ground) < 0) {
        bad("FRAME_GROUND", `${at}: ground 不是条目原文（查无此段：「${String(c.ground).slice(0, 40)}…」）`);
      }
    }
    /* 仅书名级的材料不能用来立成就论 */
    if (PV && Object.keys(PV.RANK).indexOf(PV.tierOf(e)) >= 0 && PV.rankOf(e) < RANK_MIN) {
      bad("FRAME_PROV", `${at}: 条目溯源为「${PV.labelOf(PV.tierOf(e))}」，不足以支撑成就主张`);
    }
    if (SUPER.test(String(c.text || "") + String(c.ground || ""))) {
      ["basis", "scope", "strength"].forEach((k) => {
        if (!c[k]) bad("FRAME_SUPERLATIVE", `${at}: 用了极限词却缺 ${k}`);
      });
      if (c.strength && STRENGTHS.indexOf(c.strength) < 0) bad("FRAME_STRENGTH", `${at}: strength=${c.strength} 越枚举`);
      if (c.strength && c.strength !== "确证" && (!c.dispute || c.dispute.length < 8)) {
        bad("FRAME_DISPUTE", `${at}: strength=${c.strength} 却没写争议/反例（读者先于你找到反例时，被连累的是全部看点）`);
      }
    }
    const pr = h.peer;
    if (pr) {
      const w = byId.get(pr.id);
      if (!w) bad("FRAME_PEER", `${at}: 对照侧 ${pr.id} 不存在`);
      else {
        if (RELATIONS.indexOf(pr.relation) < 0) bad("FRAME_PEER", `${at}: peer.relation=${pr.relation} 越枚举 ${RELATIONS.join("/")}`);
        if (pr.relation === "同期" && Math.abs(w.year - e.year) > 160) {
          bad("FRAME_PEER", `${at}: 标「同期」却差 ${Math.abs(w.year - e.year)} 年（跨千年的只能写先行/后继，把时间差摆明）`);
        }
        if (!pr.note || pr.note.length < 8) bad("FRAME_PEER", `${at}: 对照缺 note（并置关系要写清，否则读者自己脑补成高下）`);
      }
    }
  });

  /* 同一条目不该被当成两条互斥主张的证据 */
  const seen = {};
  hs.forEach((h) => { if (h && h.id) { if (seen[h.id]) warns.push(`FRAME_DUP ${h.id} 出现两次`); seen[h.id] = 1; } });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ pass: !errs.length, errors: errs, warnings: warns }, null, 2));
} else {
  const n = frame && frame.highlights ? frame.highlights.length : 0;
  const withPeer = frame && frame.highlights ? frame.highlights.filter((h) => h.peer).length : 0;
  const withDispute = frame && frame.highlights ? frame.highlights.filter((h) => h.claim && h.claim.dispute).length : 0;
  console.log(`视角层门 · 看点 ${n} 条 · 带对照 ${withPeer} 条 · 自带争议标注 ${withDispute} 条`);
  warns.forEach((w) => console.log("  ~ " + w));
  if (errs.length) {
    console.log(`\n✗ ${errs.length} 项硬性错误：`);
    errs.forEach((e) => console.log("  " + e));
    process.exit(1);
  }
  console.log("\n✅ 视角层全部通过：每条主张都能在条目原文里找到那句话");
}
