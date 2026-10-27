// PromptPay QR payload (Thai QR Payment / EMVCo). Customers scan it with any
// Thai banking app and the amount is already filled in.

function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

// CRC-16/CCITT-FALSE as required by EMVCo.
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * @param id PromptPay ID: mobile number (10 digits), national ID / tax ID
 *           (13 digits) or e-wallet ID (15 digits).
 * @param amount Baht. Omit for a QR where the customer types the amount.
 */
export function promptPayPayload(id: string, amount?: number): string {
  const digits = id.replace(/\D/g, "");
  let account: string;
  if (digits.length >= 15) {
    account = tlv("03", digits);
  } else if (digits.length >= 13) {
    account = tlv("02", digits);
  } else {
    // Mobile: 0812345678 → 0066812345678
    account = tlv("01", ("0000000000000" + digits.replace(/^0/, "66")).slice(-13));
  }

  const parts = [
    tlv("00", "01"),
    tlv("01", amount ? "12" : "11"),
    tlv("29", tlv("00", "A000000677010111") + account),
    tlv("58", "TH"),
    tlv("53", "764"),
    ...(amount ? [tlv("54", amount.toFixed(2))] : []),
  ];
  const payload = parts.join("") + "6304";
  return payload + crc16(payload);
}

export function isValidPromptPayId(id: string): boolean {
  const n = id.replace(/\D/g, "").length;
  return n === 10 || n === 13 || n === 15;
}
