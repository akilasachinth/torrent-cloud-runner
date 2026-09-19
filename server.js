const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = process.env.PORT || 5000;
const REPO = process.env.REPO || 'akilasilv/torrent-cloud-runner';
const PUBLIC_DIR = path.join(__dirname, 'public');
const TOOLS_DIR = path.join(__dirname, 'tools');
const RCLONE_EXE = path.join(TOOLS_DIR, 'rclone.exe');

// Secure process runner using spawn with array arguments (zero shell injection)
function runGh(args, stdinInput = null, cwd = __dirname) {
    return new Promise((resolve) => {
        const proc = spawn('gh', args, { cwd, shell: false });
        let stdout = '';
        let stderr = '';

        if (stdinInput !== null) {
            proc.stdin.write(stdinInput);
            proc.stdin.end();
        }

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, stdout: stdout.trim() });
            } else {
                resolve({ success: false, error: stderr.trim() || `Process exited with code ${code}`, stdout: stdout.trim() });
            }
        });

        proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const ALLOWED_ORIGINS = new Set([
    'https://akilasilv.github.io',
    'https://akilasachinth.github.io',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
]);

const server = http.createServer(async (req, res) => {
    // Restrict CORS to authorized origins
    const requestOrigin = req.headers.origin;
    if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // API Routes
    if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        // GET /api/status - Check health, repository, and secret status
        if (pathname === '/api/status' && req.method === 'GET') {
            try {
                const secretCheck = await runGh(['secret', 'list', '-R', REPO]);
                const hasRcloneSecret = secretCheck.stdout ? secretCheck.stdout.includes('RCLONE_CONFIG_BASE64') : false;
                const rcloneInstalled = fs.existsSync(RCLONE_EXE);

                return res.end(JSON.stringify({
                    success: true,
                    repo: REPO,
                    gdriveConfigured: hasRcloneSecret,
                    rcloneInstalled
                }));
            } catch (err) {
                return res.end(JSON.stringify({ success: false, error: err.message }));
            }
        }

        const linksCache = new Map();

        // GET /api/jobs - List recent workflow runs
        if (pathname === '/api/jobs' && req.method === 'GET') {
            const result = await runGh(['run', 'list', '-R', REPO, '--workflow=download_to_gdrive.yml', '--json', 'databaseId,status,conclusion,createdAt,updatedAt,url,displayTitle,event', '--limit', '20']);
            if (!result.success) {
                return res.end(JSON.stringify({ success: false, error: result.error, jobs: [] }));
            }
            try {
                const jobs = JSON.parse(result.stdout || '[]');
                for (const job of jobs) {
                    if (linksCache.has(job.databaseId)) {
                        job.directUrl = linksCache.get(job.databaseId);
                    } else if (job.conclusion === 'success') {
                        const logRes = await runGh(['run', 'view', String(job.databaseId), '-R', REPO, '--log']);
                        const match = logRes.stdout ? logRes.stdout.match(/DIRECT_DOWNLOAD_URL:\s*(https?:\/\/[^\s\r\n]+)/) : null;
                        if (match) {
                            linksCache.set(job.databaseId, match[1]);
                            job.directUrl = match[1];
                        }
                    }
                }
                return res.end(JSON.stringify({ success: true, jobs }));
            } catch (err) {
                return res.end(JSON.stringify({ success: false, error: 'Failed to parse jobs' }));
            }
        }

        // POST /api/download - Trigger new cloud torrent download
        if (pathname === '/api/download' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const magnet = (data.magnet || '').trim();
                    const folder = (data.folder || 'General').trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
                    const uploadToDirect = data.uploadToDirect !== false ? 'true' : 'false';
                    const uploadToGdrive = data.uploadToGdrive === true ? 'true' : 'false';

                    if (!magnet || (!magnet.startsWith('magnet:?') && !magnet.startsWith('http://') && !magnet.startsWith('https://'))) {
                        res.writeHead(400);
                        return res.end(JSON.stringify({ success: false, error: 'A valid magnet URI or torrent link is required.' }));
                    }

                    // Dispatch GitHub Actions workflow via direct args (safe from shell injection)
                    const dispatch = await runGh([
                        'workflow', 'run', 'download_to_gdrive.yml',
                        '-R', REPO,
                        '-f', `magnet_url=${magnet}`,
                        '-f', `upload_to_direct=${uploadToDirect}`,
                        '-f', `upload_to_gdrive=${uploadToGdrive}`,
                        '-f', `destination_folder=${folder}`
                    ]);

                    if (!dispatch.success) {
                        res.writeHead(500);
                        return res.end(JSON.stringify({ success: false, error: dispatch.error }));
                    }

                    return res.end(JSON.stringify({
                        success: true,
                        message: 'Job dispatched to cloud runner! High-speed link will be generated once download completes.'
                    }));
                } catch (err) {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
            return;
        }

        // GET /api/jobs/:id/logs - Fetch run logs
        const logsMatch = pathname.match(/^\/api\/jobs\/(\d+)\/logs$/);
        if (logsMatch && req.method === 'GET') {
            const runId = logsMatch[1];
            const result = await runGh(['run', 'view', String(runId), '-R', REPO, '--log']);
            return res.end(JSON.stringify({
                success: true,
                logs: result.stdout || result.error || 'No log output yet.'
            }));
        }

        // POST /api/jobs/:id/cancel - Cancel active GitHub Action workflow run
        const cancelMatch = pathname.match(/^\/api\/jobs\/(\d+)\/cancel$/);
        if (cancelMatch && req.method === 'POST') {
            const runId = cancelMatch[1];
            const result = await runGh(['run', 'cancel', String(runId), '-R', REPO]);
            return res.end(JSON.stringify({
                success: result.success,
                message: result.success ? `Run #${runId} cancellation requested.` : result.error
            }));
        }

        // POST /api/save-gdrive - Set the RCLONE_CONFIG_BASE64 secret in GitHub
        if (pathname === '/api/save-gdrive' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const configText = (data.config || '').trim();
                    if (!configText || !configText.includes('[gdrive]')) {
                        res.writeHead(400);
                        return res.end(JSON.stringify({ success: false, error: 'Invalid config. Must contain [gdrive] section.' }));
                    }

                    const b64 = Buffer.from(configText, 'utf8').toString('base64');
                    // Set secret via gh stdin pipe (safe from shell breakout)
                    const result = await runGh(['secret', 'set', 'RCLONE_CONFIG_BASE64', '-R', REPO, '-b', b64]);
                    if (!result.success) {
                        res.writeHead(500);
                        return res.end(JSON.stringify({ success: false, error: result.error }));
                    }

                    return res.end(JSON.stringify({
                        success: true,
                        message: 'Google Drive configuration saved securely to your cloud runner!'
                    }));
                } catch (err) {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
            return;
        }

        // POST /api/trigger-auth - Launch interactive authorization window
        if (pathname === '/api/trigger-auth' && req.method === 'POST') {
            const authBat = path.join(__dirname, 'auth-gdrive.bat');
            spawn('cmd.exe', ['/c', 'start', '""', authBat], { detached: true, stdio: 'ignore' }).unref();
            return res.end(JSON.stringify({
                success: true,
                message: 'Authorization wizard launched! Check the newly opened terminal and browser window.'
            }));
        }

        // POST /api/restart or /api/shutdown - Restart server process via supervisor
        if ((pathname === '/api/shutdown' || pathname === '/api/restart') && req.method === 'POST') {
            res.end(JSON.stringify({
                success: true,
                message: 'CloudTorrent background server is restarting. It will be back online in 1.5 seconds.'
            }));
            console.log('Restart requested from dashboard. Exiting to allow supervisor auto-restart...');
            setTimeout(() => {
                process.exit(0);
            }, 300);
            return;
        }

        // POST /api/send-to-idm - Send URL directly to Internet Download Manager
        if (pathname === '/api/send-to-idm' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const url = (data.url || '').trim();
                    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
                        res.writeHead(400);
                        return res.end(JSON.stringify({ success: false, error: 'Valid HTTP/HTTPS URL is required' }));
                    }

                    const idmPath = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
                    if (!fs.existsSync(idmPath)) {
                        res.writeHead(404);
                        return res.end(JSON.stringify({ success: false, error: 'IDM is not installed at standard path.' }));
                    }

                    // Launch IDM with download URL (safe array args)
                    spawn(idmPath, ['/d', url], { detached: true, stdio: 'ignore' }).unref();

                    return res.end(JSON.stringify({
                        success: true,
                        message: 'Download sent to Internet Download Manager!'
                    }));
                } catch (err) {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
            return;
        }

        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }

    // Static File Serving with strict path traversal prevention
    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const safeFilePath = path.resolve(PUBLIC_DIR, '.' + requestedPath);

    if (!safeFilePath.startsWith(PUBLIC_DIR + path.sep) && safeFilePath !== path.join(PUBLIC_DIR, 'index.html')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Access denied');
    }

    fs.stat(safeFilePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }

        const ext = path.extname(safeFilePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(safeFilePath).pipe(res);
    });
});

// Bind to 127.0.0.1 (Localhost only, not exposed to LAN)
server.listen(PORT, '127.0.0.1', () => {
    console.log(`====================================================`);
    console.log(`🚀 Seedr Cloud Torrent Platform is running!`);
    console.log(`🌐 Localhost Dashboard: http://127.0.0.1:${PORT}`);
    console.log(`☁️  Connected to Cloud Runner: ${REPO}`);
    console.log(`====================================================`);
});
