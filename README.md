# Enrique Bot

Discord bot for script search and welcome messages. Built with discord.js.

## Features
- Script search in `#script-ai` channel using ScriptBlox API
- Rotates through results to avoid repeats
- Welcome messages on GuildMemberAdd
- Customizable presence/activity

## Setup
1. Clone repo: `git clone <repo-url>`
2. Install deps: `npm install`
3. Copy `.env.example` to `.env` and fill values
4. Run: `node index.js`

## Environment Variables
- `DISCORD_TOKEN` - Discord bot token
- `SCRIPT_AI_CHANNEL_NAMES` - Comma-separated channel names (default: script-ai)
- `SCRIPT_AI_RESULT_LIMIT` - Max results per query (default: 3)
- `WELCOME_CHANNEL_NAMES` - Comma-separated channel names (default: welcome)

## License
ISC
