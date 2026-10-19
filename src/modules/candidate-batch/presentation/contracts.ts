import { z } from "zod";
import { BATCH_LIMITS } from "../domain/models";

export const batchMatchSchema = z.object({ queryIds: z.array(z.string().min(1).max(100)).min(1).max(BATCH_LIMITS.maxQueryIds) }).strict();
