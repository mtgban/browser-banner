// The panel and the download are core/ui.js's; here the panel is headed
// "SCG BANner".

globalThis.SCGB = globalThis.SCGB || {};

(function (SCGB, BAN) {
  "use strict";

  SCGB.panel = function () {
    return BAN.panel("SCG");
  };
  SCGB.download = BAN.download;
})(globalThis.SCGB, globalThis.BAN);
