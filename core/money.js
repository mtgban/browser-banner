// Reads and writes the money a store prints, and counts days on the
// calendar.
//
// Money is read by its shape and with arithmetic, never by parseFloat: it
// accepts what a page should not be trusted to print ("$1.234"), and a value
// read wrong is worse than one refused. Each store reads its own dates; the
// calendar under them is the same.

globalThis.BAN = globalThis.BAN || {};

(function (BAN) {
  "use strict";

  // "$1,234.56" or "$0.02": dollars, grouped or not, and exactly two cents.
  var MONEY = /^\$([1-9]\d{0,2}(?:,\d{3})+|\d+)\.(\d{2})$/;

  // cents reads "$1,234.56" as 123456, and answers null for any other shape.
  BAN.cents = function (text) {
    var m = MONEY.exec(String(text).replace(/\s+/g, " ").trim());
    if (!m) {
      return null;
    }
    return Number(m[1].replace(/,/g, "")) * 100 + Number(m[2]);
  };

  // dollars writes cents the way a store prints them, with a leading minus
  // for a difference that goes down.
  BAN.dollars = function (cents) {
    var sign = cents < 0 ? "-" : "";
    var abs = Math.abs(cents);
    var whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+$)/g, ",");
    return sign + "$" + whole + "." + String(abs % 100).padStart(2, "0");
  };

  // decimal writes cents as plain dollars, "0.52", for mtgban's uploader.
  BAN.decimal = function (cents) {
    return Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0");
  };

  // daysIn is how many days a month has, month 1 to 12.
  BAN.daysIn = function (year, month) {
    if (month === 2) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
    }
    return [4, 6, 9, 11].indexOf(month) >= 0 ? 30 : 31;
  };

  // daysBefore is the calendar date n days before date, both {year, month,
  // day}.
  BAN.daysBefore = function (date, n) {
    var year = date.year;
    var month = date.month;
    var day = date.day - n;
    while (day < 1) {
      month--;
      if (month < 1) {
        month = 12;
        year--;
      }
      day += BAN.daysIn(year, month);
    }
    return { year: year, month: month, day: day };
  };

  // today is the browser's date, {year, month, day}.
  BAN.today = function () {
    var now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  };
})(globalThis.BAN);
