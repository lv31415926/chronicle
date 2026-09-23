/* limits.mjs | 数据契约里的数值上限，唯一出处
 *
 * 为什么单独一个文件：title/summary 长度上限曾同时写在 validate.mjs、check.mjs、
 * mcheck.mjs 三处（各说各话），改一处必漏一处——漏掉的那份不会报错，只会让作者
 * 按旧上限写数据、然后在另一道门里被打回。上限本身记在 DATA_SCHEMA §2。
 */
export const MAX_TITLE = 24;
export const MAX_SUMMARY = 45;
