/* gen-manifest.mjs | 扫描 data/cn/*.js 与 data/wd/*.js，生成 data/manifest.js
 *
 * 用法: node tools/gen-manifest.mjs
 * 数据分片增删后重跑。manifest.js 是 loader 的唯一入口，缺失会导致启动即失败。
 * 语法非法的分片（子代理正在追加写入的中间态）按空分片登记并告警，不阻塞构建。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const TRACK_OF = { cn: "cn", wd: "world" };
const report = [];

function evalFile(rel) {
  const win = {};
  try {
    new Function("window", fs.readFileSync(path.join(ROOT, rel), "utf8"))(win);
    return { win, err: null };
  } catch (e) {
    return { win: {}, err: e.message };
  }
}

const meta = evalFile("data/meta.js").win.__CHRONICLE_META || {};
const YEAR_MIN = meta.yearMin ?? -3000;
const YEAR_MAX = meta.yearMax ?? 2026;

const files = [];
for (const sub of ["cn", "wd"]) {
  const dir = path.join(DATA, sub);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort())
    files.push({ sub, rel: `data/${sub}/${f}` });
}

const chunks = [];
for (const { sub, rel } of files) {
  const id = path.basename(rel, ".js");
  const { win, err } = evalFile(rel);
  if (err) report.push(`!! ${rel}: 语法错误（${err}），按空分片登记`);
  let arr = (win.__CHRONICLE_CHUNK || {})[id];
  if (!Array.isArray(arr)) {
    report.push(`!! ${rel}: 缺少 window.__CHRONICLE_CHUNK["${id}"]，按空分片登记`);
    arr = [];
  }
  const years = arr.map((e) => e && e.year).filter((y) => Number.isInteger(y) && y !== 0);
  const bytes = fs.statSync(path.join(ROOT, rel)).size;
  const from = years.length ? Math.min(...years) : YEAR_MIN;
  const to = years.length ? Math.max(...years) : YEAR_MAX;
  chunks.push({
    id, file: `${sub}/${id}.js`, track: TRACK_OF[sub],
    count: arr.length, yearFrom: from, yearTo: to, empty: !arr.length, bytes,
  });
  const fmt = (y) => (y < 0 ? "前" + -y : y);
  report.push(
    `${id.padEnd(6)} ${String(arr.length).padStart(4)} 条  ` +
    `${(years.length ? fmt(from) + " → " + fmt(to) : "—").padStart(17)}  ` +
    `${(bytes / 1024).toFixed(0).padStart(4)}KB`
  );
}

/* loader 以 yearFrom/yearTo 判定视窗重叠；空分片给全区间占位，
 * 否则 null 参与比较会让它在「加载全部」时被静默排除。 */
chunks.sort((a, b) => a.yearFrom - b.yearFrom || a.id.localeCompare(b.id));

/* 相邻空分片不产生重叠负担：非空分片才按视窗命中，空分片 count=0 注入即返回。 */
const total = chunks.reduce((n, c) => n + c.count, 0);
const lines = chunks.map((c) =>
  `    { id: "${c.id}", file: "${c.file}", track: "${c.track}", count: ${c.count},` +
  ` yearFrom: ${c.yearFrom}, yearTo: ${c.yearTo}${c.empty ? ", empty: true" : ""} }`
).join(",\n");

const out = `/* manifest.js | 自动生成，请勿手工编辑
 * 重新生成: node tools/gen-manifest.mjs
 * 生成时间: ${new Date().toISOString().slice(0, 19).replace("T", " ")}
 * 分片数 ${chunks.length} | 事件总数 ${total}
 */
window.__CHRONICLE_MANIFEST = {
  generatedAt: "${new Date().toISOString()}",
  total: ${total},
  chunks: [
${lines}
  ]
};
`;
fs.writeFileSync(path.join(DATA, "manifest.js"), out, "utf8");
console.log(report.join("\n"));
console.log(`\n${chunks.length} 分片 / ${total} 条 → data/manifest.js` +
  (chunks.some((c) => c.empty) ? `（含 ${chunks.filter((c) => c.empty).length} 个空分片）` : ""));
