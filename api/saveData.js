import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      
      // Save entire object in KV database under 'spalatorie_state'
      await kv.set('spalatorie_state', payload);
      
      res.status(200).json({ status: 'success', engine: 'Vercel KV' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: 'error', message: 'Failed to save data' });
    }
  } else {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }
}
