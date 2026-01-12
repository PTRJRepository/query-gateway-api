# SQL Gateway GUI Client

A simple, lightweight GUI for interacting with the Database Query Gateway.

## Why use the Launcher?
Because the main API server has strict security settings (CORS disabled), web browsers will normally block a static HTML file from connecting to it. The launcher script (`launcher.js`) solves this by:
1. Serving the HTML file.
2. Acting as a proxy to forward your requests to the API, bypassing browser CORS restrictions.

## How to Run

1. **Ensure the Main API is Running**
   In your project root:
   ```bash
   npm run dev
   # or
   npm start
   ```
   (Verify it's running on port 8001)

2. **Start the GUI Launcher**
   Open a **new terminal**, go to the project root, and run:
   ```bash
   node gui/launcher.js
   ```

3. **Open in Browser**
   Visit: [http://localhost:3000](http://localhost:3000)

4. **Connect**
   - Click the **Settings (Gear)** icon.
   - **Gateway URL**: Keep as `/proxy` (this tells it to use the launcher's proxy).
   - **API Token**: Enter the token from your `.env` file (e.g., `API_TOKEN` value).
   - Click **Save & Connect**.

## Features
- **Database Selector**: Automatically lists available databases.
- **SQL Editor**: Write T-SQL queries.
- **Result Table**: View results in a responsive table.
- **CSV Export**: Download query results.
- **JSON Params**: Support for parameterized queries (e.g., `WHERE id = @id`).
