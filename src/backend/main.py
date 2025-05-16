from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, timedelta
import json
import asyncio
import os
from typing import List, Dict
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

# Get the absolute path to the frontend directory
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

# Mount the static files directory for JS and other assets
app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_DIR)), name="static")

@app.get("/")
async def read_root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/hourly")
async def read_hourly():
    return FileResponse(os.path.join(FRONTEND_DIR, "hourly.html"))

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {
            'standard': [],
            'hourly': []
        }

    async def connect(self, websocket: WebSocket, connection_type: str = 'standard'):
        await websocket.accept()
        if connection_type not in self.active_connections:
            self.active_connections[connection_type] = []
        self.active_connections[connection_type].append(websocket)

    def disconnect(self, websocket: WebSocket, connection_type: str = 'standard'):
        if connection_type in self.active_connections:
            if websocket in self.active_connections[connection_type]:
                self.active_connections[connection_type].remove(websocket)

    async def broadcast(self, message: str, connection_type: str = 'standard'):
        if connection_type in self.active_connections:
            for connection in self.active_connections[connection_type]:
                await connection.send_text(message)

manager = ConnectionManager()

@app.get("/units")
async def get_units():
    return get_production_units()

@app.websocket("/ws/{unit_name}")
async def websocket_endpoint(websocket: WebSocket, unit_name: str):
    await manager.connect(websocket, 'standard')
    try:
        while True:
            data = await websocket.receive_text()
            params = json.loads(data)
            
            start_time = datetime.fromisoformat(params['start_time'])
            end_time = datetime.fromisoformat(params['end_time'])
            
            # Get production data and filter models with target
            production_data = get_production_data(unit_name, start_time, end_time)
            
            # For each model, if it has no target, set performance and OEE to None
            for model in production_data:
                if not model['target']:
                    model['performance'] = None
                    model['oee'] = None
            
            await websocket.send_json(production_data)
            await asyncio.sleep(30)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, 'standard')

@app.websocket("/ws/hourly/{unit_name}")
async def hourly_websocket_endpoint(websocket: WebSocket, unit_name: str):
    await manager.connect(websocket, 'hourly')
    try:
        while True:
            data = await websocket.receive_text()
            params = json.loads(data)
            
            start_time = datetime.fromisoformat(params['start_time'])
            end_time = datetime.fromisoformat(params['end_time'])
            
            print(f"\nProcessing hourly data for {unit_name}")
            print(f"Time range: {start_time} to {end_time}")
            
            # Get hourly data
            hourly_data = []
            current_hour = start_time.replace(minute=0, second=0, microsecond=0)
            
            while current_hour < end_time:
                hour_end = min(current_hour + timedelta(hours=1), end_time)
                hour_data = get_production_data(unit_name, current_hour, hour_end)
                
                print(f"\nHour: {current_hour} to {hour_end}")
                print(f"Raw hour data: {hour_data}")
                
                # Separate models with and without targets
                models_with_target = [model for model in hour_data if model['target']]
                print(f"Models with target: {models_with_target}")
                
                # Aggregate all models for this hour
                hour_summary = {
                    'hour_start': current_hour.isoformat(),
                    'hour_end': hour_end.isoformat(),
                    'success_qty': sum(model['success_qty'] for model in hour_data),
                    'fail_qty': sum(model['fail_qty'] for model in hour_data),
                    'total_qty': sum(model['total_qty'] for model in hour_data)
                }
                
                print(f"Hour summary before performance: {hour_summary}")
                
                # Calculate quality using all models
                hour_summary['quality'] = (hour_summary['success_qty'] / hour_summary['total_qty'] 
                                         if hour_summary['total_qty'] > 0 else 0)
                
                # Calculate performance using only models with target
                if models_with_target:
                    operation_time = (hour_end - current_hour).total_seconds()
                    total_theoretical_time = 0
                    
                    print(f"Operation time: {operation_time} seconds")
                    
                    for model in models_with_target:
                        model_theoretical_time = model['total_qty'] * (3600 / model['target'])
                        total_theoretical_time += model_theoretical_time
                        print(f"Model {model['model']}: qty={model['total_qty']}, target={model['target']}, theoretical_time={model_theoretical_time}")
                    
                    print(f"Total theoretical time: {total_theoretical_time}")
                    
                    hour_summary['performance'] = total_theoretical_time / operation_time if operation_time > 0 else 0
                    hour_summary['oee'] = hour_summary['quality'] * hour_summary['performance']
                    
                    print(f"Calculated performance: {hour_summary['performance']}")
                    print(f"Calculated OEE: {hour_summary['oee']}")
                else:
                    hour_summary['performance'] = None
                    hour_summary['oee'] = None
                    print("No models with target found for this hour")
                
                hourly_data.append(hour_summary)
                current_hour += timedelta(hours=1)
            
            # Calculate totals for summary
            total_success = sum(hour['success_qty'] for hour in hourly_data)
            total_qty = sum(hour['total_qty'] for hour in hourly_data)
            total_quality = total_success / total_qty if total_qty > 0 else 0
            
            print(f"\nFinal totals:")
            print(f"Total success: {total_success}")
            print(f"Total quantity: {total_qty}")
            print(f"Total quality: {total_quality}")
            
            # Calculate total performance and OEE only for hours with performance data
            hours_with_performance = [h for h in hourly_data if h['performance'] is not None]
            if hours_with_performance:
                total_performance = sum(h['performance'] for h in hours_with_performance) / len(hours_with_performance)
                total_oee = total_quality * total_performance
                print(f"Total performance: {total_performance}")
                print(f"Total OEE: {total_oee}")
            else:
                total_performance = None
                total_oee = None
                print("No hours with performance data found")
            
            response_data = {
                'unit_name': unit_name,
                'total_success': total_success,
                'total_oee': total_oee,
                'hourly_data': hourly_data
            }
            
            await websocket.send_json(response_data)
            await asyncio.sleep(30)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, 'hourly')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 