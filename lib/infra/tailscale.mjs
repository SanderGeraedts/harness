// Tailscale, for a project's backend (G-0018): an auth key from the OAuth client, and what a
// node tagged tag:harness may do, read from `tailscale status --json`. The OAuth client may
// only write auth keys for tag:harness; nothing here can do more.
import { TAG } from './project.mjs';

const API = 'https://api.tailscale.com/api/v2';

// A one-use, pre-authorised key for one node tagged tag:harness, valid for ten minutes. A
// tagged node's own key doesn't expire. The key is returned, never printed.
export async function createAuthKey({ clientId, clientSecret, description, fetchImpl = fetch }) {
  if (!clientId || !clientSecret) throw new Error('TS_OAUTH_CLIENT_ID or TS_OAUTH_SECRET is missing from the environment');
  const tokenRes = await fetchImpl(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }).toString(),
  });
  if (!tokenRes.ok) throw new Error(`Tailscale refused the OAuth client (${tokenRes.status})`);
  const { access_token: access } = await tokenRes.json();
  const keyRes = await fetchImpl(`${API}/tailnet/-/keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilities: { devices: { create: { reusable: false, ephemeral: false, preauthorized: true, tags: [TAG] } } },
      expirySeconds: 600,
      description: String(description ?? 'harness').replace(/[^\w -]/g, '-').slice(0, 50),
    }),
  });
  if (!keyRes.ok) throw new Error(`Tailscale refused to make an auth key for ${TAG} (${keyRes.status})`);
  const { key } = await keyRes.json();
  if (!key) throw new Error('Tailscale gave no auth key');
  return key;
}

const has = (caps, name) => caps.some((c) => c === name || c === `https://tailscale.com/cap/${name}`);

// What a node tagged tag:harness may do in this tailnet, from its `tailscale status --json`,
// and the backend's address. Returns { address, missing: [what the Engineer must turn on] }.
export function readTailnet(status, project) {
  const self = status?.Self ?? {};
  const caps = [...Object.keys(self.CapMap ?? {}), ...(self.Capabilities ?? [])];
  const suffix = String(status?.CurrentTailnet?.MagicDNSSuffix ?? status?.MagicDNSSuffix ?? '').replace(/\.$/, '');
  const missing = [];
  if (!status?.CurrentTailnet?.MagicDNSEnabled || !suffix) missing.push('MagicDNS is off in the tailnet: turn it on (admin console, DNS)');
  if (!has(caps, 'https')) missing.push('HTTPS certificates are off in the tailnet: turn them on (admin console, DNS, HTTPS Certificates)');
  if (!has(caps, 'funnel'))
    missing.push(`nodes tagged ${TAG} may not use Funnel: add to the tailnet policy file "nodeAttrs": [{ "target": ["${TAG}"], "attr": ["funnel"] }]`);
  return { address: suffix ? `https://${project}.${suffix}` : undefined, missing };
}
