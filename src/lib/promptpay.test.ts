import { describe, expect, it } from "vitest";
import { isValidPromptPayId, promptPayPayload } from "./promptpay";

// Expected values generated with the widely used `promptpay-qr` package.
describe("promptPayPayload", () => {
  it("encodes a mobile number with an amount", () => {
    expect(promptPayPayload("081-234-5678", 4.22)).toBe(
      "00020101021229370016A000000677010111011300668123456785802TH530376454044.2263045D49",
    );
  });

  it("encodes a mobile number without an amount", () => {
    expect(promptPayPayload("0812345678")).toBe(
      "00020101021129370016A000000677010111011300668123456785802TH530376463045D82",
    );
  });

  it("encodes a tax ID", () => {
    expect(promptPayPayload("1234567890123", 1500)).toBe(
      "00020101021229370016A000000677010111021312345678901235802TH530376454071500.0063048F60",
    );
  });

  it("encodes an e-wallet ID", () => {
    expect(promptPayPayload("004999000288505", 10)).toBe(
      "00020101021229390016A00000067701011103150049990002885055802TH5303764540510.006304ECEE",
    );
  });

  it("validates IDs", () => {
    expect(isValidPromptPayId("081-234-5678")).toBe(true);
    expect(isValidPromptPayId("1234567890123")).toBe(true);
    expect(isValidPromptPayId("12345")).toBe(false);
  });
});
