# Chandrabindu Smart Home — Telegram bot

A standalone Node.js bot that controls the house through the main app's existing
REST API. It does **not** import the app's code or touch device keys — it only
makes authenticated HTTP calls over your LAN.

## What it does

- **Menu navigation** — `/menu` → rooms → switchboards → switches → actions
  (On/Off for switches & sockets; Off/Low/Medium/High/Max for fans).
- **Routines** — `/routines` lists and runs saved scenes.
- **Natural language** — type plainly (e.g. _"turn off the bedroom lights"_).
  The bot asks the same LLM the web app uses, shows the proposed actions, and
  runs them only after you tap **Confirm** — mirroring the web flow.
- Locked rooms are shown with 🔒 and are not controllable from Telegram (unlock
  them in the web app).
- Protected controls are marked 🛡️ and are enforced server-side exactly as in
  the web app.

## How auth works (no password in Telegram)

Auth uses the app's generic **device-pairing** flow (the same flow a TV or POS
client could use):

1. In the web app: **Settings → Link a device → Generate pairing code**.
2. In Telegram: send `/pair <code>` to the bot (the bot deletes that message).
3. The bot exchanges the code for a session token (valid ~7 days) via
   `POST /api/pairing/token` and stores only the token. Your password is never
   typed into Telegram.

A Telegram **user-ID allowlist** is the outer gate — the bot ignores everyone
not listed.

## Setup

Requires Node 18+ (for global `fetch`).

```bash
cd telegram-bot
npm install
cp .env.example .env   # then fill it in
npm start
```

### Environment (`.env`)

| Variable | Meaning |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token from [@BotFather](https://t.me/BotFather). |
| `BASE_URL` | The Next.js hub on your LAN, e.g. `http://192.168.68.68`. |
| `PAIRING_SECRET` | Shared device-pairing secret — **must match** `PAIRING_SECRET` set in the main app's environment. |
| `ALLOWED_TELEGRAM_IDS` | Comma-separated Telegram numeric user IDs allowed to use the bot (required). Get yours from [@userinfobot](https://t.me/userinfobot). |

### Main-app environment

The main Next.js app must also have `PAIRING_SECRET` set (same value), or the
`/api/pairing/token` endpoint stays disabled (fails closed). For example:

```bash
PAIRING_SECRET=the-same-long-random-string npm run start   # in the app root
```

## Notes

- Sessions persist in `data/sessions.json` (gitignored) so users stay linked
  across restarts.
- Run it under a process manager (pm2/systemd) for always-on use.
