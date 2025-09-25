import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).send('Server not configured');
  }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const emailRaw = (body.email || '').toString().trim().toLowerCase();
  const reason   = (body.reason || '').toString();

  if (!emailRaw) return res.status(400).send('Email requis');

  // 1) Retrouver l’utilisateur par la table clients (puis fallback admin par email)
  let userId: string | null = null;

  const { data: cli, error: cliErr } = await sb
    .from('clients')
    .select('user_id,email')
    .eq('email', emailRaw)
    .maybeSingle();

  if (cliErr) return res.status(500).send(cliErr.message);
  if (cli?.user_id) {
    userId = cli.user_id as string;
  } else {
    // Fallback : admin lookup (nécessite service_role)
    const { data: byEmail, error: adminErr } = await sb.auth.admin.getUserByEmail(emailRaw);
    if (adminErr) return res.status(404).send('Utilisateur introuvable');
    userId = byEmail?.user?.id ?? null;
  }

  if (!userId) return res.status(404).send('Utilisateur introuvable');

  // 2) Enregistrer / réinitialiser la demande (J+30)
  const deleteAfter = new Date(Date.now() + 30*24*60*60*1000).toISOString();
  const { error: upErr } = await sb.from('account_deletion_requests').upsert({
    user_id: userId,
    reason,
    requested_at: new Date().toISOString(),
    delete_after: deleteAfter,
    status: 'pending',
    processed_at: null
  });
  if (upErr) return res.status(500).send(upErr.message);

  // 3) Désactiver immédiatement
  await sb.from('clients').update({ compte_ferme: true }).eq('user_id', userId);
  await sb.from('chauffeurs').update({ compte_ferme: true }).eq('user_id', userId);

  return res.status(200).send('Demande enregistrée. Suppression sous 30 jours (annulable en vous reconnectant).');
}
