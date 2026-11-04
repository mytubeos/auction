# GCSPL Live Auction

English-only live auction for 10 teams. One host (the auctioneer) runs the room, and each team owner bids from their own phone.

## Run locally
1. `npm install`
2. `npm start`
3. Open `http://localhost:3000`

## Deploy on Render
1. Push this folder to GitHub.
2. Create a Web Service on Render. Build command: `npm install`. Start command: `node server.js`.
3. Add environment variables (do this before sharing the link):
   - `HOST_PASSCODE` = passcode for the host
   - `PASSCODE_RCB`, `PASSCODE_MI`, `PASSCODE_KKR`, `PASSCODE_DC`, `PASSCODE_CSK`, `PASSCODE_GT`, `PASSCODE_LSG`, `PASSCODE_RR`, `PASSCODE_SRH`, `PASSCODE_PBKS` = one passcode per team owner
   - `MONGODB_URI` = optional. Keeps the auction if the server restarts.
   If a passcode is not set, the default is `gcspl2026` for the host and `<team>123` (for example `rcb123`) for teams.

## How to run the auction
1. The host opens the site, picks "Auction Host" and enters the passcode.
2. The host presses **Start Auction** (or **Resume Auction** if a saved auction exists). Until then, owners see "Host is offline" and cannot bid.
3. Each owner logs in with their team and passcode. Their big BID button shows the next price.
4. The host uses Next Player, Sold, Unsold, Pause and Undo. Everything else is in the top-right menu.

## Notes
- The host browser runs the auction. Keep the host tab open. If it reconnects, it resumes by itself.
- Render's free plan sleeps after idle time. Use MongoDB, or open the site a few minutes early.
- Only one host can be logged in. A new host login replaces the old one.
- Player data (355 unique players) and the bid steps are inside `public/index.html`.
