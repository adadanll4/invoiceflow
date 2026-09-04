import { db } from "@/db";
import { auditLog } from "@/db/schema";

type LogInput = {
  orgId: string;
  entity: string;
  entityId?: string | null;
  action: "create" | "update" | "delete" | "reverse";
  summary: string;
  details?: unknown;
};

export async function logAction(input: LogInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      orgId: input.orgId,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      details: input.details ?? null,
    });
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}