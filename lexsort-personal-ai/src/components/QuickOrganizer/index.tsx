import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Task, TaskList } from './types';
import { TaskCard } from './TaskCard';
import { AskVERAPanel } from './AskVERAPanel';

const LISTS: { id: TaskList; label: string }[] = [
    { id: 'today',     label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'someday',   label: 'Someday' },
];

interface QuickOrganizerProps {
    activeModel: string;
    serverPort: number;
}

export function QuickOrganizer({ activeModel, serverPort }: QuickOrganizerProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [activeList, setActiveList] = useState<TaskList>('today');
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [showAskVERA, setShowAskVERA] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTasks();
    }, []);

    async function loadTasks() {
        try {
            const fetched = await invoke<Task[]>('get_tasks');
            setTasks(fetched);
        } catch (e) {
            console.error('Failed to load tasks:', e);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddTask() {
        const title = newTaskTitle.trim();
        if (!title) return;
        try {
            const task = await invoke<Task>('create_task', {
                title,
                list: activeList,
            });
            setTasks(prev => [...prev, task]);
            setNewTaskTitle('');
        } catch (e) {
            console.error('Failed to create task:', e);
        }
    }

    async function handleComplete(taskId: string) {
        try {
            await invoke('complete_task', { taskId });
            setTasks(prev => prev.map(t =>
                t.id === taskId
                    ? { ...t, completed: true,
                        completed_at: new Date().toISOString() }
                    : t
            ));
        } catch (e) {
            console.error('Failed to complete task:', e);
        }
    }

    async function handleDelete(taskId: string) {
        try {
            await invoke('delete_task', { taskId });
            setTasks(prev => prev.filter(t => t.id !== taskId));
        } catch (e) {
            console.error('Failed to delete task:', e);
        }
    }

    async function handleMove(taskId: string, newList: TaskList) {
        try {
            await invoke('move_task', { taskId, newList });
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, list: newList } : t
            ));
        } catch (e) {
            console.error('Failed to move task:', e);
        }
    }

    const activeTasks = tasks.filter(
        t => t.list === activeList && !t.completed
    );
    const completedTasks = tasks.filter(
        t => t.list === activeList && t.completed
    );

    return (
        <div className="qo-shell">
            {/* Header */}
            <div className="qo-header">
                <div className="qo-header__title-group">
                    <h1 className="qo-header__title">Quick Organizer</h1>
                    <span className="qo-header__badge">Free</span>
                </div>
                <button
                    className="qo-ask-btn"
                    onClick={() => setShowAskVERA(v => !v)}>
                    {showAskVERA ? 'Hide VERA' : 'Ask VERA'}
                </button>
            </div>

            {/* List tabs */}
            <div className="qo-tabs">
                {LISTS.map(list => {
                    const count = tasks.filter(
                        t => t.list === list.id && !t.completed
                    ).length;
                    return (
                        <button
                            key={list.id}
                            className={`qo-tab ${activeList === list.id
                                ? 'qo-tab--active' : ''}`}
                            onClick={() => setActiveList(list.id)}>
                            {list.label}
                            {count > 0 && (
                                <span className="qo-tab__count">{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="qo-body">
                {/* Ask VERA panel — slides in when active */}
                {showAskVERA && (
                    <AskVERAPanel
                        tasks={tasks}
                        activeList={activeList}
                        activeModel={activeModel}
                        serverPort={serverPort}
                        onBreakdownCached={(taskId, breakdown) => {
                            invoke('cache_ai_breakdown', { taskId, breakdown });
                            setTasks(prev => prev.map(t =>
                                t.id === taskId
                                    ? { ...t, ai_breakdown: breakdown }
                                    : t
                            ));
                        }}
                        onClose={() => setShowAskVERA(false)}
                    />
                )}

                {/* Add task input */}
                <div className="qo-add-row">
                    <input
                        className="qo-add-input"
                        type="text"
                        placeholder={`Add to ${LISTS.find(l =>
                            l.id === activeList)?.label ?? 'list'}...`}
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                    />
                    <button
                        className="qo-add-btn"
                        onClick={handleAddTask}
                        disabled={!newTaskTitle.trim()}>
                        Add
                    </button>
                </div>

                {/* Task list */}
                {loading ? (
                    <div className="qo-empty">Loading...</div>
                ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
                    <div className="qo-empty">
                        <p>Nothing here yet.</p>
                        <p style={{ marginTop: '4px', fontSize: '12px' }}>Add a task above or ask VERA to help you plan.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activeTasks.map(task => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                onComplete={handleComplete}
                                onDelete={handleDelete}
                                onMove={handleMove}
                                lists={LISTS}
                            />
                        ))}

                        {completedTasks.length > 0 && (
                            <details className="qo-completed-section" open>
                                <summary className="qo-completed-label">
                                    Completed ({completedTasks.length})
                                </summary>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    {completedTasks.map(task => (
                                        <TaskCard
                                            key={task.id}
                                            task={task}
                                            onComplete={handleComplete}
                                            onDelete={handleDelete}
                                            onMove={handleMove}
                                            lists={LISTS}
                                        />
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
