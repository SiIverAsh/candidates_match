import type { AiGateway } from "../application/ports";
import { AiError } from "../domain/models";

const SYSTEM_PROMPT = "你是 Connection Finder 的企业招聘助手。帮助用户理解简历、共同经历、匹配依据和招聘工作。用中文清晰回答。你没有访问员工库、候选人库或执行系统操作的工具，不要声称已查询或修改数据。共同经历只能表示可能认识，不能断言真实关系。资料不足时说明缺少什么，不编造姓名、邮箱或履历。";

export function createChatGateway(env: Record<string, string | undefined> = process.env, send: typeof fetch = fetch): AiGateway {
  function configuration() {
    const endpoint = env.ENTERPRISE_AI_URL;
    const model = env.ENTERPRISE_AI_MODEL;
    const key = env.ENTERPRISE_AI_API_KEY;
    if (!endpoint || !model || !key) return null;
    try {
      const url = new URL(endpoint);
      if (url.username || url.password || url.hash || url.search) return null;
      if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null;
      return { endpoint, model, key };
    } catch { return null; }
  }
  return {
    status() {
      const config = configuration();
      return { configured: Boolean(config), model: config?.model ?? null };
    },
    async reply(messages, signal) {
      const config = configuration();
      if (!config) throw new AiError("AI_NOT_CONFIGURED", "企业 AI 配置不完整。", 503);
      const response = await send(config.endpoint, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages], stream: false }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new AiError("AI_UPSTREAM_ERROR", response.status === 429 ? "企业 AI 当前繁忙，请稍后重试。" : "企业 AI 返回错误，请联系管理员检查服务配置。", 503);
      const payload = await response.json() as { choices?: { message?: { content?: unknown } }[] };
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim() || content.length > 100_000) {
        throw new AiError("AI_INVALID_RESPONSE", "企业 AI 未返回有效文本，请重试。");
      }
      return content.trim();
    },
  };
}
