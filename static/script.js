// Load API URL from env
if (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL.trim() !== '') {
    var API_BASE = window.API_BASE_URL.trim();
} else {
    throw new Error('API_BASE_URL is not set in env.js. Please set window.API_BASE_URL in static/env.js');
}

// Global state
let currentMediaData = null;
let currentUrl = '';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    const urlInput = document.getElementById('urlInput');
    const detectBtn = document.getElementById('detectBtn');

    // Event listeners
    detectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDetect();
    });

    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleDetect();
        }
    });

    // Check API health
    checkApiHealth();
}

async function checkApiHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        console.log('API Status:', data);
    } catch (error) {
        showStatus('⚠️ API server is not running. Please start the server first.', 'error');
    }
}

async function handleDetect() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();

    if (!url) {
        showStatus('Please enter a URL', 'error');
        return;
    }

    currentUrl = url;
    setLoading(true);
    hideStatus();
    hideMediaInfo();

    try {
        const response = await fetch(`${API_BASE}/detect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to detect platform');
        }

        currentMediaData = data;
        displayMediaInfo(data);
        showStatus('Media information loaded successfully!', 'success');

    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        setLoading(false);
    }
}

function displayMediaInfo(data) {
    const mediaInfo = document.getElementById('mediaInfo');
    const thumbnail = document.getElementById('thumbnail');
    const platformBadge = document.getElementById('platformBadge');
    const title = document.getElementById('title');
    const uploader = document.getElementById('uploader');
    const duration = document.getElementById('duration');
    const optionsContainer = document.getElementById('optionsContainer');

    // Set media info
    thumbnail.src = data.thumbnail || 'https://via.placeholder.com/200x112?text=No+Thumbnail';
    platformBadge.textContent = data.platform;
    platformBadge.className = `platform-badge ${data.platform}`;
    title.textContent = data.title;
    uploader.textContent = `👤 ${data.uploader}`;

    if (data.duration) {
        const minutes = Math.floor(data.duration / 60);
        const seconds = data.duration % 60;
        duration.textContent = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
        duration.style.display = 'block';
    } else {
        duration.style.display = 'none';
    }

    // Clear previous options
    optionsContainer.innerHTML = '';

    // Add platform-specific options
    if (data.platform === 'youtube') {
        addYouTubeOptions(data, optionsContainer);
    } else if (data.platform === 'instagram') {
        addInstagramOptions(data, optionsContainer);
    } else if (data.platform === 'facebook') {
        addFacebookOptions(data, optionsContainer);
    }

    mediaInfo.classList.remove('hidden');
}

function addYouTubeOptions(data, container) {
    // Video quality options
    if (data.formats && data.formats.length > 0) {
        const videoGroup = document.createElement('div');
        videoGroup.className = 'option-group';
        videoGroup.innerHTML = '<h4>Video Quality</h4>';
        
        data.formats.forEach(format => {
            const btn = createDownloadButton(`📹 ${format.label}`, () => {
                startDownload('youtube', 'video', format.format_id);
            });
            videoGroup.appendChild(btn);
        });
        
        container.appendChild(videoGroup);
    }

    // Other options
    const otherGroup = document.createElement('div');
    otherGroup.className = 'option-group';
    otherGroup.innerHTML = '<h4>Other Options</h4>';

    otherGroup.appendChild(createDownloadButton('🎵 Audio Only (MP3)', () => {
        startDownload('youtube', 'audio');
    }));

    if (data.has_subtitles) {
        otherGroup.appendChild(createDownloadButton('📝 Subtitles', () => {
            startDownload('youtube', 'subtitles');
        }));
    }

    otherGroup.appendChild(createDownloadButton('🖼️ Thumbnail', () => {
        startDownload('youtube', 'thumbnail');
    }));

    if (currentUrl.includes('playlist') || currentUrl.includes('list=')) {
        otherGroup.appendChild(createDownloadButton('📑 Playlist', () => {
            startDownload('youtube', 'playlist');
        }));
    }

    container.appendChild(otherGroup);
}

function addInstagramOptions(data, container) {
    const group = document.createElement('div');
    group.className = 'option-group';

    group.appendChild(createDownloadButton('📸 Download Post/Reel/Story', () => {
        startDownload('instagram', 'post');
    }));

    group.appendChild(createDownloadButton('🎵 Audio Only (MP3)', () => {
        startDownload('instagram', 'audio');
    }));

    container.appendChild(group);
}

function addFacebookOptions(data, container) {
    const group = document.createElement('div');
    group.className = 'option-group';

    group.appendChild(createDownloadButton('📱 Download Post/Video', () => {
        startDownload('facebook', 'post');
    }));

    group.appendChild(createDownloadButton('🎵 Audio Only (MP3)', () => {
        startDownload('facebook', 'audio');
    }));

    container.appendChild(group);
}

function createDownloadButton(text, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.textContent = text;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    return btn;
}

async function startDownload(platform, option, formatId = null) {
    const downloadData = {
        url: currentUrl,
        platform: platform,
        option: option
    };

    if (formatId) {
        downloadData.format_id = formatId;
    }

    const downloadId = Date.now();
    addDownloadItem(downloadId, option, 'Fetching download URL...');

    try {
        const response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(downloadData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Download failed');
        }

        if (data.download_url) {
            updateDownloadItem(downloadId, 'success', 'Opening download...');
            // Open in new window
            const downloadWindow = window.open(data.download_url, '_blank');
            if (!downloadWindow) {
                showStatus('Please allow popups to download', 'error');
            } else {
                showStatus('Download opened in new tab!', 'success');
            }
        } else {
            throw new Error('No download URL received');
        }

    } catch (error) {
        updateDownloadItem(downloadId, 'error', error.message);
        showStatus(error.message, 'error');
    }
}

function addDownloadItem(id, option, message) {
    const downloadProgress = document.getElementById('downloadProgress');
    const downloadsList = document.getElementById('downloadsList');
    
    downloadProgress.classList.remove('hidden');
    
    const item = document.createElement('div');
    item.className = 'download-item';
    item.id = `download-${id}`;
    item.innerHTML = `
        <div class="status">⏳</div>
        <div class="details">
            <div class="name">${option.toUpperCase()}</div>
            <div class="message">${message}</div>
        </div>
    `;
    
    downloadsList.insertBefore(item, downloadsList.firstChild);
}

function updateDownloadItem(id, status, message) {
    const item = document.getElementById(`download-${id}`);
    if (!item) return;

    const statusIcon = item.querySelector('.status');
    const messageEl = item.querySelector('.message');

    if (status === 'success') {
        statusIcon.textContent = '✅';
        messageEl.textContent = message;
    } else if (status === 'error') {
        statusIcon.textContent = '❌';
        messageEl.textContent = message;
    }
}

function showStatus(message, type) {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
}

function hideStatus() {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.classList.add('hidden');
}

function hideMediaInfo() {
    const mediaInfo = document.getElementById('mediaInfo');
    mediaInfo.classList.add('hidden');
}

function setLoading(loading) {
    const detectBtn = document.getElementById('detectBtn');
    if (loading) {
        detectBtn.classList.add('loading');
        detectBtn.disabled = true;
    } else {
        detectBtn.classList.remove('loading');
        detectBtn.disabled = false;
    }
}
