export {};
declare const chrome: any;
const select = document.querySelector<HTMLSelectElement>('select')!;
chrome.storage.local.get('webOrigin').then((config: any) => { if ([...select.options].some(o => o.value === config.webOrigin)) select.value = config.webOrigin; });
document.querySelector('form')!.addEventListener('submit', async event => {
  event.preventDefault();
  try { await chrome.storage.local.set({ webOrigin: select.value }); document.querySelector('[role=status]')!.textContent = 'Report app saved.'; }
  catch { document.querySelector('[role=status]')!.textContent = 'Could not save. Please try again.'; }
});
