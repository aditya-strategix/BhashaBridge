/**
 * Centralised service URL resolution.
 *
 * The launcher (start.sh) runs each service on its own port, and there is no
 * reverse proxy by default. Deriving the API/socket origin from the page origin
 * without a port sends requests to the Next.js server instead of the backend,
 * so LAN access (http://<host>:3000) used to fail every API call.
 *
 * NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SOCKET_URL remain the authoritative
 * override for reverse-proxied or HTTPS deployments.
 */

const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1';

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    const clean = String(configured).replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (!isLocalHost(hostname)) return `${protocol}//${hostname}:5000/api`;
  }

  return 'http://localhost:5000/api';
}

export function getSocketBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (configured) return String(configured).replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (!isLocalHost(hostname)) return `${protocol}//${hostname}:5000`;
  }

  return 'http://localhost:5000';
}

export function getSfuBaseUrlWithPortFallback() {
  const configured = process.env.NEXT_PUBLIC_SFU_URL;
  if (configured) return String(configured).replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (!isLocalHost(hostname)) {
      // HTTPS cannot reach the plain-HTTP SFU port directly; use a proxy.
      return protocol === 'https:' ? window.location.origin : `${protocol}//${hostname}:5002`;
    }
  }

  return 'http://localhost:5002';
}
