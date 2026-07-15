import { kv } from '@vercel/kv';

// Admin password is stored as an environment variable in Vercel
// Set ADMIN_PASSWORD in Vercel > Settings > Environment Variables
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Alexnae23#';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Parolă lipsă' });
    }

    if (password === ADMIN_PASSWORD) {
      // Return a simple session token so the client knows it's authenticated
      return res.status(200).json({ success: true });
    } else {
      return res.status(401).json({ success: false, message: 'Parolă incorectă' });
    }
  } catch (error) {
    console.error('[verifyAdmin] Error:', error);
    res.status(500).json({ success: false, message: 'Eroare server' });
  }
}
