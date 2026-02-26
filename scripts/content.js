// content.js - Video Frame Capture 内容脚本
// 注入到所有网页，负责检测视频和截取帧

(function() {
  'use strict';

  // 视频信息缓存
  let videos = [];
  
  // 悬浮按钮相关
  let floatingPanel = null;
  let isPanelVisible = false;
  
  // 检测是否是抖音或TikTok页面
  function isDouyinOrTikTok() {
    const hostname = window.location.hostname;
    return hostname.includes('douyin.com') || 
           hostname.includes('tiktok.com') ||
           hostname.includes('iesdouyin.com');
  }
  
  // ==================== 新增：提取视频信息功能 ====================
  
  // 从TikTok URL提取视频ID和用户名
  // URL格式: https://www.tiktok.com/@username/video/1234567890
  function getTikTokVideoInfo() {
    const url = window.location.href;
    const result = { videoId: '', username: '' };
    
    // TikTok格式
    const tiktokMatch = url.match(/tiktok\.com\/@([^\/]+)\/video\/(\d+)/);
    if (tiktokMatch) {
      result.username = tiktokMatch[1];
      result.videoId = tiktokMatch[2];
      return result;
    }
    
    // 抖音格式1: douyin.com/video/1234567890
    const douyinMatch1 = url.match(/douyin\.com\/video\/(\d+)/);
    if (douyinMatch1) {
      result.videoId = douyinMatch1[1];
      // 尝试从页面获取用户名
      result.username = getDouyinUsername();
      return result;
    }
    
    // 抖音格式2: douyin.com/user/xxx?modal_id=1234567890
    const douyinMatch2 = url.match(/douyin\.com\/user\/([^?]+).*modal_id=(\d+)/);
    if (douyinMatch2) {
      result.username = douyinMatch2[1];
      result.videoId = douyinMatch2[2];
      return result;
    }
    
    // 从URL参数获取
    const urlParams = new URLSearchParams(window.location.search);
    const modalId = urlParams.get('modal_id');
    if (modalId) {
      result.videoId = modalId;
      result.username = getDouyinUsername();
    }
    
    return result;
  }
  
  // 从抖音页面获取用户名
  function getDouyinUsername() {
    // 尝试多种方式获取用户名
    const selectors = [
      '[class*="author"] [class*="name"]',
      '[class*="AuthorCard"] [class*="name"]',
      '[data-e2e="video-author-unique-id"]',
      '[class*="nickname"]',
      '.author-card .name',
      '[class*="UserInfo"] [class*="name"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        return el.textContent.trim().replace('@', '');
      }
    }
    
    return '';
  }
  
  // 从TikTok页面获取用户名（备用方法）
  function getTikTokUsername() {
    const selectors = [
      '[data-e2e="video-author-unique-id"]',
      '[class*="AuthorLink"]',
      '[class*="author-uniqueId"]',
      'h2[data-e2e="video-author-unique-id"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        return el.textContent.trim().replace('@', '');
      }
    }
    
    return '';
  }
  
  // 获取完整的视频元信息
  function getVideoMetaInfo() {
    const info = getTikTokVideoInfo();
    
    // 如果URL中没有提取到用户名，尝试从页面获取
    if (!info.username) {
      if (window.location.hostname.includes('tiktok')) {
        info.username = getTikTokUsername();
      } else if (window.location.hostname.includes('douyin')) {
        info.username = getDouyinUsername();
      }
    }
    
    return info;
  }
  
  // ==================== 原有功能 ====================
  
  // 获取页面标题
  function getPageTitle() {
    return document.title || 'Untitled';
  }
  
  // 获取视频信息
  function getVideoInfo(video) {
    return {
      src: video.src || video.currentSrc || '',
      width: video.videoWidth || video.width,
      height: video.videoHeight || video.height,
      duration: video.duration || 0,
      currentTime: video.currentTime || 0,
      title: video.title || video.getAttribute('title') || '',
      paused: video.paused,
      readyState: video.readyState
    };
  }
  
  // 检测页面中的所有视频
  function detectVideos() {
    const videoElements = document.querySelectorAll('video');
    videos = Array.from(videoElements).map((video, index) => ({
      index,
      element: video,
      ...getVideoInfo(video),
      title: video.title || video.getAttribute('title') || getPageTitle()
    }));
    return videos.map(v => ({
      index: v.index,
      src: v.src,
      width: v.width,
      height: v.height,
      duration: v.duration,
      currentTime: v.currentTime,
      title: v.title,
      paused: v.paused,
      readyState: v.readyState
    }));
  }
  
  // 获取当前正在播放的视频（用于抖音/TikTok）
  function getVisibleVideo() {
    videos = [];
    detectVideos();
    
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];
    
    const viewportCenterY = window.innerHeight / 2;
    const viewportCenterX = window.innerWidth / 2;
    
    // 优先级1：正在播放的视频
    const playingVideos = videos.filter(v => !v.element.paused && v.element.readyState >= 2);
    if (playingVideos.length > 0) {
      let bestVideo = playingVideos[0];
      let minDistance = Infinity;
      
      for (const v of playingVideos) {
        const rect = v.element.getBoundingClientRect();
        const videoCenterX = rect.left + rect.width / 2;
        const videoCenterY = rect.top + rect.height / 2;
        const distance = Math.sqrt(
          Math.pow(videoCenterX - viewportCenterX, 2) + 
          Math.pow(videoCenterY - viewportCenterY, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          bestVideo = v;
        }
      }
      
      return bestVideo;
    }
    
    // 优先级2：视口中心附近的视频
    let bestVideo = videos[0];
    let minDistance = Infinity;
    
    for (const v of videos) {
      const rect = v.element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      
      const videoCenterY = rect.top + rect.height / 2;
      const distance = Math.abs(videoCenterY - viewportCenterY);
      
      if (distance < minDistance) {
        minDistance = distance;
        bestVideo = v;
      }
    }
    
    return bestVideo;
  }
  
  // 使用 canvas 截取视频帧
  function captureVideoFrame(video, format = 'png', quality = 1) {
    return new Promise((resolve, reject) => {
      if (!video) {
        reject(new Error('视频元素不存在'));
        return;
      }
      
      if (video.readyState < 2) {
        reject(new Error('视频尚未加载，请等待视频加载完成'));
        return;
      }
      
      const width = video.videoWidth || video.width;
      const height = video.videoHeight || video.height;
      
      if (!width || !height) {
        reject(new Error('无法获取视频尺寸'));
        return;
      }
      
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);
        
        const mimeType = `image/${format}`;
        const dataUrl = canvas.toDataURL(mimeType, quality);
        
        // 生成文件名（包含视频ID和用户名）
        const filename = generateFilename(video.currentTime, format);
        
        resolve({ dataUrl, filename, width, height });
      } catch (error) {
        if (error.name === 'SecurityError') {
          reject(new Error('跨域限制，无法截取此视频帧'));
        } else {
          reject(new Error(`截帧失败: ${error.message}`));
        }
      }
    });
  }
  
  // ==================== 新增：智能文件命名 ====================
  
  // 生成文件名
  function generateFilename(currentTime, format) {
    const metaInfo = getVideoMetaInfo();
    const timestamp = formatTimestamp(currentTime);
    
    let parts = [];
    
    // 添加用户名
    if (metaInfo.username) {
      parts.push(metaInfo.username);
    }
    
    // 添加视频ID
    if (metaInfo.videoId) {
      parts.push(metaInfo.videoId);
    }
    
    // 添加时间戳
    parts.push(timestamp);
    
    // 如果没有提取到任何信息，使用页面标题
    if (parts.length === 1) {
      const pageTitle = document.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 30);
      parts.unshift(pageTitle);
    }
    
    const filename = parts.join('_') + '.' + format;
    return filename;
  }
  
  // 格式化时间戳
  function formatTimestamp(seconds) {
    if (!seconds || isNaN(seconds)) return '00_00_00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}_${m.toString().padStart(2, '0')}_${s.toString().padStart(2, '0')}`;
  }
  
  // 跳转到指定时间并截取
  async function seekAndCapture(video, timestamp, format) {
    return new Promise((resolve, reject) => {
      if (!video) {
        reject(new Error('视频元素不存在'));
        return;
      }
      
      if (timestamp < 0 || (video.duration && timestamp > video.duration)) {
        reject(new Error('时间超出视频范围'));
        return;
      }
      
      const wasPaused = video.paused;
      
      const onSeeked = async () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        
        try {
          const result = await captureVideoFrame(video, format);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      
      const onError = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        reject(new Error('视频跳转失败'));
      };
      
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      video.currentTime = timestamp;
      
      if (wasPaused && video.readyState < 3) {
        video.load();
      }
    });
  }
  
  // 截取首帧
  async function captureFirstFrame(videoIndex, format) {
    const video = videos[videoIndex]?.element;
    if (!video) {
      return { success: false, error: '视频不存在' };
    }
    
    try {
      if (video.currentTime > 0.1) {
        await seekAndCapture(video, 0, format);
      }
      
      const result = await captureVideoFrame(video, format);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // 截取指定时间帧
  async function captureAtTime(videoIndex, timestamp, format) {
    const video = videos[videoIndex]?.element;
    if (!video) {
      return { success: false, error: '视频不存在' };
    }
    
    try {
      const result = await seekAndCapture(video, timestamp, format);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // 截取当前帧
  async function captureCurrentFrame(videoIndex, format) {
    const video = videos[videoIndex]?.element;
    if (!video) {
      return { success: false, error: '视频不存在' };
    }
    
    try {
      const result = await captureVideoFrame(video, format);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // ==================== 悬浮面板功能 ====================
  
  function injectStyles() {
    if (document.getElementById('vfc-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'vfc-styles';
    style.textContent = `
      .vfc-floating-panel {
        position: fixed;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s, visibility 0.3s;
      }
      
      .vfc-floating-panel.visible {
        opacity: 1;
        visibility: visible;
      }
      
      .vfc-toggle-btn {
        position: fixed;
        right: 20px;
        bottom: 100px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
        border: none;
        cursor: pointer;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        box-shadow: 0 4px 15px rgba(233, 69, 96, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      
      .vfc-toggle-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(233, 69, 96, 0.6);
      }
      
      .vfc-action-btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        transition: transform 0.2s, box-shadow 0.2s;
        position: relative;
      }
      
      .vfc-action-btn:hover {
        transform: scale(1.15);
      }
      
      .vfc-first-frame {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      
      .vfc-current-frame {
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        box-shadow: 0 4px 12px rgba(17, 153, 142, 0.4);
      }
      
      .vfc-refresh-btn {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
      }
      
      .vfc-refresh-btn.refreshing {
        animation: vfc-spin 0.5s ease-in-out;
      }
      
      @keyframes vfc-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      .vfc-tooltip {
        position: absolute;
        right: 60px;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s, visibility 0.2s;
        pointer-events: none;
      }
      
      .vfc-action-btn:hover .vfc-tooltip {
        opacity: 1;
        visibility: visible;
      }
      
      .vfc-toast {
        position: fixed;
        bottom: 180px;
        right: 20px;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 9999999;
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.3s, transform 0.3s;
        max-width: 300px;
      }
      
      .vfc-toast.show {
        opacity: 1;
        transform: translateY(0);
      }
      
      .vfc-toast.success {
        background: rgba(46, 204, 113, 0.9);
      }
      
      .vfc-toast.error {
        background: rgba(231, 76, 60, 0.9);
      }
      
      .vfc-video-info {
        position: fixed;
        right: 80px;
        bottom: 100px;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 11px;
        z-index: 999998;
        display: none;
        max-width: 200px;
      }
      
      .vfc-video-info.visible {
        display: block;
      }
      
      .vfc-video-info div {
        margin: 4px 0;
      }
      
      .vfc-video-info .label {
        color: #aaa;
      }
      
      .vfc-video-info .value {
        color: #fff;
        word-break: break-all;
      }
    `;
    document.head.appendChild(style);
  }
  
  // 创建悬浮面板
  function createFloatingPanel() {
    if (floatingPanel) return;
    
    injectStyles();
    
    // 创建主面板
    floatingPanel = document.createElement('div');
    floatingPanel.className = 'vfc-floating-panel';
    floatingPanel.innerHTML = `
      <button class="vfc-action-btn vfc-refresh-btn" data-action="refresh">
        <span class="vfc-tooltip">🔄 刷新检测视频</span>
        🔄
      </button>
      <button class="vfc-action-btn vfc-first-frame" data-action="first">
        <span class="vfc-tooltip">📷 下载首帧</span>
        📷
      </button>
      <button class="vfc-action-btn vfc-current-frame" data-action="current">
        <span class="vfc-tooltip">🖼️ 下载当前帧</span>
        🖼️
      </button>
    `;
    
    // 创建切换按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'vfc-toggle-btn';
    toggleBtn.innerHTML = '🎬';
    toggleBtn.title = '视频截帧工具';
    
    // 创建视频信息显示区
    const infoPanel = document.createElement('div');
    infoPanel.className = 'vfc-video-info';
    infoPanel.id = 'vfc-info-panel';
    
    // 切换面板显示
    toggleBtn.addEventListener('click', () => {
      isPanelVisible = !isPanelVisible;
      floatingPanel.classList.toggle('visible', isPanelVisible);
      infoPanel.classList.toggle('visible', isPanelVisible);
      
      // 更新视频信息
      if (isPanelVisible) {
        updateVideoInfo();
      }
    });
    
    // 添加按钮事件
    floatingPanel.querySelectorAll('.vfc-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        await handleFloatingAction(action, btn);
      });
    });
    
    document.body.appendChild(floatingPanel);
    document.body.appendChild(toggleBtn);
    document.body.appendChild(infoPanel);
  }
  
  // 更新视频信息显示
  function updateVideoInfo() {
    const infoPanel = document.getElementById('vfc-info-panel');
    if (!infoPanel) return;
    
    const metaInfo = getVideoMetaInfo();
    
    infoPanel.innerHTML = `
      <div>
        <span class="label">用户名:</span>
        <span class="value">${metaInfo.username || '未知'}</span>
      </div>
      <div>
        <span class="label">视频ID:</span>
        <span class="value">${metaInfo.videoId || '未知'}</span>
      </div>
    `;
  }
  
  // 处理悬浮按钮操作
  async function handleFloatingAction(action, btn) {
    // 刷新操作
    if (action === 'refresh') {
      btn.classList.add('refreshing');
      videos = [];
      detectVideos();
      updateVideoInfo();
      showToast(`已刷新，检测到 ${videos.length} 个视频`, 'success');
      setTimeout(() => btn.classList.remove('refreshing'), 500);
      return;
    }
    
    const video = getVisibleVideo();
    
    if (!video) {
      showToast('未检测到视频，请点击刷新按钮', 'error');
      return;
    }
    
    try {
      let result;
      
      if (action === 'first') {
        showToast('正在获取首帧...', 'info');
        
        if (video.element.currentTime > 0.1) {
          await new Promise((resolve) => {
            const onSeeked = () => {
              video.element.removeEventListener('seeked', onSeeked);
              resolve();
            };
            video.element.addEventListener('seeked', onSeeked);
            video.element.currentTime = 0;
          });
        }
        
        result = await captureVideoFrame(video.element, 'png');
      } else if (action === 'current') {
        showToast('正在截取当前帧...', 'info');
        result = await captureVideoFrame(video.element, 'png');
      }
      
      if (result) {
        chrome.runtime.sendMessage({
          action: 'download',
          dataUrl: result.dataUrl,
          filename: result.filename
        });
        
        // 显示文件名信息
        showToast(`下载成功!\n文件名: ${result.filename}`, 'success');
      }
    } catch (error) {
      showToast(error.message || '截帧失败', 'error');
    }
  }
  
  // 显示提示消息
  function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.vfc-toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `vfc-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handleAsync = async () => {
      detectVideos();
      
      switch (message.action) {
        case 'getVideos':
          return { videos: detectVideos() };
          
        case 'forceRefresh':
          videos = [];
          detectVideos();
          console.log('[Video Frame Capture] 强制刷新，检测到', videos.length, '个视频');
          return { videos: detectVideos() };
          
        case 'captureFirstFrame':
          return await captureFirstFrame(message.videoIndex, message.format);
          
        case 'captureAtTime':
          return await captureAtTime(message.videoIndex, message.timestamp, message.format);
          
        case 'captureCurrent':
          return await captureCurrentFrame(message.videoIndex, message.format);
          
        default:
          return { error: '未知操作' };
      }
    };
    
    handleAsync().then(sendResponse);
    return true;
  });
  
  // 监听 DOM 变化
  const observer = new MutationObserver((mutations) => {
    let hasNewVideo = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
          hasNewVideo = true;
        }
      });
    });
    
    if (hasNewVideo) {
      detectVideos();
    }
  });
  
  // 监听滚动事件
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      detectVideos();
      // 更新视频信息显示
      if (isPanelVisible) {
        updateVideoInfo();
      }
    }, 300);
  });
  
  // 监听URL变化（用于SPA页面）
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      videos = [];
      detectVideos();
      updateVideoInfo();
      console.log('[Video Frame Capture] URL变化，重新检测视频');
    }
  }, 500);
  
  // 初始化
  function init() {
    detectVideos();
    
    if (isDouyinOrTikTok()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(createFloatingPanel, 1000);
        });
      } else {
        setTimeout(createFloatingPanel, 1000);
      }
    }
    
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      });
    }
    
    console.log('[Video Frame Capture] 插件已加载，检测到', videos.length, '个视频');
    
    // 输出视频信息（调试用）
    const metaInfo = getVideoMetaInfo();
    console.log('[Video Frame Capture] 视频信息:', metaInfo);
  }
  
  init();
})();
