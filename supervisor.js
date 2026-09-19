const { spawn, execSync } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');

const LOG_FILE = path.join(__dirname, 'supervisor.log');
const SERVER_PATH = path.join(__dirname, 'server.js');
const LOCK_PORT = 5001;

function log(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, entry);
    } catch (e) {}
}

process.on('uncaughtException', (err) => {
    log(`Uncaught exception: ${err.stack || err}`);
});

process.on('unhandledRejection', (reason) => {
    log(`Unhandled rejection: ${reason}`);
});

// Single instance lock
const lockServer = net.createServer();

lockServer.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        log('Another supervisor instance is already running. Exiting cleanly.');
        process.exit(0);
    } else {
        log(`Lock error: ${err.message}`);
    }
});

lockServer.listen(LOCK_PORT, '127.0.0.1', () => {
    log('Lock acquired on port 5001. Starting server.js supervision...');
    startServer();
});

let child = null;
let restartTimer = null;

function cleanupPort5000() {
    try {
        const out = execSync('netstat -ano -p tcp | findstr ":5000" | findstr "LISTENING"', { encoding: 'utf8' });
        const lines = out.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0' && pid !== String(process.pid)) {
                try {
                    process.kill(parseInt(pid, 10), 'SIGKILL');
                    log(`Killed stale process ${pid} on port 5000`);
                } catch (e) {}
            }
        }
    } catch (e) {
        // Port 5000 is clean
    }
}

function startServer() {
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    cleanupPort5000();

    log('Spawning server.js...');
    
    // Open log streams for child
    const outStream = fs.openSync(path.join(__dirname, 'out.log'), 'a');
    const errStream = fs.openSync(path.join(__dirname, 'err.log'), 'a');

    child = spawn(process.execPath, [SERVER_PATH], {
        cwd: __dirname,
        stdio: ['ignore', outStream, errStream],
        detached: false,
        windowsHide: true
    });

    log(`server.js spawned with PID: ${child.pid}`);

    child.on('exit', (code, signal) => {
        log(`server.js exited (code: ${code}, signal: ${signal}). Auto-restarting in 1.5 seconds...`);
        restartTimer = setTimeout(startServer, 1500);
    });

    child.on('error', (err) => {
        log(`Failed to start server.js: ${err.message}`);
        restartTimer = setTimeout(startServer, 3000);
    });
}
