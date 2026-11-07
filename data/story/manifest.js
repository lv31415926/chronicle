/* manifest.js | 故事层分片清单
 *
 * 界面只按这张表注入 <script>，不扫描目录——file:// 下没有目录列举能力，
 * 而且「加了文件就自动出现在站上」会让未过门的条目直接见到读者。
 * 新增分片必须同时改这里，否则 tools/validate-story.mjs 的 STORY_MANIFEST 会红。
 */
window.__CHRONICLE_STORY_MANIFEST = {
  version: 1,
  label: "故事层",
  chunks: [
    { id: "preqin", file: "preqin.js", label: "先秦" },
    { id: "han", file: "han.js", label: "两汉" },
    { id: "liuchao", file: "liuchao.js", label: "六朝" },
    { id: "suitang", file: "suitang.js", label: "隋唐" },
    { id: "songyuan", file: "songyuan.js", label: "宋元" },
    { id: "ming", file: "ming.js", label: "明" },
    { id: "qing", file: "qing.js", label: "清" },
    { id: "modern", file: "modern.js", label: "近代" },
    { id: "world", file: "world.js", label: "世界" }
  ]
};
