import type { FieldFile } from './field/schema';

const PREFIX = 'v1.';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): Uint8Array {
  const padded = token.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (token.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function pack(bytes: Uint8Array, compress: boolean): Promise<Uint8Array> {
  const format = compress ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw');
  const packed = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(format)).arrayBuffer();
  return new Uint8Array(packed);
}

/** A `v1.` token: deflate-raw of the minified field, then base64url. */
export async function encodeField(file: FieldFile): Promise<string> {
  return PREFIX + toBase64Url(await pack(new TextEncoder().encode(JSON.stringify(file)), true));
}

/** The field a token holds. Throws when the version or the bytes are not a field link. */
export async function decodeField(token: string): Promise<unknown> {
  if (!token.startsWith(PREFIX)) throw new Error('This link uses a field format this editor does not know.');
  try {
    const text = new TextDecoder().decode(await pack(fromBase64Url(token.slice(PREFIX.length)), false));
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('This link is not a field.');
  }
}
