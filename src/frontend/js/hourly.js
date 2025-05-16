let activeWebSocket = null;

// Update current time every second
setInterval(() => {
    const now = new Date();
    document.getElementById('currentTime').textContent = 
        now.getHours().toString().padStart(2, '0') + ':' + 
        now.getMinutes().toString().padStart(2, '0');
}, 1000);

// Get unit name from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const unitName = urlParams.get('unit');

if (!unitName) {
    alert('Üretim birimi seçilmedi!');
} else {
    connectWebSocket(unitName);
}

function connectWebSocket(unitName) {
    // Close existing connection if any
    if (activeWebSocket) {
        activeWebSocket.close();
    }

    // Create new WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/hourly/${unitName}`;
    activeWebSocket = new WebSocket(wsUrl);

    activeWebSocket.onopen = function() {
        console.log(`Connected to WebSocket for ${unitName}`);
        requestHourlyData();
    };

    activeWebSocket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        updateTables(data);
    };

    activeWebSocket.onerror = function(error) {
        console.error(`WebSocket error:`, error);
    };

    activeWebSocket.onclose = function() {
        console.log(`WebSocket connection closed`);
        // Try to reconnect after 5 seconds
        setTimeout(() => connectWebSocket(unitName), 5000);
    };
}

function requestHourlyData() {
    if (activeWebSocket && activeWebSocket.readyState === WebSocket.OPEN) {
        const now = new Date();
        const startOfShift = getShiftStartTime(now);
        
        const timeRange = {
            start_time: startOfShift.toISOString().replace('Z', ''),
            end_time: now.toISOString().replace('Z', '')
        };
        
        activeWebSocket.send(JSON.stringify(timeRange));
    }
}

function getShiftStartTime(now) {
    const hour = now.getHours();
    const shiftStart = new Date(now);
    
    if (hour >= 8 && hour < 16) {
        shiftStart.setHours(8, 0, 0, 0);
    } else if (hour >= 16 && hour < 24) {
        shiftStart.setHours(16, 0, 0, 0);
    } else {
        shiftStart.setHours(0, 0, 0, 0);
    }
    
    return shiftStart;
}

function updateTables(data) {
    // Update summary table
    const summaryTableBody = document.getElementById('summaryTableBody');
    summaryTableBody.innerHTML = `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.unit_name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.total_success}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(data.total_oee)}</td>
        </tr>
    `;

    // Update hourly table
    const hourlyTableBody = document.getElementById('hourlyTableBody');
    hourlyTableBody.innerHTML = data.hourly_data
        .sort((a, b) => new Date(b.hour_start) - new Date(a.hour_start)) // Sort by hour descending
        .map(hour => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${formatHourRange(hour.hour_start, hour.hour_end)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${hour.success_qty}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${hour.fail_qty}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(hour.quality)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(hour.performance)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(hour.oee)}</td>
            </tr>
        `).join('');
}

function formatHourRange(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}-${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
}

function formatPercentage(value) {
    if (value === null || value === undefined) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
}

// Request new data every minute
setInterval(requestHourlyData, 60000); 