// Background service worker — re-injects content scripts on extension install/update
chrome.runtime.onInstalled.addListener(async () => {
  // Re-inject content script into all open tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch (e) {
        // Some tabs (chrome://, edge://) can't be injected — ignore
      }
    }
  }
});

// When popup sends a message to broadcast to all tabs
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'BROADCAST_SESSION') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs.sendMessage(tab.id, msg.payload).catch(() => {});
        }
      });
    });
  }
});
