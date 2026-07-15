import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Allow only GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Edge Cache: Serverele Vercel vor stoca rezultatul timp de 30 secunde. 
  // Astfel, dacă 300 utilizatori dau refresh în 30s, doar 1 cerere ajunge la Upstash.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=59');
  
  try {
    let data = await kv.get('spalatorie_state');
    if (data) {
      if (!data._lastModified) data._lastModified = Date.now();
      res.status(200).json(data);
    } else {
      // First run - return empty state so app initializes cleanly
      res.status(200).json({ _lastModified: Date.now() });
    }
  } catch (error) {
    console.error('[getData] Upstash KV error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
