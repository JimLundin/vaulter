addEventListener('message', async function boot(e) {
  if (e.source !== parent || !e.data || e.data.t !== 'pip:boot' || !e.ports[0]) return;
  removeEventListener('message', boot);
  const url = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const mods = {};
  for (const [name, code] of Object.entries(e.data.modules)) mods[name] = await import(url(code));
  mods.core.start(e.ports[0], mods);
});
parent.postMessage('pip:ready', '*');
