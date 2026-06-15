export type TaskList = 'today' | 'this_week' | 'someday';

export interface Task {
    id: string;
    title: string;
    notes: string | null;
    list: TaskList;
    completed: boolean;
    created_at: string;
    completed_at: string | null;
    ai_breakdown: string | null;
}

export interface AskVERARequest {
    type: 'prioritize' | 'breakdown' | 'estimate';
    task?: Task;          // for breakdown/estimate
    allTasks?: Task[];    // for prioritize
}
