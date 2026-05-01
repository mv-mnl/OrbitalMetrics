// Utility to format bytes
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
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
    if (pct < 60) return 'linear-gradient(90deg, #3b82f6, #60a5fa)';
    if (pct < 85) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    return 'linear-gradient(90deg, #ef4444, #f87171)';
}

function getBarColor(pct) {
    if (pct < 60) return '#3b82f6';
    if (pct < 85) return '#f59e0b';
    return '#ef4444';
}

// Global state – stores last known snapshot for modals
let lastData = {};

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
    const evtSource = new EventSource('/api/metrics');

    evtSource.onopen = () => {
        connStatus.classList.remove('disconnected');
        connStatusText.textContent = 'Connected';
    };

    evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.message === 'connected') return;
        lastData = data;
        updateDashboard(data);
    };

    evtSource.onerror = () => {
        connStatus.classList.add('disconnected');
        connStatusText.textContent = 'Disconnected - Retrying...';
        evtSource.close();
        setTimeout(connect, 3000);
    };
}

function updateDashboard(data) {
    // OS Info
    if (data.os) {
        sysInfo.textContent = `${data.os.distro} ${data.os.release} • ${data.os.kernel} • ${data.os.arch} • Host: ${data.os.hostname}`;
    }

    // Uptime
    if (data.uptime) uptimeEl.textContent = formatUptime(data.uptime);

    // CPU
    if (data.cpu) {
        const load = parseFloat(data.cpu.load);
        cpuLoad.textContent = Math.round(load);
        cpuBar.style.width = `${load}%`;
        cpuBar.style.background = getColorForPercentage(load);

        if (data.cpu.cores) {
            cpuCores.innerHTML = data.cpu.cores.map((c, i) => {
                const cLoad = typeof c === 'object' ? parseFloat(c.load) : parseFloat(c);
                return `<div class="core">C${i}: ${Math.round(cLoad)}%</div>`;
            }).join('');
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

    // Disk – show root partition summary
    if (data.disk && data.disk.length > 0) {
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
        let totalRx = 0, totalTx = 0;
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
                const cpu = c.cpuPercent ? c.cpuPercent.toFixed(1) : '0.0';
                const mem = c.memPercent ? c.memPercent.toFixed(1) : '0.0';
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
                </div>`;
            }).join('');
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Modals (CPU / RAM / Disk)
// ─────────────────────────────────────────────────────────────────────────────
function openDetailModal(title, bodyHtml) {
    document.getElementById('detail-modal-title').textContent = title;
    document.getElementById('detail-modal-body').innerHTML = bodyHtml;
    document.getElementById('detail-modal').style.display = 'flex';
}

function buildCpuDetail(cpu, temp) {
    const coreItems = cpu.cores.map((c, i) => {
        const cLoad = typeof c === 'object' ? parseFloat(c.load) : parseFloat(c);
        const cSpeed = (typeof c === 'object' && c.speed) ? `${c.speed.toFixed(2)} GHz` : '';
        const cTemp = (temp && temp.cpuTempCores && temp.cpuTempCores[i]) ? `${temp.cpuTempCores[i]}°C` : '';
        return `
        <div class="detail-core-item">
            <div class="core-label">Core ${i}${cTemp ? ' • ' + cTemp : ''}</div>
            <div style="font-weight:600">${Math.round(cLoad)}%${cSpeed ? ' • ' + cSpeed : ''}</div>
            <div class="detail-core-bar-bg">
                <div class="detail-core-bar" style="width:${cLoad}%; background:${getBarColor(cLoad)}"></div>
            </div>
        </div>`;
    }).join('');

    const cacheInfo = cpu.cache && Object.keys(cpu.cache).length
        ? Object.entries(cpu.cache).filter(([, v]) => v > 0).map(([k, v]) => `<div class="detail-row"><span class="label">Cache ${k.toUpperCase()}</span><span class="value">${formatBytes(v)}</span></div>`).join('')
        : '';

    return `
    <div class="detail-section">
        <div class="detail-section-title">Procesador</div>
        <div class="detail-row"><span class="label">Modelo</span><span class="value">${cpu.manufacturer} ${cpu.model}</span></div>
        <div class="detail-row"><span class="label">Núcleos físicos / lógicos</span><span class="value">${cpu.physicalCores} / ${cpu.logicalCores}</span></div>
        <div class="detail-row"><span class="label">Velocidad base</span><span class="value">${cpu.speed} GHz</span></div>
        <div class="detail-row"><span class="label">Velocidad mín / máx</span><span class="value">${cpu.speedMin} – ${cpu.speedMax} GHz</span></div>
        <div class="detail-row"><span class="label">Socket</span><span class="value">${cpu.socket || 'N/A'}</span></div>
        ${cpu.tempMain != null ? `<div class="detail-row"><span class="label">Temperatura CPU</span><span class="value" style="color:${cpu.tempMain > 80 ? 'var(--danger)' : cpu.tempMain > 65 ? 'var(--warning)' : 'var(--success)'}">${cpu.tempMain}°C</span></div>` : ''}
        ${cacheInfo}
    </div>
    <div class="detail-section">
        <div class="detail-section-title">Carga por núcleo</div>
        <div class="detail-cores-grid">${coreItems}</div>
    </div>`;
}

function buildMemDetail(mem) {
    const total = mem.total;
    const usedPct  = (mem.used / total * 100).toFixed(1);
    const cachedPct = (mem.cached / total * 100).toFixed(1);
    const bufPct    = (mem.buffers / total * 100).toFixed(1);
    const freePct   = (mem.free / total * 100).toFixed(1);

    const swapPct = mem.swapTotal > 0
        ? (mem.swapUsed / mem.swapTotal * 100).toFixed(1)
        : 0;

    return `
    <div class="detail-section">
        <div class="detail-section-title">Resumen de Memoria</div>
        <div class="detail-row"><span class="label">Total</span><span class="value">${formatBytes(total)}</span></div>
        <div class="detail-row"><span class="label">En uso (activa)</span><span class="value" style="color:var(--primary)">${formatBytes(mem.used)} (${usedPct}%)</span></div>
        <div class="detail-row"><span class="label">Libre (disponible)</span><span class="value" style="color:var(--success)">${formatBytes(mem.free)} (${freePct}%)</span></div>
        <div class="detail-row"><span class="label">En caché</span><span class="value">${formatBytes(mem.cached)} (${cachedPct}%)</span></div>
        <div class="detail-row"><span class="label">Buffers</span><span class="value">${formatBytes(mem.buffers)} (${bufPct}%)</span></div>
        <div class="detail-row"><span class="label">Slab</span><span class="value">${formatBytes(mem.slab)}</span></div>
    </div>
    <div class="detail-section">
        <div class="detail-section-title">Distribución visual</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.4rem">Total: ${formatBytes(total)}</div>
        <div class="detail-mem-bar-row">
            <div title="En uso (${usedPct}%)" style="width:${usedPct}%; background:#3b82f6; border-radius:4px 0 0 4px; min-width:2px"></div>
            <div title="Caché (${cachedPct}%)" style="width:${cachedPct}%; background:#8b5cf6; min-width:2px"></div>
            <div title="Buffers (${bufPct}%)" style="width:${bufPct}%; background:#f59e0b; min-width:2px"></div>
            <div title="Libre (${freePct}%)" style="flex:1; background:rgba(255,255,255,0.08); border-radius:0 4px 4px 0; min-width:2px"></div>
        </div>
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:0.5rem; font-size:0.75rem;">
            <span style="color:#3b82f6">■ En uso</span>
            <span style="color:#8b5cf6">■ Caché</span>
            <span style="color:#f59e0b">■ Buffers</span>
            <span style="color:rgba(255,255,255,0.3)">■ Libre</span>
        </div>
    </div>
    ${mem.swapTotal > 0 ? `
    <div class="detail-section">
        <div class="detail-section-title">Swap</div>
        <div class="detail-row"><span class="label">Total</span><span class="value">${formatBytes(mem.swapTotal)}</span></div>
        <div class="detail-row"><span class="label">En uso</span><span class="value">${formatBytes(mem.swapUsed)} (${swapPct}%)</span></div>
        <div class="detail-row"><span class="label">Libre</span><span class="value">${formatBytes(mem.swapFree)}</span></div>
        <div class="progress-bar-container" style="margin-top:0.4rem">
            <div class="progress-bar" style="width:${swapPct}%; background:${getColorForPercentage(swapPct)}"></div>
        </div>
    </div>` : ''}`;
}

function buildDiskDetail(disks) {
    return `
    <div class="detail-section">
        <div class="detail-section-title">Particiones del sistema</div>
        ${disks.map(d => {
            const pct = parseFloat(d.use);
            return `
            <div class="detail-disk-partition">
                <div class="detail-disk-header">
                    <span class="mount">${d.mount}</span>
                    <span class="fs">${d.fs} ${d.type ? '• ' + d.type : ''}</span>
                </div>
                <div class="detail-row" style="font-size:0.85rem">
                    <span class="label">Usado</span>
                    <span class="value">${formatBytes(d.used)} / ${formatBytes(d.size)}</span>
                </div>
                <div class="progress-bar-container" style="margin-top:0.4rem">
                    <div class="progress-bar" style="width:${pct}%; background:${getColorForPercentage(pct)}"></div>
                </div>
                <div style="text-align:right; font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem">${pct}% utilizado</div>
            </div>`;
        }).join('')}
    </div>`;
}

// Card click listeners
document.getElementById('card-cpu').addEventListener('click', () => {
    if (!lastData.cpu) return;
    openDetailModal('⚡ Detalles del CPU', buildCpuDetail(lastData.cpu, lastData));
});

document.getElementById('card-mem').addEventListener('click', () => {
    if (!lastData.memory) return;
    openDetailModal('🧠 Detalles de Memoria', buildMemDetail(lastData.memory));
});

document.getElementById('card-disk').addEventListener('click', () => {
    if (!lastData.disk || lastData.disk.length === 0) return;
    openDetailModal('💾 Detalles de Almacenamiento', buildDiskDetail(lastData.disk));
});

document.getElementById('close-detail-modal').addEventListener('click', () => {
    document.getElementById('detail-modal').style.display = 'none';
});

document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('detail-modal')) {
        document.getElementById('detail-modal').style.display = 'none';
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Docker Actions
// ─────────────────────────────────────────────────────────────────────────────
window.dockerAction = async function(id, action) {
    if (!confirm(`¿Estás seguro de que quieres hacer ${action} a este contenedor?`)) return;
    try {
        const res = await fetch(`/api/docker/${id}/${action}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
    } catch (err) {
        alert('Error al ' + action + ' el contenedor: ' + err.message);
    }
};

window.showLogs = async function(id, name) {
    const modal = document.getElementById('logs-modal');
    const nameEl = document.getElementById('modal-container-name');
    const outputEl = document.getElementById('logs-output');
    nameEl.textContent = `Logs: ${name}`;
    outputEl.textContent = 'Obteniendo logs...';
    modal.style.display = 'flex';
    try {
        const res = await fetch(`/api/docker/${id}/logs`);
        if (!res.ok) throw new Error(await res.text());
        const logs = await res.text();
        outputEl.textContent = logs || 'Sin logs disponibles.';
    } catch (err) {
        outputEl.textContent = 'Error al obtener logs: ' + err.message;
    }
};

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('logs-modal').style.display = 'none';
});

document.getElementById('logs-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('logs-modal')) {
        document.getElementById('logs-modal').style.display = 'none';
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Initialize
// ─────────────────────────────────────────────────────────────────────────────
connect();
