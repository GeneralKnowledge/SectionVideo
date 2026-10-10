import { nanoid } from "nanoid";
import type { DatabaseHandle } from "@/lib/db/connection";
import { auditEvents } from "@/lib/db/schema";

export function recordAudit(
  handle: DatabaseHandle,
  event: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    detail: unknown;
  },
): void {
  handle.db
    .insert(auditEvents)
    .values({
      id: nanoid(),
      actorId: event.actorId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      detailJson: JSON.stringify(event.detail),
      createdAt: Date.now(),
    })
    .run();
}
