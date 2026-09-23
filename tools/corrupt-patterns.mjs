/* 编码腐蚀判据（validate.mjs 与 test-units.mjs 共用，防止两边各写一份而漂移）
 *
 * MANGLED  半角 ? 紧跟汉字且落在标点/空白边界前。本库契约要求引号用「」、
 *          设问用全角？，故该形态 6/6 全是生成器腐蚀，零真例 → 命中 1 次即报。
 * QRUN     两个及以上问号（全/半角，允许其间空白）相邻。生成器把整句缩写成
 *          「？ ？ ？」时不落半角，MANGLED 看不见；真设问不会连排，故无误伤。
 */
export const MANGLED = /[一-鿿]\?(?=[\s,、。；」）"]|$)/g;
export const QRUN = /[?？]\s*[?？]/g;

export function isCorrupt(line) {
  MANGLED.lastIndex = QRUN.lastIndex = 0;
  return (line.match(MANGLED) || []).length >= 1 || (line.match(QRUN) || []).length >= 1;
}
