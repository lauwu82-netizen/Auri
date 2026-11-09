// Auri · iniciar sesión con nombre de usuario.
// Busca el correo de ese usuario en el servidor (el correo NUNCA llega al navegador) y entra con la contraseña.
const URL_ = Deno.env.get('SUPABASE_URL')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const out = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let b: { username?: string; password?: string; apikey?: string } = {};
  try { b = await req.json(); } catch { return out({ error: 'bad_request' }, 400); }
  const username = String(b.username || '').trim().toLowerCase().replace(/^@/, ''), password = String(b.password || '');
  if (!/^[a-z0-9_.]{3,20}$/.test(username) || !password) return out({ error: 'invalid_login' }, 400);
  const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE };
  const p = await fetch(`${URL_}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`, { headers: H });
  const rows = p.ok ? await p.json() : [];
  // mismo mensaje y mismo trabajo si el usuario no existe, para no revelar qué usuarios hay
  let email = '';
  if (rows[0]) {
    const q = await fetch(`${URL_}/rest/v1/profile_private?id=eq.${rows[0].id}&select=email`, { headers: H });
    const r2 = q.ok ? await q.json() : []; email = (r2[0] && r2[0].email) || '';
  }
  const key = ANON || b.apikey || SERVICE;
  const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email || 'no-existe@auri.invalid', password }) });
  const data = await t.json().catch(() => ({}));
  if (!t.ok) return out(data && (data.error_code || data.msg) ? { error_code: data.error_code, msg: data.msg } : { error: 'invalid_login' }, t.status === 429 ? 429 : 400);
  return out(data);
});
