# n8n-nodes-caldav

> 🔌 Connect your calendars to n8n! Automate Nextcloud, iCloud, Google Calendar, and any CalDAV-compatible calendar.

[n8n](https://n8n.io/) is a workflow automation platform.

## Quick Start

1. Add your calendar credentials (see [Setup Guide](#setup-guide))
2. Start automating! ✨

## What You Can Do

### 📅 Manage Your Calendar

- Get all your calendars
- Create, view, update, and delete events
- Create and manage todos/tasks
- Add attendees to events
- Set up recurring events (daily meetings, weekly reminders, etc.)

### 🔔 Automate with Triggers

- Get notified when someone creates a new event
- React when events are updated or rescheduled
- Trigger workflows when events start (great for reminders!)
- Set a "minutes before" offset to trigger ahead of event start times
- Works perfectly with recurring events - each occurrence triggers separately

### 🔗 Works With Your Favorite Calendar Apps

- ✅ Nextcloud Calendar
- ✅ iCloud Calendar
- ✅ Google Calendar (via CalDAV)
- ✅ Radicale
- ✅ Any CalDAV-compatible calendar server

## Setup Guide

After installing the node, you'll need to connect it to your calendar:

### Nextcloud Calendar

1. **Server URL**: `https://your-nextcloud.com/remote.php/dav`
   - Replace `your-nextcloud.com` with your actual Nextcloud server address
2. **Username**: Your Nextcloud username
3. **Password**: Your Nextcloud password
   - **Tip**: For better security, create an app-specific password in Nextcloud Settings → Security

### iCloud Calendar

1. **Server URL**: `https://caldav.icloud.com`
2. **Username**: Your Apple ID email address
3. **Password**: You'll need an app-specific password
   - Go to [appleid.apple.com](https://appleid.apple.com)
   - Navigate to "Sign-In and Security" → "App-Specific Passwords"
   - Generate a new password for n8n

### Google Calendar

1. **Server URL**: `https://apidata.googleusercontent.com/caldav/v2/`
2. **Username**: Your full Gmail address
3. **Password**: Create an app password in your Google account settings
   - Note: You'll need to enable 2-factor authentication first

### Other CalDAV Servers (Radicale, Baikal, etc.)

1. **Server URL**: Your server's CalDAV URL (ask your admin if unsure)
2. **Username**: Your account username
3. **Password**: Your account password

## How to Use

### Working with Calendars

- **Get All**: Get all your available calendars with details like URL, display name, description, timezone, and sync tokens

### Working with Events

- **Create**: Add a new event to your calendar
  - Set title, start/end times, location, description
  - Add attendees by email (comma-separated)
  - Create recurring events with RRULE syntax (daily, weekly, monthly, etc.)
  - Mark as all-day event
- **Get**: Retrieve a specific event by its URL
- **Get All**: Fetch all events from a calendar
  - Optional: Filter by date range (time range start/end)
  - Optional: Expand recurring events into individual occurrences
- **Update**: Modify an existing event (requires event URL and ETag for conflict detection)
- **Delete**: Remove an event from your calendar

### Working with Todos

- **Create**: Add a new task to your calendar
  - Set title, description, due date, priority, and status
  - Mark as completed
- **Get**: Retrieve a specific todo by its URL
- **Get All**: Fetch all tasks from a calendar
  - Optional: Filter by status (Needs Action, In Progress, Completed, Cancelled)
- **Update**: Modify an existing todo (requires todo URL and ETag for conflict detection)
- **Delete**: Remove a todo from your calendar

### Triggers (Start Workflows Automatically)

The CalDAV Trigger node watches your calendar and starts workflows when things happen:

- **Event Created**: Triggers when a new event is created
  - Great for: Sending welcome emails to meeting attendees, logging new bookings

- **Event Updated**: Triggers when someone changes an event
  - Great for: Notifying attendees of schedule changes, updating external systems

- **Event Started**: Triggers when an event begins
  - Great for: Sending meeting reminders, starting Zoom calls, posting to Slack
  - **Minutes Before**: Configure a lead time to trigger X minutes before the event starts (0 = trigger exactly at start time)
  - **Bonus**: For recurring events (like "Daily Standup"), this triggers for each occurrence

## Real-World Examples

### 💼 Automatic Meeting Room Booking

When someone books a meeting through your website:

```
Webhook (booking form)
  ↓
CalDAV: Create Event
  ↓
Send confirmation email
```

### 📧 Daily Schedule Email

Get your day's schedule every morning:

```
Schedule Trigger (Every day at 6 AM)
  ↓
CalDAV: Get All Events (today only)
  ↓
Send email with your schedule
```

### 🔔 Smart Meeting Reminders

Get reminded before any meeting starts (works great with recurring meetings!):

```
CalDAV Trigger: Event Started (Minutes Before: 5)
  ↓
Send SMS/Slack message
```

**Special feature**: If you have a "Daily Standup" recurring event, you'll get a reminder every single day automatically!

### 📊 Calendar Analytics

Track all your meetings in a database:

```
CalDAV Trigger: Event Created
  ↓
Save to database (Postgres/MySQL/etc.)
  ↓
Build reports on meeting trends
```

### 🎯 Task Management Integration

Sync your calendar todos with your project management tool:

```
CalDAV Trigger: Event Created (on "Tasks" calendar)
  ↓
Create card in Trello/Asana/Jira
```

## Recurring Events

You can create events that repeat automatically! Here are some examples:

### Common Recurring Event Patterns

When creating an event, use the "Recurrence Rule (RRULE)" field:

- **Daily standup for 10 days**: `FREQ=DAILY;COUNT=10`
- **Weekly team meeting (every Monday)**: `FREQ=WEEKLY;BYDAY=MO`
- **Bi-weekly sprint planning**: `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO`
- **Monthly review (every 15th)**: `FREQ=MONTHLY;BYMONTHDAY=15`
- **Annual company party**: `FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25`
- **Gym every Mon/Wed/Fri**: `FREQ=WEEKLY;BYDAY=MO,WE,FR`

### How Triggers Handle Recurring Events

- **Event Created/Updated triggers**: Get notified once when you create or modify the series
  - Example: When you create "Weekly Team Meeting", you get 1 trigger

- **Event Started trigger**: Get notified for each occurrence (recurring events are expanded)
  - Example: "Weekly Team Meeting" triggers every Monday
  - Perfect for sending reminders or starting Zoom calls automatically!

## Troubleshooting

### "Calendar not found" error

Make sure you're using the correct server URL for your calendar provider (see Setup Guide above).

### Authentication failed

- **iCloud users**: You must use an app-specific password, not your regular password
- **Google Calendar users**: Enable 2-factor authentication and create an app password
- **Nextcloud users**: Check that your username and password are correct

### Events not showing up

- Try using "Get All" without filters first to see if events are being retrieved
- Check that you're looking at the correct calendar
- For time-range filters, make sure your dates are in the correct format

### Trigger not firing

- Triggers poll your calendar periodically (check your n8n polling interval settings)
- Make sure the calendar URL in your trigger matches exactly
- For "Event Started" triggers, the event must start within the polling interval

## License

MIT - Free to use and modify!

## Credits

This node is built with:

- [tsdav](https://github.com/natelindev/tsdav) - CalDAV client library
- [ical.js](https://github.com/kewisch/ical.js) - Calendar event parser

Thanks to all [contributors](https://github.com/Mic92/n8n-nodes-opencrow/graphs/contributors)!
