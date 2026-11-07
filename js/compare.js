/* compare.js | 同年中西对照卡：任意年份的双线并置与解读 */
(function () {
  "use strict";

  var L = window.ChronLoader, T = window.ChronTime, S = window.ChronState, M = window.__CHRONICLE_META;
  var PV = window.ChronProv;

  var el = null;

  function ensure() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "cmp-modal";
    el.hidden = true;
    el.innerHTML = '<div class="cmp-card" role="dialog" aria-label="同年中西对照">' +
      '<header><h3>同年中西对照</h3>' +
      '<div class="cmp-nav"><button data-c="prev">←</button>' +
      '<input type="number" id="cmp-year" aria-label="年份（负数为公元前）">' +
      '<button data-c="next">→</button>' +
      '<button data-c="now">今年</button>' +
      '<button data-c="close" class="x">✕</button></div></header>' +
      '<div class="cmp-body" id="cmp-body"></div></div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      if (e.target === el) { close(); return; }
      var b = e.target.closest("[data-c],[data-ev]");
      if (!b) return;
      if (b.hasAttribute("data-ev")) { window.ChronDetail.openEvent(b.getAttribute("data-ev")); return; }
      var c = b.getAttribute("data-c");
      if (c === "close") close();
      if (c === "prev") shift(-1);
      if (c === "next") shift(1);
      if (c === "now") render(currentYear());
    });
    el.addEventListener("change", function (e) {
      if (e.target.id === "cmp-year") { var v = parseInt(e.target.value, 10); if (v !== 0 && Number.isFinite(v)) render(v); }
    });
    return el;
  }

  function currentYear() {
    var d = new Date();
    return Math.min(2026, d.getFullYear());
  }

  function stepOf(y) {
    var v = y < 0 ? -y : y;
    if (v >= 1000) return 50;
    if (v >= 200) return 10;
    return 1;
  }

  function shift(dir) {
    var v = window.__cmpYear || currentYear();
    var s = stepOf(v) * dir;
    var n = v + s;
    if (v === -1 && dir > 0) n = 1;
    if (v === 1 && dir < 0) n = -1;
    render(Math.max(M.yearMin, Math.min(M.yearMax, n)));
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function col(track, y) {
    var raw = L.eventsAtYear(track, y);
    var evs = raw.filter(S.passesFilter)
      .sort(function (a, b) { return b.weight - a.weight; });
    var era = T.eraOf(track, y);
    var html = '<section class="cc" style="--c:' + M.tracks[track].color + '">';
    html += '<h4><i style="background:' + M.tracks[track].color + '"></i>' + esc(M.tracks[track].label);
    if (era) html += '<span class="era">' + esc(era.label) + (era.approx ? " ~" : "") + "</span>";
    html += "</h4>";
    if (!evs.length) {
      /* 「此年无收录」只能留给真的没有条目那一年。本列如今跟着筛选实时重画，
       * 读者把溯源门槛拉到「仅已核」时它会被整年筛空——这时说「历史上没有」，
       * 是把「我不给你看」冒充成事实，而这句话恰好出在一个以溯源为名的功能里。 */
      var fv = S.get().provFloor, held = 0;
      if (fv > 0 && window.ChronProv)
        held = raw.filter(function (e) { return ChronProv.rankOf(e) < fv; }).length;
      html += '<div class="none">' + (!raw.length ? "此年无收录条目。"
        : held === raw.length
          ? "此年有 " + raw.length + " 条记载，全部被溯源门槛筛掉——现在只看「" +
            esc(ChronProv.floorLabel(fv)) + "」及以上。"
          : "此年有 " + raw.length + " 条记载，被当前筛选条件（维度／轨道／重要度／时间区间）全部筛掉。") + "</div>";
      var near = [];
      for (var i = 1; i <= 200 && !near.length; i++) {
        near = L.eventsAtYear(track, y - i).concat(L.eventsAtYear(track, y + i)).filter(S.passesFilter);
      }
      if (near.length) {
        html += '<div class="near">最近有记载：' + esc(T.formatYear(near[0].year, { approx: near[0].yearApprox })) + "</div>";
        html += list(near.slice(0, 3));
      }
    } else {
      html += list(evs);
    }
    return html + "</section>";
  }

  function list(evs) {
    return '<ul class="cl">' + evs.map(function (e) {
      var d = M.dimensions[e.dim];
      return '<li data-ev="' + esc(e.id) + '"><i style="background:' + d.color + '"></i>' +
        "<b>" + esc(e.title) + (PV ? PV.badge(e) : "") + "</b><span>" + esc(e.summary) + "</span></li>";
    }).join("") + "</ul>";
  }

  function dimsSummary(evs) {
    var g = {};
    evs.forEach(function (e) { g[e.dim] = (g[e.dim] || 0) + 1; });
    return M.dimOrder.filter(function (d) { return g[d]; })
      .map(function (d) { return M.dimensions[d].label + "×" + g[d]; }).join("、") || "—";
  }

  /* 关联边：无向去重 + 跨线与同轨分开裁
   * 两条实测理由（2026-09-22，全库 5661 条有向 related）：
   *   · 盘上 related 双向落库，按有向键去重会把 A↔B 与 B↔A 各列一次（全库 325 对），
   *     旧实现因此把将近一半可见槽位花在同一件事上；
   *   · 旧实现按「先中轨后世界轨」的插入顺序截前 10 条，59 个有跨线边的年份里有 32 年
   *     的跨线边被同轨边整年挤出列表——而对照视图的存在理由恰恰就是这条跨线连接。
   * 上限：CROSS_MAX 取实测年度峰值 6 的余量档（真实语料下不该截掉任何一条跨线边），
   * 同轨边 p90=10、峰值 39，故截断必须配一句「另有 N 条未显示」，不能静默。 */
  var CROSS_MAX = 12, SAME_MAX = 8;

  /* 权重高的一端在前：行的呈现次序不能取决于 related 落库时谁先被遍历到 */
  function orient(a, b) {
    return b.weight > a.weight || (b.weight === a.weight && b.year < a.year) ? { from: b, to: a } : { from: a, to: b };
  }

  function relLinks(evs) {
    var cross = [], same = [], seen = {};
    evs.forEach(function (e) {
      (e.related || []).forEach(function (rid) {
        var r = L.eventById(rid);
        if (!r || r.id === e.id) return;
        var key = [e.id, r.id].sort().join("|");
        if (seen[key]) return;
        seen[key] = 1;
        (e.track === r.track ? same : cross).push(orient(e, r));
      });
    });
    var byWeight = function (p, q) {
      return q.from.weight - p.from.weight || q.to.weight - p.to.weight || p.from.year - q.from.year;
    };
    return { cross: cross.sort(byWeight), same: same.sort(byWeight) };
  }

  function linkBlock(title, links, max, withTrack) {
    if (!links.length) return "";
    var shown = links.slice(0, max);
    var tag = function (e) { return withTrack ? M.tracks[e.track].short + "·" : ""; };
    return '<div class="para"><h5>' + esc(title) + "</h5><ul class=\"cl\">" +
      shown.map(function (k) {
        return '<li data-ev="' + esc(k.to.id) + '"><i style="background:' + M.dimensions[k.from.dim].color + '"></i>' +
          "<b>" + esc(tag(k.from) + k.from.title + " ↔ " + tag(k.to) + k.to.title) + "</b>" +
          "<span>" + esc(T.formatYear(k.from.year, { approx: k.from.yearApprox })) + " ／ " +
          esc(T.formatYear(k.to.year, { approx: k.to.yearApprox })) + "</span></li>";
      }).join("") + "</ul>" +
      (links.length > shown.length ? '<div class="cmp-more">另有 ' + (links.length - shown.length) + " 条关联未显示</div>" : "") +
      "</div>";
  }

  function render(y) {
    ensure();
    window.__cmpYear = y;
    var input = document.getElementById("cmp-year");
    input.value = y < 0 ? y : y;
    input.placeholder = "公元前用负数";
    var cnE = T.eraOf("cn", y), wdE = T.eraOf("world", y);
    var p = T.polityOf(y);
    var head = '<div class="cmp-head"><div class="big">' + esc(T.formatYear(y)) + "</div>" +
      '<div class="sub">' + esc(T.formatCentury(y)) +
      (p.main ? " · " + esc(p.main.label) : "") +
      (p.coeval.length ? " · 并立 " + esc(p.coeval.map(function (x) { return x.label; }).join("、")) : "") +
      "</div></div>";

    var cn = L.eventsAtYear("cn", y).filter(S.passesFilter);
    var wd = L.eventsAtYear("world", y).filter(S.passesFilter);

    /* 关联边：跨线（中国↔世界）与同轨分列，标题与内容对齐 */
    var links = relLinks(cn.concat(wd));

    var html = head;
    html += '<div class="cmp-grid">' + col("cn", y) + col("world", y) + "</div>";
    html += '<div class="cmp-notes"><div><span>中国维度构成</span>' + esc(dimsSummary(cn)) + "</div>" +
      "<div><span>世界维度构成</span>" + esc(dimsSummary(wd)) + "</div>" +
      "<div><span>时代带</span>" + esc((cnE ? cnE.label : "—") + " ／ " + (wdE ? wdE.label : "—")) + "</div></div>";
    html += linkBlock("跨线关联（中国 ↔ 世界）", links.cross, CROSS_MAX, true);
    html += linkBlock("同轨关联", links.same, SAME_MAX, false);
    html += '<div class="cmp-acts"><button data-year="' + y + '" id="cmp-open-year">打开 ' + esc(T.formatYear(y)) + ' 完整档案页 →</button>' +
      "<button id=\"cmp-fly\">在时间轴定位</button></div>";

    document.getElementById("cmp-body").innerHTML = html;
    document.getElementById("cmp-open-year").onclick = function () { ChronDetail.openYear(y); close(); };
    document.getElementById("cmp-fly").onclick = function () {
      ChronTimeline.flyToYear(y, 40); close();
      S.patch({ selectedYear: y });
    };
    el.hidden = false;
    el.classList.add("open");
  }

  function close() {
    if (el) {
      el.hidden = true;
      el.classList.remove("open");
      /* 同主题线：#/compare/<y> 是 router 认得的地址，留着它刷新就把已经关掉的一层再弹回来。 */
      window.ChronRouter.resetHash(["#/compare"]);
    }
  }
  function isOpen() { return !!el && !el.hidden; }
  function open() { render(window.__cmpYear || currentYear()); }

  /* 对照两列同样按 passesFilter 挑条目，此前却只在打开那一刻画一次：
   * 读者改完门槛再回头看对照，看到的还是改之前那一批。重画判据与 passesFilter
   * 的键集由 state.js 的 filterChanged 单点给出，这里不再抄第二份清单。 */
  S.subscribe(function (s, ch) {
    if (isOpen() && S.filterChanged(ch)) render(window.__cmpYear || currentYear());
  });

  /* relLinks 与上限一并导出：门禁要拿真实语料验「跨线边一条都不许被挤掉」，
   * 关在闭包里就只能靠读代码相信了。 */
  window.ChronCompare = {
    open: open, render: render, close: close, isOpen: isOpen,
    relLinks: relLinks, CROSS_MAX: CROSS_MAX, SAME_MAX: SAME_MAX,
  };
})();
