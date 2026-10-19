import type { AiStatus, ChatMessage } from "../domain/models";

export interface AiGateway {
  status(): AiStatus;
  reply(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
}

export interface AiDependencies {
  gateway: AiGateway;
  record(actorId: string, outcome: string): void;
}
