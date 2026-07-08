export default async function handler(req, res) {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return res.status(500).json({ error: 'Upstash credentials missing in Vercel environment variables' });
    }

    const getRes = await fetch(`${url}/get/spalatorie_state`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const getJson = await getRes.json();
    
    if (getJson.result) {
      const data = typeof getJson.result === 'string' ? JSON.parse(getJson.result) : getJson.result;
      res.status(200).json(data);
    } else {
      res.status(200).json({});
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
