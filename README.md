# SkillBridge: freelance and skill-exchange marketplace

React (JavaScript) + Vite frontend, Node.js + Express + Socket.io backend, SQLite database.

## Run it
Terminal 1:
    cd server
    npm install
    npm start        # API on http://localhost:5001, creates skillbridge.db automatically
Terminal 2:
    cd client
    npm install
    npm run dev      # open http://localhost:5173

Demo logins (password `demo123`): freelancer@demo.com, client@demo.com

## Database (server/schema.sql)
users, gigs, orders, reviews, messages, transactions, with foreign keys, CHECK constraints
(balance can never go negative, rating 1 to 5) and one review per order.
Money moves (hire, approve, withdraw) run inside SQL transactions so they are all-or-nothing.
To browse the data, open skillbridge.db in "DB Browser for SQLite". To reset, stop the server and delete skillbridge.db.

## Troubleshooting
- "Cannot reach the server": the backend is not running. Start it in the server folder.
- "Port 5001 is busy": run `PORT=5002 npm start` and change the port in client/vite.config.js.
