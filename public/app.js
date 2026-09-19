document.addEventListener('DOMContentLoaded', () => {
    // Elements
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

    // Toggle folder input visibility when GDrive checkbox is clicked
    if (gdriveCheckbox && folderGroup) {
        gdriveCheckbox.addEventListener('change', () => {
            folderGroup.style.display = gdriveCheckbox.checked ? 'flex' : 'none';
        });
    }

    // Restart Server Button Handler
    if (restartServerBtn) {
        restartServerBtn.addEventListener('click', async () => {
            if (!confirm('Restart CloudTorrent background service?')) {
                return;
            }

            restartServerBtn.disabled = true;
            restartServerBtn.textContent = 'Restarting...';

            try {
                await fetch('/api/restart', { method: 'POST' });
            } catch (e) {
                // Expected drop during restart
            }

            setTimeout(() => {
                window.location.reload();
            }, 1800);
        });
    }

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

    let pollInterval = null;

    // --- Status Check ---
    async function checkStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();

            if (data.success) {
                // Runner Status
                runnerStatus.className = 'status-pill online';
                runnerStatus.querySelector('.label').textContent = 'Cloud Runner: Online';

                // GDrive Status
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

    // --- Submit Download ---
    downloadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const magnet = magnetInput.value.trim();
        const folder = folderInput.value.trim() || 'General';

        if (!magnet) return;

        // UI state
        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');
        btnText.textContent = 'Sending to Cloud...';
        formFeedback.className = 'feedback-msg hidden';

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
                // Refresh jobs immediately and start polling
                setTimeout(loadJobs, 2000);
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
    });

    // --- Load Jobs ---
    async function loadJobs() {
        try {
            const res = await fetch('/api/jobs');
            const data = await res.json();

            if (!data.success || !data.jobs || data.jobs.length === 0) {
                jobsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">☁️</div>
                        <p>No downloads yet. Paste a magnet link above to start downloading directly to Google Drive!</p>
                    </div>`;
                return;
            }

            let hasActiveJobs = false;

            jobsList.innerHTML = data.jobs.map(job => {
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

            // If active jobs exist, poll every 6s
            if (hasActiveJobs) {
                if (!pollInterval) {
                    pollInterval = setInterval(loadJobs, 6000);
                }
            } else {
                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                }
            }

        } catch (err) {
            console.error('Failed to load jobs:', err);
        }
    }

    // --- Cancel Job ---
    window.cancelJob = async (jobId) => {
        if (!confirm(`Are you sure you want to cancel Cloud Download Job #${jobId}?`)) return;
        try {
            const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
            const data = await res.json();
            alert(data.message || 'Job cancellation submitted.');
            loadJobs();
        } catch (err) {
            alert('Failed to cancel job: ' + err.message);
        }
    };

    // --- View Logs ---
    window.viewLogs = async (jobId) => {
        logsModal.classList.remove('hidden');
        logsModalTitle.textContent = `Cloud Runner Logs (#${jobId})`;
        logsContent.textContent = 'Fetching live runner output from cloud...';

        try {
            const res = await fetch(`/api/jobs/${jobId}/logs`);
            const data = await res.json();
            logsContent.textContent = data.logs || 'No logs available yet.';
            logsContent.scrollTop = logsContent.scrollHeight;
        } catch (err) {
            logsContent.textContent = 'Failed to load logs: ' + err.message;
        }
    };

    closeLogsBtn.addEventListener('click', () => {
        logsModal.classList.add('hidden');
    });

    // --- Google Drive Modal Controls ---
    openGdriveModalBtn.addEventListener('click', () => {
        gdriveModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        gdriveModal.classList.add('hidden');
    });

    launchRcloneAuthBtn.addEventListener('click', async () => {
        launchRcloneAuthBtn.disabled = true;
        authOutput.classList.remove('hidden');
        authOutput.textContent = 'Launching Google login window on your desktop... Please follow the prompts in the newly opened browser!';

        try {
            const res = await fetch('/api/trigger-auth', { method: 'POST' });
            const data = await res.json();
            authOutput.textContent = data.message;
            // Periodically check if GDrive became configured
            const checkTimer = setInterval(async () => {
                await checkStatus();
                if (gdriveStatus.classList.contains('online')) {
                    clearInterval(checkTimer);
                    authOutput.textContent = '🎉 Google Drive successfully authorized and saved to Cloud Runner!';
                    launchRcloneAuthBtn.disabled = false;
                }
            }, 3000);
        } catch (err) {
            authOutput.textContent = 'Error launching auth wizard: ' + err.message;
            launchRcloneAuthBtn.disabled = false;
        }
    });

    saveConfigBtn.addEventListener('click', async () => {
        const config = rcloneConfigInput.value.trim();
        if (!config) {
            alert('Please paste a valid rclone.conf [gdrive] block');
            return;
        }

        saveConfigBtn.disabled = true;
        saveConfigBtn.textContent = 'Saving to GitHub Secrets...';

        try {
            const res = await fetch('/api/save-gdrive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config })
            });
            const data = await res.json();

            if (data.success) {
                alert('Google Drive connected successfully!');
                gdriveModal.classList.add('hidden');
                checkStatus();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (err) {
            alert('Network error saving configuration');
        } finally {
            saveConfigBtn.disabled = false;
            saveConfigBtn.textContent = 'Save GDrive to Cloud Runner';
        }
    });

    refreshJobsBtn.addEventListener('click', loadJobs);

    function escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    window.sendToIdm = async (url) => {
        try {
            const res = await fetch('/api/send-to-idm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (data.success) {
                // Visual feedback without blocking popup
                console.log('Sent to IDM successfully!');
            } else {
                alert('IDM Error: ' + data.error);
            }
        } catch (err) {
            alert('Failed to connect to local server: ' + err.message);
        }
    };

    window.copyLink = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            alert('📋 Link copied to clipboard!\n\nIf IDM is open, it will detect this link automatically.');
        } catch (err) {
            prompt('Copy this link for IDM:', url);
        }
    };

    // Initial load
    checkStatus();
    loadJobs();
});
