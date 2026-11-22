// Writes rows out as CSV, byte for byte what Go's csv.Writer writes for the
// same rows: a value is quoted only when it holds a comma, a quote or a line
// break, and a quote is doubled. Which columns, and what goes in them, is
// each store's own.

globalThis.BAN = globalThis.BAN || {};

(function (BAN) {
  "use strict";

  // csvField quotes what has to be quoted and nothing else.
  BAN.csvField = function (value) {
    var text = value === undefined || value === null ? "" : String(value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  };

  // csv writes lines, each an array of values, every one ended by eol: LF
  // as Go writes it, or CRLF where a reader asks for that.
  BAN.csv = function (lines, eol) {
    var out = "";
    for (var i = 0; i < lines.length; i++) {
      out += lines[i].map(BAN.csvField).join(",") + eol;
    }
    return out;
  };
})(globalThis.BAN);
