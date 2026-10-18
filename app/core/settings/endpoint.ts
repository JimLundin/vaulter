export function apiEndpoint(value: string): string {
  const url = new URL(value.trim());
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Enter an HTTP or HTTPS API URL without credentials, query parameters or a fragment.',
    );
  return value.trim().replace(/\/+$/, '');
}
