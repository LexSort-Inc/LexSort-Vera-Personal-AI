export type TaskList = 'today' | 'this_week' | 'someday';
export type TaskCategory = 'task' | 'urgent' | 'personal' | 'system';

export interface Task {
    id: string;
    title: string;
    notes: string | null;
    list: TaskList;
    completed: boolean;
    created_at: string;
    completed_at: string | null;
    ai_breakdown: string | null;
    start_time?: string | null;
    end_time?: string | null;
    category?: TaskCategory;
    all_day?: boolean;
    recurrence_rule?: string | null;
    next_due?: string | null;
    recurrence_end?: string | null;
}

export interface AskVERARequest {
    type: 'prioritize' | 'breakdown' | 'estimate';
    task?: Task;          // for breakdown/estimate
    allTasks?: Task[];    // for prioritize
}
