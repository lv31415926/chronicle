/* prov-stats.mjs | 溯源四级实测读数
 *
 * 为什么要有这个文件：四级分布曾经手抄在 README 与 DATA_SCHEMA 里，两处各一份。
 * 结果是文档里的数字比库里慢了几百条——「同一个数字写在两处，就注定其中一处会腐烂」，
 * 而这两处都还在被引用。等级本来就由 js/prov.js 现算，读数也就只能现算。
 *
 * 本工具只报数，不设门：它不判对错，所以不进 GATES 清单。
 * 判据与界面同一把尺子（加载的是同一个 js/prov.js），不是这里另写一份。
 *
 * 用法：node tools/prov-stats.mjs [--era] [--json]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const AS_JSON = ARGS.includes("--json");

/* 与 tools/intake.mjs 同一套垫片：只实现 prov.js 真正调用的那几个面。 */
const win = {
  document: { createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
    querySelector: () => null, addEventListener() {}, body: {} },
  localStorage: { getItem: () => null, setItem() {} },
};
win.window = win;

function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  new Function("window", "document", "localStorage", "CustomEvent", "setTimeout", src)(
    win, win.document, win.localStorage, function () {}, function () {});
}

for (const sub of ["cn", "wd"]) {
  const dir = path.join(ROOT, "data", sub);
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) load(`data/${sub}/${n}`);
}
load("js/prov.js");

const PV = win.ChronProv;
if (!PV) { console.error("判据装载失败：ChronProv 不在垫片里求值出来了"); process.exit(1); }

const EVENTS = Object.values(win.__CHRONICLE_CHUNK || {}).flat();
const stats = PV.stats(EVENTS);

const ERAS = [
  ["上古—先秦", (y) => y <= -221],
  ["秦汉", (y) => y > -221 && y <= 220],
  ["魏晋南北朝", (y) => y > 220 && y <= 589],
  ["隋唐", (y) => y > 589 && y <= 907],
  ["宋元", (y) => y > 907 && y <= 1368],
  ["明清", (y) => y > 1368 && y <= 1911],
  ["近代", (y) => y > 1911],
];

function eraRows() {
  return ERAS.map(([name, inEra]) => {
    const set = EVENTS.filter((e) => inEra(e.year));
    const s = PV.stats(set);
    return { name, total: s.total, verified: s.verified, locatable: s.locatable,
      titled: s.titled, unsourced: s.unsourced,
      titledPct: s.total ? Math.round((s.titled / s.total) * 100) : 0 };
  });
}

if (AS_JSON) {
  console.log(JSON.stringify({ total: stats.total, tiers: stats, eras: ARGS.includes("--era") ? eraRows() : undefined }, null, 2));
} else {
  /* 本地日期，不用 toISOString：后者给的是 UTC，跨日界时会比读者的「今天」早一天，
   * 而 checks[].at 按口径必须写核对发生的那天。 */
  const today = new Date().toLocaleDateString("sv-SE");
  console.log(`溯源四级实测（${today}，${stats.total} 条；判据＝js/prov.js，与界面同一把尺子）`);
  for (const k of ["verified", "locatable", "titled", "unsourced"]) {
    console.log(`  ${PV.labelOf(k).padEnd(4)} ${String(stats[k]).padStart(5)}  ${stats.total ? (stats[k] / stats.total * 100).toFixed(1) + "%" : "0%"}`);
  }
  if (ARGS.includes("--era")) {
    console.log("\n分段（仅书名占比高＝这一段读者最查不到，补定位优先从这里起）");
    for (const r of eraRows()) {
      console.log(`  ${r.name.padEnd(6)} ${String(r.total).padStart(5)} 条  仅书名 ${String(r.titled).padStart(4)}  ${String(r.titledPct).padStart(2)}%  已核 ${r.verified}`);
    }
  }
}
