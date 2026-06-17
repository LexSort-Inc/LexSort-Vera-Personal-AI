use std::process::Command;
use crate::quick_organizer::{Task, TaskList};

pub fn request_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // On macOS, executing a simple osascript to read calendar triggers the system permission dialog.
        // We will run a quick check script.
        let script = r#"
            var app = Application('Calendar');
            app.calendars().length;
            true;
        "#;
        
        let output = Command::new("osascript")
            .arg("-l")
            .arg("JavaScript")
            .arg("-e")
            .arg(script)
            .output();
            
        match output {
            Ok(out) => {
                let success = out.status.success();
                Ok(success)
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
on toISODate(theDate)
    set y to year of theDate as string
    set m to (month of theDate as integer) as string
    if length of m is 1 then set m to "0" & m
    set d to day of theDate as string
    if length of d is 1 then set d to "0" & d
    set h to hours of theDate as string
    if length of h is 1 then set h to "0" & h
    set min to minutes of theDate as string
    if length of min is 1 then set min to "0" & min
    set s to seconds of theDate as string
    if length of s is 1 then set s to "0" & s
    return y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
end toISODate

on lowercase(str)
    set theComparison to "abcdefghijklmnopqrstuvwxyz"
    set theSource to "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    set theResult to ""
    repeat with i from 1 to count of str
        set char to character i of str
        set pos to offset of char in theSource
        if pos is not 0 then
            set theResult to theResult & character pos of theComparison
        else
            set theResult to theResult & char
        end if
    end repeat
    return theResult
end lowercase

on replaceText(findStr, replaceStr, textStr)
    set oldDelims to AppleScript's text item delimiters
    set AppleScript's text item delimiters to findStr
    set theItems to text items of textStr
    set AppleScript's text item delimiters to replaceStr
    set theResult to theItems as string
    set AppleScript's text item delimiters to oldDelims
    return theResult
end replaceText

on getEvents(daysAhead)
    tell application "Calendar"
        set now to (current date)
        set hours of now to 0
        set minutes of now to 0
        set seconds of now to 0
        
        set endLimit to now + (daysAhead * 24 * 60 * 60)
        set jsonParts to {{}}
        
        -- Get names of all writable calendars to avoid slow references
        set writableCalNames to name of every calendar whose writable is true
        
        repeat with calNameRef in writableCalNames
            set calName to calNameRef as string
            set calNameLower to my lowercase(calName)
            
            if (calNameLower does not contain "birthday") and (calNameLower does not contain "holiday") and (calNameLower does not contain "siri") and (calNameLower does not contain "reminder") then
                try
                    with timeout of 3 seconds
                        -- Fetch calendar by name directly
                        set theCalendar to calendar calName
                        set calendarEvents to (every event of theCalendar whose (start date is greater than or equal to now) and (start date is less than or equal to endLimit))
                        
                        repeat with theEvent in calendarEvents
                            try
                                set eventTitle to summary of theEvent
                                set cleanTitle to my replaceText("\"", "\\\"", eventTitle)
                                set cleanTitle to my replaceText(linefeed, " ", cleanTitle)
                                set cleanTitle to my replaceText(return, " ", cleanTitle)
                                
                                set eventStart to my toISODate(start date of theEvent)
                                set eventEnd to my toISODate(end date of theEvent)
                                set eventAllDay to allday event of theEvent
                                
                                if eventAllDay is true then
                                    set eventAllDayStr to "true"
                                else
                                    set eventAllDayStr to "false"
                                end if
                                
                                set eventDesc to description of theEvent
                                if eventDesc is missing value then
                                    set eventDescStr to "null"
                                else
                                    set cleanDesc to my replaceText("\"", "\\\"", eventDesc)
                                    set cleanDesc to my replaceText(linefeed, "\\n", cleanDesc)
                                    set cleanDesc to my replaceText(return, "\\r", cleanDesc)
                                    set eventDescStr to "\"" & cleanDesc & "\""
                                end if
                                
                                set end of jsonParts to "{{\"title\":\"" & cleanTitle & "\",\"start_time\":\"" & eventStart & "\",\"end_time\":\"" & eventEnd & "\",\"all_day\":" & eventAllDayStr & ",\"notes\":" & eventDescStr & "}}"
                            end try
                        end repeat
                    end timeout
                on error err
                    log "Skipped calendar " & calName & " due to timeout or error: " & err
                end try
            end if
        end repeat
        
        -- Combine into a JSON array
        set oldDelims to AppleScript's text item delimiters
        set AppleScript's text item delimiters to ","
        set jsonList to jsonParts as string
        set AppleScript's text item delimiters to oldDelims
        return "[" & jsonList & "]"
    end tell
end getEvents

return getEvents({})
"#, days_ahead);
        
        let output = Command::new("osascript")
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
                $end = $now.AddDays({})
                
                $result = @()
                foreach ($event in $events) {{
                    if ($event.Start -ge $now -and $event.Start -le $end) {{
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
        "#, days_ahead);
        
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
