export default async function handler(req, res) {
  // Option: n'accepter que les appels Cron Vercel
  if (req.headers['x-vercel-cron'] !== '1') {
    return res.status(403).send('Forbidden');
  }

  const url = process.env.SUPABASE_DELETE_URL; // https://.../functions/v1/delete_due_users
  const secret = process.env.CRON_SECRET;

  if (!url || !secret) return res.status(500).send('Not configured');

  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` }
  });

  const text = await r.text();
  res.status(r.status).send(text);
}
