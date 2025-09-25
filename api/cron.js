// api/cron.js  (Node/ESM, ton package.json a "type": "module")
export default async function handler(req, res) {
  // Vercel enverra cette en-tête pour les exécutions cron planifiées
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  // Appelle la fonction Edge Supabase (delete_due_users) en POST
  const r = await fetch(process.env.SUPABASE_DELETE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  });

  const text = await r.text();
  return res.status(r.status).send(text || 'OK');
}
