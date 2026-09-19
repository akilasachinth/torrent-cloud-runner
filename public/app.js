document.addEventListener('DOMContentLoaded', () => {
    // Storage Keys
    const STORAGE_KEY_TOKEN = 'cloudtorrent_gh_token';
    const STORAGE_KEY_REPO = 'cloudtorrent_gh_repo';
    const DEFAULT_REPO = 'akilasachinth/torrent-cloud-runner';

    // Environment Detection
    const isLocalServer = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '5000';

    // DOM Elements
    const runnerStatus = document.getElementById('runnerStatus');
    const gdriveStatus = document.getElementById('gdriveStatus');
    const downloadForm = document.getElementById('downloadForm');
    const magnetInput = document.getElementById('magnetInput');
    const folderInput = document.getElementById('folderInput');
    const folderGroup = document.getElementById('folderGroup');
    const directLinkCheckbox = document.getElementById('directLinkCheckbox');
    const gdriveCheckbox = document.getElementById('gdriveCheckbox');
    const submitBtn = document.getElementById('submitBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const formFeedback = document.getElementById('formFeedback');
    const jobsList = document.getElementById('jobsList');
    const refreshJobsBtn = document.getElementById('refreshJobsBtn');
    const restartServerBtn = document.getElementById('restartServerBtn');

    // Modals
    const gdriveModal = document.getElementById('gdriveModal');
    const openGdriveModalBtn = document.getElementById('openGdriveModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const launchRcloneAuthBtn = document.getElementById('launchRcloneAuthBtn');
    const authOutput = document.getElementById('authOutput');
    const rcloneConfigInput = document.getElementById('rcloneConfigInput');
    const saveConfigBtn = document.getElementById('saveConfigBtn');

    const logsModal = document.getElementById('logsModal');
    const closeLogsBtn = document.getElementById('closeLogsBtn');
    const logsContent = document.getElementById('logsContent');
    const logsModalTitle = document.getElementById('logsModalTitle');

    const configModal = document.getElementById('configModal');
    const openConfigModalBtn = document.getElementById('openConfigModalBtn');
    const closeConfigModalBtn = document.getElementById('closeConfigModalBtn');
    const ghTokenInput = document.getElementById('ghTokenInput');
    const ghRepoInput = document.getElementById('ghRepoInput');
    const saveGhConfigBtn = document.getElementById('saveGhConfigBtn');

    let pollInterval = null;
    const directLinksCache = new Map();

    // Hide local restart button when running on GitHub Pages
    if (!isLocalServer && restartServerBtn) {
        restartServerBtn.style.display = 'none';
    }

    // Helper functions for settings
    function getToken() {
        return localStorage.getItem(STORAGE_KEY_TOKEN) || '';
    }

    function getRepo() {
        return localStorage.getItem(STORAGE_KEY_REPO) || DEFAULT_REPO;
    }

    function getGhHeaders() {
        const headers = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    // Initialize Config Inputs
    if (ghRepoInput) ghRepoInput.value = getRepo();
    if (ghTokenInput) ghTokenInput.value = getToken();

    // Toggle folder input visibility
    if (gdriveCheckbox && folderGroup) {
        gdriveCheckbox.addEventListener('change', () => {
            folderGroup.style.display = gdriveCheckbox.checked ? 'flex' : 'none';
        });
    }

    // --- Status Check ---
    async function checkStatus() {
        if (isLocalServer) {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                if (data.success) {
                    runnerStatus.className = 'status-pill online';
                    runnerStatus.querySelector('.label').textContent = 'Cloud Runner: Online';
                    if (data.gdriveConfigured) {
                        gdriveStatus.className = 'status-pill online';
                        gdriveStatus.querySelector('.label').textContent = 'GDrive: Connected';
                    } else {
                        gdriveStatus.className = 'status-pill warning';
                        gdriveStatus.querySelector('.label').textContent = 'GDrive: Setup Required';
                    }
                } else {
                    runnerStatus.className = 'status-pill error';
                    runnerStatus.querySelector('.label').textContent = 'Cloud Runner: Error';
                }
            } catch (err) {
                runnerStatus.className = 'status-pill error';
                runnerStatus.querySelector('.label').textContent = 'Local Server: Offline';
            }
        } else {
            // Cloud / GitHub Pages Mode
            const token = getToken();
            const repo = getRepo();

            if (!token) {
                runnerStatus.className = 'status-pill warning';
                runnerStatus.querySelector('.label').textContent = '🔑 Connect GitHub Token';
                gdriveStatus.className = 'status-pill warning';
                gdriveStatus.querySelector('.label').textContent = 'GDrive: Pending Auth';
                return;
            }

            try {
                const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
                    headers: getGhHeaders()
                });

                if (repoRes.ok) {
                    runnerStatus.className = 'status-pill online';
                    runnerStatus.querySelector('.label').textContent = 'Cloud Runner: Online (Cloud)';

                    // Check GDrive secret
                    try {
                        const secretRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/RCLONE_CONFIG_BASE64`, {
                            headers: getGhHeaders()
                        });
                        if (secretRes.ok) {
                            gdriveStatus.className = 'status-pill online';
                            gdriveStatus.querySelector('.label').textContent = 'GDrive: Connected';
                        } else {
                            gdriveStatus.className = 'status-pill warning';
                            gdriveStatus.querySelector('.label').textContent = 'GDrive: Setup Needed';
                        }
                    } catch (e) {
                        gdriveStatus.className = 'status-pill online';
                        gdriveStatus.querySelector('.label').textContent = 'GDrive: Connected';
                    }
                } else {
                    runnerStatus.className = 'status-pill error';
                    runnerStatus.querySelector('.label').textContent = 'GitHub Auth Failed';
                }
            } catch (err) {
                runnerStatus.className = 'status-pill error';
                runnerStatus.querySelector('.label').textContent = 'Network Error';
            }
        }
    }

    // --- Paste from Clipboard ---
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                magnetInput.value = text;
                magnetInput.focus();
            }
        } catch (err) {
            console.warn('Clipboard read failed:', err);
        }
    });

    // --- Submit Download Form ---
    downloadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const magnet = magnetInput.value.trim();
        const folder = folderInput.value.trim() || 'General';

        if (!magnet) return;

        // UI state
        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector('.btn-text');
        btnText.textContent = 'Sending to Cloud Runner...';
        formFeedback.className = 'feedback-msg hidden';

        if (isLocalServer) {
            try {
                const res = await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        magnet,
                        folder,
                        uploadToDirect: directLinkCheckbox ? directLinkCheckbox.checked : true,
                        uploadToGdrive: gdriveCheckbox ? gdriveCheckbox.checked : false
                    })
                });
                const data = await res.json();
                if (data.success) {
                    formFeedback.textContent = data.message;
                    formFeedback.className = 'feedback-msg success';
                    magnetInput.value = '';
                    setTimeout(loadJobs, 2500);
                } else {
                    formFeedback.textContent = data.error || 'Failed to dispatch download';
                    formFeedback.className = 'feedback-msg error';
                }
            } catch (err) {
                formFeedback.textContent = 'Network error contacting local server.';
                formFeedback.className = 'feedback-msg error';
            } finally {
                submitBtn.disabled = false;
                btnText.textContent = '⚡ Start Cloud Download';
            }
        } else {
            // Cloud Mode (Direct GitHub API)
            const token = getToken();
            const repo = getRepo();

            if (!token) {
                alert('Please connect your GitHub Token first using the "🔑 GitHub Settings" button.');
                configModal.classList.remove('hidden');
                submitBtn.disabled = false;
                btnText.textContent = '⚡ Start Cloud Download';
                return;
            }

            try {
                const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/download_to_gdrive.yml/dispatches`, {
                    method: 'POST',
                    headers: getGhHeaders(),
                    body: JSON.stringify({
                        ref: 'main',
                        inputs: {
                            magnet_url: magnet,
                            upload_to_direct: directLinkCheckbox && directLinkCheckbox.checked ? 'true' : 'false',
                            upload_to_gdrive: gdriveCheckbox && gdriveCheckbox.checked ? 'true' : 'false',
                            destination_folder: folder
                        }
                    })
                });

                if (dispatchRes.status === 204) {
                    formFeedback.textContent = '🚀 Job dispatched directly to GitHub Cloud Runner! Downloading in cloud...';
                    formFeedback.className = 'feedback-msg success';
                    magnetInput.value = '';
                    setTimeout(loadJobs, 3000);
                } else {
                    const errData = await dispatchRes.json().catch(() => ({}));
                    formFeedback.textContent = errData.message || `GitHub dispatch failed (${dispatchRes.status})`;
                    formFeedback.className = 'feedback-msg error';
                }
            } catch (err) {
                formFeedback.textContent = 'Failed to dispatch to GitHub API: ' + err.message;
                formFeedback.className = 'feedback-msg error';
            } finally {
                submitBtn.disabled = false;
                btnText.textContent = '⚡ Start Cloud Download';
            }
        }
    });

    // --- Load Jobs ---
    async function loadJobs() {
        if (isLocalServer) {
            try {
                const res = await fetch('/api/jobs');
                const data = await res.json();
                renderJobs(data.jobs || []);
            } catch (err) {
                console.error('Failed to load local jobs:', err);
            }
        } else {
            // Direct GitHub API
            const token = getToken();
            const repo = getRepo();
            if (!token) return;

            try {
                const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=15`, {
                    headers: getGhHeaders()
                });
                if (!res.ok) return;
                const data = await res.json();
                const runs = (data.workflow_runs || []).filter(r => r.path && r.path.includes('download_to_gdrive.yml'));

                const jobs = await Promise.all(runs.map(async (run) => {
                    let directUrl = localStorage.getItem('direct_url_' + run.id) || directLinksCache.get(run.id) || null;

                    // Extract direct URL from logs if completed successfully and not cached
                    if (!directUrl && run.status === 'completed' && run.conclusion === 'success') {
                        try {
                            const jobsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/jobs`, {
                                headers: getGhHeaders()
                            });
                            if (jobsRes.ok) {
                                const jobsData = await jobsRes.json();
                                const runnerJob = jobsData.jobs && jobsData.jobs[0];
                                if (runnerJob) {
                                    const logRes = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${runnerJob.id}/logs`, {
                                        headers: getGhHeaders()
                                    });
                                    if (logRes.ok) {
                                        const logText = await logRes.text();
                                        const match = logText.match(/DIRECT_DOWNLOAD_URL:\s*(https?:\/\/[^\s\r\n]+)/);
                                        if (match) {
                                            directUrl = match[1];
                                            directLinksCache.set(run.id, directUrl);
                                            localStorage.setItem('direct_url_' + run.id, directUrl);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to parse direct URL for run:', run.id, e);
                        }
                    }

                    return {
                        databaseId: run.id,
                        status: run.status,
                        conclusion: run.conclusion,
                        createdAt: run.created_at,
                        displayTitle: run.display_title || 'Cloud Torrent Downloader',
                        directUrl
                    };
                }));

                renderJobs(jobs);
            } catch (err) {
                console.error('Failed to load GitHub cloud jobs:', err);
            }
        }
    }

    // --- Render Job Cards ---
    function renderJobs(jobs) {
        if (!jobs || jobs.length === 0) {
            jobsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">☁️</div>
                    <p>No downloads yet. Paste a magnet link above to start downloading on cloud runners!</p>
                </div>`;
            return;
        }

        let hasActiveJobs = false;

        jobsList.innerHTML = jobs.map(job => {
            const isRunning = job.status === 'in_progress';
            const isQueued = job.status === 'queued';
            if (isRunning || isQueued) hasActiveJobs = true;

            let badgeClass = 'badge-queued';
            let statusLabel = 'Queued';

            if (isRunning) {
                badgeClass = 'badge-in_progress';
                statusLabel = '⚡ Downloading in Cloud...';
            } else if (job.status === 'completed') {
                if (job.conclusion === 'success') {
                    badgeClass = 'badge-success';
                    statusLabel = job.directUrl ? '✓ Ready to Download' : '✓ Completed';
                } else {
                    badgeClass = 'badge-failure';
                    statusLabel = '✗ Failed';
                }
            }

            const createdDate = new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return `
                <div class="job-card">
                    <div class="job-info">
                        <div class="job-title">${escapeHtml(job.displayTitle || 'Torrent Download Job')}</div>
                        <div class="job-meta">
                            <span>Started: ${createdDate}</span>
                            <span>ID: #${job.databaseId}</span>
                        </div>
                    </div>
                    <div class="job-status">
                        <span class="badge ${badgeClass}">${statusLabel}</span>
                    </div>
                    <div class="job-actions">
                        ${job.directUrl ? `
                            <button class="btn btn-success btn-sm" onclick="window.sendToIdm('${escapeHtml(job.directUrl)}')">⚡ Send to IDM</button>
                            <a href="${job.directUrl}" target="_blank" class="btn btn-primary btn-sm">🚀 Browser</a>
                            <button class="btn btn-outline btn-sm" onclick="window.copyLink('${escapeHtml(job.directUrl)}')">📋 Copy</button>
                        ` : ''}
                        ${(job.status === 'in_progress' || job.status === 'queued') ? `
                            <button class="btn btn-danger btn-sm" onclick="window.cancelJob('${job.databaseId}')">⏹️ Cancel</button>
                        ` : ''}
                        <button class="btn btn-outline btn-sm" onclick="window.viewLogs('${job.databaseId}')">📜 Logs</button>
                        ${job.conclusion === 'success' ? `<a href="https://drive.google.com/drive/my-drive" target="_blank" class="btn btn-secondary btn-sm">📁 Open Drive</a>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        if (hasActiveJobs) {
            if (!pollInterval) pollInterval = setInterval(loadJobs, 6000);
        } else {
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
        }
    }

    // --- Cancel Job ---
    window.cancelJob = async (jobId) => {
        if (!confirm(`Are you sure you want to cancel Cloud Download Job #${jobId}?`)) return;

        if (isLocalServer) {
            try {
                const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
                const data = await res.json();
                alert(data.message || 'Job cancellation submitted.');
                loadJobs();
            } catch (err) {
                alert('Failed to cancel job: ' + err.message);
            }
        } else {
            try {
                const res = await fetch(`https://api.github.com/repos/${getRepo()}/actions/runs/${jobId}/cancel`, {
                    method: 'POST',
                    headers: getGhHeaders()
                });
                if (res.status === 202) {
                    alert('Cancellation request sent to cloud runner.');
                    loadJobs();
                } else {
                    alert('Cancel failed: ' + res.statusText);
                }
            } catch (err) {
                alert('Cancel request failed: ' + err.message);
            }
        }
    };

    // --- View Logs ---
    window.viewLogs = async (jobId) => {
        logsModal.classList.remove('hidden');
        logsModalTitle.textContent = `Cloud Runner Logs (#${jobId})`;
        logsContent.textContent = 'Fetching live runner output from cloud...';

        if (isLocalServer) {
            try {
                const res = await fetch(`/api/jobs/${jobId}/logs`);
                const data = await res.json();
                logsContent.textContent = data.logs || 'No logs available yet.';
                logsContent.scrollTop = logsContent.scrollHeight;
            } catch (err) {
                logsContent.textContent = 'Failed to load logs: ' + err.message;
            }
        } else {
            try {
                const repo = getRepo();
                const jobsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${jobId}/jobs`, {
                    headers: getGhHeaders()
                });
                if (!jobsRes.ok) throw new Error('Could not fetch jobs for this run');
                const jobsData = await jobsRes.json();
                const runnerJob = jobsData.jobs && jobsData.jobs[0];

                if (!runnerJob) {
                    logsContent.textContent = 'Job has not started on cloud yet. Please check back in a few seconds.';
                    return;
                }

                const logRes = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${runnerJob.id}/logs`, {
                    headers: getGhHeaders()
                });

                if (logRes.ok) {
                    logsContent.textContent = await logRes.text();
                    logsContent.scrollTop = logsContent.scrollHeight;
                } else {
                    logsContent.textContent = 'Logs are still streaming or not yet available.';
                }
            } catch (err) {
                logsContent.textContent = 'Error fetching logs: ' + err.message;
            }
        }
    };

    // --- IDM & Copy Helpers ---
    window.sendToIdm = async (url) => {
        if (isLocalServer) {
            try {
                const res = await fetch('/api/send-to-idm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const data = await res.json();
                if (!data.success) alert('IDM Error: ' + data.error);
            } catch (err) {
                window.copyLink(url);
            }
        } else {
            // Cloud mode: copy link and notify
            await window.copyLink(url);
        }
    };

    window.copyLink = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            alert('📋 High-Speed Direct Link copied to clipboard!\n\nIf IDM or browser extension is active, it will capture this download automatically.');
        } catch (err) {
            prompt('Copy this high-speed direct download link:', url);
        }
    };

    function escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    // Modal Events
    if (closeLogsBtn) closeLogsBtn.addEventListener('click', () => logsModal.classList.add('hidden'));
    if (openGdriveModalBtn) openGdriveModalBtn.addEventListener('click', () => gdriveModal.classList.remove('hidden'));
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => gdriveModal.classList.add('hidden'));

    if (openConfigModalBtn) openConfigModalBtn.addEventListener('click', () => {
        ghTokenInput.value = getToken();
        ghRepoInput.value = getRepo();
        configModal.classList.remove('hidden');
    });

    if (closeConfigModalBtn) closeConfigModalBtn.addEventListener('click', () => configModal.classList.add('hidden'));

    if (saveGhConfigBtn) {
        saveGhConfigBtn.addEventListener('click', () => {
            const token = ghTokenInput.value.trim();
            const repo = ghRepoInput.value.trim() || DEFAULT_REPO;

            if (!token) {
                alert('Please enter a valid GitHub token.');
                return;
            }

            localStorage.setItem(STORAGE_KEY_TOKEN, token);
            localStorage.setItem(STORAGE_KEY_REPO, repo);
            alert('✅ GitHub credentials saved to your browser!');
            configModal.classList.add('hidden');
            checkStatus();
            loadJobs();
        });
    }

    if (refreshJobsBtn) refreshJobsBtn.addEventListener('click', loadJobs);

    // Initial Load & Auth prompt
    checkStatus();
    loadJobs();

    if (!isLocalServer && !getToken()) {
        setTimeout(() => {
            configModal.classList.remove('hidden');
        }, 800);
    }
});
