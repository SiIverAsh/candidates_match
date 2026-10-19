import { auditApplication } from "../audit/composition";
import { askAi } from "./application/chat";
import type { ChatMessage } from "./domain/models";
import { createChatGateway } from "./infrastructure/chat-gateway";

const gateway = createChatGateway();
const dependencies = {
  gateway,
  record: (actorId: string, outcome: string) => auditApplication.record({ actorId, actionType: "AI_CHAT", resourceRef: null, outcome }),
};
export const enterpriseAiApplication = {
  status: () => gateway.status(),
  ask: (actorId: string, messages: ChatMessage[], signal?: AbortSignal) => askAi(actorId, messages, dependencies, signal),
};
