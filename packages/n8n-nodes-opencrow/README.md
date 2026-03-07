# OpenCrow

Send trigger messages to [OpenCrow](https://github.com/pinpox/opencrow) via its
named pipe (FIFO).

Multi-line messages are collapsed to a single line since each line in the pipe
is a separate trigger.

**Node parameters:**

| Parameter | Description                                                           |
| --------- | --------------------------------------------------------------------- |
| Message   | The trigger message to send                                           |
| Pipe Path | Path to the FIFO (default: `/var/lib/opencrow/sessions/trigger.pipe`) |
