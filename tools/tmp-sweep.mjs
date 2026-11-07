/* tmp-sweep.mjs | 现场副本回收的唯一判据（test-gates / test-gates-meta 共用一份）
 *
 * 为什么要有这个文件：两份自审器每次跑都在 tmp 下开一份整项目副本
 * （gate-mut-xxx / gate-meta-xxx，一份 300M+），失败时刻意保留现场，
 * 所以启动时得把同名前缀的旧副本收回来，否则几个 G 就堆在 /var/folders。
 *
 * 但「前缀由本文件独占」从来不等于「同一时刻只有一份」：
 *   · 另开一个终端跑门禁；
 *   · test-gates-meta 在自己的副本里再拉起一个 test-gates。
 * 两个进程会互相删掉对方正在使用的目录。实测到的两种后果，一种当场崩
 * （ENOTEMPTY: directory not empty, rmdir gate-mut-xxx），另一种更坏——
 * 副本半途消失，被删的那份门禁照样往下判、照样打印通过。
 * 一个会自我误伤的清理程序，比不清理危险得多：它的失效模式是「假绿」。
 *
 * 所以回收前先问一句：这目录还有人活着吗。判据只写在这一处。
 *
 * 用法：markOwner(dir) 在 mkdtemp 之后立刻调用；reclaimStale(prefix, parent, keepBase)
 * 返回 {reclaimed, kept}。可红性由 tools/test-gates.mjs 开头的双探针用例自证。
 */
import fs from "fs";
import os from "os";
import path from "path";

export const OWNER_FILE = ".owner";

/** 把归属写进副本目录：进程被杀后 pid 不再存在，目录自动降级为「无主旧现场」 */
export function markOwner(dir, pid = process.pid) {
  fs.writeFileSync(path.join(dir, OWNER_FILE), String(pid) + "\n");
}

/**
 * pid 存活判定。kill(pid, 0) 不发信号，只做存在性检查：
 *   成功 → 活着；EPERM → 也活着（只是属于别人）；ESRCH → 不存在。
 * 把 EPERM 当「死了」会删掉同一台机器上其他用户/会话正在用的副本，
 * 而那种删法不会报错，只会让对方的门禁结论失真。
 */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** 读目录里的归属文件；读不到（老版本留下的现场、或写到一半被杀）按无主处理，照旧回收 */
export function ownerAlive(dir) {
  let raw;
  try { raw = fs.readFileSync(path.join(dir, OWNER_FILE), "utf8"); } catch { return false; }
  return pidAlive(parseInt(String(raw).trim(), 10));
}

/** 回收 parentDir 下以 prefix 开头、且无主的旧副本；keepBase（自己的目录）永不动 */
export function reclaimStale(prefix, parentDir = os.tmpdir(), keepBase = "") {
  const res = { reclaimed: 0, kept: 0 };
  let names;
  try { names = fs.readdirSync(parentDir); } catch { return res; }
  for (const n of names) {
    if (!n.startsWith(prefix) || n === keepBase) continue;
    const dir = path.join(parentDir, n);
    if (ownerAlive(dir)) { res.kept++; continue; }
    fs.rmSync(dir, { recursive: true, force: true });
    res.reclaimed++;
  }
  return res;
}
