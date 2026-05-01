const express = require('express');
const cors = require('cors');
const si = require('systeminformation');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // For parsing json if needed

const path = require('path');

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// --- Docker UNIX Socket API Helper ---
function dockerRequest(method, path, res) {
    const options = {
        socketPath: '/var/run/docker.sock',
        path: path,
        method: method
    };
    const req = http.request(options, (response) => {
        let body = [];
        response.on('data', chunk => body.push(chunk));
        response.on('end', () => {
            let fullBody = Buffer.concat(body);
            if (path.includes('/logs')) {
                // Parse multiplexed stream (8-byte header per frame)
                let logs = '';
                let offset = 0;
                while (offset < fullBody.length) {
                    if (offset + 8 > fullBody.length) break;
                    let type = fullBody.readUInt8(offset); // 1 = stdout, 2 = stderr
                    let length = fullBody.readUInt32BE(offset + 4);
                    offset += 8;
                    if (offset + length > fullBody.length) break;
                    logs += fullBody.toString('utf8', offset, offset + length);
                    offset += length;
                }
                res.status(response.statusCode).send(logs);
            } else {
                res.status(response.statusCode).send(fullBody.toString('utf8'));
            }
        });
    });
    req.on('error', err => res.status(500).json({ error: err.message }));
    req.end();
}

app.post('/api/docker/:id/restart', (req, res) => {
    dockerRequest('POST', `/containers/${req.params.id}/restart`, res);
});

app.post('/api/docker/:id/stop', (req, res) => {
    dockerRequest('POST', `/containers/${req.params.id}/stop`, res);
});

app.get('/api/docker/:id/logs', (req, res) => {
    // 20 lines of logs
    dockerRequest('GET', `/containers/${req.params.id}/logs?stdout=true&stderr=true&tail=20`, res);
});
// -------------------------------------

// SSE Endpoint for metrics
app.get('/api/metrics', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ message: 'connected' })}\n\n`);

    const intervalId = setInterval(async () => {
        try {
            const [cpu, mem, disk, time, network, os, docker, temp, dockerStats] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.time(),
                si.networkStats(),
                si.osInfo(),
                si.dockerContainers('all').catch(() => []), // Catch error if docker is not accessible
                si.cpuTemperature().catch(() => ({ main: null })),
                si.dockerContainerStats('*').catch(() => [])
            ]);

            const data = {
                cpu: {
                    load: cpu.currentLoad.toFixed(2),
                    cores: cpu.cpus.map(c => c.load.toFixed(2))
                },
                memory: {
                    total: mem.total,
                    used: mem.active,
                    free: mem.available,
                    percent: ((mem.active / mem.total) * 100).toFixed(2)
                },
                disk: disk.map(d => ({
                    fs: d.fs,
                    size: d.size,
                    used: d.used,
                    use: d.use.toFixed(2),
                    mount: d.mount
                })).filter(d => d.mount === '/' || d.mount.startsWith('/boot')), // Filter out loop/snap
                uptime: time.uptime, // in seconds
                network: network.map(n => ({
                    iface: n.iface,
                    rx_sec: n.rx_sec,
                    tx_sec: n.tx_sec
                })).filter(n => n.rx_sec > 0 || n.tx_sec > 0 || n.iface === 'eth0' || n.iface === 'enp3s0'),
                os: {
                    hostname: os.hostname,
                    distro: os.distro,
                    release: os.release,
                    kernel: os.kernel
                },
                temperature: temp.main,
                docker: docker.map(d => {
                    const stats = dockerStats.find(s => s.id === d.id);
                    return {
                        id: d.id,
                        name: d.name,
                        image: d.image,
                        state: d.state,
                        status: d.status,
                        cpuPercent: stats ? stats.cpuPercent : 0,
                        memPercent: stats ? stats.memPercent : 0
                    };
                })
            };

            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
            console.error('Error fetching system info:', err);
        }
    }, 2000); // Send updates every 2 seconds

    req.on('close', () => {
        clearInterval(intervalId);
    });
});

app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
