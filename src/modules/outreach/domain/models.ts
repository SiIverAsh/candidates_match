export type ContactStatus = "UNCONTACTED" | "IN_PROGRESS" | "CONTACTED";
export type ContactAction = "CLAIM" | "COMPLETE" | "RELEASE";

export interface ContactRecord {
  employeeId: string;
  status: ContactStatus;
  ownerId: string | null;
  ownerName: string | null;
  updatedAt: string;
  contactedAt: string | null;
  revision: number;
}

export interface OutreachSnapshot {
  actorId: string;
  shared: boolean;
  canShare: boolean;
  records: ContactRecord[];
}

export function contactActions(record: ContactRecord | undefined, actorId: string): ContactAction[] {
  if (!record || record.status === "UNCONTACTED") return ["CLAIM"];
  if (record.ownerId !== actorId) return [];
  return record.status === "IN_PROGRESS" ? ["COMPLETE", "RELEASE"] : ["RELEASE"];
}

export function transitionContact(
  employeeId: string,
  current: ContactRecord | undefined,
  action: ContactAction,
  actor: { id: string; displayName: string },
  now: string,
): ContactRecord | null {
  if (!contactActions(current, actor.id).includes(action)) return null;
  return {
    employeeId,
    status: action === "CLAIM" ? "IN_PROGRESS" : action === "COMPLETE" ? "CONTACTED" : "UNCONTACTED",
    ownerId: action === "RELEASE" ? null : actor.id,
    ownerName: action === "RELEASE" ? null : actor.displayName,
    updatedAt: now,
    contactedAt: action === "COMPLETE" ? now : null,
    revision: (current?.revision ?? 0) + 1,
  };
}
