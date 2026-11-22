// The panel and the download are core/ui.js's; here the panel is headed
// "TCG BANner".

globalThis.TCGB = globalThis.TCGB || {};

(function (TCGB, BAN) {
  "use strict";

  TCGB.panel = function () {
    return BAN.panel("TCG");
  };
  TCGB.download = BAN.download;
})(globalThis.TCGB, globalThis.BAN);
