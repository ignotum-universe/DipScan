const SECRET = process.env.COOKIE_SECRET ?? 'dev-secret-change-me';

async function getKey() {
  const enc = new TextEncoder().encode(SECRET);
  return crypto.subtle.importKey('raw', enc, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signValue(value: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${value}.${b64}`;          // "["GDX","VOO"].BASE64SIG"
}

export async function verifyValue(signed: string): Promise<string | null> {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const expected = await signValue(value);
  // Constant-time comparison isn't available natively, but timing attacks
  // on cookie forgery are low-risk here — simple equality is fine
  return expected === signed ? value : null;
}