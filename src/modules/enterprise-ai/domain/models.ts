export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiStatus {
  configured: boolean;
  model: string | null;
}

export class AiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502) {
    super(message);
  }
}
