/* palette.js | 深墨 / 宣纸 双主题画布配色（供 Canvas 与 CSS 共用同一套令牌） */
(function () {
  "use strict";

  var P = {
    dark: {
      bg: "#12100e", bgPanel: "#1b1815", bgElevated: "#241f1b",
      ink: "#e8e0d2", inkSoft: "#b3a894", inkFaint: "#7d7462",
      rule: "#3a342c", ruleSoft: "#2a251f",
      gridMajor: "rgba(232,224,210,0.16)", gridMinor: "rgba(232,224,210,0.07)",
      eraBandText: "#e8e0d2", eraBandTextDim: "rgba(232,224,210,0.45)",
      hoverGlow: "rgba(224,161,43,0.9)", selectGlow: "#e0a12b",
      bridge: "rgba(224,161,43,0.42)", bridgeHot: "#e0a12b",
      binFillAlpha: 0.85, labelHalo: "rgba(18,16,14,0.85)",
      minimapBg: "#191512", density: "rgba(179,168,148,0.5)",
      trackBandCn: "rgba(217,72,43,0.09)", trackBandWorld: "rgba(47,111,158,0.09)",
      flowDust: "rgba(232,224,210,0.85)",
      /* 水层专用：spark=贴水面的高光闪点，meteorHead/Tail=流星的光头与尾迹，
       * riverInk 是整条河的颜色系数（宣纸底要更重的墨才压得住）。 */
      spark: "rgba(255,246,226,0.95)",
      meteorHead: "#fff3d8", meteorTail: "rgba(224,161,43,0.62)",
      riverInk: 1,
      shadow: "rgba(0,0,0,0.5)"
    },
    light: {
      bg: "#f4efe4", bgPanel: "#fbf7ee", bgElevated: "#ffffff",
      ink: "#241f18", inkSoft: "#5c5142", inkFaint: "#8d8271",
      rule: "#d5cbb6", ruleSoft: "#e6ddca",
      gridMajor: "rgba(36,31,24,0.22)", gridMinor: "rgba(36,31,24,0.10)",
      eraBandText: "#241f18", eraBandTextDim: "rgba(36,31,24,0.5)",
      hoverGlow: "#b06a10", selectGlow: "#b06a10",
      bridge: "rgba(176,106,16,0.45)", bridgeHot: "#b06a10",
      binFillAlpha: 0.9, labelHalo: "rgba(251,247,238,0.9)",
      minimapBg: "#eae3d4", density: "rgba(92,81,66,0.45)",
      trackBandCn: "rgba(217,72,43,0.07)", trackBandWorld: "rgba(47,111,158,0.07)",
      flowDust: "rgba(36,31,24,0.62)",
      /* 纸上的反光是墨的深浅，不是亮度：实测纸白闪点对底 ΔL 只有 +14（深墨底是 +230），
       * 等于整层波光在宣纸下看不见。改取深石青，与 crest 的暖金凑成冷暖两色闪点。
       * 流星同理改成墨痕——纸上的光应当是墨，不是灯。 */
      spark: "rgba(36,80,111,0.95)",
      meteorHead: "#3a2c14", meteorTail: "rgba(176,106,16,0.55)",
      riverInk: 1.45,
      shadow: "rgba(36,31,24,0.18)"
    }
  };

  var current = "dark";
  function set(name) { if (P[name]) current = name; }
  function get() { return P[current]; }
  function all() { return P; }

  /* 十六进制色 → rgba 字符串 */
  function alpha(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function mix(h1, h2, t) {
    function parse(h) {
      h = h.replace("#", "");
      if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var a = parse(h1), b = parse(h2);
    var r = a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); });
    return "rgb(" + r.join(",") + ")";
  }

  window.ChronPalette = { set: set, get: get, all: all, alpha: alpha, mix: mix };
})();
