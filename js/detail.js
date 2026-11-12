/* detail.js | 事件详情抽屉 / 年份档案页 / 同年中西对照 */
(function () {
  "use strict";

  var L = window.ChronLoader, T = window.ChronTime, S = window.ChronState, M = window.__CHRONICLE_META;
  var PV = window.ChronProv;

  var panel, body, mode = null, busy = false;

  function ensure() {
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = "detail";
    panel.className = "detail";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "详情");
    panel.innerHTML =
      '<header class="d-head"><div class="d-crumb" id="d-crumb"></div>' +
      '<div class="d-tools">' +
      '<button data-act="prev" title="上一条 (←)">←</button>' +
      '<button data-act="next" title="下一条 (→)">→</button>' +
      '<button data-act="pin" title="在新路由打开">分享链接</button>' +
      '<button data-act="close" title="关闭 (Esc)">✕</button>' +
      "</div></header>" +
      '<div class="d-body" id="d-body" tabindex="0"></div>';
    document.body.appendChild(panel);
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act],[data-ev],[data-year],[data-dim],[data-tag],[data-tl],[data-tk],[data-st],[data-st-person],[data-st-loadall],[data-ch],[data-ch-loadall],[data-an-year],[data-an-juan]");
      if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "close") { close(); history.back && location.hash && (location.hash = "#/timeline"); return; }
      if (act === "prev" || act === "next") { step(act === "next" ? 1 : -1); return; }
      if (act === "pin") { copyLink(); return; }
      if (act === "prov-all") { S.patch({ provFloor: 0 }); return; }
      if (b.hasAttribute("data-ev")) { openEvent(b.getAttribute("data-ev")); return; }
      if (b.hasAttribute("data-year")) { openYear(Number(b.getAttribute("data-year"))); return; }
      if (b.hasAttribute("data-dim")) { S.soloDim(b.getAttribute("data-dim")); return; }
      if (b.hasAttribute("data-tag")) { window.ChronSearch && ChronSearch.query(b.getAttribute("data-tag")); return; }
      if (b.hasAttribute("data-tl")) { window.ChronThemes && ChronThemes.openById(b.getAttribute("data-tl")); return; }
      if (b.hasAttribute("data-tk")) { window.ChronState && S.soloTrack(b.getAttribute("data-tk")); return; }
      /* 故事卡上的 st-* 是这个模块看不懂的记号，交回故事层处置；
       * 判据放在最后一条，前面的 data-ev 之类才不会把故事的跳转抢走。 */
      if (window.ChronStory && ChronStory.handleDetailClick(b)) return;
      /* 涟漪卡上的 ch-* 同样归涟漪层：data-ch 要开的是抽屉里的某一条链。 */
      if (window.ChronChain && ChronChain.handleDetailClick(b)) return;
      /* 编年原文行上的 an-* 归编年层：点卷次开的是「只看这一卷」，点年份开的是全年编年。 */
      if (window.ChronAnnals && ChronAnnals.handleDetailClick(b)) return;
    });
    /* 面板只在这里建一次，订阅也只挂一次。
     * 重画判据向 state.js 的 filterChanged 要：它恰好等于 passesFilter 读到的那几个键。
     * 视窗（view）不在其内——拖拽/缩放时每帧都 emit，一并重画会把读者正看着的
     * 那一屏抽回顶部，滚动位置就是这么丢的。 */
    S.subscribe(function (st, changed) {
      if (S.filterChanged(changed)) rerender();
    });
    return panel;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function para(label, text) {
    if (!text) return "";
    return '<div class="para"><h5>' + esc(label) + "</h5><p>" + esc(text) + "</p></div>";
  }
  function chip(text, attr, val, color) {
    return '<button class="chip" ' + attr + '="' + esc(val) + '"' +
      (color ? ' style="border-color:' + color + '55;color:' + color + '"' : "") + ">" + esc(text) + "</button>";
  }
  function wDots(w) {
    var s = "";
    for (var i = 1; i <= 5; i++) s += '<i class="w' + (i <= w ? " on" : "") + '"></i>';
    return '<span class="wts">' + s + "</span>";
  }
  function dimOf(dim) { return M.dimensions[dim]; }

  /* ---------- 事件详情 ---------- */
  function renderEvent(ev) {
    var st = S.get();
    var html = "";
    var d = ev.detail || {};
    html += '<div class="ev-head" style="--tc:' + M.tracks[ev.track].color + '">' +
      '<div class="ev-kicker">' + chip(M.tracks[ev.track].label, "data-tk", ev.track, M.tracks[ev.track].color) +
      chip(dimOf(ev.dim).label, "data-dim", ev.dim, dimOf(ev.dim).color) +
      (PV ? PV.badge(ev) : "") + wDots(ev.weight) + "</div>" +
      "<h2>" + esc(ev.title) + "</h2>" +
      '<div class="ev-meta">' +
      '<button data-year="' + ev.year + '">' + esc(T.formatYear(ev.year, { approx: ev.yearApprox })) + "</button>" +
      "<span>" + esc(T.formatCentury(ev.year)) + "</span>" +
      (d.place ? "<span>" + esc(d.place) + "</span>" : "") +
      (d.state ? "<span>" + esc(d.state) + "</span>" : "") +
      "</div>" +
      '<div class="ev-sum">' + esc(ev.summary) + "</div></div>";

    html += para("背景与缘起", d.background);
    html += para("经过", d.process);
    html += para("影响与意义", d.impact);

    if (d.figures && d.figures.length) {
      html += '<div class="para"><h5>关键人物</h5><div class="chips">' +
        d.figures.map(function (f) { return chip(f, "data-tag", f, M.dimensions.figure.color); }).join("") + "</div></div>";
    }
    if (d.tags && d.tags.length) {
      html += '<div class="para"><h5>标签</h5><div class="chips">' +
        d.tags.map(function (f) { return chip(f, "data-tag", f); }).join("") + "</div></div>";
    }
    /* 溯源块：没有出处也要渲染——「无出处」正是读者最需要被告知的一件事，
     * 整块省掉等于替它遮掉。explain() 说明标签凭什么，checks 说明谁核过。 */
    var cs = PV ? PV.verifiedChecks(ev) : [];
    html += '<div class="para"><h5>史料与出处</h5>' +
      (d.sources && d.sources.length
        ? '<ul class="src">' + d.sources.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>"
        : '<ul class="src"><li>本条目没有登记任何出处。</li></ul>') +
      (PV ? '<div class="pv-line">' + PV.badge(ev) + " " + PV.explain(ev) + "</div>" : "") +
      "</div>";
    if (cs.length) {
      html += '<div class="para"><h5>核对记录</h5><ul class="checks">' +
        cs.map(function (c) {
          return '<li><span class="who">' + esc(c.by) + "</span> 于 <code>" + esc(c.at) + "</code>" +
            (c.note ? "：" + esc(c.note) : "（未写明核对结论）") + "</li>";
        }).join("") + "</ul></div>";
    }
    /* 投稿入口挂在出处之后：读者刚看完「这条查到哪儿」，正是手上可能有出处的人。
     * ChronContribute 晚于本文件加载，只能在渲染时懒取；它缺席就整条不画，
     * 留两个点了没反应的按钮比不画更糟。 */
    if (window.ChronContribute) html += ChronContribute.bar(ev);

    /* 小故事挂在出处与投稿之后、同年对照之前：读者先看完「这条凭什么」，
     * 再读本站的复述，顺序反了就成了先讲故事再补出处。同样懒取、缺席不画。 */
    if (window.ChronStory) html += ChronStory.block(ev);

    /* 涟漪挂在小故事之后：小故事说的是「当时那人手上是什么情形」，涟漪说的是
     * 「这件事后来牵动了什么」，顺序反了就成了先讲余波再讲本体。同样懒取、缺席不画。 */
    if (window.ChronChain) html += ChronChain.block(ev);

    /* 明史编年挂在涟漪之后、同年对照之前：这一层给的是史料原文而不是本站转述，
     * 读者读完本站写的几条，再看当年那句原话是怎么写的。同样懒取、缺席不画。 */
    if (window.ChronAnnals) html += ChronAnnals.block(ev);

    /* 同年对照 */
    html += compareBlock(ev);

    /* 关联 */
    var rel = (ev.related || []).map(function (i) { return L.eventById(i); }).filter(Boolean);
    if (rel.length) {
      html += '<div class="para"><h5>相关条目</h5><ul class="list">' +
        rel.map(function (e) { return rowFor(e, true); }).join("") + "</ul></div>";
    }

    /* 上下文窗口 ±5 年 */
    html += contextBlock(ev);

    /* 此后：三年后 / 三十年后 / 这些人后来 */
    html += laterBlock(ev);

    /* 主题线归属 */
    var ths = window.ChronThemes ? ChronThemes.ofEvent(ev.id) : [];
    if (ths.length) {
      html += '<div class="para"><h5>所属主题时间线</h5><div class="chips">' +
        ths.map(function (t) { return chip(t.label, "data-tl", t.id); }).join("") + "</div></div>";
    }

    html += '<div class="d-foot"><code class="id">' + esc(ev.id) + "</code>" +
      (ev._chunk ? '<span>分片 ' + esc(ev._chunk) + "</span>" : "") + "</div>";
    return html;
  }

  function rowFor(e, withTrack) {
    var d = dimOf(e.dim);
    /* 混轨列表必须标轨：两岸常对同一件事各立一条（如入世在中/世两轨各一条），
     * 不标就会被读成同轨的两件事。单轨块（同年对照）已由 h5 说明轨道，不重复标。 */
    var tag = withTrack ? M.tracks[e.track].short + "·" : "";
    return '<li class="ev" data-ev="' + esc(e.id) + '">' +
      '<i class="dot" style="background:' + d.color + '"></i>' +
      "<b>" + esc(tag + e.title) + (PV ? PV.badge(e) : "") + "</b>" +
      '<span class="yr">' + esc(T.formatYear(e.year, { approx: e.yearApprox })) + "</span>" +
      '<span class="sm">' + esc(e.summary) + "</span></li>";
  }

  function compareBlock(ev) {
    var other = ev.track === "cn" ? "world" : "cn";
    var same = L.eventsAtYear(other, ev.year).filter(S.passesFilter);
    var near = [];
    if (!same.length) {
      for (var i = 1; i <= 60 && !near.length; i++) {
        near = L.eventsAtYear(other, ev.year - i).concat(L.eventsAtYear(other, ev.year + i)).filter(S.passesFilter);
      }
    }
    var list = same.length ? same : near;
    var head = same.length ? "同年·" + M.tracks[other].label : "邻近·" + M.tracks[other].label;
    if (!list.length) return "";
    list = list.slice().sort(function (a, b) { return b.weight - a.weight; }).slice(0, 8);
    return '<div class="para cmp"><h5>' + esc(head) + "</h5><ul class=\"list\">" +
      list.map(function (e) { return rowFor(e, false); }).join("") + "</ul></div>";
  }

  function contextBlock(ev) {
    var out = [];
    for (var d = -5; d <= 5; d++) {
      if (!d) continue;
      var y = ev.year + d;
      if (y < M.yearMin || y > M.yearMax) continue;
      L.allEventsAtYear(y).filter(S.passesFilter).forEach(function (e) {
        if (Math.abs(d) <= 1 || e.weight >= 4) out.push(e);
      });
    }
    if (!out.length) return "";
    out.sort(function (a, b) { return a.year - b.year || b.weight - a.weight; });
    return '<div class="para"><h5>前后 ±5 年</h5><ul class="list tight">' +
      out.slice(0, 16).map(function (e) {
        var d = dimOf(e.dim);
        return '<li class="ev" data-ev="' + esc(e.id) + '"><i class="dot" style="background:' + d.color + '"></i>' +
          "<b>" + esc(M.tracks[e.track].short + "·" + e.title) + (PV ? PV.badge(e) : "") + '</b><span class="yr">' + esc(T.formatYear(e.year, { approx: e.yearApprox })) + "</span></li>";
      }).join("") + "</ul></div>";
  }

  /* 「此后」钩子：把一条详情读成五条的入口。候选全部由年序与人物名现算，不读 related
   * ——跨轨 related 边只占 2.8%，若拿它当依据，大多数条目这一格永远空着。
   * 三条纪律：
   * ① 窗口里没有候选就不出这一格，绝不拿二十年后的事来充当「三年后」；
   * ② 标题只承诺窗口，行内给实年，读者可以自己验算年差；
   * ③ 排的是时间不是因果，所以文末必须写明这一点（因果是另一层的事，要带出处才敢说）。 */
  function ahead(ev, lo, hi, opts) {
    opts = opts || {};
    var out = [];
    var list = L.eventsIn(ev.year + lo, ev.year + hi);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.id === ev.id || (opts.exclude && opts.exclude[e.id])) continue;
      if (!opts.crossTrack && e.track !== ev.track) continue;
      if (opts.sameDim && e.dim !== ev.dim) continue;
      if (!S.passesFilter(e)) continue;
      out.push(e);
    }
    if (opts.farFirst) {
      out.sort(function (a, b) { return b.year - a.year || b.weight - a.weight; });
    } else {
      out.sort(function (a, b) { return a.year - b.year || b.weight - a.weight; });
    }
    return out;
  }

  /* 三格各取多少：3 / 2 / 3。抽成一张表，测试与界面读的是同一份，
   * 免得「界面写 3、测试写 2」这种两边各自成立的样子。 */
  var LATER_CAPS = { three: 3, thirty: 2, people: 3 };

  /* 三格的时间窗（年差，含两端）。抽成一张表而不是写死在调用处：名额只有两三个，
   * 把上界偷偷放宽未必挤得进结果，测试照旧全绿——表与测试各写一份年份，改表必红才拦得住。 */
  var LATER_WINDOWS = { three: [1, 3], thirty: [4, 30], people: [1, 30] };

  /* 选候选：只挑，不渲染。窗口边界、自身排除、同轨/同维、溯源门槛、三格互不重复
   * 这五件事全在这里，所以单测可以把它整个跑一遍而不必造 DOM。 */
  function laterPick(ev) {
    var W = LATER_WINDOWS;
    var three = ahead(ev, W.three[0], W.three[1], {});
    var seen = {};
    var out = { three: three.slice(0, LATER_CAPS.three), thirty: [], people: [] };
    out.three.forEach(function (e) { seen[e.id] = 1; });

    /* 「三十年后」从窗口远端取起。若仍按最近的先取，这一格永远只会给出「四年后、五年后」，
     * 标题上的「三十年」就成了空话——读者点开一看，离本条才四年，那前面两句真话也不可信了。
     * 选远端、再按年序显示：承诺的是年代，读起来还是编年。 */
    var thirty = ahead(ev, W.thirty[0], W.thirty[1], { sameDim: true, exclude: seen, farFirst: true });
    out.thirty = thirty.slice(0, LATER_CAPS.thirty);
    out.thirty.sort(function (a, b) { return a.year - b.year || b.weight - a.weight; });
    out.thirty.forEach(function (e) { seen[e.id] = 1; });

    var figs = {};
    ((ev.detail && ev.detail.figures) || []).forEach(function (f) { figs[f] = 1; });
    if (Object.keys(figs).length) {
      var cand = ahead(ev, W.people[0], W.people[1], { crossTrack: true, exclude: seen });
      for (var i = 0; i < cand.length && out.people.length < LATER_CAPS.people; i++) {
        var fs = (cand[i].detail && cand[i].detail.figures) || [];
        for (var j = 0; j < fs.length; j++) {
          if (figs[fs[j]]) { out.people.push(cand[i]); seen[cand[i].id] = 1; break; }
        }
      }
    }
    return out;
  }

  function laterEmpty(p) { return !p.three.length && !p.thirty.length && !p.people.length; }

  function laterBlock(ev) {
    var pick = laterPick(ev);
    if (laterEmpty(pick)) return "";

    var parts = [];
    function sub(head, list) {
      if (!list.length) return;
      parts.push('<div class="para"><h5>' + head + '</h5><ul class="list tight">' +
        list.map(function (e) { return rowFor(e, true); }).join("") + "</ul></div>");
    }
    sub("三年后 · 同轨紧接着", pick.three);
    sub("三十年后 · 同轨同维", pick.thirty);
    sub("这些人后来 · 三十年内同名人物", pick.people);

    /* 视窗优先加载时，未来那段分片可能还没到：这时候「窗口里没有」有可能是
     * 「还没载入」，不能把它说成本库没有——照实报载入比例。 */
    var st = L.stats ? L.stats() : null;
    var partial = st && st.totalChunks && st.loadedChunks < st.totalChunks;
    /* 窗口数字一律从 LATER_WINDOWS 取，不在句子里再抄一遍：这一句是对读者的承诺，
     * 表改了话没改，页面就开始报假的年差——而两边各自都「对得上自己的出处」。 */
    var W = LATER_WINDOWS;
    parts.push('<div class="para"><div class="d-hint">「三年后」取本条之后 ' + W.three[0] + '–' + W.three[1] + ' 年的同轨条目，' +
      '「三十年后」取 ' + W.thirty[0] + '–' + W.thirty[1] + ' 年且同一维度（从最远的年开始往回收，所以它真是几十年后），' +
      '「这些人后来」按人物名相交取 ' + W.people[0] + '–' + W.people[1] + ' 年。' +
      '窗口里没有就不列。都是按年序现算的邻近，不是因果。' +
      (partial ? "（全库分片只载入 " + st.loadedChunks + "/" + st.totalChunks +
        "，未载入部分不参与查找。）" : "") + "</div></div>");
    return parts.join("");
  }

  /* ---------- 年份档案页 ---------- */
  function renderYear(y) {
    var st = S.get();
    var raw = L.allEventsAtYear(y);
    var all = raw.filter(S.passesFilter);
    var html = '<div class="yr-head">' +
      "<h2>" + esc(T.formatYear(y)) + "</h2>" +
      '<div class="yr-meta">' + esc(T.yearLabel(y)) + "</div>";
    var cnE = T.eraOf("cn", y), wdE = T.eraOf("world", y);
    html += '<div class="yr-era">' +
      (cnE ? '<span style="--c:' + M.tracks.cn.color + '">中国 ' + esc(cnE.label) + " · " + esc(cnE.sub || "") + "</span>" : "") +
      (wdE ? '<span style="--c:' + M.tracks.world.color + '">世界 ' + esc(wdE.label) + " · " + esc(wdE.sub || "") + "</span>" : "") +
      "</div>";
    html += '<div class="yr-nav">' +
      '<button data-year="' + (y < 0 ? y + 1 : y - 1) + '">← 前一年</button>' +
      '<button data-year="' + (y === -1 ? 1 : y + 1) + '">后一年 →</button>' +
      "</div></div>";

    if (!all.length) {
      /* 「此年暂无收录」只能留给真的没有条目那一年。把「我不给你看」说成
       * 「历史上没有」，在一个以溯源为名的功能上是最不该犯的一种错。 */
      if (!raw.length) {
        html += '<div class="empty-block">此年暂无收录条目。可用 <kbd>[</kbd> <kbd>]</kbd> 跳到最近有记载的年份。</div>';
      } else if (st.provFloor > 0 && PV) {
        var held = raw.filter(function (e) { return PV.rankOf(e) < st.provFloor; }).length;
        html += '<div class="empty-block">此年有 ' + raw.length + ' 条记载，全部被溯源门槛筛掉——' +
          "现在只看「" + esc(PV.floorLabel(st.provFloor)) + "」及以上。其中 " + held +
          " 条并非可疑，只是<b>还没有人登记过核对记录</b>。" +
          '<div class="acts"><button data-act="prov-all">放宽到「全部来源」</button></div></div>';
      } else {
        html += '<div class="empty-block">此年有 ' + raw.length +
          " 条记载，被当前筛选条件（维度／轨道／重要度／时间区间）全部筛掉。</div>";
      }
      return html;
    }
    ["cn", "world"].forEach(function (t) {
      var evs = all.filter(function (e) { return e.track === t; });
      if (!evs.length || !st.tracks[t]) return;
      html += '<section class="tk" data-track="' + t + '"><h4><i class="tkdot" style="background:' +
        M.tracks[t].color + '"></i>' + esc(M.tracks[t].label) + '<span class="cnt">' + evs.length + " 条</span></h4>";
      groupByDimLocal(evs).forEach(function (g) {
        html += '<div class="grp">' + chip(dimOf(g.dim).label, "data-dim", g.dim, dimOf(g.dim).color) +
          "<ul class=\"list\">" + g.items.map(function (e) { return rowFor(e, false); }).join("") + "</ul></div>";
      });
      html += "</section>";
    });
    return html;
  }

  function groupByDimLocal(evs) {
    var g = {};
    evs.forEach(function (e) { (g[e.dim] || (g[e.dim] = [])).push(e); });
    return M.dimOrder.filter(function (d) { return g[d]; }).map(function (d) {
      return { dim: d, items: g[d].sort(function (a, b) { return b.weight - a.weight; }) };
    });
  }

  /* ---------- 开关 ---------- */
  function open(html, which) {
    ensure();
    mode = which;
    body = document.getElementById("d-body");
    body.innerHTML = html;
    body.scrollTop = 0;
    panel.classList.add("open");
    panel.hidden = false;
    document.body.classList.add("detail-open");
    body.focus({ preventScroll: true });
  }

  /* 筛选条件（溯源门槛、维度、轨道、重要度、区间）一变，开着的面板必须重画。
   * 此前面板只在 open 那一刻渲染一次：读者把门槛拉到「仅已核」，抽屉里仍留着
   * 刚才那批未核条目——列了不该列的，比列漏了更难被读者发现。
   * 这里只重画、不写状态：写状态会再触发本回调，等于自己追自己。 */
  function rerender() {
    if (busy || !panel || !panel.classList.contains("open")) return;
    var st = S.get();
    if (mode === "year" && st.selectedYear != null) open(renderYear(st.selectedYear), "year");
    else if (mode === "event" && st.selectedId) {
      var ev = L.eventById(st.selectedId);
      if (ev) open(renderEvent(ev), "event");
    }
  }

  function openEvent(id) {
    ensure();
    var ev = L.eventById(id);
    if (!ev) {
      open('<div class="missing">未找到条目 <code>' + esc(id) + "</code><br>它可能属于尚未加载的分片。" +
           '<div class="acts"><button data-load="1">加载全部分片</button></div></div>', "missing");
      var btn = panel.querySelector('[data-load]');
      /* until：读者点这个按钮是为了这一条。分片一批批取，最坏要十几批才 resolve；
       * 这一条到手就该动，剩下的交给后台补齐，不能为一把钥匙等整串。 */
      if (btn) btn.onclick = function () {
        L.ensureAll(function () { return !!L.eventById(id); }).then(function () {
          ChronTimeline.invalidate(); openEvent(id);
        });
      };
      return;
    }
    document.getElementById("d-crumb").textContent = M.tracks[ev.track].label + " · " + dimOf(ev.dim).label;
    busy = true;
    try {
      S.patch({ selectedId: id, selectedYear: ev.year });
      open(renderEvent(ev), "event");
    } finally { busy = false; }
    if (location.hash !== "#/event/" + id) history.replaceState(null, "", "#/event/" + id);
    announce(ev.title);
  }

  function openYear(y) {
    ensure();
    document.getElementById("d-crumb").textContent = "年份档案";
    busy = true;
    try {
      S.patch({ selectedYear: y, selectedId: null });
      open(renderYear(y), "year");
    } finally { busy = false; }
    if (location.hash !== "#/year/" + y) history.replaceState(null, "", "#/year/" + y);
    announce(T.formatYear(y) + " 档案");
  }

  function close() {
    if (!panel) return;
    panel.classList.remove("open");
    document.body.classList.remove("detail-open");
    setTimeout(function () { if (!panel.classList.contains("open")) panel.hidden = true; }, 180);
    S.patch({ selectedId: null });
    if (location.hash && location.hash !== "#/timeline") history.replaceState(null, "", "#/timeline");
  }

  function isOpen() { return !!panel && panel.classList.contains("open"); }

  /* 同屏内前后翻页：按 weight 与年份排序的可见事件序列 */
  function step(dir) {
    var st = S.get();
    var evs = L.eventsIn(Math.floor(st.view.from), Math.ceil(st.view.to))
      .filter(S.passesFilter)
      .sort(function (a, b) { return a.year - b.year || b.weight - a.weight; });
    if (!evs.length) return;
    var idx = -1;
    if (st.selectedId) idx = evs.findIndex(function (e) { return e.id === st.selectedId; });
    else if (st.selectedYear) {
      idx = evs.findIndex(function (e) { return e.year === st.selectedYear; });
    }
    var n = idx < 0 ? 0 : Math.max(0, Math.min(evs.length - 1, idx + dir));
    openEvent(evs[n].id);
    ChronTimeline.flyToYear(evs[n].year, Math.max(12, st.view.to - st.view.from));
    ChronTimeline.pulseEvent(evs[n].id);
  }

  function copyLink() {
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { flash("链接已复制"); }, function () { flash(url, 4000); });
    } else flash(url, 4000);
  }

  function flash(msg, ms) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 1600);
  }

  function announce(text) {
    var r = document.getElementById("live");
    if (r) r.textContent = text;
  }

  window.ChronDetail = {
    openEvent: openEvent, openYear: openYear, close: close, isOpen: isOpen, step: step,
    flash: flash, get mode() { return mode; },
    /* 选候选这一段是纯算式（只读 Loader/State），留给单测：窗口边界、自身排除、
     * 同轨同维、溯源门槛、三格互不重复——这几条错了页面不会报错，
     * 只会静默给出一个假邻近或悄悄少一格。 */
    ahead: ahead, laterPick: laterPick, laterBlock: laterBlock,
    LATER_CAPS: LATER_CAPS, LATER_WINDOWS: LATER_WINDOWS
  };
})();
