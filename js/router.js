/* router.js | hash 路由：#/timeline  #/event/<id>  #/year/<y>  #/theme/<id>  #/compare/<y>
 *                                  #/river/<q>  #/place/<key>?year=  #/person/<key>  #/atlas?year=&place=&journey=&embed=
 *                                  #/story  #/story/<id>  #/story?person=<name>
 *                                  #/chain  #/chain/<id>
 *                                  #/annals?y=&juan=&section=&q=
 *                                  #/today  #/today/<m>/<d>
 */
(function () {
  "use strict";

  /* 查询参数在 atlas/place 与 story 路由上解析：深链是舆图的第一入口（学的是「零坐标双参数」
   * 这个设计——调用方只给年份与地名，坐标由本站的地名表解析）；故事层用 ?person= 把
   * 「只看这个人的故事」做成可分享的链接。 */
  function qsOf(str) {
    var o = {}, i = str.indexOf("?");
    if (i < 0) return [str, o];
    var tail = str.slice(i + 1);
    tail.split("&").forEach(function (kv) {
      if (!kv) return;
      var p = kv.split("=");
      o[decodeURIComponent(p[0])] = p.length > 1 ? decodeURIComponent(p.slice(1).join("=")) : "1";
    });
    return [str.slice(0, i), o];
  }

  function parse(h) {
    h = (h || "").replace(/^#\/?/, "");
    var pr = qsOf(h), path = pr[0], qs = pr[1];
    var seg = path.split("/").filter(Boolean);
    if (!seg.length) return { name: "timeline", params: {} };
    var name = seg[0];
    if (name === "event" && seg[1]) return { name: "event", params: { id: decodeURIComponent(seg.slice(1).join("/")) } };
    if (name === "year" && seg[1] !== undefined) return { name: "year", params: { year: Number(seg[1]) } };
    if (name === "theme" && seg[1]) return { name: "theme", params: { id: seg[1] } };
    if (name === "compare") return { name: "compare", params: { year: seg[1] ? Number(seg[1]) : null } };
    if (name === "view" && seg[1] && seg[2]) return { name: "view", params: { from: Number(seg[1]), to: Number(seg[2]) } };
    if (name === "river") return { name: "river", params: { query: seg[1] ? decodeURIComponent(seg.slice(1).join("/")) : "" } };
    if (name === "place" && seg[1]) return { name: "place", params: { key: decodeURIComponent(seg[1]), year: qs.year } };
    if (name === "person" && seg[1]) return { name: "person", params: { key: decodeURIComponent(seg[1]) } };
    if (name === "atlas") return { name: "atlas", params: { year: qs.year, place: qs.place, journey: qs.journey, embed: !!qs.embed } };
    if (name === "story") return { name: "story", params: { id: seg[1] ? decodeURIComponent(seg[1]) : "", person: qs.person } };
    if (name === "chain") return { name: "chain", params: { id: seg[1] ? decodeURIComponent(seg[1]) : "" } };
    /* 地址里的键是短的（?y=），交给 open() 的键是它文档里那套（year）：
     * 两边各叫各的，实测结果是 y=1449 被当成「没给年份」，装载层于是按整段
     * 明史去取片——一次深链拉 1.4 MB，正是事件层为慢链路专门改掉的那件事。 */
    if (name === "annals") return { name: "annals", params: { year: qs.y, juan: qs.juan, section: qs.section, q: qs.q } };
    if (name === "today") {
      /* 月日存不存在不在这里判。判它要一张各月天数表，而这张表全站只有一份——盘上的 mdays，
       * 由 date-lib 生成、ChronToday 读它并当着读者说明。路由此前自己抄了一份「二月 29 天、其余 31 天」，
       * 于是同一类地址两条路：4/31 放到了界面（界面说得清），2/30 被这里默默吞掉、
       * 读者被送回今天而不知道为什么。手改地址栏的人需要的是一条解释，不是第二次猜。 */
      var tm = Number(seg[1]), td = Number(seg[2]);
      return { name: "today", params: (Number.isInteger(tm) && Number.isInteger(td)) ? { m: tm, d: td } : {} };
    }
    return { name: "timeline", params: {} };
  }

  function apply(r) {
    var L = window.ChronLoader, S = window.ChronState;
    if (r.name === "event") {
      var ev = L.eventById(r.params.id);
      if (!ev) {
        /* 补到这一条落地就认一次；仍没有就必须说一句话——静默不动会让
         * 「链接错了」看起来像「页面坏了」。until 是因为补齐改成分批之后，
         * 等全部分片最坏是十几批，而深链要的只是这一条。 */
        L.ensureAll(function () { return !!L.eventById(r.params.id); }).then(function () {
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
    } else if (r.name === "place" || r.name === "person") {
      /* 舆图是全屏层（z 60），地点抽屉只有 42：不收舆图，抽屉就永远看不见。 */
      if (window.ChronAtlas) ChronAtlas.close();
      if (window.ChronToday) ChronToday.close();
      if (r.name === "place") {
        /* 地点页要等地理层就位；等不到就明说，不能让「打不开」看起来像「页面坏了」。
         * "cancelled"（读者在加载期已经走了）不在要说的一句话之列。 */
        window.ChronPlaces.openPlace(r.params.key, r.params.year).then(function (ok) {
          if (ok === false) ChronDetail.flash("地理数据没载入，打不开地点页", 4000);
        });
      } else window.ChronPlaces.openPerson(r.params.key);
    } else if (r.name === "atlas") {
      window.ChronAtlas.open(r.params);
    } else if (r.name === "story") {
      /* 同 place/person：舆图与地点页都是压住抽屉的层，不收掉就只剩一块背景。
       * 这里只走 open()，不走 ChronStory.openStory()——后者会回头改 hash，
       * 而 hashchange 又会进到本分支，于是路由和抽屉互相把对方再叫一次。 */
      if (window.ChronAtlas) ChronAtlas.close();
      if (window.ChronPlaces) ChronPlaces.close();
      if (window.ChronToday) ChronToday.close();
      if (window.ChronChain) ChronChain.close();
      if (window.ChronAnnals) ChronAnnals.close();
      if (window.ChronStory) ChronStory.open({ story: r.params.id, person: r.params.person });
    } else if (r.name === "chain") {
      /* 涟漪抽屉与故事抽屉同层同宽，同时开着只剩最上面那个还点得动：
       * 进这一分支先把故事层收掉，反之亦然（见上一分支的 ChronChain.close）。 */
      if (window.ChronAtlas) ChronAtlas.close();
      if (window.ChronPlaces) ChronPlaces.close();
      if (window.ChronToday) ChronToday.close();
      if (window.ChronStory) ChronStory.close();
      if (window.ChronAnnals) ChronAnnals.close();
      /* 只走 open()，不走 ChronChain.openChain()：后者会回头改 hash，
       * 而 hashchange 又进到本分支，于是路由和抽屉互相把对方再叫一次。 */
      if (window.ChronChain) ChronChain.open({ chain: r.params.id });
    } else if (r.name === "annals") {
      /* 编年与其余抽屉同层，同时开着只剩最上面那个还点得动：进这一分支先收掉别的。
       * 只走 open()，不走 ChronAnnals.openYear()——后者会回头改 hash，
       * 而 hashchange 又进到本分支，于是路由和抽屉互相把对方再叫一次。 */
      if (window.ChronAtlas) ChronAtlas.close();
      if (window.ChronPlaces) ChronPlaces.close();
      if (window.ChronStory) ChronStory.close();
      if (window.ChronChain) ChronChain.close();
      if (window.ChronToday) ChronToday.close();
      if (window.ChronAnnals) ChronAnnals.open(r.params);
    } else if (r.name === "today") {
      /* 同上：「今天」也是抽屉，舆图和地点页压着它。
       * 没给月日就是「今天本身」，由 ChronToday 自己按本机日期定位。 */
      if (window.ChronAtlas) ChronAtlas.close();
      if (window.ChronPlaces) ChronPlaces.close();
      if (window.ChronStory) ChronStory.close();
      if (window.ChronChain) ChronChain.close();
      if (window.ChronAnnals) ChronAnnals.close();
      if (window.ChronToday) ChronToday.open(r.params.m ? { m: r.params.m, d: r.params.d } : {});
    } else {
      /* 回到时间轴时把舆图与地点页收掉：三个全屏层叠在一起，读者只会看见最上面那个 */
      if (window.ChronAtlas) ChronAtlas.close();
      if (window.ChronPlaces) ChronPlaces.close();
      if (window.ChronChain) ChronChain.close();
      if (window.ChronStory) ChronStory.close();
      if (window.ChronToday) ChronToday.close();
      if (window.ChronAnnals) ChronAnnals.close();
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

  /* 关掉一层，地址栏却还指着它：刷新一次这层自己就弹回来，读者只当刚才没关掉。
   * 前缀必须逐层给——router 切到别的层以后会回头叫本层的 close()，那时 hash 已经
   * 不属于本层，不该被我们改回时间轴。replaceState 不发 hashchange，所以收完不会
   * 再把本分支叫一次（换成 location.hash = 就会）。 */
  function resetHash(prefixes) {
    var hit = prefixes.some(function (p) { return location.hash.indexOf(p) === 0; });
    if (hit) history.replaceState(null, "", "#/timeline");
  }

  window.ChronRouter = { init: init, parse: parse, go: go, handle: handle, resetHash: resetHash };
})();
