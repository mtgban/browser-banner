// mtgban's handoff from ManaPool (SPECIFICATIONS.md, section 6): the rows go
// in the link, since ManaPool cuts its pages off from the windows they open.
// It sends Magic alone: ManaPool sells Magic alone.

globalThis.MPB = globalThis.MPB || {};

(function (MPB, BAN) {
  "use strict";

  MPB.TOO_LONG = "Too many cards to send; save them as CSV instead";
  // LONGEST is the longest address sent: Firefox opens none past 1 MiB.
  MPB.LONGEST = 1000000;

  var sender = BAN.handoff({ games: ["magic"], words: {} });

  // mayOpen says whether a click made at clicked, a time, still lets the
  // page open a tab. Where the browser does not say, a second is well
  // within what every browser allows.
  MPB.mayOpen = function (clicked) {
    return navigator.userActivation ? navigator.userActivation.isActive : Date.now() - clicked < 1000;
  };

  // sendLink opens mtgban's upload in a new tab with rows, { csv, rows }.
  MPB.sendLink = function (rows) {
    var url = sender.linkURL("magic", rows);
    if (url.length > MPB.LONGEST) {
      throw new Error(MPB.TOO_LONG);
    }
    var link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.referrerPolicy = "origin";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
})(globalThis.MPB, globalThis.BAN);
