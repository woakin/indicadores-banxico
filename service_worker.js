// Abre onboarding al instalar/actualizar
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});