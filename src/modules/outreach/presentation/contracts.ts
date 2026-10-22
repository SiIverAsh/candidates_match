import { z } from "zod";

export const contactCommandSchema = z.object({
  employeeId: z.string().min(1).max(200),
  action: z.enum(["CLAIM", "COMPLETE", "RELEASE"]),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
