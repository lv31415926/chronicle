/* places.js | 地点页与人物页：把「一个地方 4000 年」「一个人一生」铺成可通读的流
 * 依赖：window.ChronGeo / ChronLoader / ChronTime / ChronState / ChronProv / ChronDetail / ChronRiver / ChronAtlas
 * 发布：window.ChronPlaces
 *
 * 为什么不新建一套列表渲染：详情抽屉（detail.js）与长河（river.js）已经把「一条事件
 * 怎么摆、溯源标签怎么挂」定下来了。地点页只做三件事——给元信息、按时代分组、
 * 把行交给既有渲染。另写一套卡片样式，等于给同一个字段准备两份将来会各自腐化的排版。
 */
(function () {
  "use strict";

  var panel = null, body = null, head = null, kind = null, key = null;
  /* 同 atlas：地理分片没到位时 close() 面对的是还没现形的面板，这一旗接住那次「关」 */
  var wantOpen = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot" }[c];
    });
  }

  function ensure() {
    if (panel) return;
    panel = document.createElement("aside");
    panel.id = "place";
    panel.className = "place-drawer";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "地点与人物");
    panel.innerHTML =
      '<header class="pl-head">' +
        '<div class="pl-crumb" id="pl-crumb"></div>' +
        '<div class="pl-tools">' +
          '<button data-act="map" title="在舆图上定位">舆图</button>' +
          '<button data-act="river" title="铺成全屏长河">长河</button>' +
          '<button data-act="link" title="复制本页链接">分享链接</button>' +
          '<button data-act="close" title="关闭 (Esc)">✕</button>' +
        "</div>" +
      "</header>" +
      '<div class="pl-body" id="pl-body" tabindex="0"></div>';
    document.body.appendChild(panel);
    head = panel.querySelector("#pl-crumb");
    body = panel.querySelector("#pl-body");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act],[data-ev],[data-place],[data-journey]");
      if (!b) return;
      if (b.hasAttribute("data-ev")) { window.ChronDetail.openEvent(b.getAttribute("data-ev")); return; }
      if (b.hasAttribute("data-place")) { openPlace(b.getAttribute("data-place")); return; }
      if (b.hasAttribute("data-journey")) { openPerson(b.getAttribute("data-journey")); return; }
      var a = b.getAttribute("data-act");
      if (a === "close") close();
      else if (a === "map") toMap();
      else if (a === "river") toRiver();
      else if (a === "link") copyLink();
    });
  }

  function rows(evs, limit) {
    var T = window.ChronTime, M = window.__CHRONICLE_META, PV = window.ChronProv;
    if (!evs.length) return '<div class="pl-none">这个地点在本库还没有可落点的条目。' +
      "可能是地名表还没收到它——顶栏「纠错投稿」可以补，或跑 <code>node tools/geo-candidates.mjs</code> 看缺口。</div>";
    var groups = {}, order = [];
    evs.forEach(function (e) {
      var era = T.eraOf(e.track, e.year);
      var g = era ? era.id : (e.year < 0 ? "bc" : "ad");
      if (!groups[g]) { groups[g] = { label: era ? era.label : g, items: [] }; order.push(g); }
      groups[g].items.push(e);
    });
    return order.map(function (g) {
      var s = groups[g];
      return '<section class="pl-sec"><h4>' + esc(s.label) +
        '<span class="pl-n">' + s.items.length + " 条</span></h4>" +
        s.items.slice(0, limit || 40).map(function (e) {
          var d = M.dimensions[e.dim], tk = M.tracks[e.track];
          return '<div class="pl-it" data-ev="' + esc(e.id) + '">' +
            '<span class="pl-y">' + esc(T.formatYearShort(e.year, e.yearApprox)) + "</span>" +
            '<span class="pl-g" style="color:' + d.color + '">' + d.glyph + "</span>" +
            '<span class="pl-c"><b>' + esc(e.title) + "</b>" + (PV ? PV.badge(e) : "") +
            '<span class="pl-m"><i style="color:' + tk.color + '">' + esc(tk.short) + "</i> " +
            esc(e.summary) + "</span></span>" +
            '<span class="pl-w">' + "★".repeat(e.weight) + "</span></div>";
        }).join("") +
        (s.items.length > (limit || 40) ? '<div class="pl-more">本节另有 ' + (s.items.length - (limit || 40)) + " 条未列出</div>" : "") +
        "</section>";
    }).join("");
  }

  function currentEvents() {
    var L = window.ChronLoader;
    if (kind === "place") return window.ChronGeo.eventsAtPlace(key);
    if (kind === "person") {
      var j = window.ChronGeo.journeyOf(key);
      var byEv = {};
      var out = [];
      (j ? j.stops : []).forEach(function (s) {
        if (s.ev) { var e = L.eventById(s.ev); if (e) { byEv[e.id] = 1; out.push(e); } }
      });
      var more = window.ChronGeo.eventsForPerson(j ? j.person : key).filter(function (e) { return !byEv[e.id]; });
      return out.concat(more).sort(function (a, b) { return a.year - b.year; });
    }
    return [];
  }

  function metaBlock() {
    var PV = window.ChronProv, T = window.ChronTime;
    var evs = currentEvents();
    var ps = PV ? PV.stats(evs) : null;
    var pvSum = ps ? PV.TIERS.filter(function (t) { return ps[t.key] > 0; })
      .map(function (t) { return t.label + " " + ps[t.key]; }).join(" · ") : "";
    if (kind === "place") {
      var p = window.ChronGeo.placeOf(key);
      if (!p) return '<div class="pl-none">地名表里没有 <code>' + esc(key) + "</code>。</div>";
      return '<div class="pl-meta">' +
        '<h3>' + esc(p.zh) + '<small>' + esc(p.modern || "") + "</small></h3>" +
        '<div class="pl-line">别名：' + esc((p.keys || []).join("、")) + "</div>" +
        '<div class="pl-line">坐标：' + p.coord[0].toFixed(2) + "°E, " + p.coord[1].toFixed(2) + "°N" +
        (p.approx ? ' <span class="pl-warn">区域条目（语料只给到省域，界面按软盘画，不给精确落针）</span>' : "") + "</div>" +
        '<div class="pl-line">类型：' + esc(p.kind) + (p.note ? " ｜ " + esc(p.note) : "") + "</div>" +
        '<div class="pl-line">出处：' + (p.sources || []).map(function (s) { return "<code>" + esc(s) + "</code>"; }).join(" ") + "</div>" +
        '<div class="pl-line">本库落点：<b>' + evs.length + "</b> 条" +
        (evs.length ? " ｜ " + esc(T.formatYearShort(evs[0].year)) + " — " + esc(T.formatYearShort(evs[evs.length - 1].year)) : "") +
        (pvSum ? ' <span class="pl-pv">溯源：' + esc(pvSum) + "</span>" : "") + "</div>" +
        "</div>";
    }
    var j = window.ChronGeo.journeyOf(key);
    if (!j) return '<div class="pl-none">没有名为 <code>' + esc(key) + "</code> 的行迹。</div>";
    var stops = window.ChronGeo.journeyPoints(j);
    var miss = stops.filter(function (s) { return s.missing; });
    return '<div class="pl-meta">' +
      "<h3>" + esc(j.zh) + "<small>" + esc(j.person) + "</small></h3>" +
      '<div class="pl-line">' + esc(j.note || "") + "</div>" +
      '<div class="pl-line">出处：' + (j.sources || []).map(function (s) { return "<code>" + esc(s) + "</code>"; }).join(" ") + "</div>" +
      '<div class="pl-line">站点：' + stops.map(function (s, i) {
        return '<button data-stop="' + i + '" title="' + esc(s.title) + '">' + (i + 1) + " " +
          esc(s.place ? s.place.zh : "？") + "</button>";
      }).join("") + "</div>" +
      (miss.length ? '<div class="pl-warn">' + miss.length + " 站的地点没在地名表里，舆图会跳过它们。</div>" : "") +
      '<div class="pl-stops">' + stops.map(function (s, i) {
        return '<div class="pl-stop" data-stop="' + i + '">' +
          '<span class="pl-sn">' + (i + 1) + "</span>" +
          '<span class="pl-sy">' + esc(window.ChronTime.formatYearShort(s.year)) + "</span>" +
          '<span class="pl-sc"><b>' + esc(s.title) + "</b>" +
          (s.place ? '<i data-place="' + esc(s.place.key) + '">' + esc(s.place.zh) + " · " + esc(s.place.modern) + "</i>" : "") +
          '<span>' + esc(s.desc || "") + "</span>" +
          (s.ev ? '<code data-ev="' + esc(s.ev) + '">语料 ' + esc(s.ev) + "</code>" :
                  (s.src || []).map(function (x) { return "<code>" + esc(x) + "</code>"; }).join(" ")) +
          "</span></div>";
      }).join("") + "</div>" +
      "</div>";
  }

  function render() {
    if (!panel) return;
    var L = window.ChronLoader;
    head.textContent = kind === "place"
      ? "地点 · " + (window.ChronGeo.placeOf(key) || {}).zh
      : "人物行迹 · " + ((window.ChronGeo.journeyOf(key) || {}).person || key);
    body.innerHTML = metaBlock() + "<div class='pl-list'>" + rows(currentEvents(), 60) + "</div>";
    body.scrollTop = 0;
    void L;
  }

  /* 三种结局必须分开说：true＝开着、false＝地理层没到货（调用方要当场讲一句话）、
   * "cancelled"＝读者在加载期已经走了（什么也不用说）。把第二种和第三种压成同一个
   * falsy，读者走开了却收到「地理数据没载入」——那是把人的动作报成系统的故障。 */
  function openPlace(k, year) {
    ensure();
    wantOpen = true;
    return window.ChronGeo.ensure(["places", "overlay", "journeys"]).then(function (okAll) {
      if (!wantOpen) return "cancelled";
      if (!okAll) return false;
      kind = "place"; key = k;
      panel.hidden = false;
      document.body.classList.add("place-open");
      render();
      if (year != null) window.ChronAtlas.jumpYear(Number(year));
      return true;
    });
  }
  function openPerson(k) {
    ensure();
    wantOpen = true;
    return window.ChronGeo.ensure(["places", "overlay", "journeys"]).then(function (okAll) {
      if (!wantOpen) return "cancelled";
      if (!okAll) return false;
      kind = "person"; key = k;
      panel.hidden = false;
      document.body.classList.add("place-open");
      render();
      return true;
    });
  }
  function close() {
    wantOpen = false;
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove("place-open");
    /* 舆图上点一个地名就是把地址换成 #/place/…：抽屉收了却留着地址，
     * 刷新一次地点页自己就弹回来，读者以为刚才没关掉。 */
    window.ChronRouter.resetHash(["#/place", "#/person"]);
  }
  function isOpen() { return !!panel && !panel.hidden; }

  function toMap() {
    if (kind === "place") window.ChronAtlas.open({ place: key, year: (currentEvents()[0] || {}).year });
    else window.ChronAtlas.open({ journey: key });
  }
  function toRiver() {
    var evs = currentEvents();
    window.ChronRiver.open({ ids: evs.map(function (e) { return e.id; }),
      label: (kind === "place" ? "地点：" : "行迹：") + key });
  }
  function copyLink() {
    var h = location.href.split("#")[0] + (kind === "place" ? "#/place/" : "#/person/") + encodeURIComponent(key);
    if (navigator.clipboard) navigator.clipboard.writeText(h).then(function () {
      window.ChronDetail.flash && window.ChronDetail.flash("已复制本页链接", 2000);
    });
    else window.ChronDetail.flash && window.ChronDetail.flash(h, 6000);
  }

  window.ChronPlaces = {
    openPlace: openPlace, openPerson: openPerson, close: close, isOpen: isOpen, render: render,
    currentEvents: currentEvents
  };
})();
