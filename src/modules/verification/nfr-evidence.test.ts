import { describe, expect, it } from "vitest";

import { initialNfrEvidenceNote } from "@/modules/verification/nfr-evidence";

describe("initial NFR evidence", () => {
  it("does not describe privacy or encryption requirements as missing accessibility tools", () => {
    const privacy = initialNfrEvidenceNote({
      category: "PRIVACY",
      title: "UK Data Protection Compliance",
      description: "The platform must comply with UK data protection regulations.",
    });
    const encryption = initialNfrEvidenceNote({
      category: "SECURITY",
      title: "Data Encryption in Transit and Rest",
      description: "User personal data and communications must be securely encrypted.",
    });
    expect(privacy).toMatch(/UK Data Protection Compliance was not exercised/);
    expect(encryption).toMatch(/Data Encryption in Transit and Rest was not exercised/);
    expect(privacy).not.toMatch(/accessibility|performance/i);
    expect(encryption).not.toMatch(/accessibility|performance/i);
    expect(privacy).toMatch(/not claimed as verified|does not claim the requirement is met/);
  });

  it("names an accessibility or performance tool only for those requirements", () => {
    expect(initialNfrEvidenceNote({ category: "ACCESSIBILITY", title: "Keyboard access" })).toMatch(/accessibility tool/);
    expect(initialNfrEvidenceNote({ category: "PERFORMANCE", title: "Response time" })).toMatch(/performance tool/);
    expect(initialNfrEvidenceNote({ category: "COMPLIANCE", title: "Audit retention" })).not.toMatch(/accessibility|performance/i);
  });
});
