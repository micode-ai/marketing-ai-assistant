import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Refuses a host that resolves to a loopback, private, link-local (cloud metadata),
 * CGNAT, multicast or otherwise non-public address. Call it right before any
 * outbound connection to a user-supplied host (webhook URL, SMTP host).
 *
 * On 2026-11-24 a scripted account used the webhook test and the SMTP "test
 * connection" to probe 127.0.0.1, the API container's own docker IP and
 * 169.254.169.254. This does not stop DNS rebinding between the check and the
 * connect; it closes the direct path.
 */
export async function assertPublicHost(host: string | null | undefined): Promise<void> {
  const h = (host ?? '').trim().replace(/^\[|\]$/g, '');
  if (!h) throw new BadRequestException('Host is required');
  if (/^localhost$/i.test(h) || /\.localhost$/i.test(h) || /\.internal$/i.test(h)) {
    throw new BadRequestException('Host is not allowed');
  }
  let addresses: string[];
  try {
    addresses = isIP(h) ? [h] : (await lookup(h, { all: true, verbatim: true })).map((a) => a.address);
  } catch {
    throw new BadRequestException('Host could not be resolved');
  }
  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    throw new BadRequestException('Host is not allowed');
  }
}

export async function assertPublicUrl(url: string | null | undefined): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url ?? '');
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('Only http(s) URLs are allowed');
  }
  await assertPublicHost(parsed.hostname);
}

export function isNonPublicAddress(address: string): boolean {
  let ip = address.toLowerCase();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) ip = mapped[1];
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||           // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||  // includes docker bridge networks
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224                              // multicast, reserved, broadcast
    );
  }
  if (isIP(ip) === 6) {
    return (
      ip === '::' || ip === '::1' ||
      ip.startsWith('fc') || ip.startsWith('fd') || // unique local
      /^fe[89ab]/.test(ip) ||                       // link-local
      ip.startsWith('ff')                           // multicast
    );
  }
  return true;
}
