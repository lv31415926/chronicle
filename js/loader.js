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
   * 所以每条注入都必须自带终点：到点即判失败，宁可少一片也不能冻在遮罩上。 */
  var INJECT_TIMEOUT = window.__CHRONICLE_INJECT_TIMEOUT || 8000;
  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        s.onload = s.onerror = null;         // 迟到的回调不能再碰已移除的节点
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("加载超时（" + INJECT_TIMEOUT + "ms 无响应）：" + src));
      }, INJECT_TIMEOUT);
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

  function loadChunk(meta) {
    var id = meta.id;
    if (loaded[id]) return Promise.resolve(0);
    if (pending[id]) return pending[id];
    pending[id] = injectScript(BASE + meta.file).then(function () {
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
    return injectScript(BASE + "manifest.js").then(function () {
      var mf = window.__CHRONICLE_MANIFEST;
      if (!mf || !Array.isArray(mf.chunks)) throw new Error("manifest.js 缺少 chunks");
      manifest = mf;                       // 校验通过才落账：先赋值会让下次调用把坏清单当好清单
      return manifest;
    });
  }

  function ensureRange(from, to) {
    return ensureManifest().then(function (mf) {
      var need = chunksForRange(mf, from, to);
      return Promise.all(need.map(loadChunk)).then(function (rs) {
        return rs.reduce(function (a, b) { return a + b; }, 0);
      });
    });
  }

  function ensureAll() {
    return ensureManifest().then(function (mf) {
      return Promise.all(mf.chunks.map(loadChunk));
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

  var REST_BATCH = 3;
  /* 后台补齐：分批而非并发全部，也不是一片片串——串起来最坏要等看门狗把每个
   * 死链各耗一轮（27 × 8s）；全并发则把首屏刚省下的带宽一次性占满。
   * 队列只排除「已载入」，不排除「已失败」：一次抖动不该永久少一片，下一轮补齐
   * 还有机会把它救回来；是否重复取由 loadChunk 的 loaded/pending 两道守卫决定。 */
  function ensureRest(from, to) {
    return ensureManifest().then(function (mf) {
      var need = restChunks(mf, from, to);
      function step(i, n) {
        if (i >= need.length) return n;
        return Promise.all(need.slice(i, i + REST_BATCH).map(loadChunk))
          .then(function (rs) { return step(i + REST_BATCH, n + rs.reduce(function (a, b) { return a + b; }, 0)); });
      }
      return step(0, 0);
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
