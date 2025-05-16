let activeWebSockets = new Map();
let dateRangePicker = null;
let isInitialLoad = true;

function setTimeRangeForShift(startHour, endHour) {
    const now = new Date();
    let startDate = new Date(now);
    let endDate = new Date(now);

    // Set the hours for start date
    startDate.setHours(startHour, 0, 0, 0);
    
    // For initial setup, use current time as end time
    if (startHour <= now.getHours() && now.getHours() < endHour) {
        endDate = now;
    } else {
        endDate.setHours(endHour, 0, 0, 0);
    }
    
    // If end hour is less than start hour, it means the shift goes into the next day
    if (endHour < startHour) {
        endDate.setDate(endDate.getDate() + 1);
    }
    
    // If current time is before the shift start time, move dates back one day
    if (now.getHours() < startHour) {
        startDate.setDate(startDate.getDate() - 1);
        endDate.setDate(endDate.getDate() - 1);
    }
    
    dateRangePicker.setDate([startDate, endDate]);
}

// Initialize date range picker
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Flatpickr
    dateRangePicker = flatpickr("#timeRange", {
        mode: "range",
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        time_24hr: true,
        locale: "tr",
        defaultHour: 0,
        defaultMinute: 0
    });

    // Load production units
    loadProductionUnits();

    // Add form submit handler
    document.getElementById('productionForm').addEventListener('submit', function(e) {
        e.preventDefault();
        startDataCollection();
    });

    // Add screen button handler
    document.getElementById('screenButton').addEventListener('click', function() {
        const checkedUnits = document.querySelectorAll('#unitCheckboxes input[type="checkbox"]:checked');
        if (checkedUnits.length !== 1) {
            alert('Lütfen ekran görüntüsü için tek bir üretim birimi seçiniz');
            return;
        }
        const unitName = checkedUnits[0].value;
        window.open(`/hourly?unit=${encodeURIComponent(unitName)}`, '_blank');
    });

    // Add shift button click handlers
    document.getElementById('shift1').addEventListener('click', () => setTimeRangeForShift(8, 16));
    document.getElementById('shift2').addEventListener('click', () => setTimeRangeForShift(16, 24));
    document.getElementById('shift3').addEventListener('click', () => setTimeRangeForShift(0, 8));

    // Add refresh button click handler
    document.getElementById('refreshButton').addEventListener('click', refreshData);

    // Add event listener for checkbox changes
    document.getElementById('unitCheckboxes').addEventListener('change', function(e) {
        if (e.target.type === 'checkbox') {
            const unitName = e.target.value;
            if (e.target.checked) {
                connectWebSocket(unitName);
            } else {
                disconnectWebSocket(unitName);
            }
        }
    });
});

async function loadProductionUnits() {
    try {
        console.log('Fetching production units...');
        const response = await fetch('/units', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const units = await response.json();
        console.log('Received units:', units);
        
        const unitCheckboxes = document.getElementById('unitCheckboxes');
        
        if (units.length === 0) {
            console.log('No production units received from the server');
            unitCheckboxes.innerHTML = '<p class="text-gray-500">No units available</p>';
            return;
        }
        
        // Clear existing checkboxes
        unitCheckboxes.innerHTML = '';
        
        units.forEach(unit => {
            const div = document.createElement('div');
            div.className = 'flex items-center min-w-0';
            div.innerHTML = `
                <input type="checkbox" id="unit-${unit}" value="${unit}" class="h-4 w-4 text-blue-600 rounded border-gray-300">
                <label for="unit-${unit}" class="ml-2 text-sm text-gray-700 truncate">${unit}</label>
            `;
            unitCheckboxes.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading production units:', error);
        const unitCheckboxes = document.getElementById('unitCheckboxes');
        unitCheckboxes.innerHTML = '<p class="text-red-500">Error loading units</p>';
    }
}

function connectWebSocket(unitName) {
    // Close existing connection if any
    disconnectWebSocket(unitName);

    // Create new WebSocket connection using relative URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${unitName}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = function() {
        console.log(`Connected to WebSocket for ${unitName}`);
        activeWebSockets.set(unitName, ws);
        
        // Store the initial start time
        ws.startTime = dateRangePicker.selectedDates[0];
        
        // Send initial request
        refreshData(unitName);
    };

    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        updateTable(data, unitName);
        
        // After receiving data, schedule the next update with stored start time
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                sendPeriodicUpdate(ws, ws.startTime);
            }
        }, 30000);
    };

    ws.onerror = function(error) {
        console.error(`WebSocket error for ${unitName}:`, error);
    };

    ws.onclose = function() {
        console.log(`WebSocket connection closed for ${unitName}`);
        activeWebSockets.delete(unitName);
    };
}

function disconnectWebSocket(unitName) {
    const ws = activeWebSockets.get(unitName);
    if (ws) {
        ws.close();
        activeWebSockets.delete(unitName);
    }
}

function startDataCollection() {
    const checkedUnits = document.querySelectorAll('#unitCheckboxes input[type="checkbox"]:checked');
    if (checkedUnits.length === 0) {
        alert('Lütfen en az bir üretim birimi seçiniz');
        return;
    }

    // If no time range is selected, set it based on current time
    if (!dateRangePicker.selectedDates || dateRangePicker.selectedDates.length === 0) {
        const currentHour = new Date().getHours();
        if (currentHour >= 8 && currentHour < 16) {
            setTimeRangeForShift(8, 16);
        } else if (currentHour >= 16 && currentHour < 24) {
            setTimeRangeForShift(16, 24);
        } else {
            setTimeRangeForShift(0, 8);
        }
    }

    // Clear existing connections and data
    activeWebSockets.forEach((ws) => ws.close());
    activeWebSockets.clear();
    document.getElementById('resultsContainer').innerHTML = '';

    // Start new connections
    checkedUnits.forEach(checkbox => {
        connectWebSocket(checkbox.value);
    });

    // Show refresh button
    document.getElementById('refreshButton').classList.remove('hidden');
}

function refreshData(specificUnit = null) {
    const selectedDates = dateRangePicker.selectedDates;
    if (selectedDates.length !== 2) {
        alert('Lütfen geçerli bir tarih aralığı seçiniz');
        return;
    }

    const timeRange = {
        start_time: selectedDates[0].toISOString().replace('Z', ''),
        end_time: selectedDates[1].toISOString().replace('Z', ''),
        is_initial_request: true
    };

    if (specificUnit) {
        // Refresh specific unit
        const ws = activeWebSockets.get(specificUnit);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(timeRange));
        }
    } else {
        // Refresh all checked units
        activeWebSockets.forEach((ws, unitName) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(timeRange));
            } else {
                connectWebSocket(unitName);
            }
        });
    }
}

function sendPeriodicUpdate(ws, startTime) {
    const timeRange = {
        start_time: startTime.toISOString().replace('Z', ''),
        end_time: new Date().toISOString().replace('Z', ''),
        is_initial_request: false
    };
    ws.send(JSON.stringify(timeRange));
}

function formatPercentage(value) {
    if (value === null || value === undefined) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
}

function updateTable(data, unitName) {
    // Create or update the table section for this unit
    let unitSection = document.getElementById(`unit-section-${unitName}`);
    if (!unitSection) {
        unitSection = document.createElement('div');
        unitSection.id = `unit-section-${unitName}`;
        unitSection.className = 'bg-white rounded-lg shadow-md overflow-hidden mb-8';
        document.getElementById('resultsContainer').appendChild(unitSection);
    }

    // Update the unit section content
    unitSection.innerHTML = `
        <h3 class="text-xl font-semibold p-6 text-gray-700 border-b">${unitName}</h3>
        <div class="overflow-x-auto">
            <table class="min-w-full">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Üretim (OK)</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tamir</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Toplam</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saatlik Hedef</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kalite</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performans</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OEE</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${data.map(row => `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.model}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.success_qty}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.fail_qty}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.total_qty}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.target || 'N/A'}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(row.quality)}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(row.performance)}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(row.oee)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    updateTotalSummary();
}

function updateTotalSummary() {
    let totalSuccessQty = 0;
    let totalFailQty = 0;
    let totalProduction = 0;
    let totalPerformanceSum = 0;
    let totalPerformanceCount = 0;

    // Sum up totals from all visible tables
    document.querySelectorAll('table tbody tr').forEach(row => {
        const cells = row.cells;
        totalSuccessQty += parseInt(cells[1].textContent) || 0;
        totalFailQty += parseInt(cells[2].textContent) || 0;
        totalProduction += parseInt(cells[3].textContent) || 0;
        
        // Only include performance if it's not N/A
        const performanceText = cells[6].textContent;
        if (performanceText !== 'N/A') {
            totalPerformanceSum += parseFloat(performanceText) || 0;
            totalPerformanceCount++;
        }
    });

    // Update summary cards
    document.getElementById('totalSuccess').textContent = totalSuccessQty.toLocaleString();
    document.getElementById('totalFail').textContent = totalFailQty.toLocaleString();
    document.getElementById('totalProduction').textContent = totalProduction.toLocaleString();
} 