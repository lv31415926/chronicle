/* voice-lib.mjs | 立场词表与引号豁免：工具侧唯一一份
 *
 * 为什么要有这一份：评价词表过去在 validate-achv 与 validate-story 各抄一份，
 * DATA_SCHEMA 里写的是「同词表」，但没有任何东西看着它同不同。两份一旦漂开，
 * 同一句「辉煌的成就」会在成就门变红、在故事门变绿——而读者只看见一句红一句不红，
 * 他会开始不信门的话。立场轴全站只有一条线，所以词表也只能有一份。
 *
 * 改这里必须同时跑：node tools/test-achv.mjs && node tools/test-story.mjs && node tools/test-chain.mjs
 * （三道门共用一张表，所以三道门都得重新证明它仍抓得住）。
 *
 * 词表口径（与 validate-achv 头部注释同源，理由记在那边）：
 *   · 刻意不含「伟业」——吴伟业是真实存在的明末作者名，落进 background 就是误报，
 *     而且加书名号救不回来。这是删词而不是加豁免，被删的词由人工审兜着。
 *   · 保留「伟大」「光荣」——语料里的用例本来就是文献原话，加引号既让门变绿也让记述更忠实。
 */

export const PRAISE = /辉煌|灿烂|骄傲|自豪|瑰宝|举世瞩目|博大精深|遥遥领先|壮举|无双|伟大|光荣/;

/* 落在引号对内的文字算文献原话或书名，不算本站的立场。 */
export const QUOTES = /《[^》]*》|「[^」]*」|『[^』]*』|“[^”]*”/g;

/* 极值语：本站不禁止说「最早」，禁止的是不说凭什么。 */
export const SUPER = /最早|第一次|首次|领先|之最|唯一|最大|最完|最持久|第一本|第一部|第一种/;

/* 剥掉引号对内的部分，只留下作者自己写的字。 */
export function stripQuoted(t) {
  return String(t || "").replace(new RegExp(QUOTES.source, "g"), "");
}

/* 引号对的区间表：位置判定用，比 strip 精确（要知道词落在哪一段才被豁免）。 */
export function quoteSpans(s) {
  const out = [];
  const re = new RegExp(QUOTES.source, "g");
  let m;
  while ((m = re.exec(s))) out.push([m.index, m.index + m[0].length]);
  return out;
}
