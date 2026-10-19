import { AiError, type ChatMessage } from "../domain/models";
import type { AiDependencies } from "./ports";

export async function askAi(actorId: string, messages: ChatMessage[], dependencies: AiDependencies, signal?: AbortSignal) {
  if (!dependencies.gateway.status().configured) {
    throw new AiError("AI_NOT_CONFIGURED", "企业 AI 尚未配置，请联系管理员配置服务地址、模型和密钥。", 503);
  }
  try {
    const content = await dependencies.gateway.reply(messages, signal);
    dependencies.record(actorId, "SUCCESS");
    return { role: "assistant" as const, content };
  } catch (error) {
    dependencies.record(actorId, "FAILED");
    if (error instanceof AiError) throw error;
    throw new AiError("AI_UNAVAILABLE", "企业 AI 暂时无法连接，请稍后重试。回复未完成。", 503);
  }
}
