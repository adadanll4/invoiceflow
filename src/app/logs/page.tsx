import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, organizations } from "@/db/schema";

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  reverse: "bg-amber-100 text-amber-800",
};

export default async function LogsPage() {
  const [org] = await db.select().from(organizations).limit(1);

  const entries = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, org.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-medium">Activity log</h1>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex items-start gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    ACTION_STYLE[e.action] ?? "bg-gray-200"
                  }`}
                >
                  {e.action}
                </span>
                <div className="flex-1">
                  <p className="text-sm">{e.summary}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {e.entity}
                    {" · "}
                    {new Date(e.createdAt).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>

              {e.details != null && (
                <details className="mt-2 ml-16">
                  <summary className="cursor-pointer text-xs text-gray-400">
                    View snapshot
                  </summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
                    {JSON.stringify(e.details, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}