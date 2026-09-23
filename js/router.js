/* router.js | hash 路由：#/timeline  #/event/<id>  #/year/<y>  #/theme/<id>  #/compare/<y> */
(function () {
  "use strict";

  function parse(h) {
    h = (h || "").replace(/^#\/?/, "");
    var seg = h.split("/").filter(Boolean);
    if (!seg.length) return { name: "timeline", params: {} };
    var name = seg[0];
    if (name === "event" && seg[1]) return { name: "event", params: { id: decodeURIComponent(seg.slice(1).join("/")) } };
    if (name === "year" && seg[1] !== undefined) return { name: "year", params: { year: Number(seg[1]) } };
    if (name === "theme" && seg[1]) return { name: "theme", params: { id: seg[1] } };
    if (name === "compare") return { name: "compare", params: { year: seg[1] ? Number(seg[1]) : null } };
    if (name === "view" && seg[1] && seg[2]) return { name: "view", params: { from: Number(seg[1]), to: Number(seg[2]) } };
    if (name === "river") return { name: "river", params: { query: seg[1] ? decodeURIComponent(seg.slice(1).join("/")) : "" } };
    return { name: "timeline", params: {} };
  }

  function apply(r) {
    var L = window.ChronLoader, S = window.ChronState;
    if (r.name === "event") {
      var ev = L.eventById(r.params.id);
      if (!ev) {
        /* 补完全部分片再认一次；仍没有就必须说一句话——静默不动会让
         * 「链接错了」看起来像「页面坏了」。 */
        L.ensureAll().then(function () {
          window.ChronTimeline.invalidate();
          var e2 = L.eventById(r.params.id);
          if (!e2) { ChronDetail.flash("链接指向的条目不存在：" + r.params.id, 5000); return; }
          ChronDetail.openEvent(e2.id); ChronTimeline.flyToYear(e2.year, 30); ChronTimeline.pulseEvent(e2.id);
        }).catch(function (e) {
          ChronDetail.flash("数据未就绪，打不开该条目（" + e.message + "）", 5000);
        });
        return;
      }
      ChronDetail.openEvent(ev.id);
      ChronTimeline.flyToYear(ev.year, Math.max(14, S.get().view.to - S.get().view.from));
      ChronTimeline.pulseEvent(ev.id);
    } else if (r.name === "year") {
      ChronDetail.openYear(r.params.year);
      ChronTimeline.flyToYear(r.params.year, Math.max(24, S.get().view.to - S.get().view.from));
    } else if (r.name === "theme") {
      ChronThemes.openById(r.params.id);
    } else if (r.name === "compare") {
      ChronCompare.render(r.params.year || new Date().getFullYear());
    } else if (r.name === "view") {
      ChronTimeline.zoomToRange(r.params.from, r.params.to);
    } else if (r.name === "river") {
      if (!window.ChronRiver) return;
      var q = r.params.query;
      if (!q) { ChronRiver.open({}); return; }
      /* 长河按检索命中铺流，分片没载入全就会永久少节点，先补片再开 */
      ChronRiver.open({ query: q, label: "检索：" + q });
      window.ChronLoader.ensureAll().then(function () { ChronRiver.render(); });
    }
  }

  var pending = false;
  function handle() {
    var r = parse(location.hash);
    window.ChronState.patch({ route: r });
    if (!window.ChronTimeline.viewport) { pending = true; return; }
    apply(r);
  }

  function init() {
    window.addEventListener("hashchange", handle);
    /* 数据在启动后才就绪：首帧路由延后到 ready 信号 */
    window.addEventListener("chronicle:ready", function () {
      if (pending) { pending = false; handle(); }
    });
    if (location.hash) handle();
  }

  function go(hash) {
    if (location.hash === hash) handle();
    else location.hash = hash;
  }

  window.ChronRouter = { init: init, parse: parse, go: go, handle: handle };
})();
