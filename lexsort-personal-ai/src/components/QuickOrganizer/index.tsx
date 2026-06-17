import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Task, TaskList, TaskCategory } from './types';
import { parseNaturalLanguageTask } from './nlpParser';
import { VeraCopilot } from './VeraCopilot';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

const CATEGORIES: { id: TaskCategory; label: string; color: string }[] = [
    { id: 'urgent',   label: 'Urgent',   color: 'var(--red)' },
    { id: 'task',     label: 'Task',     color: 'var(--accent)' },
    { id: 'personal', label: 'Personal', color: '#a855f7' },
    { id: 'system',   label: 'System',   color: 'var(--text-muted)' },
];

interface QuickOrganizerProps {
    activeModel?: string;
    serverPort?: number;
}

export function QuickOrganizer({ activeModel = "llama3.2:3b", serverPort = 11434 }: QuickOrganizerProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [systemEvents, setSystemEvents] = useState<Task[]>([]);
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [view, setView] = useState<'month' | 'week' | 'day'>('week');
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // Voice Input (Speech to Text) Logic
    const initialTextRef = useRef('');
    const speech = useSpeechRecognition({
        onResult: (transcript) => {
            const base = initialTextRef.current;
            const space = base && !base.endsWith(' ') ? ' ' : '';
            setNewTaskTitle(base + space + transcript);
        },
        onError: (err) => {
            console.error('Speech Recognition Error in Quick Add:', err);
        }
    });

    const toggleSpeech = () => {
        if (speech.isListening) {
            speech.stop();
        } else {
            initialTextRef.current = newTaskTitle;
            speech.start();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewTaskTitle(val);
        if (speech.isListening) {
            initialTextRef.current = val;
            speech.restart();
        }
    };
    
    // Calendar import and onboarding states
    const [calendarImported, setCalendarImported] = useState<string | null>(() => {
        return localStorage.getItem('vera_calendar_imported');
    });
    
    // Task Edit / Add Modal state
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    
    // Chat Overlay state
    const [showChatOverlay, setShowChatOverlay] = useState(false);
    const [chatTriggerText, setChatTriggerText] = useState<string | null>(null);

    useEffect(() => {
        loadTasks();
        if (calendarImported === 'approved') {
            loadSystemEvents();
        }
    }, [calendarImported]);

    useEffect(() => {
        const handleRefresh = () => {
            loadSystemEvents();
            setCalendarImported(localStorage.getItem('vera_calendar_imported'));
        };
        const handleDisconnect = () => {
            setSystemEvents([]);
            setCalendarImported('declined');
        };
        window.addEventListener('vera-calendar-refresh', handleRefresh);
        window.addEventListener('vera-calendar-disconnect', handleDisconnect);
        return () => {
            window.removeEventListener('vera-calendar-refresh', handleRefresh);
            window.removeEventListener('vera-calendar-disconnect', handleDisconnect);
        };
    }, []);

    async function loadTasks() {
        try {
            const fetched = await invoke<Task[]>('get_tasks');
            setTasks(fetched);
        } catch (e) {
            console.error('Failed to load tasks:', e);
        }
    }

    async function loadSystemEvents() {
        try {
            const fetched = await invoke<Task[]>('import_calendar_events', { daysAhead: 30 });
            console.log('[QuickOrganizer] import_calendar_events returned:', fetched);
            setSystemEvents(fetched);
        } catch (e) {
            console.error('Failed to load system events:', e);
        }
    }

    // Helper for date formatting
    const formatDateKey = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Helper for navigating calendar dates
    const handlePrev = () => {
        const d = new Date(currentDate);
        if (view === 'week') d.setDate(d.getDate() - 7);
        else if (view === 'month') d.setMonth(d.getMonth() - 1);
        else d.setDate(d.getDate() - 1);
        setCurrentDate(d);
    };

    const handleNext = () => {
        const d = new Date(currentDate);
        if (view === 'week') d.setDate(d.getDate() + 7);
        else if (view === 'month') d.setMonth(d.getMonth() + 1);
        else d.setDate(d.getDate() + 1);
        setCurrentDate(d);
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    // NLP Quick Add
    async function handleQuickAdd() {
        const title = newTaskTitle.trim();
        if (!title) return;

        if (speech.isListening) {
            speech.stop();
        }
        
        // Use client-side NLP parser (0ms lag)
        const parsed = parseNaturalLanguageTask(title);
        
        try {
            const task = await invoke<Task>('create_task', {
                title: parsed.title,
                list: 'today' as TaskList,
                startTime: parsed.start_time,
                endTime: parsed.end_time,
                category: parsed.category,
                allDay: parsed.all_day,
            });
            setTasks(prev => [...prev, task]);
            setNewTaskTitle('');
        } catch (e) {
            console.error('Failed to create task:', e);
        }
    }

    // Task Completion
    async function handleToggleComplete(taskId: string, currentCompleted: boolean) {
        try {
            if (currentCompleted) {
                // Uncomplete task
                const task = tasks.find(t => t.id === taskId);
                if (task) {
                    const updated = { ...task, completed: false, completed_at: null };
                    await invoke('update_task', { task: updated });
                    setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
                }
            } else {
                await invoke('complete_task', { taskId });
                setTasks(prev => prev.map(t =>
                    t.id === taskId
                        ? { ...t, completed: true, completed_at: new Date().toISOString() }
                        : t
                ));
            }
        } catch (e) {
            console.error('Failed to toggle completion:', e);
        }
    }

    // Task Deletion
    async function handleDelete(taskId: string) {
        try {
            await invoke('delete_task', { taskId });
            setTasks(prev => prev.filter(t => t.id !== taskId));
            setShowEditModal(false);
        } catch (e) {
            console.error('Failed to delete task:', e);
        }
    }

    // Edit Task Save
    async function handleSaveEditedTask(updated: Task) {
        try {
            await invoke('update_task', { task: updated });
            setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
            setShowEditModal(false);
            setEditingTask(null);
        } catch (e) {
            console.error('Failed to update task:', e);
        }
    }

    // Calendar Imports Onboarding Action
    async function handleImportCalendar() {
        try {
            const allowed = await invoke<boolean>('request_calendar_permission');
            if (allowed) {
                localStorage.setItem('vera_calendar_imported', 'approved');
                setCalendarImported('approved');
            } else {
                localStorage.setItem('vera_calendar_imported', 'declined');
                setCalendarImported('declined');
            }
        } catch (e) {
            console.error('Calendar permission request failed:', e);
            localStorage.setItem('vera_calendar_imported', 'declined');
            setCalendarImported('declined');
        }
    }

    // Date navigation helpers
    const getMonday = (d: Date) => {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        return new Date(d.setDate(diff));
    };

    const getWeekDates = (d: Date) => {
        const monday = getMonday(new Date(d));
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const next = new Date(monday);
            next.setDate(monday.getDate() + i);
            dates.push(next);
        }
        return dates;
    };

    const weekDates = getWeekDates(currentDate);

    // Filter and group tasks
    const allEvents = [...tasks, ...systemEvents];

    const getEventsForDate = (date: Date) => {
        const key = formatDateKey(date);
        return allEvents.filter(event => {
            if (!event.start_time) return false;
            const eventDateKey = event.start_time.split('T')[0];
            
            // Search filter
            if (searchQuery && showSearch) {
                return eventDateKey === key && event.title.toLowerCase().includes(searchQuery.toLowerCase());
            }
            return eventDateKey === key;
        });
    };

    const getHoursArray = () => {
        const hours = [];
        for (let i = 9; i <= 18; i++) {
            hours.push(i);
        }
        return hours;
    };

    const hours = getHoursArray();

    // Grouping tasks for Right Sidebar
    const todayKey = formatDateKey(new Date());
    const todayTasks = tasks.filter(t => {
        if (!t.start_time) return false;
        return t.start_time.split('T')[0] === todayKey;
    });

    const thisWeekTasks = tasks.filter(t => {
        if (!t.start_time) return false;
        const taskDate = t.start_time.split('T')[0];
        const taskTime = new Date(t.start_time).getTime();
        
        // Find if task is in the current calendar week, and not today
        const isToday = taskDate === todayKey;
        const weekStart = weekDates[0].getTime();
        const weekEnd = weekDates[6].getTime() + 86400000; // end of sunday
        
        return taskTime >= weekStart && taskTime < weekEnd && !isToday;
    });

    // Chat Trigger from Sidebar chips
    const handleTriggerChatText = (text: string) => {
        setChatTriggerText(text);
        setShowChatOverlay(true);
    };

    return (
        <div className="qo-shell">
            {/* Header */}
            <div className="qo-header">
                <div className="qo-header__title-group">
                    <h1 className="qo-header__title">Quick Organizer</h1>
                    <span className="qo-header__badge">Free</span>
                </div>

                {/* View Selector / Navigator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {showSearch && (
                        <input
                            type="text"
                            className="qo-add-input"
                            style={{ width: '160px', padding: '6px 12px' }}
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    )}
                    <button
                        className={`qo-btn-icon ${showSearch ? 'active' : ''}`}
                        onClick={() => setShowSearch(!showSearch)}
                        title="Search"
                    >
                        🔍
                    </button>
                    <div className="qo-view-buttons">
                        {(['month', 'week', 'day'] as const).map(v => (
                            <button
                                key={v}
                                className={`qo-view-btn ${view === v ? 'active' : ''}`}
                                onClick={() => setView(v)}
                            >
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Sub-header Navigation */}
            <div className="qo-subheader">
                <div className="qo-nav-controls">
                    <button className="qo-nav-btn" onClick={handlePrev}>&lt;</button>
                    <button className="qo-nav-btn" onClick={handleToday}>Today</button>
                    <button className="qo-nav-btn" onClick={handleNext}>&gt;</button>
                    <span className="qo-current-date-label">
                        {currentDate.toLocaleDateString('en-US', {
                            month: 'long',
                            year: 'numeric',
                            day: view === 'day' ? 'numeric' : undefined
                        })}
                    </span>
                </div>

                <button className="qo-add-btn" onClick={() => {
                    setEditingTask({
                        id: '',
                        title: '',
                        notes: null,
                        list: 'today',
                        completed: false,
                        created_at: new Date().toISOString(),
                        completed_at: null,
                        ai_breakdown: null,
                        start_time: new Date().toISOString(),
                        end_time: new Date(Date.now() + 3600000).toISOString(),
                        category: 'task',
                        all_day: false
                    });
                    setShowEditModal(true);
                }}>
                    + Add task
                </button>
            </div>

            <div className="qo-body">
                {/* Left Pane: Calendar Grid */}
                <div className="qo-calendar-pane">
                    {/* Onboarding Banner if Calendar flag is absent */}
                    {calendarImported === null && (
                        <div className="qo-onboarding-banner">
                            <div className="qo-onboarding-banner__content">
                                📅 <strong>Import events from your system calendar?</strong> VERA will read your local events for the next 30 days so you can plan around meetings. VERA never modifies your calendar.
                            </div>
                            <div className="qo-onboarding-banner__actions">
                                <button className="qo-add-btn" onClick={handleImportCalendar}>Import</button>
                                <button className="qo-add-btn" style={{ background: 'var(--border)', color: 'var(--text)' }} onClick={() => {
                                    localStorage.setItem('vera_calendar_imported', 'declined');
                                    setCalendarImported('declined');
                                }}>Decline</button>
                            </div>
                        </div>
                    )}

                    {/* View rendering */}
                    {view === 'week' ? (
                        <div className="qo-calendar-week-view">
                            {/* Days Header */}
                            <div className="qo-calendar-header-row">
                                <div className="qo-calendar-time-col-spacer" />
                                {weekDates.map(date => {
                                    const isToday = formatDateKey(date) === formatDateKey(new Date());
                                    return (
                                        <div key={date.toString()} className="qo-calendar-header-day">
                                            <span className="qo-calendar-header-day-name">
                                                {date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                                            </span>
                                            <span className={`qo-calendar-header-day-num ${isToday ? 'qo-calendar-header-day-num--today' : ''}`}>
                                                {date.getDate()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* All Day Row */}
                            <div className="qo-calendar-allday-row">
                                <div className="qo-calendar-time-col-spacer" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>All Day</div>
                                {weekDates.map(date => {
                                    const dayEvents = getEventsForDate(date).filter(e => e.all_day);
                                    return (
                                        <div key={`allday-${date.toString()}`} className="qo-calendar-allday-cell">
                                            {dayEvents.map(event => (
                                                <div
                                                    key={event.id}
                                                    className={`qo-calendar-event-pill qo-calendar-event-pill--${event.category || 'task'} ${event.completed ? 'completed' : ''}`}
                                                    onClick={() => event.category !== 'system' && (setEditingTask(event), setShowEditModal(true))}
                                                >
                                                    {event.title}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Grid Body */}
                            <div className="qo-calendar-grid-body">
                                <div className="qo-calendar-time-column">
                                    {hours.map(h => (
                                        <div key={h} className="qo-calendar-hour-label">
                                            {h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`}
                                        </div>
                                    ))}
                                </div>

                                <div className="qo-calendar-grid-columns">
                                    {weekDates.map(date => {
                                        const dayEvents = getEventsForDate(date).filter(e => !e.all_day);
                                        return (
                                            <div key={`col-${date.toString()}`} className="qo-calendar-grid-col">
                                                {/* Hour grid lines */}
                                                {hours.map(h => (
                                                    <div key={`line-${h}`} className="qo-calendar-grid-line" />
                                                ))}

                                                {/* Event placement */}
                                                {dayEvents.map(event => {
                                                    const sTime = new Date(event.start_time!);
                                                    const eTime = event.end_time ? new Date(event.end_time) : new Date(sTime.getTime() + 3600000);
                                                    
                                                    const startHour = sTime.getHours() + sTime.getMinutes() / 60;
                                                    const duration = (eTime.getTime() - sTime.getTime()) / 3600000;
                                                    
                                                    // Calculate percentages based on 9 AM - 7 PM (10 hours total range)
                                                    const top = Math.max(0, Math.min(100, ((startHour - 9) / 10) * 100));
                                                    const height = Math.min(100 - top, (duration / 10) * 100);

                                                    return (
                                                        <div
                                                            key={event.id}
                                                            className={`qo-calendar-event qo-calendar-event--${event.category || 'task'} ${event.completed ? 'completed' : ''}`}
                                                            style={{
                                                                top: `${top}%`,
                                                                height: `${height > 0 ? height : 10}%`,
                                                            }}
                                                            onClick={() => {
                                                                if (event.category !== 'system') {
                                                                    setEditingTask(event);
                                                                    setShowEditModal(true);
                                                                }
                                                            }}
                                                        >
                                                            <div className="qo-calendar-event-inner">
                                                                <div className="qo-calendar-event-title">{event.title}</div>
                                                                <div className="qo-calendar-event-time">
                                                                    {sTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : view === 'day' ? (
                        <div className="qo-calendar-day-view">
                            <div className="qo-calendar-header-row">
                                <div className="qo-calendar-time-col-spacer" />
                                <div className="qo-calendar-header-day active">
                                    <span className="qo-calendar-header-day-name">
                                        {currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
                                    </span>
                                </div>
                            </div>

                            <div className="qo-calendar-grid-body">
                                <div className="qo-calendar-time-column">
                                    {hours.map(h => (
                                        <div key={h} className="qo-calendar-hour-label">
                                            {h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`}
                                        </div>
                                    ))}
                                </div>

                                <div className="qo-calendar-grid-columns" style={{ gridTemplateColumns: '1fr' }}>
                                    <div className="qo-calendar-grid-col">
                                        {hours.map(h => (
                                            <div key={`line-${h}`} className="qo-calendar-grid-line" />
                                        ))}

                                        {getEventsForDate(currentDate).map(event => {
                                            const sTime = new Date(event.start_time!);
                                            const eTime = event.end_time ? new Date(event.end_time) : new Date(sTime.getTime() + 3600000);
                                            
                                            const startHour = sTime.getHours() + sTime.getMinutes() / 60;
                                            const duration = (eTime.getTime() - sTime.getTime()) / 3600000;
                                            
                                            const top = Math.max(0, Math.min(100, ((startHour - 9) / 10) * 100));
                                            const height = Math.min(100 - top, (duration / 10) * 100);

                                            return (
                                                <div
                                                    key={event.id}
                                                    className={`qo-calendar-event qo-calendar-event--${event.category || 'task'} ${event.completed ? 'completed' : ''}`}
                                                    style={{
                                                        top: `${top}%`,
                                                        height: `${height > 0 ? height : 10}%`,
                                                    }}
                                                    onClick={() => event.category !== 'system' && (setEditingTask(event), setShowEditModal(true))}
                                                >
                                                    <div className="qo-calendar-event-inner">
                                                        <div className="qo-calendar-event-title">{event.title}</div>
                                                        <div className="qo-calendar-event-time">
                                                            {sTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                            {event.notes && ` - ${event.notes}`}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Month View (Simple list grouped by date for this month)
                        <div className="qo-calendar-month-view">
                            <div className="qo-month-list">
                                {Array.from({ length: 30 }).map((_, i) => {
                                    const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1);
                                    const dayEvents = getEventsForDate(d);
                                    if (dayEvents.length === 0) return null;
                                    return (
                                        <div key={i} className="qo-month-day-row">
                                            <div className="qo-month-day-label">
                                                <strong>{d.getDate()}</strong>
                                                <span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                                            </div>
                                            <div className="qo-month-day-events">
                                                {dayEvents.map(event => (
                                                    <div
                                                        key={event.id}
                                                        className={`qo-month-event-pill qo-calendar-event-pill--${event.category || 'task'} ${event.completed ? 'completed' : ''}`}
                                                        onClick={() => event.category !== 'system' && (setEditingTask(event), setShowEditModal(true))}
                                                    >
                                                        {event.start_time && !event.all_day && (
                                                            <span style={{ marginRight: '6px', fontWeight: 600 }}>
                                                                {new Date(event.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                            </span>
                                                        )}
                                                        {event.title}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Pane: Tasks Sidebar */}
                <div className="qo-sidebar-pane">
                    {/* Quick Add Row */}
                    <div className="qo-sidebar-quickadd">
                        <div className="qo-add-row">
                            <input
                                className="qo-add-input"
                                type="text"
                                placeholder='Try "Call John Friday 2pm"'
                                value={newTaskTitle}
                                onChange={handleInputChange}
                                onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                            />
                            {speech.supported && (
                                <button
                                    className={`qo-add-mic-btn ${speech.isListening ? 'active' : ''}`}
                                    onClick={toggleSpeech}
                                    title={speech.isListening ? "Stop Voice Input" : "Start Voice Input"}
                                    type="button"
                                >
                                    {speech.isListening ? (
                                        <span className="mic-icon-active">🔴 🎤</span>
                                    ) : (
                                        <span className="mic-icon-inactive">🎤</span>
                                    )}
                                </button>
                            )}
                            <button
                                className="qo-add-btn"
                                onClick={handleQuickAdd}
                                disabled={!newTaskTitle.trim()}
                            >
                                Add
                            </button>
                        </div>
                        <div className="qo-quickadd-hint">
                            🪄 VERA understands natural language
                        </div>
                    </div>

                    {/* Today's Tasks */}
                    <div className="qo-sidebar-section">
                        <h4 className="qo-sidebar-section-title">TODAY</h4>
                        <div className="qo-sidebar-list">
                            {todayTasks.length === 0 ? (
                                <div className="qo-sidebar-empty">No tasks scheduled for today.</div>
                            ) : (
                                todayTasks.map(task => (
                                    <div key={task.id} className={`qo-sidebar-item ${task.completed ? 'completed' : ''}`}>
                                        <div
                                            className={`qo-sidebar-item-check ${task.completed ? 'done' : ''}`}
                                            onClick={() => handleToggleComplete(task.id, task.completed)}
                                        >
                                            {task.completed && '✓'}
                                        </div>
                                        <div className="qo-sidebar-item-content" onClick={() => { setEditingTask(task); setShowEditModal(true); }}>
                                            <div className="qo-sidebar-item-title">{task.title}</div>
                                            <div className="qo-sidebar-item-time">
                                                {task.start_time ? new Date(task.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '9:00 AM'}
                                                <span className={`qo-category-dot qo-category-dot--${task.category || 'task'}`} />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* This Week Tasks */}
                    <div className="qo-sidebar-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 className="qo-sidebar-section-title">THIS WEEK</h4>
                            <span className="qo-sidebar-badge">{thisWeekTasks.length} TASKS</span>
                        </div>
                        <div className="qo-sidebar-list">
                            {thisWeekTasks.length === 0 ? (
                                <div className="qo-sidebar-empty">No other tasks this week.</div>
                            ) : (
                                thisWeekTasks.map(task => {
                                    const date = new Date(task.start_time!);
                                    const dayBadge = date.toLocaleDateString('en-US', { weekday: 'short' });
                                    const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                    return (
                                        <div key={task.id} className={`qo-sidebar-item ${task.completed ? 'completed' : ''}`}>
                                            <div
                                                className={`qo-sidebar-item-check ${task.completed ? 'done' : ''}`}
                                                onClick={() => handleToggleComplete(task.id, task.completed)}
                                            >
                                                {task.completed && '✓'}
                                            </div>
                                            <div className="qo-sidebar-item-content" onClick={() => { setEditingTask(task); setShowEditModal(true); }}>
                                                <div className="qo-sidebar-item-title">{task.title}</div>
                                                <div className="qo-sidebar-item-time">
                                                    {dayBadge} {timeLabel}
                                                    <span className={`qo-category-dot qo-category-dot--${task.category || 'task'}`} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Ask VERA Prompts & Message Input */}
                    <div className="qo-sidebar-ask-section">
                        <div className="qo-sidebar-ask-title">Ask VERA about your schedule</div>
                        
                        <div className="qo-ask-chips">
                            <button className="qo-ask-chip" onClick={() => handleTriggerChatText("What's urgent today?")}>
                                What's urgent today?
                            </button>
                            <button className="qo-ask-chip" onClick={() => handleTriggerChatText("Plan my morning")}>
                                Plan my morning
                            </button>
                            <button className="qo-ask-chip" onClick={() => handleTriggerChatText("Break down a task")}>
                                Break down a task
                            </button>
                            <button className="qo-ask-chip" onClick={() => handleTriggerChatText("What can I defer?")}>
                                What can I defer?
                            </button>
                        </div>

                        <div className="qo-chat-input-wrapper">
                            <input
                                className="qo-chat-input"
                                type="text"
                                placeholder="Message Vera..."
                                onClick={() => setShowChatOverlay(true)}
                                readOnly
                            />
                            <button
                                className="qo-chat-send-btn"
                                onClick={() => setShowChatOverlay(true)}
                            >
                                Send
                            </button>
                        </div>
                    </div>

                    {/* VERA Chat Overlay */}
                    {showChatOverlay && (
                        <div className="qo-chat-overlay-container">
                            <div className="qo-chat-overlay-header">
                                <span className="qo-chat-overlay-title">🤖 VERA Copilot</span>
                                <button className="qo-chat-overlay-close" onClick={() => {
                                    setShowChatOverlay(false);
                                    setChatTriggerText(null);
                                }}>✕</button>
                            </div>
                            <VeraCopilot
                                tasks={[...tasks, ...systemEvents]}
                                activeModel={activeModel}
                                serverPort={serverPort}
                                initialPromptText={chatTriggerText}
                                onBreakdownCached={(taskId, breakdown) => {
                                    invoke('cache_ai_breakdown', { taskId, breakdown });
                                    setTasks(prev => prev.map(t =>
                                        t.id === taskId ? { ...t, ai_breakdown: breakdown } : t
                                    ));
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Task Edit / Add Modal */}
            {showEditModal && editingTask && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal-card" style={{ maxWidth: '420px' }}>
                        <header className="settings-header">
                            <h3 className="settings-title">{editingTask.id ? 'Edit Task' : 'New Task'}</h3>
                            <button className="settings-close-btn" onClick={() => setShowEditModal(false)}>✕</button>
                        </header>

                        <div className="settings-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                            <div>
                                <label className="settings-label">Title</label>
                                <input
                                    type="text"
                                    className="qo-add-input"
                                    style={{ width: '100%' }}
                                    value={editingTask.title}
                                    onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="settings-label">Notes</label>
                                <textarea
                                    className="qo-add-input"
                                    style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                                    value={editingTask.notes || ''}
                                    onChange={e => setEditingTask({ ...editingTask, notes: e.target.value || null })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                    <label className="settings-label">Date</label>
                                    <input
                                        type="date"
                                        className="qo-add-input"
                                        style={{ width: '100%' }}
                                        value={editingTask.start_time ? editingTask.start_time.split('T')[0] : ''}
                                        onChange={e => {
                                            const datePart = e.target.value;
                                            const timePart = editingTask.start_time ? editingTask.start_time.split('T')[1] || '09:00:00.000Z' : '09:00:00.000Z';
                                            setEditingTask({ ...editingTask, start_time: `${datePart}T${timePart}` });
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="settings-label">Time</label>
                                    <input
                                        type="time"
                                        className="qo-add-input"
                                        style={{ width: '100%' }}
                                        value={editingTask.start_time ? (editingTask.start_time.split('T')[1] || '').substring(0, 5) : '09:00'}
                                        onChange={e => {
                                            const timePart = e.target.value;
                                            const datePart = editingTask.start_time ? editingTask.start_time.split('T')[0] : formatDateKey(new Date());
                                            setEditingTask({ ...editingTask, start_time: `${datePart}T${timePart}:00.000Z` });
                                        }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                    <label className="settings-label">Category</label>
                                    <select
                                        className="qo-ask-select"
                                        style={{ width: '100%', padding: '6px' }}
                                        value={editingTask.category || 'task'}
                                        onChange={e => setEditingTask({ ...editingTask, category: e.target.value as TaskCategory })}
                                    >
                                        {CATEGORIES.filter(c => c.id !== 'system').map(c => (
                                            <option key={c.id} value={c.id}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '22px' }}>
                                    <label className="settings-checkbox-container" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            checked={editingTask.all_day || false}
                                            onChange={e => setEditingTask({ ...editingTask, all_day: e.target.checked })}
                                        />
                                        All Day Event
                                    </label>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                                {editingTask.id && (
                                    <button
                                        className="qo-add-btn"
                                        style={{ background: 'var(--red)', color: 'white', marginRight: 'auto' }}
                                        onClick={() => handleDelete(editingTask.id)}
                                    >
                                        Delete
                                    </button>
                                )}
                                <button
                                    className="qo-add-btn"
                                    style={{ background: 'var(--border)', color: 'var(--text)' }}
                                    onClick={() => setShowEditModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="qo-add-btn"
                                    onClick={() => {
                                        if (!editingTask.title.trim()) return;
                                        if (editingTask.id) {
                                            handleSaveEditedTask(editingTask);
                                        } else {
                                            // Creating new task
                                            invoke<Task>('create_task', {
                                                title: editingTask.title,
                                                list: 'today' as TaskList,
                                                startTime: editingTask.start_time,
                                                endTime: editingTask.end_time || null,
                                                category: editingTask.category || 'task',
                                                allDay: editingTask.all_day || false
                                            }).then(task => {
                                                setTasks(prev => [...prev, task]);
                                                setShowEditModal(false);
                                            });
                                        }
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
