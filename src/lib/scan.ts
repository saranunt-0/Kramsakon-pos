// USB/Bluetooth barcode scanners "type" the code like a keyboard. If Windows is
// switched to the Thai keyboard layout, the same key presses come out as Thai
// characters (e.g. "KS000123" → "ษฆจจจๅ/-"). This maps them back to what the
// keys mean on an English (US) keyboard, so scanning works in either layout.

// Thai Kedmanee layout as [character typed in Thai mode, same key in US mode].
export const KEDMANEE: [string, string][] = [
  // number row
  ["_", "`"], ["%", "~"],
  ["ๅ", "1"], ["+", "!"],
  ["/", "2"], ["๑", "@"],
  ["-", "3"], ["๒", "#"],
  ["ภ", "4"], ["๓", "$"],
  ["ถ", "5"], ["๔", "%"],
  ["ุ", "6"], ["ู", "^"],
  ["ึ", "7"], ["฿", "&"],
  ["ค", "8"], ["๕", "*"],
  ["ต", "9"], ["๖", "("],
  ["จ", "0"], ["๗", ")"],
  ["ข", "-"], ["๘", "_"],
  ["ช", "="], ["๙", "+"],
  // top row
  ["ๆ", "q"], ["๐", "Q"],
  ["ไ", "w"], ['"', "W"],
  ["ำ", "e"], ["ฎ", "E"],
  ["พ", "r"], ["ฑ", "R"],
  ["ะ", "t"], ["ธ", "T"],
  ["ั", "y"], ["ํ", "Y"],
  ["ี", "u"], ["๊", "U"],
  ["ร", "i"], ["ณ", "I"],
  ["น", "o"], ["ฯ", "O"],
  ["ย", "p"], ["ญ", "P"],
  ["บ", "["], ["ฐ", "{"],
  ["ล", "]"], [",", "}"],
  ["ฃ", "\\"], ["ฅ", "|"],
  // home row
  ["ฟ", "a"], ["ฤ", "A"],
  ["ห", "s"], ["ฆ", "S"],
  ["ก", "d"], ["ฏ", "D"],
  ["ด", "f"], ["โ", "F"],
  ["เ", "g"], ["ฌ", "G"],
  ["้", "h"], ["็", "H"],
  ["่", "j"], ["๋", "J"],
  ["า", "k"], ["ษ", "K"],
  ["ส", "l"], ["ศ", "L"],
  ["ว", ";"], ["ซ", ":"],
  ["ง", "'"], [".", '"'],
  // bottom row
  ["ผ", "z"], ["(", "Z"],
  ["ป", "x"], [")", "X"],
  ["แ", "c"], ["ฉ", "C"],
  ["อ", "v"], ["ฮ", "V"],
  ["ิ", "b"], ["ฺ", "B"],
  ["ื", "n"], ["์", "N"],
  ["ท", "m"], ["?", "M"],
  ["ม", ","], ["ฒ", "<"],
  ["ใ", "."], ["ฬ", ">"],
  ["ฝ", "/"], ["ฦ", "?"],
];

const THAI_TO_US = new Map(KEDMANEE);
const HAS_THAI = /[฀-๿]/;

/**
 * Cleans up what a barcode scanner typed: undoes the Thai keyboard layout if
 * needed, trims, and upper-cases (all our barcodes are upper-case).
 */
export function normalizeScan(raw: string): string {
  let value = raw.trim();
  if (HAS_THAI.test(value)) {
    value = Array.from(value, (ch) => THAI_TO_US.get(ch) ?? ch).join("");
  }
  return value.toUpperCase();
}
