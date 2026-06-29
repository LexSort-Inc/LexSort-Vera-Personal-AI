use chrono::{DateTime, Datelike, Duration, TimeZone, Timelike, Utc, Weekday};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecurrenceRule {
    pub freq: String,
    pub interval: u32,
    pub days: Option<Vec<String>>,
    pub time: Option<String>,
}

impl RecurrenceRule {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }

    pub fn from_json(s: &str) -> Option<Self> {
        serde_json::from_str(s).ok()
    }
}

pub fn parse_recurrence(input: &str) -> Option<RecurrenceRule> {
    let lower = input.trim().to_lowercase();
    let lower = lower.as_str();

    if lower == "weekdays" || lower == "every weekday" {
        return Some(RecurrenceRule {
            freq: "weekly".into(),
            interval: 1,
            days: Some(vec![
                "monday".into(),
                "tuesday".into(),
                "wednesday".into(),
                "thursday".into(),
                "friday".into(),
            ]),
            time: None,
        });
    }

    if lower == "weekends" || lower == "every weekend" {
        return Some(RecurrenceRule {
            freq: "weekly".into(),
            interval: 1,
            days: Some(vec!["saturday".into(), "sunday".into()]),
            time: None,
        });
    }

    if lower == "daily" || lower == "every day" || lower == "everyday" {
        return Some(RecurrenceRule {
            freq: "daily".into(),
            interval: 1,
            days: None,
            time: None,
        });
    }

    if let Some(n) = extract_every_n(lower, &["day", "days"]) {
        return Some(RecurrenceRule {
            freq: "daily".into(),
            interval: n,
            days: None,
            time: None,
        });
    }

    if lower == "weekly" || lower == "every week" {
        return Some(RecurrenceRule {
            freq: "weekly".into(),
            interval: 1,
            days: None,
            time: None,
        });
    }

    if let Some(n) = extract_every_n(lower, &["week", "weeks"]) {
        return Some(RecurrenceRule {
            freq: "weekly".into(),
            interval: n,
            days: None,
            time: None,
        });
    }

    if lower.starts_with("every ") {
        let rest = &lower[6..];
        let days = extract_days(rest);
        if !days.is_empty() {
            let time = extract_time(lower);
            return Some(RecurrenceRule {
                freq: "weekly".into(),
                interval: 1,
                days: Some(days),
                time,
            });
        }
    }

    if lower == "monthly" || lower == "every month" {
        return Some(RecurrenceRule {
            freq: "monthly".into(),
            interval: 1,
            days: None,
            time: None,
        });
    }

    if let Some(n) = extract_every_n(lower, &["month", "months"]) {
        return Some(RecurrenceRule {
            freq: "monthly".into(),
            interval: n,
            days: None,
            time: None,
        });
    }

    None
}

fn extract_every_n(input: &str, units: &[&str]) -> Option<u32> {
    let parts: Vec<&str> = input.split_whitespace().collect();
    if parts.len() >= 3 && parts[0] == "every" {
        if let Ok(n) = parts[1].parse::<u32>() {
            if units.iter().any(|u| parts[2].starts_with(u)) {
                return Some(n);
            }
        }
    }
    None
}

fn extract_days(input: &str) -> Vec<String> {
    let day_map: &[(&[&str], &str)] = &[
        (&["monday", "mon"], "monday"),
        (&["tuesday", "tue"], "tuesday"),
        (&["wednesday", "wed"], "wednesday"),
        (&["thursday", "thu"], "thursday"),
        (&["friday", "fri"], "friday"),
        (&["saturday", "sat"], "saturday"),
        (&["sunday", "sun"], "sunday"),
    ];

    let input = if let Some(pos) = input.find(" at ") {
        &input[..pos]
    } else {
        input
    };

    let tokens: Vec<&str> = input
        .split(|c: char| c == ',' || c == ' ')
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "and" && *s != "&")
        .collect();

    let mut days = Vec::new();
    for token in &tokens {
        for (aliases, canonical) in day_map {
            if aliases.iter().any(|a| a == token) {
                let canonical = canonical.to_string();
                if !days.contains(&canonical) {
                    days.push(canonical);
                }
            }
        }
    }
    days
}

fn extract_time(input: &str) -> Option<String> {
    let at_pos = input.find(" at ")?;
    let time_part = input[at_pos + 4..].trim();
    let time_part = time_part.split_whitespace().next()?;

    if time_part.ends_with("am") || time_part.ends_with("pm") {
        let is_pm = time_part.ends_with("pm");
        let digits = time_part.trim_end_matches("am").trim_end_matches("pm");

        let (h, m) = if digits.contains(':') {
            let parts: Vec<&str> = digits.splitn(2, ':').collect();
            let h = parts[0].parse::<u32>().ok()?;
            let m = parts[1].parse::<u32>().ok()?;
            (h, m)
        } else {
            let h = digits.parse::<u32>().ok()?;
            (h, 0)
        };

        let h24 = if is_pm && h < 12 {
            h + 12
        } else if !is_pm && h == 12 {
            0
        } else {
            h
        };
        return Some(format!("{:02}:{:02}", h24, m));
    }

    if time_part.contains(':') {
        let parts: Vec<&str> = time_part.splitn(2, ':').collect();
        if let (Ok(h), Ok(m)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
            if h < 24 && m < 60 {
                return Some(format!("{:02}:{:02}", h, m));
            }
        }
    }

    None
}

pub fn compute_next_due(rule: &RecurrenceRule, from: &DateTime<Utc>) -> Option<DateTime<Utc>> {
    match rule.freq.as_str() {
        "daily" => {
            let next = *from + Duration::days(rule.interval as i64);
            Some(apply_time(next, rule.time.as_deref()))
        }
        "weekly" => {
            if let Some(days) = &rule.days {
                let target_weekdays: Vec<Weekday> =
                    days.iter().filter_map(|d| parse_weekday(d)).collect();
                let mut candidate = *from + Duration::days(1);
                for _ in 0..7 {
                    if target_weekdays.contains(&candidate.weekday()) {
                        return Some(apply_time(candidate, rule.time.as_deref()));
                    }
                    candidate = candidate + Duration::days(1);
                }
                None
            } else {
                let next = *from + Duration::weeks(rule.interval as i64);
                Some(apply_time(next, rule.time.as_deref()))
            }
        }
        "monthly" => {
            let months_to_add = rule.interval as i32;
            let year = from.year();
            let month = from.month() as i32;
            let new_month_total = month - 1 + months_to_add;
            let new_year = year + new_month_total / 12;
            let new_month = (new_month_total % 12 + 1) as u32;
            let max_day = days_in_month(new_year, new_month);
            let new_day = from.day().min(max_day);
            let next = Utc
                .with_ymd_and_hms(new_year, new_month, new_day, from.hour(), from.minute(), 0)
                .single()?;
            Some(apply_time(next, rule.time.as_deref()))
        }
        _ => None,
    }
}

fn apply_time(dt: DateTime<Utc>, time_str: Option<&str>) -> DateTime<Utc> {
    if let Some(t) = time_str {
        let parts: Vec<&str> = t.splitn(2, ':').collect();
        if parts.len() == 2 {
            if let (Ok(h), Ok(m)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                if let Some(result) = dt.date_naive().and_hms_opt(h, m, 0) {
                    return DateTime::from_naive_utc_and_offset(result, Utc);
                }
            }
        }
    }
    dt
}

fn parse_weekday(day: &str) -> Option<Weekday> {
    match day {
        "monday" => Some(Weekday::Mon),
        "tuesday" => Some(Weekday::Tue),
        "wednesday" => Some(Weekday::Wed),
        "thursday" => Some(Weekday::Thu),
        "friday" => Some(Weekday::Fri),
        "saturday" => Some(Weekday::Sat),
        "sunday" => Some(Weekday::Sun),
        _ => None,
    }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_daily() {
        let r = parse_recurrence("daily").unwrap();
        assert_eq!(r.freq, "daily");
        assert_eq!(r.interval, 1);
    }

    #[test]
    fn test_every_2_days() {
        let r = parse_recurrence("every 2 days").unwrap();
        assert_eq!(r.freq, "daily");
        assert_eq!(r.interval, 2);
    }

    #[test]
    fn test_every_monday() {
        let r = parse_recurrence("every Monday").unwrap();
        assert_eq!(r.freq, "weekly");
        assert_eq!(r.days, Some(vec!["monday".to_string()]));
    }

    #[test]
    fn test_every_monday_and_wednesday() {
        let r = parse_recurrence("every Monday and Wednesday").unwrap();
        assert_eq!(
            r.days,
            Some(vec!["monday".to_string(), "wednesday".to_string()])
        );
    }

    #[test]
    fn test_weekdays() {
        let r = parse_recurrence("weekdays").unwrap();
        assert_eq!(r.days.unwrap().len(), 5);
    }

    #[test]
    fn test_weekends() {
        let r = parse_recurrence("weekends").unwrap();
        assert_eq!(r.days.unwrap().len(), 2);
    }

    #[test]
    fn test_monthly() {
        let r = parse_recurrence("monthly").unwrap();
        assert_eq!(r.freq, "monthly");
        assert_eq!(r.interval, 1);
    }

    #[test]
    fn test_time_extraction() {
        let r = parse_recurrence("every Monday at 9am").unwrap();
        assert_eq!(r.time, Some("09:00".to_string()));
    }

    #[test]
    fn test_unrecognized_returns_none() {
        assert!(parse_recurrence("tomorrow").is_none());
        assert!(parse_recurrence("next week").is_none());
        assert!(parse_recurrence("").is_none());
    }

    #[test]
    fn test_json_roundtrip() {
        let rule = RecurrenceRule {
            freq: "weekly".into(),
            interval: 1,
            days: Some(vec!["monday".into()]),
            time: Some("09:00".into()),
        };
        let json = rule.to_json();
        let parsed = RecurrenceRule::from_json(&json).unwrap();
        assert_eq!(rule, parsed);
    }

    #[test]
    fn test_compute_next_due_daily() {
        let rule = RecurrenceRule {
            freq: "daily".into(),
            interval: 1,
            days: None,
            time: None,
        };
        let from = Utc::now();
        let next = compute_next_due(&rule, &from).unwrap();
        assert!(next > from);
    }
}
