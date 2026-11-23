// The panel and the download are core/ui.js's; here the panel is headed
// "MP BANner".

globalThis.MPB = globalThis.MPB || {};

(function (MPB, BAN) {
  "use strict";

  MPB.panel = function () {
    return BAN.panel("MP");
  };
  MPB.download = BAN.download;
})(globalThis.MPB, globalThis.BAN);
