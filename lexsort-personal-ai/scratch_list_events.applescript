tell application "Calendar"
    set resultList to {}
    repeat with cal in calendars
        set calName to name of cal
        set calNameLower to my lowercase(calName)
        if (calNameLower does not contain "birthday") and (calNameLower does not contain "holiday") and (calNameLower does not contain "siri") and (calNameLower does not contain "reminder") then
            try
                set calEvents to events of cal
                repeat with ev in calEvents
                    set sd to start date of ev
                    set end of resultList to calName & " | " & (summary of ev) & " | " & (sd as string)
                end repeat
            end try
        end if
    end repeat
    return resultList
end tell

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
