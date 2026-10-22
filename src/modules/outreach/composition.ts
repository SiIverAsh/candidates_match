import { createOutreachApplication } from "./application/service";
import type { OutreachRepository } from "./application/ports";

export function composeOutreach(repository: OutreachRepository) {
  return createOutreachApplication(repository, () => new Date());
}
