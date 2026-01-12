# Copilot Instructions for UniDownload

## Project Overview
- **UniDownload** is a Flask-based web app for downloading media from YouTube, Instagram, and Facebook.
- The backend is in Python (Flask, yt-dlp, FFmpeg), serving a REST API to a static frontend (HTML/CSS/JS in `static/`).
- Downloaders for each platform are modularized: see `youtube.py`, `instagram.py`, `facebook.py`.
- All downloads are saved under `downloads/` in subfolders by platform.

## Key Files & Structure
- `server.py`: Main Flask API server, routes `/api/detect`, `/api/download`, `/api/health`.
- `youtube.py`, `instagram.py`, `facebook.py`: Platform-specific download logic, invoked by the API.
- `static/`: Contains `index.html`, `style.css`, `script.js` for the frontend UI.
- `downloads/`: Output directory for downloaded files.
- `requirements.txt`: Python dependencies (Flask, yt-dlp, etc.).
- `Procfile`, `render.yaml`: Deployment configs for Render.com.

## Developer Workflows
- **Local run:** `python server.py` (Flask dev server, default port 5000)
- **Install deps:** `pip install -r requirements.txt`
- **FFmpeg required:** Must be installed and in PATH for media processing.
- **Deployment:** See `DEPLOYMENT.md` for Render.com steps; uses Gunicorn in production.
- **Frontend:** Open `http://localhost:5000` after starting the server.

## API Patterns
- All API endpoints are under `/api/`.
- `/api/detect`: POST, analyzes a URL and returns media info (platform, formats, etc.).
- `/api/download`: POST, downloads media based on user options.
- `/api/health`: GET, returns `{ "status": "ok" }` for health checks.
- Example request/response payloads are in `README.md`.

## Project Conventions
- Platform detection and routing is automatic; the backend determines which downloader to use.
- Downloaders use yt-dlp and FFmpeg via subprocess or Python bindings.
- For private content, a `cookies.txt` file in the project root is used if present (see README for details).
- All static assets are served from `/static/`.
- Downloaded files are organized by platform in `downloads/`.

## Integration & Extensibility
- To add a new platform, create a new `platform.py` and register it in `server.py`.
- All downloaders should expose a common interface for detection and download.
- Frontend communicates with backend via fetch/XHR to `/api/` endpoints.

## Troubleshooting
- FFmpeg must be in PATH; check with `ffmpeg -version`.
- For private Instagram/Facebook, use Firefox cookies (see README).
- See `README.md` and `DEPLOYMENT.md` for more troubleshooting and deployment tips.

---
For more details, see the [README.md](../README.md) and [DEPLOYMENT.md](../DEPLOYMENT.md).
