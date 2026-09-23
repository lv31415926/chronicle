/* repair-lines.mjs | 修复「一条事件一行」契约下的机械性语法损伤
 *
 * 症状：增量追加时某行漏掉事件对象的收尾 `}`（常连带漏掉 "related" 字段），
 *       导致整个分片无法被 <script> 解析——一个坏行让该分片全部条目不可见。
 * 规则：只处理「以 {"id": 开头的单行事件」且花括号净深度为 +1 的行；
 *       补 related（若缺）并补回缺失的 `}`。幂等：已平衡的行不动。
 *
 * 用法: node tools/repair-lines.mjs            仅报告
 *       node tools/repair-lines.mjs --write    就地修复
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const Q = '"';

function depthOf(line) {
  let d = 0, instr = false, esc = false;
  for (const ch of line) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === Q) { instr = !instr; continue; }
    if (instr) continue;
    if (ch === "{") d++;
    else if (ch === "}") d--;
  }
  return d;
}

let fixed = 0, scanned = 0;
for (const sub of ["cn", "wd"]) {
  const dir = path.join(ROOT, "data", sub);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    const abs = path.join(dir, f);
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    let touched = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      if (!/^\{\s*["']?id["']?\s*:/.test(t)) continue;        // 只认单行事件
      scanned++;
      const d = depthOf(t);
      if (d === 0) continue;
      if (d > 0) {
        const tailComma = t.endsWith(",");
        let body = tailComma ? t.slice(0, -1) : t;
        if (depthOf(body) !== 1) { console.log(`  ? ${sub}/${f}:${i + 1} 深度 ${depthOf(body)}，非单括号缺失，跳过`); continue; }
        let patch = "";
        const quoted = /["']related["']\s*:/.test(body);
        const bare = /\brelated\s*:/.test(body);
        if (!quoted && !bare) {
          const styled = /[{,]\s*["']id["']\s*:/.test(body)
            ? "," + Q + "related" + Q + ":[]"
            : ",related:[]";
          patch += styled;
        }
        patch += "}";
        lines[i] = "  " + body + patch + (tailComma ? "," : "");
        touched++; fixed++;
        const id = (/id"?:\s*"([^"]+)/.exec(t) || [])[1] || "?";
        console.log(`  ${touched ? "✚" : " "} ${sub}/${f}:${i + 1} 补回 }${patch.includes("related") ? '+related' : ''}  (${id})`);
      } else {
        console.log(`  ! ${sub}/${f}:${i + 1} 多余 ${-d} 个收尾括号，需人工处理`);
      }
    }
    if (touched && WRITE) fs.writeFileSync(abs, lines.join("\n"), "utf8");
  }
}
console.log(`\n扫描 ${scanned} 行事件${WRITE ? "，修复 " + fixed + " 行" : fixed ? "，待修复 " + fixed + " 行（加 --write 生效）" : "，无需修复"}`);
