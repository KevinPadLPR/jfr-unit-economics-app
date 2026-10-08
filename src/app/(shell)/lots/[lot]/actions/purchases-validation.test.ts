import { describe, it, expect } from "vitest";
import { checkInvoiceHeadCount } from "./purchases-validation";

describe("checkInvoiceHeadCount", () => {
  it("allows an invoice with nothing linked yet", () => {
    expect(checkInvoiceHeadCount(50, [])).toBeNull();
  });

  it("allows when the linked total matches exactly", () => {
    expect(checkInvoiceHeadCount(50, [30, 20])).toBeNull();
  });

  it("refuses when the linked total is short", () => {
    expect(checkInvoiceHeadCount(50, [30])).toMatch(/must equal the linked load-outs total \(30 from 1 load-out\)/);
  });

  it("refuses when the linked total is over", () => {
    expect(checkInvoiceHeadCount(50, [30, 30])).toMatch(/must equal the linked load-outs total \(60 from 2 load-outs\)/);
  });

  it("treats a null head_count on a linked receipt as zero rather than dropping it", () => {
    expect(checkInvoiceHeadCount(30, [30, null])).toBeNull();
    expect(checkInvoiceHeadCount(30, [null])).toMatch(/must equal the linked load-outs total \(0 from 1 load-out\)/);
  });
});
