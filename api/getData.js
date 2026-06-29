import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const data = await kv.get('spalatorie_state');
    if (data) {
      res.status(200).json(data);
    } else {
      res.status(404).json({ error: 'No data found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
