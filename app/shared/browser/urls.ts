// URLs a note may link to or embed: relative paths, #anchors, http(s), mailto and tel. Anything else
// (javascript:, data:, vbscript:, …) could run code in the page, which holds a token that writes the vault.
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const ALLOWED = new Set(['http', 'https', 'mailto', 'tel']);

/** True if the URL is safe to put in href or src. Browsers ignore control characters and spaces in the scheme. */
export const isSafeUrl = (url: unknown) => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  const m = SCHEME.exec(String(url).replace(/[\u0000- \u007f]/g, ''));
  return !m || ALLOWED.has(m[1].toLowerCase());
};
