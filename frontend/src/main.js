// Utility to format bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Utility to format time
function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    
    let res = '';
    if (d > 0) res += d + 'd ';
    if (h > 0) res += h + 'h ';
    res += m + 'm';
    return res;
}

// Determine color based on percentage
function getColorForPercentage(pct) {
    if (pct < 60) return 'linear-gradient(90deg, #3b82f6, #60a5fa)'; // Blue
    if (pct < 85) return 'linear-gradient(90deg, #f59e0b, #fbbf24)'; // Warning/Yellow
    return 'linear-gradient(90deg, #ef4444, #f87171)'; // Danger/Red
}

// DOM Elements
const connStatus = document.getElementById('conn-status');
const connStatusText = connStatus.querySelector('span:nth-child(2)');
const sysInfo = document.getElementById('sys-info');

const cpuTempBadge = document.getElementById('cpu-temp-badge');
const cpuTemp = document.getElementById('cpu-temp');

const cpuLoad = document.getElementById('cpu-load');
const cpuBar = document.getElementById('cpu-bar');
const cpuCores = document.getElementById('cpu-cores');

const memPercent = document.getElementById('mem-percent');
const memBar = document.getElementById('mem-bar');
const memUsed = document.getElementById('mem-used');
const memTotal = document.getElementById('mem-total');

const diskPercent = document.getElementById('disk-percent');
const diskBar = document.getElementById('disk-bar');
const diskUsed = document.getElementById('disk-used');
const diskTotal = document.getElementById('disk-total');

const netRx = document.getElementById('net-rx');
const netTx = document.getElementById('net-tx');

const uptimeEl = document.getElementById('uptime');

// Connect to SSE
function connect() {
    // In production, this might be a relative URL if served from the same host
    // In Vite dev mode, we proxy /api to localhost:3000
    const evtSource = new EventSource('/api/metrics');

    evtSource.onopen = () => {
        connStatus.classList.remove('disconnected');
        connStatusText.textContent = 'Connected';
    };

    evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.message === 'connected') return;
        
        updateDashboard(data);
    };

    evtSource.onerror = (err) => {
        connStatus.classList.add('disconnected');
        connStatusText.textContent = 'Disconnected - Retrying...';
        evtSource.close();
        setTimeout(connect, 3000); // Try to reconnect after 3 seconds
    };
}

function updateDashboard(data) {
    // OS Info
    if (data.os) {
        sysInfo.textContent = `${data.os.distro} ${data.os.release} • ${data.os.kernel} • Host: ${data.os.hostname}`;
    }

    // Uptime
    if (data.uptime) {
        uptimeEl.textContent = formatUptime(data.uptime);
    }

    // CPU
    if (data.cpu) {
        const load = parseFloat(data.cpu.load);
        cpuLoad.textContent = Math.round(load);
        cpuBar.style.width = `${load}%`;
        cpuBar.style.background = getColorForPercentage(load);

        // Cores
        if (data.cpu.cores) {
            cpuCores.innerHTML = data.cpu.cores.map((c, i) => 
                `<div class="core">C${i}: ${Math.round(c)}%</div>`
            ).join('');
        }
    }

    // Memory
    if (data.memory) {
        const pct = parseFloat(data.memory.percent);
        memPercent.textContent = Math.round(pct);
        memBar.style.width = `${pct}%`;
        memBar.style.background = getColorForPercentage(pct);
        
        memUsed.textContent = formatBytes(data.memory.used);
        memTotal.textContent = formatBytes(data.memory.total);
    }

    // Disk
    if (data.disk && data.disk.length > 0) {
        // Find main disk (usually /)
        const mainDisk = data.disk.find(d => d.mount === '/') || data.disk[0];
        const pct = parseFloat(mainDisk.use);
        
        diskPercent.textContent = Math.round(pct);
        diskBar.style.width = `${pct}%`;
        diskBar.style.background = getColorForPercentage(pct);
        
        diskUsed.textContent = formatBytes(mainDisk.used);
        diskTotal.textContent = formatBytes(mainDisk.size);
    }

    // Network
    if (data.network && data.network.length > 0) {
        // Aggregate all active interfaces
        let totalRx = 0;
        let totalTx = 0;
        data.network.forEach(n => {
            totalRx += (n.rx_sec || 0);
            totalTx += (n.tx_sec || 0);
        });

        netRx.textContent = formatBytes(totalRx) + '/s';
        netTx.textContent = formatBytes(totalTx) + '/s';
    }

    // Temperature
    if (data.temperature) {
        cpuTempBadge.style.display = 'inline-flex';
        cpuTemp.textContent = data.temperature.toFixed(1);
        if (data.temperature > 80) cpuTempBadge.style.color = 'var(--danger)';
        else if (data.temperature > 65) cpuTempBadge.style.color = 'var(--warning)';
        else cpuTempBadge.style.color = 'var(--success)';
    }

    // Docker Containers
    const dockerList = document.getElementById('docker-list');
    if (data.docker && dockerList) {
        if (data.docker.length === 0) {
            dockerList.innerHTML = '<div class="docker-placeholder">No containers found</div>';
        } else {
            dockerList.innerHTML = data.docker.map(c => {
                const stateClass = c.state === 'running' ? 'running' : (c.state === 'exited' ? 'exited' : 'paused');
                const cpu = c.cpuPercent ? c.cpuPercent.toFixed(1) : 0;
                const mem = c.memPercent ? c.memPercent.toFixed(1) : 0;
                
                return `
                <div class="docker-item">
                    <div class="docker-info">
                        <span class="docker-name">${c.name.replace(/^\//, '')}</span>
                        <span class="docker-image">${c.image}</span>
                        <div class="docker-stats">
                            <span>CPU: ${cpu}%</span>
                            <span>RAM: ${mem}%</span>
                        </div>
                        <div class="docker-actions">
                            <button class="docker-btn restart" onclick="dockerAction('${c.id}', 'restart')">🔄 Restart</button>
                            <button class="docker-btn stop" onclick="dockerAction('${c.id}', 'stop')">⏹️ Stop</button>
                            <button class="docker-btn" onclick="showLogs('${c.id}', '${c.name.replace(/^\//, '')}')">📄 Logs</button>
                        </div>
                    </div>
                    <div class="docker-status-col">
                        <span class="docker-state ${stateClass}">
                            <span class="dot"></span>
                            ${c.state.toUpperCase()}
                        </span>
                        <span class="docker-status-text">${c.status}</span>
                    </div>
                </div>
                `;
            }).join('');
        }
    }
}

// Docker Actions
window.dockerAction = async function(id, action) {
    if (!confirm(`Are you sure you want to ${action} this container?`)) return;
    
    try {
        const res = await fetch(`/api/docker/${id}/${action}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
        // Action sent successfully
    } catch (err) {
        alert('Failed to ' + action + ' container: ' + err.message);
    }
};

window.showLogs = async function(id, name) {
    const modal = document.getElementById('logs-modal');
    const nameEl = document.getElementById('modal-container-name');
    const outputEl = document.getElementById('logs-output');
    
    nameEl.textContent = `Logs: ${name}`;
    outputEl.textContent = 'Fetching logs...';
    modal.style.display = 'flex';
    
    try {
        const res = await fetch(`/api/docker/${id}/logs`);
        if (!res.ok) throw new Error(await res.text());
        const logs = await res.text();
        outputEl.textContent = logs || 'No logs available.';
    } catch (err) {
        outputEl.textContent = 'Error fetching logs: ' + err.message;
    }
};

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('logs-modal').style.display = 'none';
});

// Initialize
connect();
