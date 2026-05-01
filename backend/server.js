const express = require('express');
const cors = require('cors');
const si = require('systeminformation');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const path = require('path');

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// SSE Endpoint for metrics
app.get('/api/metrics', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ message: 'connected' })}\n\n`);

    const intervalId = setInterval(async () => {
        try {
            const [cpu, mem, disk, time, network, os] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.time(),
                si.networkStats(),
                si.osInfo()
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
                }
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
