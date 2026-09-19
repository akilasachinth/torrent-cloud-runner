# ⚡ CloudTorrent ➔ Google Drive & High-Speed Direct CDN

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/akilasachinth/torrent-cloud-runner/blob/main/torrent_cloud_downloader.ipynb)

A private, high-performance cloud torrent platform (similar to Seedr / Real-Debrid) that downloads torrents directly on remote cloud infrastructure with **zero local network bandwidth usage**.

Once downloaded remotely in the cloud, files are uploaded to:
1. **🚀 Direct High-Speed CDN Links** (GoFile / Pixeldrain) with 1-click **Internet Download Manager (IDM)** auto-resume support.
2. **📁 Google Drive** (optional toggle) using encrypted cloud-to-cloud Rclone transfer.

---

## 🌟 Key Features

- 🛡️ **Zero Local Bandwidth**: Downloading torrents happens 100% on remote cloud runner servers.
- ⚡ **High-Speed CDN Direct Links**: Immediate download links via GoFile & Pixeldrain CDN with multi-threaded streaming.
- 🔄 **IDM Integration**: 1-click "⚡ Send to IDM" button in the dashboard for automatic download management and resilient resume upon network disconnect.
- 📁 **Google Drive Integration**: Cloud-to-cloud upload to your personal Google Drive with customizable folder organization.
- 🖥️ **Seedr-Style Web Dashboard**: Modern dark-themed dashboard running on `http://localhost:5000` with live job status and real-time logs.
- 🛡️ **24/7 Background Supervisor**: Supervised Node service that keeps `localhost:5000` permanently online without terminal windows or desktop popups.
- 🚀 **Silent Windows Boot**: Starts automatically and silently on Windows startup via `start-silent.vbs`.

---

## 🏗️ Architecture

```
[User Browser: localhost:5000]
            │
            ▼
[Local Node.js Server + Supervisor]
            │ (Dispatches via GitHub CLI)
            ▼
[GitHub Actions Cloud Runner: aria2c]
      │                     │
      ▼                     ▼
[GoFile / Pixeldrain CDN]   [Google Drive via Rclone]
      │
      ▼
[1-Click "Send to IDM"]
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18+)
- **GitHub CLI (`gh`)** logged in (`gh auth login`)
- *(Optional)* **Internet Download Manager (IDM)** for 1-click downloads

### 2. Configuration
Copy `.env.example` to `.env`:
```env
GH_TOKEN=your_github_personal_access_token
REPO=your-username/torrent-cloud-runner
PORT=5000
```

### 3. Running the Dashboard
To start the dashboard in the background:
```bash
wscript start-silent.vbs
```
Visit **[http://localhost:5000](http://localhost:5000)** in your browser.

---

## ⚙️ Google Drive Setup

1. In the web dashboard (`http://localhost:5000`), click **⚙️ GDrive Config**.
2. Click **🚀 Launch Rclone Auth Wizard** to authorize Google Drive through your Google account.
3. Paste the generated `[gdrive]` configuration and click **💾 Save Configuration**.
4. The token will be securely saved as an encrypted secret (`RCLONE_CONFIG_BASE64`) in your GitHub repository.

---

## 📂 Project Structure

```
├── .github/workflows/
│   └── download_to_gdrive.yml   # Cloud runner workflow (aria2c + CDN + GDrive)
├── public/
│   ├── index.html               # Seedr-style web dashboard
│   ├── style.css                # Modern dark theme UI styles
│   └── app.js                   # Client logic, IDM dispatcher, log viewer
├── server.js                    # Zero-dependency Node.js HTTP server
├── supervisor.js                # 24/7 process supervisor & auto-restarter
├── start-silent.vbs             # Silent Windows launcher (0 console windows)
├── package.json                 # Project manifest
└── README.md
```

---

## 📄 License
MIT License
