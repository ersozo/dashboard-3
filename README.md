# Production Dashboard

A real-time dashboard showing production quantity and OEE metrics using FastAPI, WebSockets, and vanilla JavaScript with Tailwind CSS.

## Features

- Real-time production data updates
- Production unit selection
- Time range selection
- Display of success quantity, quality, performance, and OEE metrics
- Support for models with and without target cycle times

## Prerequisites

- Python 3.8+
- Microsoft SQL Server
- ODBC Driver 18 for SQL Server

## Setup

1. Clone the repository
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure the database connection:
   - Copy `backend/.env.example` to `backend/.env`
   - Update the database connection details in `.env`:
     ```
     DB_SERVER=your_server_name
     DB_NAME=your_database_name
     DB_USER=your_username
     DB_PASSWORD=your_password
     ```

## Running the Application

1. Start the backend server:
   ```bash
   cd backend
   python main.py
   ```
   The server will start at `http://localhost:8000`

## Usage

1. Select a production unit from the menu
2. Choose a time range using the date-time picker
3. The dashboard will automatically update with real-time data every 30 sec.
4. The table shows:
   - Model name
   - Success quantity
   - Quality percentage
   - Performance percentage (for models with targets)
   - OEE percentage (for models with targets)

## Technical Details

- Backend: FastAPI with WebSocket support
- Frontend: Vanilla JavaScript, Tailwind CSS
- Database: Microsoft SQL Server
- Real-time updates every 60 seconds
- Responsive design for all screen sizes 