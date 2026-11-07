/* geo.js | 地理层数据访问：分片注入、地名解析、事件落点、行迹与水系
 * 依赖：window.ChronLoader（注入纪律）、window.__CHRONICLE_PLACES 等全局（按需注入）
 * 发布：window.ChronGeo
 *
 * 为什么地理数据也走 <script> 注入而不是写在 index.html 里：
 * basemap + places + 叠加层合计约 340KB，全部首屏加载会把「双击就开」的等待
 * 拉长一倍，而九成读者从不点舆图。所以它们只在第一次打开舆图/地点页时注入，
 * 并且沿用 loader.js 的看门狗纪律——一条 <script> 既不 onload 也不 onerror 时，
 * Promise 必须自己到点判失败，否则界面永远停在「正在载入舆图…」。
 */
(function () {
  "use strict";

  var INJECT_TIMEOUT = window.__CHRONICLE_GEO_TIMEOUT || 8000;
  var FILES = [
    { id: "places", src: "data/geo/places.js", glob: "__CHRONICLE_PLACES" },
    { id: "overlay", src: "data/geo/event-places.js", glob: "__CHRONICLE_EVENT_PLACES" },
    { id: "journeys", src: "data/geo/journeys.js", glob: "__CHRONICLE_JOURNEYS" },
    { id: "basemap", src: "data/geo/basemap.js", glob: "__CHRONICLE_BASEMAP" },
    { id: "snapshots", src: "data/geo/snapshots.js", glob: "__CHRONICLE_SNAPSHOTS", optional: true }
  ];
  var loaded = {}, pending = {}, failed = {};

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("载入超时（" + INJECT_TIMEOUT + "ms 无响应）：" + src));
      }, INJECT_TIMEOUT);
      function settle(fn) {
        return function () {
          clearTimeout(timer);
          if (s.parentNode) s.parentNode.removeChild(s);
          fn();
        };
      }
      s.src = src; s.async = true;
      s.onload = settle(resolve);
      s.onerror = settle(function () { reject(new Error("文件缺失或不可读：" + src)); });
      document.head.appendChild(s);
    });
  }

  function loadOne(f) {
    if (loaded[f.id]) return Promise.resolve(true);
    if (pending[f.id]) return pending[f.id];
    pending[f.id] = injectScript(f.src).then(function () {
      var v = window[f.glob];
      if (v == null) {
        if (f.optional) { loaded[f.id] = true; delete pending[f.id]; return true; }
        throw new Error(f.src + " 已加载但没挂上 " + f.glob);
      }
      loaded[f.id] = true; delete pending[f.id]; delete failed[f.id];
      return true;
    }).catch(function (e) {
      delete pending[f.id];
      failed[f.id] = e.message;
      console.error("[geo] " + e.message);
      return false;
    });
    return pending[f.id];
  }

  /* 只保证 places/overlay/journeys/basemap 到位；快照可选（缺了只是没有大势层）。 */
  function ensure(ids) {
    var want = FILES.filter(function (f) { return !ids || ids.indexOf(f.id) >= 0; });
    return Promise.all(want.map(loadOne)).then(function (rs) {
      var allOk = rs.every(function (v, i) { return v || want[i].optional; });
      /* 索引必须在数据到位的这一刻建：coordFor 只认 byKey，
       * 不建就是「4312 条地理数据在盘上、地图上一条针都不画」。 */
      build();
      return allOk;
    });
  }

  /* ---------- 地名 ---------- */
  var index = null;      // 命中词 -> key（与 tools/geo-lib.mjs 同排序口径）
  var byKey = null;

  function build() {
    var P = window.__CHRONICLE_PLACES;
    if (!P || !P.list) return;
    if (byKey && index) return;          // 建过一次就够，重复调用不重排索引
    byKey = {};
    index = [];
    P.list.forEach(function (p) {
      byKey[p.key] = p;
      (p.keys || []).forEach(function (k) {
        if (k && k.length >= 2) index.push({ k: k, key: p.key, region: p.kind === "region" ? 1 : 0 });
      });
    });
    index.sort(function (a, b) {
      return b.k.length - a.k.length || a.region - b.region || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);
    });
  }
  function places() { return byKey || {}; }
  function placeOf(key) { if (!byKey) build(); return (byKey || {})[key] || null; }

  function resolveToken(tok) {
    if (!index) build();
    for (var i = 0; i < index.length; i++) if (tok.indexOf(index[i].k) >= 0) return index[i].key;
    return null;
  }
  /* 搜索框输入「长安」「今西安」「罗马」都能落到点上。 */
  function resolvePlace(q) {
    if (!q) return null;
    var s = String(q).trim();
    var direct = (byKey || {})[s];
    if (direct) return direct;
    for (var k in (byKey || {})) {
      var p = byKey[k];
      if (p.zh === s || p.modern === s) return p;
      if ((p.keys || []).indexOf(s) >= 0) return p;
    }
    var hit = resolveToken(s);
    return hit ? byKey[hit] : null;
  }

  /* ---------- 事件落点 ---------- */
  var DIR_OFF = { nw: [-0.55, 0.42], ne: [0.55, 0.42], sw: [-0.55, -0.42], se: [0.55, -0.42],
    w: [-0.7, 0], e: [0.7, 0], n: [0, 0.55], s: [0, -0.55], c: [0, 0] };

  function placeKeyFor(ev) {
    var m = window.__CHRONICLE_EVENT_PLACES;
    if (!m) return null;
    var e = m[ev.id];
    return e ? e.p : null;
  }
  /* 返回 {place, coord, approx} —— approx 时界面按区域画软盘，不画精确落针。 */
  function coordFor(ev) {
    var m = window.__CHRONICLE_EVENT_PLACES;
    if (!m) return null;
    if (!byKey) build();
    if (!byKey) return null;
    var e = m[ev.id];
    if (!e) return null;
    var p = byKey[e.p];
    if (!p) return null;
    var off = e.d && DIR_OFF[e.d] ? DIR_OFF[e.d] : [0, 0];
    return {
      place: p,
      coord: [p.coord[0] + off[0], p.coord[1] + off[1]],
      dir: e.d || null,
      approx: !!p.approx || p.kind === "region"
    };
  }

  function eventsAtPlace(key) {
    if (!byKey) build();
    var L = window.ChronLoader, m = window.__CHRONICLE_EVENT_PLACES || {};
    var out = [];
    L.allEvents().forEach(function (e) { if (m[e.id] && m[e.id].p === key) out.push(e); });
    out.sort(function (a, b) { return a.year - b.year || b.weight - a.weight; });
    return out;
  }
  function eventsForPerson(name) {
    var L = window.ChronLoader;
    if (!name) return [];
    return L.allEvents().filter(function (e) {
      return (e.detail.figures || []).some(function (f) { return f === name || f.indexOf(name) >= 0; });
    }).sort(function (a, b) { return a.year - b.year; });
  }

  function journeys() { return window.__CHRONICLE_JOURNEYS || []; }
  function journeyOf(key) {
    var js = journeys();
    for (var i = 0; i < js.length; i++) if (js[i].key === key) return js[i];
    return null;
  }
  function journeyForPerson(name) {
    var js = journeys();
    for (var i = 0; i < js.length; i++) if (js[i].person === name || js[i].zh.indexOf(name) >= 0) return js[i];
    return null;
  }
  /* 行迹站点的坐标与出处；缺地点的站点跳过并由调用方显示警告。 */
  function journeyPoints(j) {
    if (!j) return [];
    return (j.stops || []).map(function (s) {
      var p = placeOf(s.place);
      return { year: s.year, title: s.title, desc: s.desc, ev: s.ev, src: s.src || [],
        place: p, coord: p ? p.coord : null, missing: !p };
    });
  }

  function snapshots() { return window.__CHRONICLE_SNAPSHOTS || []; }
  /* 取「不晚于 year 的最近一幅」大势快照：拖动时间轴时版图随年代换。 */
  function snapshotFor(year) {
    var sn = snapshots().slice().sort(function (a, b) { return a.year - b.year; });
    var hit = null;
    for (var i = 0; i < sn.length; i++) if (sn[i].year <= year) hit = sn[i]; else break;
    return hit;
  }

  function basemap() { return window.__CHRONICLE_BASEMAP || null; }
  /* 水系随年代出现/消失（黄河夺淮、罗布泊干涸）。 */
  function waterFor(year) {
    var b = basemap();
    if (!b || !b.water) return [];
    return b.water.filter(function (w) {
      if (w.appear != null && year < w.appear) return false;
      if (w.vanish != null && year > w.vanish) return false;
      return true;
    });
  }

  function coverage() {
    var L = window.ChronLoader, m = window.__CHRONICLE_EVENT_PLACES || {};
    var evs = L.allEvents(), hit = 0, hi = 0, hiAll = 0;
    evs.forEach(function (e) {
      if (e.weight >= 4) { hiAll++; if (m[e.id]) hi++; }
      if (m[e.id]) hit++;
    });
    return { all: [hit, evs.length], w45: [hi, hiAll] };
  }

  function failedList() { return Object.keys(failed).map(function (k) { return k + "：" + failed[k]; }); }

  window.ChronGeo = {
    ensure: ensure,
    places: places, placeOf: placeOf, resolvePlace: resolvePlace, resolveToken: resolveToken,
    placeKeyFor: placeKeyFor, coordFor: coordFor,
    eventsAtPlace: eventsAtPlace, eventsForPerson: eventsForPerson,
    journeys: journeys, journeyOf: journeyOf, journeyForPerson: journeyForPerson, journeyPoints: journeyPoints,
    snapshots: snapshots, snapshotFor: snapshotFor,
    basemap: basemap, waterFor: waterFor, coverage: coverage, failedList: failedList
  };
})();
