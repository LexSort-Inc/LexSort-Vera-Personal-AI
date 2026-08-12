import { invoke } from "@tauri-apps/api/core";

export interface ToolAction {
  name: string;
  args: Record<string, unknown>;
}

export const SYSTEM_TOOLS_PROMPT = `SYSTEM QUERY TOOLS
When the user asks a question about THIS computer or about VERA app state (storage, disk, memory, CPU, calendar, tasks, version, updates, models, modules), do NOT answer with guesses or estimates. Respond with ONLY a single JSON object (no prose; you may wrap it in \`\`\`json fences), like:
{"tool":"<name>"}

Available tools:
- "system_stats" — live CPU, RAM and disk usage
- "cleanup_candidates" — read-only analysis of caches/logs/trash that could be freed
- "calendar_today" — upcoming calendar events
- "due_tasks" — tasks due in the Quick Organizer
- "app_info" — installed VERA version
- "update_status" — whether a VERA update is pending
- "active_model" — the AI model currently in use
- "installed_modules" — installed VERA modules

Rules:
- Return exactly ONE JSON object and nothing else when a tool matches.
- If no tool matches the question, answer normally without JSON.
- You will receive the real tool result in the next message; then compose the final answer in plain text using that data.`;

export function parseToolAction(text: string): ToolAction | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  let cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (obj && typeof obj === "object" && typeof obj.tool === "string") {
      return {
        name: obj.tool,
        args: obj.args && typeof obj.args === "object" ? obj.args : {},
      };
    }
  } catch {
    /* not JSON — treat as a plain answer */
  }
  return null;
}

const TOOL_LABELS: Record<string, string> = {
  system_stats: "System stats",
  cleanup_candidates: "Disk cleanup analysis",
  calendar_today: "Calendar events",
  due_tasks: "Due tasks",
  app_info: "App version",
  update_status: "Update status",
  active_model: "Active model",
  installed_modules: "Installed modules",
};

const gb = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;

async function runNamedTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "system_stats": {
      const s = (await invoke("get_system_stats")) as any;
      if (!s) throw new Error("no stats returned");
      const memPct = s.total_memory_bytes
        ? Math.round((s.used_memory_bytes / s.total_memory_bytes) * 100)
        : 0;
      return (
        `CPU usage: ${s.cpu_usage}% | ` +
        `RAM: ${gb(s.used_memory_bytes)} of ${gb(s.total_memory_bytes)} used (${memPct}%) | ` +
        `Disk: ${gb(s.available_disk_bytes)} free of ${gb(s.total_disk_bytes)}`
      );
    }
    case "cleanup_candidates": {
      const cands = (await invoke("get_cleanup_candidates")) as any[];
      if (!cands || cands.length === 0) {
        return "No cleanup candidates found.";
      }
      const total = cands.reduce((t, c) => t + (c.size_bytes ?? 0), 0);
      const lines = cands.map(
        (c) => `- ${c.label}: ${gb(c.size_bytes ?? 0)} (${c.path})`
      );
      return `Potential space you could free: ${gb(total)}\n${lines.join("\n")}`;
    }
    case "calendar_today": {
      const days = (args as any).days ?? 7;
      const events = (await invoke("import_calendar_events", { daysAhead: days })) as any[];
      if (!events || events.length === 0) {
        return `No calendar events in the next ${days} days.`;
      }
      return events
        .slice(0, 12)
        .map(
          (e) =>
            `- ${e.title}${e.start_time ? ` (${e.start_time}` : ""}${e.end_time ? ` - ${e.end_time}` : ""}${e.start_time ? ")" : ""}`
        )
        .join("\n");
    }
    case "due_tasks": {
      const tasks = (await invoke("get_due_tasks_now")) as any[];
      if (!tasks || tasks.length === 0) {
        return "No tasks are currently due.";
      }
      return tasks
        .slice(0, 15)
        .map(
          (t) =>
            `- [${t.completed ? "x" : " "}] ${t.title}${t.next_due ? ` (due ${t.next_due})` : ""}`
        )
        .join("\n");
    }
    case "app_info": {
      const v = (await invoke("get_app_version")) as string;
      return `VERA Freeware version: ${v}`;
    }
    case "update_status": {
      const upd = (await invoke("get_pending_update_info")) as any;
      return upd
        ? `A VERA update is pending: ${JSON.stringify(upd).slice(0, 500)}`
        : "No pending update — VERA is up to date.";
    }
    case "active_model": {
      const m = (await invoke("get_active_model")) as string | null;
      return m ? `Active AI model: ${m}` : "No active model is selected.";
    }
    case "installed_modules": {
      const reg = (await invoke("get_installed_registry")) as any;
      return `Installed registry: ${JSON.stringify(reg ?? null).slice(0, 2000)}`;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export interface ToolResult {
  ok: boolean;
  label: string;
  result: string;
}

export async function runTool(action: ToolAction): Promise<ToolResult> {
  const label = TOOL_LABELS[action.name] ?? action.name;
  try {
    const result = await runNamedTool(action.name, action.args);
    return { ok: true, label, result };
  } catch (e: any) {
    const detail = String(e?.message ?? e ?? "unknown error").slice(0, 500);
    return { ok: false, label, result: `Tool failed: ${detail}` };
  }
}