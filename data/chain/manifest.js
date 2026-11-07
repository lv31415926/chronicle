/* manifest.js | 涟漪层（蝴蝶效应）分片清单
 *
 * 界面只按这张表注入 <script>，不扫描目录——file:// 下没有目录列举能力，
 * 而且「加了文件就自动出现在站上」会让没过门的因果链直接见到读者。
 * 新增分片必须同时改这里，否则 tools/validate-chain.mjs 的 CHAIN_MANIFEST 会红。
 *
 * 两片按**首环年代**分（≤1500 / >1500），不按朝代分：一条链天生要跨过朝代，
 * 按朝代分片会把一条链撕成两半，而撕开的两半各自都不再是一条涟漪。
 */
window.__CHRONICLE_CHAIN_MANIFEST = {
  version: 1,
  label: "涟漪层",
  chunks: [
    { id: "ancient", file: "ancient.js", label: "1500年以前" },
    { id: "earlymodern", file: "earlymodern.js", label: "1500年以后" }
  ]
};
