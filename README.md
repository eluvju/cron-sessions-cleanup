# OpenClaw Session Cleaner

A maintenance skill for OpenClaw that automatically cleans up orphaned cron job sessions to prevent system overload.

## The Problem

### What Happens in OpenClaw

When you set up cron jobs in OpenClaw (especially those running frequently, like arbitrage monitoring every minute), each execution creates a new session in the sessions store. These sessions follow a specific naming pattern:

```
agent:main:cron:<jobId>:<sessionId>
```

For example:
- `agent:main:cron:e5b75cac-2c82-41ae-b64b-37f08f16fe2e:run:abc123`
- `agent:main:cron:e5b75cac-2c82-41ae-b64b-37f08f16fe2e:run:def456`

### The Issue

The `:run:` sessions should be cleaned up after the cron job completes, but OpenClaw doesn't automatically delete them. This causes:

| Consequence | Impact |
|-------------|--------|
| **Session accumulation** | Thousands of orphaned sessions |
| **Memory bloat** | Increasing memory usage |
| **Slowdown** | Gateway becomes unresponsive (30+ second delays) |
| **System instability** | Timeouts and failures |

### Real Numbers

If you have a cron job running every minute:
- **1,440 sessions per day**
- **10,080 sessions per week**
- **43,200 sessions per month**

Without cleanup, the system becomes unusable.

## The Solution

### How Session Cleaner Works

The Session Cleaner skill solves this problem by:

1. **Scanning** the OpenClaw sessions file for sessions containing `:run:` in their keys
2. **Identifying** which sessions are orphaned cron job executions
3. **Backing up** the sessions file before making changes
4. **Deleting** only the orphaned `:run:` sessions
5. **Saving** the cleaned sessions file

### What Gets Cleaned

Only sessions matching this pattern are removed:
```
*:*:cron:*:run:*
```

The following are **NEVER** deleted:
- Main session (`agent:main:main`)
- Direct cron sessions (`agent:main:cron:<jobId>`)
- Any other session without `:run:`

## Installation

### Prerequisites

- Node.js 18 or higher
- Access to the OpenClaw sessions file (typically at `/root/.openclaw/agents/main/sessions/sessions.json`)
- Root/sudo access (for setting up automatic cron)

### Steps

1. Clone or copy the skill to your OpenClaw skills directory:

```bash
cd /root/.openclaw/workspace/skills
git clone https://github.com/eluvju/cron-sessions-cleanup.git session-cleaner
cd session-cleaner
```

2. Install dependencies (optional, pure Node.js):

```bash
npm install
```

3. Test the cleanup manually:

```bash
node index.js --dry-run    # See what would be cleaned
node index.js --cleanup    # Actually clean
```

4. Set up automatic cleanup:

```bash
sudo node index.js --setup 1h    # Clean every hour
```

## Usage

### Command Line Options

| Command | Description |
|---------|-------------|
| `node index.js --cleanup` | Clean orphaned sessions now |
| `node index.js --dry-run` | Show what would be cleaned without deleting |
| `node index.js --setup <freq>` | Set up automatic cleanup (requires sudo) |
| `node index.js --remove` | Remove automatic cleanup |
| `node index.js --status` | Show current status |
| `node index.js --help` | Show help |

### Frequency Options

When setting up automatic cleanup:

| Frequency | Cron Expression | Description |
|-----------|-----------------|-------------|
| `30m` | `*/30 * * * *` | Every 30 minutes |
| `1h` | `0 * * * *` | Every hour |
| `2h` | `0 */2 * * *` | Every 2 hours |
| `6h` | `0 */6 * * *` | Every 6 hours |
| `12h` | `0 */12 * * *` | Every 12 hours |
| `24h` | `0 0 * * *` | Once per day |

### Examples

```bash
# See current status
$ node index.js --status

==================================================
STATUS OF THE CLEANER
==================================================
✅ Cron automatic: ACTIVE
   0 * * * * cd /root/.openclaw/workspace/skills/session-cleaner && node index.js --cleanup >> /var/log/openclaw-session-cleaner.log 2>&1 # OpenClaw Session Cleaner

📊 Cron sessions: 8
📊 Orphaned sessions: 0
```

```bash
# Dry run (simulate)
$ node index.js --dry-run

==================================================
SESSION CLEANER - OpenClaw
==================================================
Sessions total: 45
Cron sessions: 40
Orphaned sessions (:run::): 35

📋 Orphaned sessions found:
  - agent:main:cron:e5b75cac-2c82-41ae-b64b-37f08f16fe2e:run:abc... (30min)
  ...

🔍 [DRY RUN] Would be removed: 35 sessions
```

```bash
# Actual cleanup
$ node index.js --cleanup

==================================================
SESSION CLEANER - OpenClaw
==================================================
Sessions total: 45
Cron sessions: 40
Orphaned sessions (:run::): 35

Backup created: /root/.openclaw/agents/main/sessions/backups/sessions-1234567890.json

✅ Cleanup complete! Removed: 35 sessions
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_SESSIONS` | `/root/.openclaw/agents/main/sessions/sessions.json` | Path to sessions.json |
| `CLEANUP_FREQUENCY` | `1h` | Default cleanup frequency |
| `CLEANUP_MIN_AGE` | `0` | Minimum age in ms (0 = any age) |

### Configuration File

You can also create a `config.json` in the `references` folder:

```json
{
  "frequency": "1h",
  "minAge": 60000,
  "dryRun": false,
  "backupDir": "/root/.openclaw/agents/main/sessions/backups",
  "logFile": "/var/log/openclaw-session-cleaner.log"
}
```

## How It Works - Technical Details

### Session Detection

The skill identifies orphaned sessions by checking for the `:run:` pattern:

```javascript
// Pseudo-code
for (sessionKey in sessions) {
  if (sessionKey.includes(':run:')) {
    // This is an orphaned cron execution
    delete sessions[sessionKey];
  }
}
```

### Backup Strategy

Before any cleanup:
1. A timestamped backup is created in the backup directory
2. Backups follow the pattern: `sessions-<timestamp>.json`
3. This allows recovery if something goes wrong

### Safety Checks

The cleaner never deletes:
- The main session (`agent:main:main`)
- Base cron sessions (without `:run:`)
- Any non-cron sessions

### Logging

Logs are written to:
- Console output (when run manually)
- `/var/log/openclaw-session-cleaner.log` (when run via cron)

## Troubleshooting

### "Permission denied" when setting up cron

Make sure to run with sudo:

```bash
sudo node index.js --setup 1h
```

### Verify cron is running

```bash
crontab -l | grep "Session Cleaner"
```

### Check logs

```bash
cat /var/log/openclaw-session-cleaner.log
```

### Manual recovery

If something goes wrong, restore from backup:

```bash
cp /root/.openclaw/agents/main/sessions/backups/sessions-<timestamp>.json \
   /root/.openclaw/agents/main/sessions/sessions.json
```

## Why This Matters

### For Individual Users

- **Faster system**: No more 30+ second delays
- **Stability**: Gateway stays responsive
- **Predictability**: Know cleanup runs automatically

### For Production Deployments

- **Scalability**: Works with hundreds of cron jobs
- **Reliability**: Automatic maintenance
- **Compliance**: Audit trail with backups

## Integration with OpenClaw

This skill is designed to work alongside OpenClaw's native features:

| Feature | Works With Session Cleaner? |
|---------|----------------------------|
| Cron jobs (isolated) | ✅ Yes - main use case |
| Cron jobs (main) | ✅ Yes - for cleanup verification |
| Manual sessions | ✅ Yes - unaffected |
| Session compaction | ✅ Yes - complementary |

## Future Improvements

Potential enhancements for the skill:

- [ ] Add webhook notifications on cleanup
- [ ] Support custom session patterns
- [ ] Add metrics/analytics
- [ ] Integrate with OpenClaw config
- [ ] Add dry-run scheduling

## Contributing

Contributions are welcome! Please feel free to:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - feel free to use in your own projects.

## Credits

Created for the OpenClaw community to solve real-world session management issues.

---

**Remember**: A clean system is a happy system! 🧹
