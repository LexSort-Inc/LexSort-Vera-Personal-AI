import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Task, TaskList } from './types';

interface TaskCardProps {
    task: Task;
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
    onMove: (id: string, list: TaskList) => void;
    lists: { id: TaskList; label: string }[];
}

export function TaskCard({
    task,
    onComplete,
    onDelete,
    onMove,
    lists
}: TaskCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(task.title);
    const [notes, setNotes] = useState(task.notes || '');
    const [showActions, setShowActions] = useState(false);

    async function handleSave() {
        if (!title.trim()) return;
        try {
            const updatedTask: Task = {
                ...task,
                title: title.trim(),
                notes: notes.trim() ? notes.trim() : null
            };
            await invoke('update_task', { task: updatedTask });
            task.title = updatedTask.title;
            task.notes = updatedTask.notes;
            setIsEditing(false);
        } catch (e) {
            console.error('Failed to update task:', e);
        }
    }

    return (
        <div className={`qo-task-card ${task.completed ? 'qo-task-card--completed' : ''}`}>
            {/* Checkmark checkbox */}
            <div 
                className={`qo-task-card__check ${task.completed ? 'qo-task-card__check--done' : ''}`}
                onClick={() => !task.completed && onComplete(task.id)}
            >
                {task.completed && '✓'}
            </div>

            {/* Task content */}
            <div className="qo-task-card__body">
                {isEditing ? (
                    <div className="qo-task-card__edit-form">
                        <input 
                            className="qo-add-input"
                            type="text" 
                            value={title} 
                            onChange={e => setTitle(e.target.value)} 
                            placeholder="Task title"
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                        <textarea 
                            className="qo-add-input"
                            style={{ marginTop: '8px', minHeight: '60px', resize: 'vertical' }}
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                            placeholder="Add notes..."
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    handleSave();
                                }
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button className="qo-add-btn" onClick={handleSave}>Save</button>
                            <button 
                                className="qo-add-btn" 
                                style={{ background: 'var(--border)', color: 'var(--text)' }} 
                                onClick={() => setIsEditing(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div 
                            className={`qo-task-card__title ${task.completed ? 'qo-task-card__title--done' : ''}`}
                            onClick={() => !task.completed && setIsEditing(true)}
                            style={{ cursor: task.completed ? 'default' : 'pointer' }}
                        >
                            {task.title}
                        </div>
                        {task.notes && (
                            <div className="qo-task-card__notes">
                                {task.notes}
                            </div>
                        )}
                        {task.ai_breakdown && (
                            <div className="qo-task-card__breakdown">
                                <strong>VERA Breakdown:</strong>
                                <br />
                                {task.ai_breakdown}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Actions dropdown/buttons */}
            <div className="qo-task-card__actions">
                {!task.completed && !isEditing && (
                    <div style={{ position: 'relative' }}>
                        <button 
                            className="qo-task-card__action"
                            onClick={() => setShowActions(v => !v)}
                        >
                            •••
                        </button>
                        {showActions && (
                            <div className="qo-task-card__dropdown-menu" onMouseLeave={() => setShowActions(false)}>
                                {lists.map(list => (
                                    list.id !== task.list && (
                                        <button 
                                            key={list.id}
                                            className="qo-task-card__dropdown-item"
                                            onClick={() => {
                                                onMove(task.id, list.id);
                                                setShowActions(false);
                                            }}
                                        >
                                            Move to {list.label}
                                        </button>
                                    )
                                ))}
                                <button 
                                    className="qo-task-card__dropdown-item"
                                    onClick={() => {
                                        setIsEditing(true);
                                        setShowActions(false);
                                    }}
                                >
                                    Edit Task
                                </button>
                            </div>
                        )}
                    </div>
                )}
                <button 
                    className="qo-task-card__action" 
                    style={{ color: 'var(--red)' }}
                    onClick={() => onDelete(task.id)}
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
