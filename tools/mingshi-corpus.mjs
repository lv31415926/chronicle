#!/usr/bin/env node
/* 明史编年层 · 底本入库
 *
 * 输入：build/mingshi/txt/msN.txt + build/mingshi/ledger.json（由 mingshi-normalize.mjs 产出）
 * 输出：data/corpus/mingshi/msN.js          —— window.__CHRONICLE_CORPUS["msN"] = "卷文"
 *       data/corpus/mingshi/manifest.js     —— 卷清单（卷号、部类、卷题、字数、维基文库 revision id）
 *
 * 为什么把整部书放进仓库：编年层的每一个节点都声称「原文如此、核在某卷」。
 * 这句话只有在本仓自带底本时才可由外人复核——否则「不得伪托」就只能靠作者自律。
 * 有了 data/corpus，tools/validate-annals.mjs 才能对每个节点做子串实证，
 * tools/mingshi-annals.mjs --check 才能从 clone 复现整层。
 *
 * 底本不进站点首屏：manifest 不在 data/manifest.js 里，装载层按需注入单卷。
 * 用法：node tools/mingshi-corpus.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { root, CORPUS_DIR } from "./mingshi-lib.mjs";

const TXT = path.join(root(), "build/mingshi/txt");
const LEDGER = path.join(root(), "build/mingshi/ledger.json");
const OUT = CORPUS_DIR;

const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const chunks = [];
let total = 0;
for (const key of Object.keys(ledger).sort((a, b) => ledger[a].juan - ledger[b].juan)) {
  const e = ledger[key];
  if (e.thin) continue;                       // 表格略一类无正文卷：台账留痕，不入库
  const src = path.join(TXT, `ms${e.juan}.txt`);
  if (!fs.existsSync(src)) continue;
  const text = fs.readFileSync(src, "utf8");
  const body = `/* 明史卷${e.juan}·${e.title || ""}｜底本：维基文库 revision ${e.revision ?? "未记"}｜公有领域 */\n`
    + `window.__CHRONICLE_CORPUS = window.__CHRONICLE_CORPUS || {};\n`
    + `window.__CHRONICLE_CORPUS["ms${e.juan}"] = ${JSON.stringify(text)};\n`;
  fs.writeFileSync(path.join(OUT, `ms${e.juan}.js`), body, "utf8");
  const bytes = Buffer.byteLength(body);
  total += bytes;
  chunks.push({
    id: `ms${e.juan}`, juan: e.juan, file: `ms${e.juan}.js`,
    section: e.section, title: e.title, chars: e.chars, bytes,
    revision: e.revision ?? null,
  });
}

const manifestBody = `/* manifest.js | 明史底本分卷清单
 *
 * 由 tools/mingshi-corpus.mjs 从 build/mingshi/ledger.json 生成，请勿手改。
 * 站点装载层按此表按需注入单卷原文；tools/validate-annals.mjs 以 revision 为「核的是哪一版」的锚。
 */
window.__CHRONICLE_CORPUS_MANIFEST = ${JSON.stringify({ version: 1, label: "明史底本", chunks }, null, 1)};
`;
fs.writeFileSync(path.join(OUT, "manifest.js"), manifestBody, "utf8");
console.log(`底本入库 ${chunks.length} 卷，共 ${(total / 1048576).toFixed(2)} MB；清单 manifest.js`);
