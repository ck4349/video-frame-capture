// background.js - Video Frame Capture 后台服务
// 处理下载请求

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    const { dataUrl, filename } = message;
    
    // 使用 Chrome Downloads API 下载图片
    chrome.downloads.download({
      url: dataUrl,
      filename: `VideoFrames/${filename}`,
      saveAs: false // 自动保存到 Downloads/VideoFrames 文件夹
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[Video Frame Capture] 下载失败:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[Video Frame Capture] 下载成功, ID:', downloadId, '文件名:', filename);
        sendResponse({ success: true, downloadId });
      }
    });
    
    return true; // 保持消息通道开启
  }
});

// 插件安装时的提示
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Video Frame Capture] 插件已安装');
  } else if (details.reason === 'update') {
    console.log('[Video Frame Capture] 插件已更新到版本', chrome.runtime.getManifest().version);
  }
});
