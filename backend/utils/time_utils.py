import os
from datetime import datetime, timedelta, timezone
from typing import Final

# Default to Pacific Time (matches the user's -07:00 from March 27)
DEFAULT_TIMEZONE: Final = "America/Los_Angeles"

def get_now_in_user_timezone(timezone_str: str | None = None):
    """Returns the current aware datetime in the given or configured user timezone."""
    import pytz
    tz_str = timezone_str or os.getenv("USER_TIMEZONE", DEFAULT_TIMEZONE)
    tz = pytz.timezone(tz_str)
    return datetime.now(tz)

def get_logical_date_iso(timezone_str: str | None = None) -> str:
    """
    Returns the logical date in ISO format (YYYY-MM-DD).
    The logical day resets at 3:00 AM in the user's timezone.
    """
    now = get_now_in_user_timezone(timezone_str)
    
    # Subtract 3 hours so that 3 AM becomes 0 AM on the SAME day
    # and 2:59 AM becomes 11:59 PM on the PREVIOUS day.
    logical_now = now - timedelta(hours=3)
    
    return logical_now.date().isoformat()

def get_window_for_date(date_str: str, timezone_str: str | None = None) -> tuple[str, str]:
    """
    Given a logical date (YYYY-MM-DD), returns the (start, end) 
    UTC timestamps corresponding to 3:00 AM of that day 
    to 2:59:59 AM of the next day in the given timezone.
    Returns ISO format strings in UTC.
    """
    import pytz
    tz_str = timezone_str or os.getenv("USER_TIMEZONE", DEFAULT_TIMEZONE)
    tz = pytz.timezone(tz_str)
    
    # Parse the date and set to 3 AM in the user's timezone
    base_date = datetime.fromisoformat(date_str)
    start_local = tz.localize(base_date.replace(hour=3, minute=0, second=0, microsecond=0))
    
    # End is 23h 59m 59s later
    end_local = start_local + timedelta(hours=23, minutes=59, seconds=59)
    
    # Convert to UTC
    start_utc = start_local.astimezone(pytz.UTC)
    end_utc = end_local.astimezone(pytz.UTC)
    
    return start_utc.isoformat(), end_utc.isoformat()
