from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime
import json
import asyncio
from typing import List
from database import get_production_units, get_production_data

app = FastAPI()

# Enable CORS
origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://127.0.0.1",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Mount the static files directory
app.mount("/static", StaticFiles(directory="../frontend"), name="static")

@app.get("/")
async def read_root():
    return FileResponse("../frontend/index.html")

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/units")
async def get_units():
    return get_production_units()

@app.websocket("/ws/{unit_name}")
async def websocket_endpoint(websocket: WebSocket, unit_name: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            params = json.loads(data)
            
            start_time = datetime.fromisoformat(params['start_time'])
            end_time = datetime.fromisoformat(params['end_time'])
            
            production_data = get_production_data(unit_name, start_time, end_time)
            await websocket.send_json(production_data)
            
            # Wait for 30 seconds before sending the next update
            await asyncio.sleep(30)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 