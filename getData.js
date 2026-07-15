import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Allow only GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Cache headers: browsers & CDN must always fetch fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const data = await kv.get('spalatorie_state');
    if (data) {
      res.status(200).json(data);
    } else {
      // First run - return empty state so app initializes cleanly
      res.status(200).json({});
    }
  } catch (error) {
    console.error('[getData] Upstash KV error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
