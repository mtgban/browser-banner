// The panel and the download are core/ui.js's; here the panel is headed
// "CM BANner".

globalThis.MKM = globalThis.MKM || {};

(function (MKM, BAN) {
  "use strict";

  MKM.panel = function () {
    return BAN.panel("CM");
  };
  MKM.download = BAN.download;
})(globalThis.MKM, globalThis.BAN);
