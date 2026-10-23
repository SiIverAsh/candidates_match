import { prepareResumeFile } from "../../../candidate-intake/infrastructure/file/prepare-resume-file";
import { extractResumeText } from "../../../resume-parser/infrastructure/extraction/extract-resume-text";
import { parseResumeText } from "../../../resume-parser/infrastructure/parsing/parse-resume-text";
import type { EmployeeResumeReader } from "../../application/ports";
import { profileToEmployeeDraft } from "../../domain/profile-to-employee";
import { createHash } from "node:crypto";

export const employeeResumeReader: EmployeeResumeReader = {
  async read(file) {
    const prepared = await prepareResumeFile(file);
    if (!prepared.ok) return { kind: "rejected", message: prepared.message };
    const now = new Date().toISOString();
    const source = { bytes: null, ...prepared.payload, queryId: "employee-preview", submittedBy: "employee-import", text: null, expiresAt: now };
    const extracted = await extractResumeText(source);
    if (!extracted.ok) return { kind: "rejected", message: extracted.message };
    const profile = parseResumeText(source, extracted.text, now);
    const draft = profileToEmployeeDraft(profile, {
      employeeId: `resume-${createHash("sha256").update(extracted.text).digest("hex").slice(0, 20)}`,
      email: profile.identity?.email ?? "",
      profileUrl: profile.identity?.profileUrl ?? "",
      sourceText: extracted.text,
    });
    return { kind: "parsed", draft };
  },
};
