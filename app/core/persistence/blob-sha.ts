// git's id for a file's content: SHA-1 of "blob <length>\0" + the bytes. WebCrypto, so browser-safe.
export async function blobSha(content: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
