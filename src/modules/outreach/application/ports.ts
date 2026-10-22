import type { ContactAction, OutreachSnapshot } from "../domain/models";

export interface ContactCommand {
  queryId: string;
  employeeId: string;
  action: ContactAction;
  revision: number;
}

export type UpdateContactResult = "updated" | "conflict" | "not_found";

export interface OutreachRepository {
  snapshot(queryId: string, actorId: string, now: string): OutreachSnapshot | null;
  update(command: ContactCommand, actor: { id: string; displayName: string }, now: string): UpdateContactResult;
  share(queryId: string, actorId: string, now: string): boolean;
}
