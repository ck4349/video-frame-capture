// popup.js - Video Frame Capture 弹窗脚本

let detectedVideos = [];
let selectedVideoIndex = 0;

// DOM 元素
const videoList = document.getElementById('videoList');
const videoCount = document.getElementById('videoCount');
const captureFirstFrame = document.getElementById('captureFirstFrame');
const captureSpecificFrame = document.getElementById('captureSpecificFrame');
const captureCurrent = document.getElementById('captureCurrent');
const timestampInput = document.getElementById('timestamp');
const formatSelect = document.getElementById('format');
const statusDiv = document.getElementById('status');
const refreshBtn = document.getElementById('refreshBtn');

// 显示状态消息
function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status show ${type}`;
  setTimeout(() => {
    statusDiv.classList.remove('show');
  }, 3000);
}

// 格式化时间
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 格式化分辨率
function formatResolution(width, height) {
  if (!width || !height) return '';
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  return `${width}x${height}`;
}

// 渲染视频列表
function renderVideoList(videos) {
  if (!videos || videos.length === 0) {
    videoList.innerHTML = `
      <div class="video-info">
        <div class="no-video">未检测到视频元素</div>
      </div>
    `;
    videoCount.textContent = '0';
    captureFirstFrame.disabled = true;
    captureSpecificFrame.disabled = true;
    captureCurrent.disabled = true;
    return;
  }

  videoCount.textContent = videos.length;
  videoList.innerHTML = videos.map((video, index) => `
    <div class="video-item ${index === selectedVideoIndex ? 'selected' : ''}" data-index="${index}">
      <div class="video-item-icon">🎬</div>
      <div class="video-item-info">
        <div style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${video.title || `视频 #${index + 1}`}
        </div>
        <div>
          <span class="video-item-size">${formatResolution(video.width, video.height)}</span>
          <span class="video-item-duration">${formatDuration(video.duration)}</span>
        </div>
      </div>
    </div>
  `).join('');

  // 添加点击事件
  document.querySelectorAll('.video-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedVideoIndex = parseInt(item.dataset.index);
      renderVideoList(detectedVideos);
    });
  });

  captureFirstFrame.disabled = false;
  captureSpecificFrame.disabled = false;
  captureCurrent.disabled = false;
}

// 解析时间输入
function parseTimestamp(input) {
  if (!input || !input.trim()) return 0;
  
  input = input.trim();
  
  // 格式: HH:MM:SS
  if (input.includes(':')) {
    const parts = input.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }
  
  // 格式: 纯秒数
  const seconds = parseFloat(input);
  return isNaN(seconds) ? 0 : seconds;
}

// 发送消息到 content script
async function sendToContent(action, data = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showStatus('无法获取当前标签页', 'error');
    return null;
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action,
      videoIndex: selectedVideoIndex,
      ...data
    });
    return response;
  } catch (error) {
    showStatus('请刷新页面后重试', 'error');
    return null;
  }
}

// 初始化 - 检测视频
async function init() {
  const response = await sendToContent('getVideos');
  if (response && response.videos) {
    detectedVideos = response.videos;
    renderVideoList(detectedVideos);
  }
}

// 下载首帧
captureFirstFrame.addEventListener('click', async () => {
  showStatus('正在获取首帧...', 'info');
  captureFirstFrame.disabled = true;
  
  const format = formatSelect.value;
  const response = await sendToContent('captureFirstFrame', { format });
  
  captureFirstFrame.disabled = false;
  
  if (response && response.success) {
    // 下载图片
    downloadImage(response.dataUrl, response.filename);
    showStatus('首帧下载成功!', 'success');
  } else {
    showStatus(response?.error || '截取首帧失败', 'error');
  }
});

// 下载指定时间帧
captureSpecificFrame.addEventListener('click', async () => {
  const timestamp = parseTimestamp(timestampInput.value);
  
  if (timestamp <= 0) {
    showStatus('请输入有效的时间', 'error');
    return;
  }
  
  showStatus('正在跳转并截取...', 'info');
  captureSpecificFrame.disabled = true;
  
  const format = formatSelect.value;
  const response = await sendToContent('captureAtTime', { timestamp, format });
  
  captureSpecificFrame.disabled = false;
  
  if (response && response.success) {
    downloadImage(response.dataUrl, response.filename);
    showStatus(`已下载 ${timestampInput.value || timestamp + '秒'} 处的帧`, 'success');
  } else {
    showStatus(response?.error || '截取指定帧失败', 'error');
  }
});

// 下载当前帧
captureCurrent.addEventListener('click', async () => {
  showStatus('正在截取当前帧...', 'info');
  captureCurrent.disabled = true;
  
  const format = formatSelect.value;
  const response = await sendToContent('captureCurrent', { format });
  
  captureCurrent.disabled = false;
  
  if (response && response.success) {
    downloadImage(response.dataUrl, response.filename);
    showStatus('当前帧下载成功!', 'success');
  } else {
    showStatus(response?.error || '截取当前帧失败', 'error');
  }
});

// 下载图片
function downloadImage(dataUrl, filename) {
  // 通过 background script 下载
  chrome.runtime.sendMessage({
    action: 'download',
    dataUrl,
    filename
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', init);

// 手动刷新按钮
refreshBtn.addEventListener('click', async () => {
  showStatus('正在重新检测视频...', 'info');
  refreshBtn.style.transform = 'rotate(360deg)';
  
  const response = await sendToContent('forceRefresh');
  
  if (response && response.videos) {
    detectedVideos = response.videos;
    selectedVideoIndex = 0;
    renderVideoList(detectedVideos);
    showStatus(`检测到 ${detectedVideos.length} 个视频`, 'success');
  } else {
    showStatus('未检测到视频', 'error');
  }
  
  setTimeout(() => {
    refreshBtn.style.transform = '';
  }, 500);
});

// 定期刷新视频列表
setInterval(init, 3000);
