// Reads the money and dates Card Kingdom prints: the money and the calendar
// are core/money.js's, and the dates and the price list's numbers its own.
//
// Dates are read by shape and arithmetic, never by Date.parse: it accepts a
// locale's own date order, and a value read wrong is worse than one refused.

globalThis.CKB = globalThis.CKB || {};

(function (CKB, BAN) {
  "use strict";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // "Mar 14, 2026 10:36 AM" or "Mar 5, 2026". Days are not padded, hours are.
  var WHEN = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2}) ([AP]M))?$/;

  CKB.cents = BAN.cents;
  CKB.dollars = BAN.dollars;
  CKB.daysBefore = BAN.daysBefore;
  CKB.today = BAN.today;

  // listCents reads a price list's "6.4" or "599.99" as cents, and answers
  // null for any other shape: no sign, no grouping, at most two decimals.
  CKB.listCents = function (text) {
    var m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(typeof text === "string" ? text : "");
    if (!m) {
      return null;
    }
    return Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2));
  };

  // when reads a date into {year, month, day, hour, minute}, hour and minute
  // null when it carries no time, and answers null for any other shape or a
  // day the month does not have.
  CKB.when = function (text) {
    var m = WHEN.exec(String(text).trim().replace(/\s+/g, " "));
    if (!m) {
      return null;
    }
    var year = Number(m[3]);
    var month = MONTHS.indexOf(m[1]) + 1;
    var day = Number(m[2]);
    if (month === 0 || day < 1 || day > BAN.daysIn(year, month)) {
      return null;
    }
    var parts = { year: year, month: month, day: day, hour: null, minute: null };
    if (m[4] !== undefined) {
      var hour = Number(m[4]);
      var minute = Number(m[5]);
      if (hour < 1 || hour > 12 || minute > 59) {
        return null;
      }
      // 12 AM is midnight and 12 PM is noon.
      parts.hour = (hour % 12) + (m[6] === "PM" ? 12 : 0);
      parts.minute = minute;
    }
    return parts;
  };
})(globalThis.CKB, globalThis.BAN);
