// The range picker of a history read by range, and the name its file is
// saved under. Each store keeps its own ranges and their labels.

globalThis.BAN = globalThis.BAN || {};

(function (BAN) {
  "use strict";

  // ymd writes a calendar date, {year, month, day}, as 2026-02-25.
  BAN.ymd = function (date) {
    return date.year + "-" + String(date.month).padStart(2, "0") + "-" + String(date.day).padStart(2, "0");
  };

  // rangePicker builds the range select from [value, label] pairs, in the
  // order given, with value chosen.
  BAN.rangePicker = function (choices, value) {
    var select = document.createElement("select");
    select.className = "ban-year";
    select.setAttribute("aria-label", "Range");
    for (var i = 0; i < choices.length; i++) {
      var option = document.createElement("option");
      option.value = choices[i][0];
      option.textContent = choices[i][1];
      select.appendChild(option);
    }
    select.value = value;
    return select;
  };

  // rangeFile names the file of a range, {year, days}: stem-2026.csv for a
  // year, stem-all.csv for every year (year and days both null), and
  // stem-last-30-days-<today>.csv for recent days, dated since the same
  // range holds other orders tomorrow.
  BAN.rangeFile = function (stem, range, today) {
    if (range.days) {
      return stem + "-last-" + range.days + "-days-" + BAN.ymd(today) + ".csv";
    }
    return stem + "-" + (range.year === null ? "all" : range.year) + ".csv";
  };
})(globalThis.BAN);
