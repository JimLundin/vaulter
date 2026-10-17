// The retained specimen link opens Calendar inside the regular Application preview.
const embedded = new URLSearchParams(location.search).has('embedded');
const preview =
  import.meta.env.DEV || import.meta.env.MODE === 'browser-test' ? './index.html' : '../';
location.replace(`${preview}#${embedded ? '/wiki/preview%3Apage%3A0/' : '/calendar/'}`);
