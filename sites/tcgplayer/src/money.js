// Reads the money, counts and dates TCGplayer prints: the money and the
// calendar are core/money.js's, and the counts and dates its own.
//
// Each is read by its shape and with arithmetic, never by parseFloat or
// Date.parse: those accept what the page should not be trusted to print
// ("1.204", a locale's own date order), and a value read wrong is worse
// than one refused.

globalThis.TCGB = globalThis.TCGB || {};

(function (TCGB, BAN) {
  "use strict";

  // "84" or "1,204".
  var COUNT = /^([1-9]\d{0,2}(?:,\d{3})+|\d+)$/;

  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // "November 09, 2026", the month in full. Order dates pad the day and
  // refund notes do not ("November 3, 2026").
  var DATE = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/;

  function squeeze(text) {
    return String(text).replace(/\s+/g, " ").trim();
  }

  TCGB.cents = BAN.cents;
  TCGB.dollars = BAN.dollars;
  TCGB.decimal = BAN.decimal;

  // count reads "1,204" as 1204, and answers null for any other shape.
  TCGB.count = function (text) {
    var m = COUNT.exec(squeeze(text));
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };

  // date reads "November 09, 2026" or "November 9, 2026" into {year,
  // month, day}, and answers null for any other shape or a day the month
  // does not have.
  TCGB.date = function (text) {
    var m = DATE.exec(squeeze(text));
    if (!m) {
      return null;
    }
    var month = MONTHS.indexOf(m[1]) + 1;
    var year = Number(m[3]);
    var day = Number(m[2]);
    if (month === 0 || day < 1 || day > BAN.daysIn(year, month)) {
      return null;
    }
    return { year: year, month: month, day: day };
  };

  TCGB.squeeze = squeeze;
})(globalThis.TCGB, globalThis.BAN);
