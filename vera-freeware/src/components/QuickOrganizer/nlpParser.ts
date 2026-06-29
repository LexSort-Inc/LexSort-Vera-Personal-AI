import { TaskCategory } from './types';

interface ParsedTask {
    title: string;
    start_time: string | null;
    end_time: string | null;
    category: TaskCategory;
    all_day: boolean;
    recurrence_rule: string | null;
}

/**
 * Normalizes a recurrence rule string so the backend parser understands it.
 */
function extractRecurrence(text: string): { text: string; rule: string | null } {
    // ── Daily ────────────────────────────────────────────────────
    const daily = /\bevery\s+day\b/i;
    if (daily.test(text)) {
        return { text: text.replace(daily, '').trim(), rule: 'daily' };
    }
    const everyWeekday = /\b(every\s+weekday|every\s+week\s*day)\b/i;
    if (everyWeekday.test(text)) {
        return { text: text.replace(everyWeekday, '').trim(), rule: 'weekdays' };
    }

    // ── Weekly (every Monday, every Tue, every mon at 2pm) ─────
    const daysOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dayAbbr    = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayNames   = [...daysOfWeek, ...dayAbbr];
    const dayPattern = dayNames.join('|');
    const weekly = new RegExp(`\\bevery\\s+(${dayPattern})(?:s)?\\b`, 'i');
    let m = text.match(weekly);
    if (m) {
        let dayName = m[1].toLowerCase();
        // map abbreviation to full name
        const idx = dayAbbr.indexOf(dayName);
        if (idx !== -1) dayName = daysOfWeek[idx];
        const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        return { text: text.replace(weekly, '').trim(), rule: `weekly:${capitalized}` };
    }

    // ── Every N days ────────────────────────────────────────────
    const everyNDays = /\bevery\s+(\d+)\s+days?\b/i;
    m = text.match(everyNDays);
    if (m) {
        const n = m[1];
        return { text: text.replace(everyNDays, '').trim(), rule: `every:${n}d` };
    }

    return { text, rule: null };
}

export function parseNaturalLanguageTask(input: string): ParsedTask {
    let text = input.trim();
    let allDay = false;
    let category: TaskCategory = 'task';
    let start_time: string | null = null;
    let end_time: string | null = null;
    let recurrence_rule: string | null = null;

    // 0. Extract recurrence rule first (e.g. "every Monday at 2pm")
    const rec = extractRecurrence(text);
    text = rec.text;
    recurrence_rule = rec.rule;

    // 1. Parse all day flag
    const allDayRegex = /\b(all\s*day|allday)\b/i;
    if (allDayRegex.test(text)) {
        allDay = true;
        text = text.replace(allDayRegex, '');
    }

    // 2. Parse category keywords
    const categoryMap: { regex: RegExp; cat: TaskCategory }[] = [
        { regex: /\b(urgent|deadline|due|asap|critical)\b/i, cat: 'urgent' },
        { regex: /\b(personal|doctor|dentist|appt|birthday|party|vacation|holiday|family)\b/i, cat: 'personal' },
        { regex: /\b(meeting|standup|sync|call|review|stand-up|demo)\b/i, cat: 'system' }
    ];

    for (const item of categoryMap) {
        if (item.regex.test(text)) {
            category = item.cat;
            text = text.replace(item.regex, '');
            break; // take the first matched category
        }
    }

    // 3. Parse Time (e.g., 2:30pm, 2pm, 14:00, 9am, 9:00)
    let hour: number | null = null;
    let minute: number = 0;

    const time12hrRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
    const time24hrRegex = /\b(\d{1,2}):(\d{2})\b/;

    let match = text.match(time12hrRegex);
    if (match) {
        hour = parseInt(match[1], 10);
        if (match[2]) {
            minute = parseInt(match[2], 10);
        }
        const meridian = match[3].toLowerCase();
        if (meridian === 'pm' && hour < 12) {
            hour += 12;
        } else if (meridian === 'am' && hour === 12) {
            hour = 0;
        }
        text = text.replace(time12hrRegex, '');
    } else {
        match = text.match(time24hrRegex);
        if (match) {
            hour = parseInt(match[1], 10);
            minute = parseInt(match[2], 10);
            text = text.replace(time24hrRegex, '');
        }
    }

    // 4. Parse Day Keyword (today, tomorrow, monday/mon, etc.)
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayAbbreviations = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    
    let targetDate = new Date();
    let dayMatched = false;

    // Helper to add days
    const addDays = (date: Date, days: number) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    };

    if (/\b(today)\b/i.test(text)) {
        targetDate = new Date();
        text = text.replace(/\b(today)\b/i, '');
        dayMatched = true;
    } else if (/\b(tomorrow)\b/i.test(text)) {
        targetDate = addDays(new Date(), 1);
        text = text.replace(/\b(tomorrow)\b/i, '');
        dayMatched = true;
    } else {
        for (let i = 0; i < 7; i++) {
            const dayFullRegex = new RegExp(`\\b(${daysOfWeek[i]})\\b`, 'i');
            const dayAbbrRegex = new RegExp(`\\b(${dayAbbreviations[i]})\\b`, 'i');

            if (dayFullRegex.test(text) || dayAbbrRegex.test(text)) {
                const currentDay = new Date().getDay();
                let diff = i - currentDay;
                if (diff < 0) {
                    diff += 7; // next week
                } else if (diff === 0) {
                    // If they specify the current day name, assume today
                    diff = 0;
                }
                targetDate = addDays(new Date(), diff);
                text = text.replace(dayFullRegex, '').replace(dayAbbrRegex, '');
                dayMatched = true;
                break;
            }
        }
    }

    // If no day matched, we default to today
    if (!dayMatched) {
        targetDate = new Date();
    }

    // Set hour/minute on target date
    if (hour !== null) {
        targetDate.setHours(hour, minute, 0, 0);
        
        // Build ISO strings
        start_time = targetDate.toISOString();
        
        // Default duration 1 hour
        const endTarget = new Date(targetDate);
        endTarget.setHours(targetDate.getHours() + 1);
        end_time = endTarget.toISOString();
    } else {
        // If no time is specified, default to 9:00 AM today/target day
        if (allDay) {
            targetDate.setHours(0, 0, 0, 0);
            start_time = targetDate.toISOString();
            
            const endTarget = new Date(targetDate);
            endTarget.setHours(23, 59, 59, 999);
            end_time = endTarget.toISOString();
        } else {
            // Default time to 9 AM
            targetDate.setHours(9, 0, 0, 0);
            start_time = targetDate.toISOString();
            
            const endTarget = new Date(targetDate);
            endTarget.setHours(10, 0, 0, 0);
            end_time = endTarget.toISOString();
        }
    }

    // 5. Clean up title from stranded prepositions and excess spaces
    let cleanedTitle = text
        .replace(/\b(at|on|for|in|due|to)\b/gi, ' ') // remove relative prepositions
        .replace(/\s+/g, ' ')                        // collapse whitespace
        .trim();

    // If title is left completely empty, give it a placeholder
    if (!cleanedTitle) {
        cleanedTitle = "New Task";
    }

    return {
        title: cleanedTitle,
        start_time,
        end_time,
        category,
        all_day: allDay,
        recurrence_rule
    };
}
