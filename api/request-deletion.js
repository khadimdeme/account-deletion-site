import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).send('Server not configured');
    return;
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Body JSON
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const emailRaw = (body.email || '').toString().trim().toLowerCase();
  const reason   = (body.reason || '').toString();
  if (!emailRaw) { res.status(400).send('Email requis'); return; }

  // 1) Trouver l’utilisateur
  let userId = null;
  const { data: cli, error: cliErr } = await sb
    .from('clients')
    .select('user_id,email')
    .eq('email', emailRaw)
    .maybeSingle();
  if (cliErr) { res.status(500).send(cliErr.message); return; }
  if (cli?.user_id) userId = cli.user_id;

  if (!userId) {
    const { data: byEmail, error: adminErr } = await sb.auth.admin.getUserByEmail(emailRaw);
    if (adminErr || !byEmail?.user?.id) { res.status(404).send('Utilisateur introuvable'); return; }
    userId = byEmail.user.id;
  }

  // 2) Enregistrer la demande (J+30)
  const deleteAfter = new Date(Date.now() + 30*24*60*60*1000).toISOString();
  const { error: upErr } = await sb.from('account_deletion_requests').upsert({
    user_id: userId,
    reason,
    requested_at: new Date().toISOString(),
    delete_after: deleteAfter,
    status: 'pending',
    processed_at: null
  });
  if (upErr) { res.status(500).send(upErr.message); return; }

  // 3) Désactiver immédiatement
  await sb.from('clients').update({ compte_ferme: true }).eq('user_id', userId);
  await sb.from('chauffeurs').update({ compte_ferme: true }).eq('user_id', userId);

  res.status(200).send('Demande enregistrée. Suppression sous 30 jours (annulable en vous reconnectant).');
}
