import { describe, it, expect } from "vitest";
import { validateCloseoutAssumptions } from "./closeout-validation";

describe("validateCloseoutAssumptions", () => {
  it("rejects a ship date before the arrival date", () => {
    expect(validateCloseoutAssumptions({ shipDate: "2026-01-01", arrivalDate: "2026-02-01" })).not.toBeNull();
  });

  it("rejects a ship date equal to the arrival date", () => {
    expect(validateCloseoutAssumptions({ shipDate: "2026-02-01", arrivalDate: "2026-02-01" })).not.toBeNull();
  });

  it("accepts a ship date after the arrival date", () => {
    expect(validateCloseoutAssumptions({ shipDate: "2026-03-01", arrivalDate: "2026-02-01" })).toBeNull();
  });

  it("is not an error when no ship date is set", () => {
    expect(validateCloseoutAssumptions({ shipDate: null, arrivalDate: "2026-02-01" })).toBeNull();
  });

  it("is not an error when there is no arrival date to compare against", () => {
    expect(validateCloseoutAssumptions({ shipDate: "2026-01-01", arrivalDate: null })).toBeNull();
  });
});
