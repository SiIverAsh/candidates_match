import { z } from "zod";

export const chatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(8_000) }).strict()).min(1).max(20),
}).strict().refine(({ messages }) => messages[0].role === "user" && messages.every((message, index) => message.role === (index % 2 === 0 ? "user" : "assistant")) && messages.at(-1)?.role === "user", "消息顺序无效")
  .refine(({ messages }) => messages.reduce((total, message) => total + message.content.length, 0) <= 40_000, "对话过长，请清空后重试");
