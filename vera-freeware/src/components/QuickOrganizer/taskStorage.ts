/**
 * QuickOrganizer Task Storage
 * Replaces missing Tauri backend commands with localStorage persistence.
 * Data survives app restarts; works without any Rust command registration.
 */

import { Task, TaskList, TaskCategory } from './types';

const STORAGE_KEY = 'vera_qo_tasks';

function readAll(): Task[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Task[]) : [];
    } catch {
        return [];
    }
}

function writeAll(tasks: Task[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function uuid(): string {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Public API (mirrors the Tauri invoke signatures) ───────────────────

export async function getTasks(): Promise<Task[]> {
    return readAll();
}

export async function createTask(params: {
    title: string;
    list: TaskList;
    startTime?: string | null;
    endTime?: string | null;
    category?: TaskCategory | null;
    allDay?: boolean;
    recurrenceRule?: string | null;
    nextDue?: string | null;
    recurrenceEnd?: string | null;
}): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
        id: uuid(),
        title: params.title,
        notes: null,
        list: params.list || 'today',
        completed: false,
        created_at: now,
        completed_at: null,
        ai_breakdown: null,
        start_time: params.startTime ?? now,
        end_time: params.endTime ?? null,
        category: (params.category as TaskCategory) || 'task',
        all_day: params.allDay ?? false,
        recurrence_rule: params.recurrenceRule ?? null,
        next_due: params.nextDue ?? null,
        recurrence_end: params.recurrenceEnd ?? null,
    };
    const all = readAll();
    all.push(task);
    writeAll(all);
    return task;
}

export async function updateTask(task: Task): Promise<void> {
    const all = readAll();
    const idx = all.findIndex(t => t.id === task.id);
    if (idx >= 0) all[idx] = task;
    else all.push(task);
    writeAll(all);
}

export async function deleteTask(id: string): Promise<void> {
    writeAll(readAll().filter(t => t.id !== id));
}
