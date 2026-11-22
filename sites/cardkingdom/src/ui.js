// The panel and the download are core/ui.js's; here the panel is headed
// "CK BANner".

globalThis.CKB = globalThis.CKB || {};

(function (CKB, BAN) {
  "use strict";

  CKB.panel = function () {
    return BAN.panel("CK");
  };
  CKB.download = BAN.download;
})(globalThis.CKB, globalThis.BAN);
