/* loader.js | 分片按需注入（file:// 兼容：用 <script> 而非 fetch）+ 事件仓库 + 索引 */
(function () {
  "use strict";

  var BASE = "data/";
  var loaded = {};                 // chunkId -> true
  var pending = {};                // chunkId -> Promise
  var failed = {};                 // chunkId -> 失败原因（缺文件、求值失败、载入 0 条）
  var events = [];                 // 全量事件
  var byId = Object.create(null);
  var byYear = Object.create(null);   // "cn|-636" -> [ev]
  var byTrackYear = Object.create(null);
  var counts = Object.create(null);   // chunkId -> n

  /* 一条 <script> 若既不触发 onload 也不触发 onerror（file:// 被拦截、磁盘挂起、
   * 代理中断），Promise 就永远不 settle，启动遮罩会盖死整站且没有任何出路。
   * 所以每条注入都必须自带终点：到点即判失败，宁可少一片也不能冻在遮罩上。
   *
   * 终点定多远要看链路有多慢。托管链路（GitHub Pages）实测吞吐 13–110 KB/s 剧烈
   * 波动，事件分片 29 片中最小 41 KB、中位 198 KB、最大 320 KB ⇒ 最慢一档下单片
   * 15–25 s。旧的 8 s 在本地永远碰不到，上线后却把 28/29 片判成超时——看门狗把自己
   * 变成了主要故障源，而且判死之后首屏那条链一次也没被救回来。
   * 于是分成两个预算（两个数字由 test-units ⑫ 按磁盘上的真实分片体积兜住）：
   *   FIRST_TRY 用在启动路径（清单 + 视窗内）：遮罩最多等一轮这个数（清单才 3 KB，
   *     13 KB/s 下 0.2 s，真正吃时间的是视窗那片），18 s 已够在最慢吞吐下拉完
   *     中位数那片（198 KB ≈ 15.2 s），只有更胖的片会落到第二轮；
   *   INJECT_TIMEOUT 用在后台补齐与全量加载，这一路没有人等在屏幕前，宁可慢也要取到。
   * 视窗那片若在第一预算内没到，会留在「未载入」队列里由后台补齐用宽预算重试
   * （app.js 的 topUpOnIdle 最多三轮）。真缺文件走的仍是一条 <script>，404 由 onerror
   * 立刻判死，不会白等 30 s——宽预算只兜「连上了但一直不落地」这一类。
   * 这两个数字是全站共用的，geo/frame/story/chain 四层从这里取，不再各自写字面量。 */
  var INJECT_TIMEOUT = window.__CHRONICLE_INJECT_TIMEOUT || 30000;
  var FIRST_TRY_TIMEOUT = window.__CHRONICLE_FIRST_TRY_TIMEOUT || 18000;
  function injectScript(src, ms) {
    var timeout = ms || INJECT_TIMEOUT;
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        s.onload = s.onerror = null;         // 迟到的回调不能再碰已移除的节点
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("加载超时（" + timeout + "ms 无响应）：" + src));
      }, timeout);
      function settle(fn) {
        return function () {
          clearTimeout(timer);
          if (s.parentNode) s.parentNode.removeChild(s);
          fn();
        };
      }
      s.src = src;
      s.async = true;
      s.onload = settle(resolve);
      s.onerror = settle(function () { reject(new Error("load failed: " + src)); });
      document.head.appendChild(s);
    });
  }

  function addEvent(ev) {
    if (byId[ev.id]) {
      /* 撞 id 不能吞掉事件：保住第一条的原 id，后到的改名入库，
       * 否则数据集里少一条却只在控制台留一行 warn。 */
      console.error("[loader] duplicate id", ev.id, "→", ev.title);
      var n = 2;
      while (byId[ev.id + "#dup" + n]) n++;
      ev.id = ev.id + "#dup" + n;
    }
    byId[ev.id] = ev;
    events.push(ev);
    var k = ev.track + "|" + ev.year;
    (byTrackYear[k] || (byTrackYear[k] = [])).push(ev);
    (byYear[ev.year] || (byYear[ev.year] = [])).push(ev);
    return true;
  }

  function absorb(chunkId, arr) {
    var n = 0;
    if (!Array.isArray(arr)) { console.warn("[loader] chunk not array", chunkId); return 0; }
    for (var i = 0; i < arr.length; i++) {
      var ev = arr[i];
      ev._chunk = chunkId;
      if (addEvent(ev)) n++;
    }
    counts[chunkId] = n;
    return n;
  }

  function loadChunk(meta, ms) {
    var id = meta.id;
    if (loaded[id]) return Promise.resolve(0);
    if (pending[id]) return pending[id];
    pending[id] = injectScript(BASE + meta.file, ms).then(function () {
      var store = window.__CHRONICLE_CHUNK || {};
      if (!Array.isArray(store[id])) {
        /* onload 只说明文件求值过，不说明它把数据挂上了：分片语法错、key 写错、
         * 被半路截断，全都表现为「安静地少一片」。 */
        throw new Error("分片未注册 " + id + "（文件已加载但 __CHRONICLE_CHUNK 里没有它）");
      }
      var n = absorb(id, store[id]);
      loaded[id] = true;
      delete pending[id];
      delete failed[id];
      window.dispatchEvent(new CustomEvent("chronicle:chunk", { detail: { id: id, count: n } }));
      return n;
    }).catch(function (e) {
      delete pending[id];
      failed[id] = e.message;               // 吞掉异常可以，但必须留下账可查
      console.error("[loader] " + id + ": " + e.message);
      return 0;
    });
    return pending[id];
  }

  /* 视窗内的分片 + 邻接一片 */
  function chunksForRange(manifest, from, to) {
    var out = [];
    for (var i = 0; i < manifest.chunks.length; i++) {
      var c = manifest.chunks[i];
      var pad = Math.max(100, (to - from) * 0.5);
      if (c.yearTo >= from - pad && c.yearFrom <= to + pad) out.push(c);
    }
    return out;
  }

  var manifest = null;
  function ensureManifest() {
    if (manifest) return Promise.resolve(manifest);
    /* 清单只有几 KB，却在启动路径上卡着整屏 ⇒ 用紧预算：宁可早点判失败走重试，
     * 也不让读者对着遮罩等 30 s。 */
    return injectScript(BASE + "manifest.js", FIRST_TRY_TIMEOUT).then(function () {
      var mf = window.__CHRONICLE_MANIFEST;
      if (!mf || !Array.isArray(mf.chunks)) throw new Error("manifest.js 缺少 chunks");
      manifest = mf;                       // 校验通过才落账：先赋值会让下次调用把坏清单当好清单
      return manifest;
    });
  }

  /* 注意：下面几处 map 一律写成显式包装函数，不能 `.map(loadChunk)`——
   * map 会把数组下标当第二个实参喂进来，下标就成了毫秒数。 */
  function ensureRange(from, to) {
    return ensureManifest().then(function (mf) {
      var need = chunksForRange(mf, from, to);
      return Promise.all(need.map(function (c) { return loadChunk(c, FIRST_TRY_TIMEOUT); }))
        .then(sum);
    });
  }

  /* 「加载全部分片」按钮走这一条：全并发会把带宽一次性占满，慢网下 29 条同时
   * 各拉一条 ⇒ 每条都更慢 ⇒ 整批一起超时（实测点这个按钮 50 s 后 0 片恢复）。
   * 所以和后台补齐共用分批与宽预算，把它变成真正能救回缺片的手动出口。
   *
   * until 是给「读者在等的这一条」留的出口：分批之后最坏要十几批才 resolve，
   * 而深链 #/event 只需要那一条落地就该动——剩下的交给后台补齐，不能让人家
   * 为一把钥匙等整串。每批开始前问一次，命中即收手。 */
  function ensureAll(until) {
    return ensureManifest().then(function (mf) {
      return loadInBatches(mf.chunks, until);
    });
  }

  /* 视窗外那几片的取用顺序：按「离视窗多远」排，不按 manifest 顺序排。
   * 按清单顺序补片，首屏之后第一批落地的数据会来自完全无关的年代——
   * 读者往右拖一次就撞见空白，而空白正是「这站没内容」的样子。 */
  function restChunks(mf, from, to) {
    var span = Math.max(1, to - from);
    var gapOf = function (c) {
      if (c.yearTo < from) return from - c.yearTo;
      if (c.yearFrom > to) return c.yearFrom - to;
      return 0;
    };
    return mf.chunks.filter(function (c) { return !loaded[c.id]; })
      .map(function (c) { return { c: c, g: gapOf(c) / span, y: c.yearFrom }; })
      .sort(function (a, b) { return a.g - b.g || a.y - b.y; })
      .map(function (x) { return x.c; });
  }

  function sum(rs) { return rs.reduce(function (a, b) { return a + b; }, 0); }

  var REST_BATCH = 3;
  /* 分批取：不并发全部，也不一片一片串——串起来每片都要各自等一轮看门狗，
   * 全并发则把首屏刚省下的带宽一次性占满。
   * 队列只排除「已载入」，不排除「已失败」：一次抖动不该永久少一片，下一轮补齐
   * 还有机会把它救回来；是否重复取由 loadChunk 的 loaded/pending 两道守卫决定。 */
  function loadInBatches(list, until) {
    function step(i, n) {
      if (i >= list.length) return n;
      if (until && until()) return n;         // 读者等的那一条已经到手，后面的批次交给补齐
      return Promise.all(list.slice(i, i + REST_BATCH)
        .map(function (c) { return loadChunk(c); }))
        .then(function (rs) { return step(i + REST_BATCH, n + sum(rs)); });
    }
    return step(0, 0);
  }

  function ensureRest(from, to) {
    return ensureManifest().then(function (mf) {
      return loadInBatches(restChunks(mf, from, to));
    });
  }

  /* ===== 查询接口 ===== */
  function eventsIn(from, to) {
    var out = [];
    for (var i = 0; i < events.length; i++) {
      var y = events[i].year;
      if (y >= from && y <= to) out.push(events[i]);
    }
    return out;
  }

  function eventsAtYear(track, y) {
    return byTrackYear[track + "|" + y] || [];
  }
  function allEventsAtYear(y) { return byYear[y] || []; }
  function eventById(id) { return byId[id] || null; }
  function allEvents() { return events; }
  function stats() {
    return {
      total: events.length,
      loadedChunks: Object.keys(loaded).length,
      totalChunks: manifest ? manifest.chunks.length : 0,
      counts: counts
    };
  }
  function yearCoverage() {
    var ys = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
    return { min: ys[0], max: ys[ys.length - 1], distinctYears: ys.length };
  }

  window.ChronLoader = {
    /* 看门狗的两个预算：本层是唯一定义处，geo/frame/story/chain 从这里取，
     * 免得同一个数字在五份文件里各自漂移。 */
    injectTimeout: INJECT_TIMEOUT,
    firstTryTimeout: FIRST_TRY_TIMEOUT,
    ensureManifest: ensureManifest,
    ensureRange: ensureRange,
    ensureAll: ensureAll,
    ensureRest: ensureRest,
    eventsIn: eventsIn,
    eventsAtYear: eventsAtYear,
    allEventsAtYear: allEventsAtYear,
    eventById: eventById,
    allEvents: allEvents,
    stats: stats,
    failedChunks: function () {
      return Object.keys(failed).map(function (id) { return { id: id, reason: failed[id] }; });
    },
    yearCoverage: yearCoverage,
    isLoaded: function (id) { return !!loaded[id]; }
  };
})();
