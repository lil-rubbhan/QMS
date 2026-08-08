# Front Desk Queue

A tiny local queue system for a one-day event. Three separate pages, one shared server.

## Setup (one-time)

1. Install Node.js if you don't have it: https://nodejs.org
2. Open a terminal in this folder and run:
   ```
   npm install
   ```

## Running it on the day

1. Start the server:
   ```
   node server.js
   ```
2. The terminal will print URLs, something like:
   ```
   Staff:   http://localhost:3000/staff.html
   Kiosk:   http://localhost:3000/kiosk.html
   Display: http://localhost:3000/display.html

   From other devices on the same WiFi:
   http://192.168.1.42:3000/kiosk.html
   ```
3. On the **main/host computer** (the one running the server), open **staff.html**.
4. On the **kiosk device** (tablet/phone visitors use), open the **kiosk** URL using the
   local IP address shown in the terminal (not "localhost" — that only works on the host machine).
5. On the **display device** (TV/monitor), open the **display** URL the same way.

All devices must be on the same WiFi network as the host computer.

## How it works

- `server.js` is a small Express server that keeps the queue state (who's waiting, who's
  being served) in memory, and also writes it to `state.json` so a restart doesn't lose data.
- `public/kiosk.html` — visitors tap "Take a Number" and get a ticket.
- `public/display.html` — shows the current "Now Serving" number for the waiting area.
- `public/staff.html` — lets staff call the next number and mark the current one done.
- All three pages just call the server's API (`/api/state`, `/api/take`, `/api/call-next`,
  `/api/done`, `/api/reset`) and refresh every couple of seconds, so they stay in sync.

## Stopping / resetting

- Stop the server any time with `Ctrl+C` in the terminal.
- To wipe the queue between events, delete `state.json` (or use the "Reset queue" link on
  the Staff page) before starting a new session.
