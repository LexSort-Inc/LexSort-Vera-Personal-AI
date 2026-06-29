use std::process::Command;
use crate::quick_organizer::{Task, TaskList};

pub fn request_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // On macOS, executing a simple osascript to read calendar triggers the system permission dialog.
        // We will run a JXA script that explicitly requests access if status is NotDetermined (0)
        // using NSRunLoop to synchronously block until the user responds.
        let script = r#"
            ObjC.import('EventKit');
            ObjC.import('Foundation');
            var store = $.EKEventStore.alloc.init;
            var status = $.EKEventStore.authorizationStatusForEntityType(0);
            if (Number(status) === 0) {
                var done = false;
                store.requestAccessToEntityTypeCompletion(0, function(granted, error) {
                    done = true;
                });
                var limitDate = $.NSDate.dateWithTimeIntervalSinceNow(60);
                while (!done && limitDate.timeIntervalSinceNow > 0) {
                    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
                }
                status = $.EKEventStore.authorizationStatusForEntityType(0);
            }
            Number(status) === 3;
        "#;
        
        let output = Command::new("osascript")
            .arg("-l")
            .arg("JavaScript")
            .arg("-e")
            .arg(script)
            .output();
            
        match output {
            Ok(out) => {
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr);
                    return Err(format!("osascript failed: {}", err));
                }
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                Ok(stdout == "true")
            }
            Err(e) => Err(format!("Failed to execute permission request: {}", e))
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // On Windows, permission is checked dynamically during query execution.
        Ok(true)
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(false)
    }
}

pub fn get_calendar_events(days_ahead: u32) -> Result<Vec<Task>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(r#"
ObjC.import('EventKit');
var store = $.EKEventStore.alloc.init;
var status = $.EKEventStore.authorizationStatusForEntityType(0);
if (Number(status) !== 3) {{
    throw new Error("Calendar access not authorized");
}}
var cals = store.calendarsForEntityType(0);
if (!cals || cals.count === 0) {{
    JSON.stringify([]);
}} else {{
    var filteredCals = $.NSMutableArray.alloc.init;
    for (var i = 0; i < cals.count; i++) {{
        var cal = cals.objectAtIndex(i);
        var name = ObjC.unwrap(cal.title).toLowerCase();
        if (name.indexOf('birthday') === -1 && name.indexOf('holiday') === -1 && name.indexOf('siri') === -1 && name.indexOf('reminder') === -1) {{
            filteredCals.addObject(cal);
        }}
    }}
    if (filteredCals.count === 0) {{
        JSON.stringify([]);
    }} else {{
        var start = $.NSDate.dateWithTimeIntervalSinceNow(-{} * 24 * 3600);
        var end = $.NSDate.dateWithTimeIntervalSinceNow({} * 24 * 3600);
        var pred = store.predicateForEventsWithStartDateEndDateCalendars(start, end, filteredCals);
        var events = store.eventsMatchingPredicate(pred);
        
        var formatter = $.NSDateFormatter.alloc.init;
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss";
        
        var res = [];
        for (var i = 0; i < events.count; i++) {{
            var ev = events.objectAtIndex(i);
            var title = ObjC.unwrap(ev.title) || '';
            var notes = ObjC.unwrap(ev.notes) || null;
            var allDay = ObjC.unwrap(ev.isAllDay) ? true : false;
            var startTime = ObjC.unwrap(formatter.stringFromDate(ev.startDate));
            var endTime = ev.endDate ? ObjC.unwrap(formatter.stringFromDate(ev.endDate)) : null;
            res.push({{
                title: title,
                notes: notes,
                start_time: startTime,
                end_time: endTime,
                all_day: allDay
            }});
        }}
        JSON.stringify(res);
    }}
}}
"#, days_ahead, days_ahead);
        
        let output = Command::new("osascript")
            .arg("-l")
            .arg("JavaScript")
            .arg("-e")
            .arg(&script)
            .output();
            
        match output {
            Ok(out) => {
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr);
                    return Err(format!("osascript failed: {}", err));
                }
                
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                println!("[calendar_bridge] Raw output from AppleScript: {}", stdout);
                
                let raw_events: Vec<RawEvent> = serde_json::from_str(&stdout)
                    .map_err(|e| format!("Failed to parse calendar JSON: {}", e))?;
                    
                println!("[calendar_bridge] Parsed {} raw events.", raw_events.len());
                    
                let tasks = raw_events.into_iter().enumerate().map(|(idx, ev)| {
                    Task {
                        id: format!("system_event_{}", idx),
                        title: ev.title,
                        notes: ev.notes,
                        list: TaskList::Today,
                        completed: false,
                        created_at: chrono::Utc::now().to_rfc3339(),
                        completed_at: None,
                        ai_breakdown: None,
                        start_time: Some(ev.start_time),
                        end_time: ev.end_time,
                        category: Some("system".to_string()),
                        all_day: Some(ev.all_day),
                        recurrence_rule: None,
                        next_due: None,
                        recurrence_end: None,
                    }
                }).collect();
                
                Ok(tasks)
            }
            Err(e) => Err(format!("Failed to execute osascript: {}", e))
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows implementation using a lightweight PowerShell COM/Outlook bridge
        let ps_script = format!(r#"
            $ErrorActionPreference = 'Stop'
            try {{
                $outlook = New-Object -ComObject Outlook.Application -ErrorAction SilentlyContinue
                if (-not $outlook) {{
                    Write-Output "[]"
                    exit
                }}
                $namespace = $outlook.GetNamespace('MAPI')
                $calendar = $namespace.GetDefaultFolder(9)
                $events = $calendar.Items
                $events.Sort('[Start]')
                $now = [DateTime]::Now
                $start = $now.AddDays(-{})
                $end = $now.AddDays({})
                
                $result = @()
                foreach ($event in $events) {{
                    if ($event.Start -ge $start -and $event.Start -le $end) {{
                        $result += [PSCustomObject]@{{
                            title = $event.Subject
                            notes = $event.Body
                            start_time = $event.Start.ToString('o')
                            end_time = $event.End.ToString('o')
                            all_day = $event.AllDayEvent
                        }}
                    }}
                }}
                $result | ConvertTo-Json -Compress
            }} catch {{
                Write-Output "[]"
            }}
        "#, days_ahead, days_ahead);
        
        let output = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&ps_script)
            .output();
            
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if stdout.is_empty() || stdout == "[]" {
                    return Ok(vec![]);
                }
                
                let raw_events: Vec<RawEvent> = serde_json::from_str(&stdout)
                    .unwrap_or_default();
                    
                let tasks = raw_events.into_iter().enumerate().map(|(idx, ev)| {
                    Task {
                        id: format!("system_event_{}", idx),
                        title: ev.title,
                        notes: ev.notes,
                        list: TaskList::Today,
                        completed: false,
                        created_at: chrono::Utc::now().to_rfc3339(),
                        completed_at: None,
                        ai_breakdown: None,
                        start_time: Some(ev.start_time),
                        end_time: ev.end_time,
                        category: Some("system".to_string()),
                        all_day: Some(ev.all_day),
                        recurrence_rule: None,
                        next_due: None,
                        recurrence_end: None,
                    }
                }).collect();
                
                Ok(tasks)
            }
            Err(_) => Ok(vec![]) // Fallback silently on error (e.g. powershell not found or outlook absent)
        }
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(vec![])
    }
}

#[derive(serde::Deserialize, serde::Serialize)]
struct RawEvent {
    title: String,
    notes: Option<String>,
    start_time: String,
    end_time: Option<String>,
    all_day: bool,
}

#[tauri::command]
pub fn request_calendar_permission() -> Result<bool, String> {
    request_permission()
}

#[tauri::command]
pub fn import_calendar_events(days_ahead: u32) -> Result<Vec<Task>, String> {
    get_calendar_events(days_ahead)
}



#[tauri::command]
pub fn refresh_calendar_events() -> Result<Vec<Task>, String> {
    get_calendar_events(30)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_permission_fn() {
        let res = request_permission();
        assert!(res.is_ok());
        let allowed = res.unwrap();
        println!("request_permission returned: {}", allowed);
    }

    #[test]
    fn test_get_calendar_events() {
        let events = get_calendar_events(30);
        assert!(events.is_ok());
        let list = events.unwrap();
        println!("Fetched {} events from calendar", list.len());
        for ev in &list {
            println!("Event: {} (Start: {:?}, All Day: {:?})", ev.title, ev.start_time, ev.all_day);
        }
        let test_occurrences: Vec<&Task> = list.iter().filter(|t| t.title == "VERA Recurrence Test Event").collect();
        println!("Found {} occurrences of VERA Recurrence Test Event", test_occurrences.len());
        assert!(test_occurrences.len() > 0);
    }
}
