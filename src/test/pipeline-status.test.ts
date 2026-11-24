import { describe, it, expect } from "vitest";
import { stageState, type StageStatusRow } from "@/lib/pipelineStatus";

const row = (o: Partial<StageStatusRow>): StageStatusRow => ({
  department: "cutting", status: "open", start_verification_status: "accepted", end_verification_status: "none", ...o,
});

describe("stageState", () => {
  it("maps rows to states", () => {
    expect(stageState(undefined, ["cutting"]).state).toBe("not_started");
    expect(stageState([row({ status: "closed", end_verification_status: "accepted" })], ["cutting"]).state).toBe("done");
    expect(stageState([row({})], ["cutting"]).state).toBe("in_progress");
    expect(stageState([row({ start_verification_status: "pending" })], ["cutting"]).state).toBe("needs_approval");
    expect(stageState([row({ end_verification_status: "pending" })], ["cutting"]).state).toBe("needs_approval");
    expect(stageState([row({ end_verification_status: "reprocess" })], ["cutting"]).state).toBe("sent_back");
    expect(stageState([row({ start_verification_status: "denied" })], ["cutting"]).state).toBe("sent_back");
  });

  it("uses whichever decoration alternative has a row", () => {
    expect(stageState([row({ department: "printing", status: "closed" })], ["sticker", "printing", "embroidery"]))
      .toEqual({ state: "done", department: "printing" });
  });
});
