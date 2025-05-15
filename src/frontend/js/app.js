let ws = null;

// Initialize date range picker
$(document).ready(function() {
    $('#timeRange').daterangepicker({
        timePicker: true,
        startDate: moment().startOf('day'),
        endDate: moment().endOf('day'),
        locale: {
            format: 'YYYY-MM-DD HH:mm'
        }
    });

    // Load production units
    loadProductionUnits();

    // Add event listeners
    $('#unitSelect').on('change', function() {
        const unitName = $(this).val();
        if (unitName) {
            connectWebSocket(unitName);
        }
    });

    // Add refresh button click handler
    $('#refreshButton').on('click', function() {
        refreshData();
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
        
        const unitSelect = document.getElementById('unitSelect');
        
        if (units.length === 0) {
            console.log('No production units received from the server');
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No units available";
            unitSelect.appendChild(option);
            return;
        }
        
        // Clear existing options except the first one
        while (unitSelect.options.length > 1) {
            unitSelect.remove(1);
        }
        
        units.forEach(unit => {
            const option = document.createElement('option');
            option.value = unit;
            option.textContent = unit;
            unitSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading production units:', error);
        const unitSelect = document.getElementById('unitSelect');
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "Error loading units";
        unitSelect.appendChild(option);
    }
}

function connectWebSocket(unitName) {
    // Close existing connection if any
    if (ws) {
        ws.close();
    }

    // Create new WebSocket connection using relative URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${unitName}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
        console.log('Connected to WebSocket');
        refreshData(); // Fetch data immediately after connection
    };

    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        updateTable(data);
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };

    ws.onclose = function() {
        console.log('WebSocket connection closed');
    };
}

function refreshData() {
    const unitName = document.getElementById('unitSelect').value;
    if (!unitName) {
        alert('Lütfen bir üretim birimi seçiniz');
        return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket(unitName);
        return;
    }

    const picker = $('#timeRange').data('daterangepicker');
    sendTimeRange(picker.startDate, picker.endDate);
}

function sendTimeRange(startDate, endDate) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const timeRange = {
            start_time: startDate.format('YYYY-MM-DD[T]HH:mm:ss'),
            end_time: endDate.format('YYYY-MM-DD[T]HH:mm:ss')
        };
        ws.send(JSON.stringify(timeRange));
    }
}

function updateTable(data) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    // Calculate totals
    let totalSuccessQty = 0;
    let totalFailQty = 0;
    let totalProduction = 0;

    data.forEach(row => {
        // Convert to numbers and update totals
        totalSuccessQty += Number(row.success_qty) || 0;
        totalFailQty += Number(row.fail_qty) || 0;
        totalProduction += Number(row.total_qty) || 0;

        // For debugging
        console.log('Row data:', {
            model: row.model,
            success: row.success_qty,
            fail: row.fail_qty,
            total: row.total_qty
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.model}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.success_qty}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.fail_qty}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.total_qty}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPercentage(row.quality)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.performance ? formatPercentage(row.performance) : 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.oee ? formatPercentage(row.oee) : 'N/A'}</td>
        `;
        tbody.appendChild(tr);
    });

    // For debugging
    console.log('Totals:', {
        success: totalSuccessQty,
        fail: totalFailQty,
        total: totalProduction
    });

    // Update summary cards
    document.getElementById('totalSuccess').textContent = totalSuccessQty.toLocaleString();
    document.getElementById('totalFail').textContent = totalFailQty.toLocaleString();
    document.getElementById('totalProduction').textContent = totalProduction.toLocaleString();
}

function formatPercentage(value) {
    return value ? `${(value * 100).toFixed(2)}%` : '0%';
} 