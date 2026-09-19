document.addEventListener('DOMContentLoaded', () => {
    const DEFAULT_REPO  = 'akilasachinth/torrent-cloud-runner';
    const WORKFLOW_FILE = 'download.yml';

    // Baked-in token — injected at build time by deploy_pages.yml from GH_TOKEN secret.
    // Acts as a fallback so new browsers work without manual PAT entry.
    // (Placeholder __BAKED_TOKEN__ is replaced with real value during CI deploy.)
    const BAKED_TOKEN = '__BAKED_TOKEN__';

    // DOM Elements
    const runnerStatus      = document.getElementById('runnerStatus');
    const downloadForm      = document.getElementById('downloadForm');
    const magnetInput       = document.getElementById('magnetInput');
    const directLinkCheckbox = document.getElementById('directLinkCheckbox');
    const submitBtn         = document.getElementById('submitBtn');
    const pasteBtn          = document.getElementById('pasteBtn');
    const formFeedback      = document.getElementById('formFeedback');
    const jobsList          = document.getElementById('jobsList');
    const refreshJobsBtn    = document.getElementById('refreshJobsBtn');
    const clearCompletedBtn = document.getElementById('clearCompletedBtn');
    const clearFailedBtn    = document.getElementById('clearFailedBtn');

    // Modals
    const logsModal         = document.getElementById('logsModal');
    const closeLogsBtn      = document.getElementById('closeLogsBtn');
    const logsContent       = document.getElementById('logsContent');
    const logsModalTitle    = document.getElementById('logsModalTitle');

    let pollInterval = null;
    const directLinksCache = new Map();

    // --- Toast Notification System ---
    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.log(`[${type.toUpperCase()}] ${message}`);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        else if (type === 'error') icon = '❌';
        else if (type === 'warning') icon = '⚠️';

        const iconEl = document.createElement('span');
        iconEl.className = 'toast-icon';
        iconEl.textContent = icon;

        const textEl = document.createElement('span');
        textEl.className = 'toast-text';
        textEl.textContent = message;

        toast.appendChild(iconEl);
        toast.appendChild(textEl);
        container.appendChild(toast);

        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            toast.classList.add('toast-exit');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        };

        const timer = setTimeout(remove, duration);
        toast.addEventListener('click', () => {
            clearTimeout(timer);
            remove();
        });
    }

    // Helper functions for settings
    function getToken() {
        return BAKED_TOKEN && !BAKED_TOKEN.startsWith('__') ? BAKED_TOKEN : '';
    }

    function getRepo() {
        return DEFAULT_REPO;
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

    // --- Status Check ---
    async function checkStatus() {
        try {
            const repoRes = await fetch(`https://api.github.com/repos/${getRepo()}`, {
                headers: getGhHeaders()
            });

            if (repoRes.ok) {
                runnerStatus.className = 'status-pill online';
                runnerStatus.querySelector('.label').textContent = 'Cloud Runner: Online';
            } else {
                runnerStatus.className = 'status-pill error';
                runnerStatus.querySelector('.label').textContent = 'GitHub Auth Failed';
            }
        } catch (err) {
            runnerStatus.className = 'status-pill error';
            runnerStatus.querySelector('.label').textContent = 'Network Error';
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

        if (!magnet) return;

        if (!magnet.startsWith('magnet:?') && !magnet.startsWith('http://') && !magnet.startsWith('https://')) {
            showToast('Please enter a valid magnet:? link or torrent HTTP/HTTPS URL.', 'warning');
            return;
        }

        // UI state
        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector('.btn-text');
        btnText.textContent = 'Sending to Cloud Runner...';
        formFeedback.className = 'feedback-msg hidden';

        try {
            const dispatchRes = await fetch(`https://api.github.com/repos/${getRepo()}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
                method: 'POST',
                headers: getGhHeaders(),
                body: JSON.stringify({
                    ref: 'main',
                    inputs: {
                        magnet_url: magnet
                    }
                })
            });

            if (dispatchRes.status === 204) {
                formFeedback.textContent = '🚀 Job dispatched directly to GitHub Cloud Runner! Downloading in cloud...';
                formFeedback.className = 'feedback-msg success';
                showToast('🚀 Dispatched directly to GitHub Cloud Runner!', 'success');
                magnetInput.value = '';
                setTimeout(loadJobs, 3000);
            } else {
                const errData = await dispatchRes.json().catch(() => ({}));
                const errMsg = errData.message || `GitHub dispatch failed (${dispatchRes.status})`;
                formFeedback.textContent = errMsg;
                formFeedback.className = 'feedback-msg error';
                showToast(errMsg, 'error');
            }
        } catch (err) {
            formFeedback.textContent = 'Failed to dispatch to GitHub API: ' + err.message;
            formFeedback.className = 'feedback-msg error';
            showToast('Failed to dispatch: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = '⚡ Start Cloud Download';
        }
    });

    // --- Load Jobs ---
    async function loadJobs() {
        const token = getToken();
        const repo  = getRepo();
        if (!token) return;

        try {
            // 0. Load server-persisted downloads registry if available (cross-browser persistence)
            let serverDb = {};
            try {
                const dbRes = await fetch('downloads.json?t=' + Date.now());
                if (dbRes.ok) {
                    serverDb = await dbRes.json();
                }
            } catch (_) {}

            const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=15`, {
                headers: getGhHeaders()
            });
            if (!res.ok) return;
            const data = await res.json();
            const runs = (data.workflow_runs || []).filter(r => r.path && r.path.includes(WORKFLOW_FILE));

            const jobs = await Promise.all(runs.map(async (run) => {
                let directUrl = localStorage.getItem('direct_url_' + run.id) || directLinksCache.get(run.id) || null;
                let filename  = localStorage.getItem('filename_' + run.id) || null;

                // Check server-persisted database first (universal cross-browser persistence)
                if (serverDb && serverDb[run.id]) {
                    if (!directUrl && serverDb[run.id].directUrl) directUrl = serverDb[run.id].directUrl;
                    if (!filename  && serverDb[run.id].filename)  filename  = serverDb[run.id].filename;
                    if (directUrl) {
                        directLinksCache.set(run.id, directUrl);
                        localStorage.setItem('direct_url_' + run.id, directUrl);
                    }
                    if (filename) {
                        localStorage.setItem('filename_' + run.id, filename);
                    }
                }

                // Fallback for run 35441423046 (ran before annotations update)
                if (String(run.id) === '35441423046') {
                    if (!directUrl) directUrl = 'https://gofile.io/d/1opS1Mz5';
                    if (!filename)  filename  = 'Harry Potter And The Deathly Hallows Part 1 2010 REPACK 720p BluRay YTS.MX.zip';
                    directLinksCache.set(run.id, directUrl);
                    localStorage.setItem('direct_url_' + run.id, directUrl);
                    localStorage.setItem('filename_' + run.id, filename);
                }

                let currentStep = null;
                const needsJobsFetch = run.status === 'in_progress' || ((!directUrl || !filename) && run.status === 'completed' && run.conclusion === 'success');

                if (needsJobsFetch) {
                    try {
                        const jobsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/jobs`, {
                            headers: getGhHeaders()
                        });
                        if (jobsRes.ok) {
                            const jobsData = await jobsRes.json();
                            const runnerJob = jobsData.jobs && jobsData.jobs[0];
                            if (runnerJob) {
                                // Extract current active step for live progress bar
                                if (runnerJob.steps && runnerJob.steps.length > 0) {
                                    const inProg = runnerJob.steps.find(s => s.status === 'in_progress');
                                    if (inProg) {
                                        currentStep = inProg.name;
                                    } else {
                                        const lastDone = runnerJob.steps.filter(s => s.status === 'completed').pop();
                                        if (lastDone) currentStep = lastDone.name;
                                    }
                                }

                                if ((!directUrl || !filename) && run.status === 'completed' && run.conclusion === 'success') {
                                    // 1. Check annotations (zero CORS / redirect issues, fast JSON)
                                    try {
                                        const annotRes = await fetch(`https://api.github.com/repos/${repo}/check-runs/${runnerJob.id}/annotations`, {
                                            headers: getGhHeaders()
                                        });
                                        if (annotRes.ok) {
                                            const annots = await annotRes.json();
                                            for (const a of annots) {
                                                if (a.title === 'DIRECT_DOWNLOAD_URL' && a.message) directUrl = a.message.trim();
                                                if (a.title === 'DOWNLOAD_FILENAME' && a.message) filename = a.message.trim();
                                            }
                                        }
                                    } catch (_) {}

                                    // 2. Fallback to raw logs if annotations not yet populated
                                    if (!directUrl || !filename) {
                                        try {
                                            const logRes = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${runnerJob.id}/logs`, {
                                                headers: getGhHeaders()
                                            });
                                            if (logRes.ok) {
                                                const logText = await logRes.text();
                                                const urlMatch  = logText.match(/DIRECT_DOWNLOAD_URL:\s*(https?:\/\/[^\s\r\n]+)/);
                                                const nameMatch = logText.match(/DOWNLOAD_FILENAME:\s*([^\r\n]+)/);
                                                if (urlMatch && !directUrl) directUrl = urlMatch[1];
                                                if (nameMatch && !filename) filename = nameMatch[1].trim();
                                            }
                                        } catch (_) {}
                                    }

                                    if (directUrl) {
                                        directLinksCache.set(run.id, directUrl);
                                        localStorage.setItem('direct_url_' + run.id, directUrl);
                                    }
                                    if (filename) {
                                        localStorage.setItem('filename_' + run.id, filename);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to fetch job metadata for run:', run.id, e);
                    }
                }

                return {
                    databaseId: run.id,
                    status: run.status,
                    conclusion: run.conclusion,
                    createdAt: run.created_at,
                    displayTitle: filename || run.display_title || 'Cloud Torrent Downloader',
                    directUrl,
                    currentStep
                };
            }));

            renderJobs(jobs);
        } catch (err) {
            console.error('Failed to load GitHub cloud jobs:', err);
        }
    }

    // Safe URL sanitizer (prevents javascript: and malformed URI injection)
    function sanitizeUrl(url) {
        if (!url || typeof url !== 'string') return '';
        try {
            const parsed = new URL(url.trim());
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.href;
            }
        } catch (_) {}
        return '';
    }

    // HTML escape helper
    function escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    // Job status helpers
    function isJobFinished(job) {
        return job.status === 'completed' || (job.status !== 'in_progress' && job.status !== 'queued');
    }

    function isJobFailed(job) {
        return isJobFinished(job) && job.conclusion && job.conclusion !== 'success';
    }

    function isJobSuccess(job) {
        return isJobFinished(job) && job.conclusion === 'success';
    }

    // --- Render Job Cards ---
    function renderJobs(jobs) {
        const countBadge = document.getElementById('jobsCountBadge');
        if (countBadge) {
            countBadge.textContent = jobs ? jobs.length : 0;
            countBadge.classList.toggle('hidden', !jobs || jobs.length === 0);
        }

        const hasFailedJobs  = jobs && jobs.some(isJobFailed);
        const hasSuccessJobs = jobs && jobs.some(isJobSuccess);

        if (clearFailedBtn) {
            clearFailedBtn.classList.toggle('hidden', !hasFailedJobs);
        }
        if (clearCompletedBtn) {
            clearCompletedBtn.classList.toggle('hidden', !hasSuccessJobs);
        }

        if (!jobs || jobs.length === 0) {
            jobsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">☁️</div>
                    <h4>No Downloads Yet</h4>
                    <p>Paste a magnet link above to trigger a high-speed download on the cloud runner!</p>
                </div>`;
            return;
        }

        let hasActiveJobs = false;

        jobsList.innerHTML = jobs.map(job => {
            const isRunning = job.status === 'in_progress';
            const isQueued  = job.status === 'queued';
            if (isRunning || isQueued) hasActiveJobs = true;

            const isFailed  = isJobFailed(job);
            const isSuccess = isJobSuccess(job);

            let badgeClass  = 'badge-queued';
            let statusLabel = 'Queued';

            if (isRunning) {
                badgeClass  = 'badge-in_progress';
                statusLabel = '⚡ Downloading in Cloud...';
            } else if (job.status === 'completed') {
                if (job.conclusion === 'success') {
                    badgeClass  = 'badge-success';
                    statusLabel = job.directUrl ? '✓ Ready to Download' : '✓ Completed';
                } else {
                    badgeClass  = 'badge-failure';
                    statusLabel = '✗ Failed';
                }
            }

            // Calculate progress and stage
            let progress = 0;
            let stageText = 'Queued';
            let progressClass = 'queued';

            if (job.status === 'queued') {
                progress = 5;
                stageText = '⏳ Queued on cloud runner...';
                progressClass = 'queued';
            } else if (job.status === 'completed') {
                if (job.conclusion === 'success') {
                    progress = 100;
                    stageText = '✅ Cloud Download & Upload Complete';
                    progressClass = 'completed';
                } else {
                    progress = 100;
                    stageText = '❌ Cloud Download Failed';
                    progressClass = 'failed';
                }
            } else if (isRunning) {
                progressClass = 'in_progress';
                const step = job.currentStep || '';
                if (step.includes('Free Disk Space') || step.includes('Set up')) {
                    progress = 15;
                    stageText = '🚀 Preparing cloud runner disk...';
                } else if (step.includes('Install Tools')) {
                    progress = 30;
                    stageText = '📦 Installing aria2 & download engine...';
                } else if (step.includes('Download Torrent')) {
                    progress = 65;
                    stageText = '⚡ High-speed cloud torrent downloading...';
                } else if (step.includes('Generate Direct')) {
                    progress = 85;
                    stageText = '☁️ Packaging archive & uploading to CDN...';
                } else if (step.includes('Clean Up')) {
                    progress = 95;
                    stageText = '🧹 Finalizing download links...';
                } else {
                    progress = 45;
                    stageText = '⚡ Downloading in cloud runner...';
                }
            }

            const createdDate  = new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const safeDirectUrl = sanitizeUrl(job.directUrl);
            const safeJobId    = escapeHtml(String(job.databaseId || ''));

            return `
                <div id="job-${safeJobId}" class="job-card ${isRunning ? 'is-active' : ''}">
                    <div class="job-info">
                        <div class="job-title" title="${escapeHtml(job.displayTitle || 'Torrent Download Job')}">${escapeHtml(job.displayTitle || 'Torrent Download Job')}</div>
                        <div class="job-meta">
                            <span>Started: ${createdDate}</span>
                            <span>ID: #${safeJobId}</span>
                        </div>
                        <div class="job-progress-wrapper">
                            <div class="job-progress-header">
                                <span class="job-progress-stage">${stageText}</span>
                                <span class="job-progress-pct">${progress}%</span>
                            </div>
                            <div class="job-progress-track">
                                <div class="job-progress-fill ${progressClass}" style="width: ${progress}%;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="job-status">
                        <span class="badge ${badgeClass}">${statusLabel}</span>
                    </div>
                    <div class="job-actions">
                        ${safeDirectUrl ? `
                            <button class="btn btn-success btn-sm" data-action="idm" data-url="${escapeHtml(safeDirectUrl)}">⚡ Send to IDM</button>
                            <a href="${escapeHtml(safeDirectUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">🚀 Browser</a>
                            <button class="btn btn-outline btn-sm" data-action="copy" data-url="${escapeHtml(safeDirectUrl)}">📋 Copy</button>
                        ` : ''}
                        ${(job.status === 'in_progress' || job.status === 'queued') ? `
                            <button class="btn btn-danger btn-sm" data-action="cancel" data-id="${safeJobId}">⏹️ Cancel</button>
                        ` : ''}
                        <button class="btn btn-outline btn-sm" data-action="logs" data-id="${safeJobId}">📜 Logs</button>
                        ${isFailed ? `
                            <button class="btn btn-danger-outline btn-sm" data-action="delete" data-id="${safeJobId}" title="Clear this failed download record">🗑️ Clear Failed</button>
                        ` : ''}
                        ${isSuccess ? `
                            <button class="btn btn-outline btn-sm" data-action="delete" data-id="${safeJobId}" title="Clear this download record">🗑️ Clear</button>
                        ` : ''}
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

        try {
            const res = await fetch(`https://api.github.com/repos/${getRepo()}/actions/runs/${jobId}/cancel`, {
                method: 'POST',
                headers: getGhHeaders()
            });
            if (res.status === 202) {
                showToast('Cancellation request sent to cloud runner.', 'info');
                loadJobs();
            } else {
                showToast('Cancel failed: ' + res.statusText, 'error');
            }
        } catch (err) {
            showToast('Cancel request failed: ' + err.message, 'error');
        }
    };

    // --- View Logs ---
    window.viewLogs = async (jobId) => {
        logsModal.classList.remove('hidden');
        logsModalTitle.textContent = `Cloud Runner Logs (#${jobId})`;
        const ghRunUrl = `https://github.com/${getRepo()}/actions/runs/${jobId}`;
        logsContent.textContent = 'Fetching live runner output from cloud...';

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

            // Try to get direct download URL and filename from annotations or cache
            let directUrl = localStorage.getItem('direct_url_' + jobId) || (String(jobId) === '35441423046' ? 'https://gofile.io/d/1opS1Mz5' : null);
            let filename  = localStorage.getItem('filename_' + jobId)   || (String(jobId) === '35441423046' ? 'Harry Potter And The Deathly Hallows Part 1 2010 REPACK 720p BluRay YTS.MX.zip' : null);

            try {
                const annotRes = await fetch(`https://api.github.com/repos/${repo}/check-runs/${runnerJob.id}/annotations`, {
                    headers: getGhHeaders()
                });
                if (annotRes.ok) {
                    const annots = await annotRes.json();
                    for (const a of annots) {
                        if (a.title === 'DIRECT_DOWNLOAD_URL' && a.message) directUrl = a.message.trim();
                        if (a.title === 'DOWNLOAD_FILENAME' && a.message) filename = a.message.trim();
                    }
                }
            } catch (_) {}

            // Try fetching raw log text
            let logText = null;
            try {
                const logRes = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${runnerJob.id}/logs`, {
                    headers: getGhHeaders()
                });
                if (logRes.ok) {
                    logText = await logRes.text();
                }
            } catch (_) {
                // Cross-origin redirect to Azure storage blocked by browser CORS policy
            }

            if (logText) {
                logsContent.textContent = logText;
                logsContent.scrollTop = logsContent.scrollHeight;
            } else {
                let summaryHtml = `
                    <div style="font-family: inherit; line-height: 1.8; padding: 4px;">
                        <p><strong>Run Status:</strong> ${escapeHtml(runnerJob.status)} (${escapeHtml(runnerJob.conclusion || 'running')})</p>
                        ${filename ? `<p><strong>File Name:</strong> ${escapeHtml(filename)}</p>` : ''}
                        ${directUrl ? `<p><strong>Direct Link:</strong> <a href="${escapeHtml(directUrl)}" target="_blank" rel="noopener noreferrer" style="color:#22c55e;font-weight:600;word-break:break-all;">${escapeHtml(directUrl)}</a></p>` : ''}
                        <hr style="border:0;border-top:1px solid rgba(255,255,255,0.15);margin:14px 0;">
                        <p style="color:#94a3b8;font-size:0.9em;margin-bottom:12px;">
                            Raw streaming runner output is hosted in GitHub Actions cloud storage. Due to browser cross-origin policy, you can view the complete live console log directly on GitHub:
                        </p>
                        <a href="${escapeHtml(ghRunUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display:inline-block;">
                            🚀 Open Live Console Logs on GitHub Actions ↗
                        </a>
                    </div>
                `;
                logsContent.innerHTML = summaryHtml;
            }
        } catch (err) {
            logsContent.textContent = 'Error: ' + err.message;
        }
    };

    // --- Delete Single Job Record ---
    window.deleteJob = async (jobId) => {
        if (!confirm(`Clear download record #${jobId}?`)) return;

        const card = document.getElementById(`job-${jobId}`);
        if (card) {
            card.style.opacity = '0.35';
            card.style.pointerEvents = 'none';
        }

        try {
            const res = await fetch(`https://api.github.com/repos/${getRepo()}/actions/runs/${jobId}`, {
                method: 'DELETE',
                headers: getGhHeaders()
            });

            // Purge from local storage and in-memory caches
            localStorage.removeItem('direct_url_' + jobId);
            localStorage.removeItem('filename_' + jobId);
            directLinksCache.delete(jobId);
            directLinksCache.delete(Number(jobId));

            if (res.status === 204 || res.status === 404 || res.ok) {
                showToast(`Download record #${jobId} cleared`, 'info');
            } else {
                showToast(`Removed from view (GitHub run status: ${res.status})`, 'info');
            }
            loadJobs();
        } catch (err) {
            showToast('Failed to delete download record: ' + err.message, 'error');
            if (card) {
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
            }
        }
    };

    // --- Clear All Failed Jobs ---
    window.clearAllFailed = async () => {
        if (!confirm('Are you sure you want to clear all failed download records?')) return;

        if (clearFailedBtn) {
            clearFailedBtn.disabled = true;
            clearFailedBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-label">Clearing...</span>';
        }

        try {
            const repo = getRepo();
            const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=30`, {
                headers: getGhHeaders()
            });

            if (res.ok) {
                const data = await res.json();
                const failedRuns = (data.workflow_runs || []).filter(r => 
                    r.path && r.path.includes(WORKFLOW_FILE) && 
                    (r.status === 'completed' || (r.status !== 'in_progress' && r.status !== 'queued')) &&
                    r.conclusion && r.conclusion !== 'success'
                );

                if (failedRuns.length > 0) {
                    await Promise.allSettled(failedRuns.map(async (run) => {
                        localStorage.removeItem('direct_url_' + run.id);
                        localStorage.removeItem('filename_' + run.id);
                        directLinksCache.delete(run.id);
                        directLinksCache.delete(Number(run.id));
                        return fetch(`https://api.github.com/repos/${repo}/actions/runs/${run.id}`, {
                            method: 'DELETE',
                            headers: getGhHeaders()
                        });
                    }));
                    showToast(`Cleared ${failedRuns.length} failed download record(s)!`, 'success');
                } else {
                    showToast('No failed download records found to clear.', 'info');
                }
            }
            await loadJobs();
        } catch (err) {
            showToast('Failed to clear failed records: ' + err.message, 'error');
        } finally {
            if (clearFailedBtn) {
                clearFailedBtn.disabled = false;
                clearFailedBtn.innerHTML = '<span class="btn-icon">❌</span><span class="btn-label">Clear Failed</span>';
            }
        }
    };

    // --- Clear All Completed Jobs ---
    window.clearAllCompleted = async () => {
        if (!confirm('Are you sure you want to clear all completed download records?')) return;

        if (clearCompletedBtn) {
            clearCompletedBtn.disabled = true;
            clearCompletedBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-label">Clearing...</span>';
        }

        try {
            const repo = getRepo();
            const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=30`, {
                headers: getGhHeaders()
            });

            if (res.ok) {
                const data = await res.json();
                const completedRuns = (data.workflow_runs || []).filter(r => 
                    r.path && r.path.includes(WORKFLOW_FILE) && 
                    (r.status === 'completed' || (r.status !== 'in_progress' && r.status !== 'queued')) &&
                    r.conclusion === 'success'
                );

                if (completedRuns.length > 0) {
                    await Promise.allSettled(completedRuns.map(async (run) => {
                        localStorage.removeItem('direct_url_' + run.id);
                        localStorage.removeItem('filename_' + run.id);
                        directLinksCache.delete(run.id);
                        directLinksCache.delete(Number(run.id));
                        return fetch(`https://api.github.com/repos/${repo}/actions/runs/${run.id}`, {
                            method: 'DELETE',
                            headers: getGhHeaders()
                        });
                    }));
                    showToast(`Cleared ${completedRuns.length} completed download record(s)!`, 'success');
                } else {
                    showToast('No completed download records found to clear.', 'info');
                }
            }
            await loadJobs();
        } catch (err) {
            showToast('Failed to clear completed records: ' + err.message, 'error');
        } finally {
            if (clearCompletedBtn) {
                clearCompletedBtn.disabled = false;
                clearCompletedBtn.innerHTML = '<span class="btn-icon">🧹</span><span class="btn-label">Clear Completed</span>';
            }
        }
    };

    // --- IDM & Copy Helpers ---
    window.sendToIdm = async (url) => {
        // Cloud mode: copy link so IDM browser extension captures it automatically
        await window.copyLink(url);
    };

    window.copyLink = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            showToast('📋 Direct download link copied! IDM or browser extension will capture it automatically.', 'success');
        } catch (err) {
            prompt('Copy this high-speed direct download link:', url);
        }
    };

    // Modal Events
    if (closeLogsBtn) closeLogsBtn.addEventListener('click', () => logsModal.classList.add('hidden'));

    // Safe Event Delegation for Jobs List (Zero inline onclick / Zero DOM-XSS)
    if (jobsList) {
        jobsList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'idm' && btn.dataset.url) {
                window.sendToIdm(btn.dataset.url);
            } else if (action === 'copy' && btn.dataset.url) {
                window.copyLink(btn.dataset.url);
            } else if (action === 'cancel' && btn.dataset.id) {
                window.cancelJob(btn.dataset.id);
            } else if (action === 'delete' && btn.dataset.id) {
                window.deleteJob(btn.dataset.id);
            } else if (action === 'logs' && btn.dataset.id) {
                window.viewLogs(btn.dataset.id);
            }
        });
    }

    if (clearFailedBtn) clearFailedBtn.addEventListener('click', window.clearAllFailed);
    if (clearCompletedBtn) clearCompletedBtn.addEventListener('click', window.clearAllCompleted);
    if (refreshJobsBtn) refreshJobsBtn.addEventListener('click', loadJobs);

    // Initial Load
    checkStatus();
    loadJobs();
});
