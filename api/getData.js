import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const data = await kv.get('spalatorie_state');
    if (data) {
      res.status(200).json(data);
    } else {
      // Empty database should not trigger an error, just return empty state
      res.status(200).json({});
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
