import type { Request } from 'express';

function normalizeIp(ip: string): string {
  return (ip ?? '').replace(/^::ffff:/, '').trim();
}

function firstIpFromXff(xff: string): string {
  // "client, proxy1, proxy2"
  return xff.split(',')[0]?.trim() ?? '';
}

export function extractIp(req: Request): string {
  const trustProxyIp = process.env.TRUST_PROXY_IP?.trim();

  const peerIp = normalizeIp(req.socket?.remoteAddress ?? '');

  if (!trustProxyIp) {
    return peerIp || normalizeIp(req.ip ?? '');
  }
  const fromTrustedProxy = peerIp === normalizeIp(trustProxyIp);

  if (fromTrustedProxy) {
    // Cloudflare
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
      return normalizeIp(cfConnectingIp);
    }

    // Standard XFF
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const ip = firstIpFromXff(xff);
      if (ip) return normalizeIp(ip);
    }

    // X-Real-IP
    const xRealIp = req.headers['x-real-ip'];
    if (typeof xRealIp === 'string' && xRealIp.trim()) {
      return normalizeIp(xRealIp);
    }
  }

  // fallback
  return peerIp || normalizeIp(req.ip ?? '');
}

