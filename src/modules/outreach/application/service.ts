import type { ContactCommand, OutreachRepository } from "./ports";

export function createOutreachApplication(repository: OutreachRepository, now: () => Date) {
  return {
    snapshot: (queryId: string, actorId: string) => repository.snapshot(queryId, actorId, now().toISOString()),
    update: (command: ContactCommand, actor: { id: string; displayName: string }) => repository.update(command, actor, now().toISOString()),
    share: (queryId: string, actorId: string) => repository.share(queryId, actorId, now().toISOString()),
  };
}
