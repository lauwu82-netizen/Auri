// Publicada automáticamente desde GitHub
// =====================================================================
// AURI · Edge Function "moderate-image"
// Revisa las imágenes de una persona (foto de perfil, banner, portadas) con la API de moderación de OpenAI (gratis).
//  - Imagen limpia: no pasa nada.
//  - Imagen marcada: se registra en la base de datos (image_checks) y se oculta para todos; la autoría puede pedir revisión humana.
//  - Muy grave: se rechaza directo (sin botón de error).
//  - Si la IA falla, la imagen NO se oculta: se vuelve a intentar más tarde.
// Secretos: OPENAI_API_KEY. Opcional: AI_MODE = auto (por defecto) | off
// =====================================================================

export const MODEL = 'omni-moderation-latest';

/** Umbrales (0 a 1). STRICT = perfil, banner y portadas de libros sin +18. MATURE = portadas de libros +18. */
export const T_STRICT: Record<string, number> = { 'sexual': 0.5, 'sexual/minors': 0.2, 'violence': 0.92, 'violence/graphic': 0.5, 'self-harm': 0.6, 'self-harm/intent': 0.5, 'self-harm/instructions': 0.5 };
export const T_MATURE: Record<string, number> = { 'sexual': 0.93, 'sexual/minors': 0.2, 'violence': 0.97, 'violence/graphic': 0.85, 'self-harm': 0.7, 'self-harm/intent': 0.6, 'self-harm/instructions': 0.5 };
/** Por encima de esto se rechaza directo, sin apelación */
export const T_HARD_STRICT: Record<string, number> = { 'sexual': 0.985, 'sexual/minors': 0.5, 'violence/graphic': 0.96 };
export const T_HARD_MATURE: Record<string, number> = { 'sexual': 0.997, 'sexual/minors': 0.5, 'violence/graphic': 0.97 };
export const LABEL: Record<string, string> = {
  'sexual': 'contenido sexual o sugerente', 'sexual/minors': 'posible contenido sexual con menores', 'violence': 'violencia',
  'violence/graphic': 'violencia gráfica', 'self-harm': 'autolesión', 'self-harm/intent': 'intención de autolesión', 'self-harm/instructions': 'instrucciones de autolesión',
};

export type Verdict = { flagged: boolean; hard: boolean; reasons: { cat: string; label: string; score: number }[]; top: { cat: string; score: number }[] };

/** Con los puntajes de la IA decide si se marca y si es grave */
export function decide(scores: Record<string, number>, mature: boolean): Verdict {
  const T = mature ? T_MATURE : T_STRICT, H = mature ? T_HARD_MATURE : T_HARD_STRICT, reasons: Verdict['reasons'] = []; let hard = false;
  for (const cat of Object.keys(T)) {
    const s = scores[cat]; if (typeof s !== 'number') continue;
    if (s >= T[cat]) reasons.push({ cat, label: LABEL[cat] || cat, score: Math.round(s * 100) / 100 });
    if (H[cat] !== undefined && s >= H[cat]) hard = true;
  }
  reasons.sort((a, b) => b.score - a.score);
  const top = Object.entries(scores).map(([cat, score]) => ({ cat, score: Math.round(score * 100) / 100 })).sort((a, b) => b.score - a.score).slice(0, 4);
  return { flagged: reasons.length > 0, hard, reasons, top };
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function moderateImage(url: string, key: string): Promise<Record<string, number>> {
  let res: Response | null = null;
  for (let n = 0; n < 3; n++) {
    res = await fetch('https://api.openai.com/v1/moderations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ model: MODEL, input: [{ type: 'image_url', image_url: { url } }] }) });
    if (res.status !== 429 && res.status < 500) break; await new Promise((r) => setTimeout(r, 1200 * (n + 1)));
  }
  if (!res || !res.ok) throw new Error('openai ' + (res ? res.status + ' ' + (await res.text()).slice(0, 160) : 'sin respuesta'));
  const d = await res.json(); return (d.results && d.results[0] && d.results[0].category_scores) || {};
}

export async function handle(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  try { return await run(req, env); }
  catch (e) { console.error('moderate-image', e); return json({ error: 'exception', detail: String((e as Error).message || e) }, 500); }
}

type Ctx = { kind: string; story: string; mature: boolean } | null;

async function run(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY, KEY = env.OPENAI_API_KEY, MODE = (env.AI_MODE || 'auto').toLowerCase();
  if (!URL_ || !ANON || !SVC) { console.error('faltan variables de Supabase'); return json({ error: 'config' }, 500); }
  if (MODE === 'off') return json({ results: {}, off: true });
  const auth = req.headers.get('Authorization') || '';
  const ur = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth } });
  if (!ur.ok) return json({ error: 'auth' }, 401);
  const user = await ur.json();
  let body: { urls?: string[] } = {}; try { body = await req.json(); } catch { /* vacío */ }
  const prefix = `${URL_}/storage/v1/object/public/images/${user.id}/`;
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map(String))].filter((u) => u.startsWith(prefix) && u.length < 400).slice(0, 8);
  if (!urls.length) return json({ results: {} });
  const H = { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' };
  const q = async (path: string) => { const r = await fetch(URL_ + '/rest/v1/' + path, { headers: H }); return r.ok ? await r.json() : []; };
  const results: Record<string, string> = {};
  for (const u of urls) {
    const enc = encodeURIComponent(u);
    const prev = (await q(`image_checks?url=eq.${enc}&select=status`))[0];
    if (prev) { results[u] = prev.status === 'approved' ? 'ok' : prev.status; continue; }                      // ya se revisó esta misma imagen
    // ¿dónde se usa? (si todavía no se guardó en el perfil o el libro, se intenta más tarde)
    let ctx: Ctx = null;
    const own = `owner=eq.${user.id}`;
    if ((await q(`profiles?id=eq.${user.id}&avatar=eq.${enc}&select=id`)).length) ctx = { kind: 'avatar', story: '', mature: false };
    else if ((await q(`profiles?id=eq.${user.id}&banner=eq.${enc}&select=id`)).length) ctx = { kind: 'banner', story: '', mature: false };
    else {
      const s = (await q(`stories?${own}&cover=eq.${enc}&select=id,mature`))[0];
      if (s) ctx = { kind: 'cover', story: s.id, mature: !!s.mature };
      else {
        const c = (await q(`chapters?cover=eq.${enc}&select=story_id,stories!inner(owner,mature)&stories.owner=eq.${user.id}`))[0];
        if (c) ctx = { kind: 'chapter', story: c.story_id, mature: !!(c.stories && c.stories.mature) };
      }
    }
    if (!ctx) { results[u] = 'unlinked'; continue; }
    if (!KEY) { console.error('falta el secreto OPENAI_API_KEY'); results[u] = 'error'; continue; }
    let scores: Record<string, number>;
    try { scores = await moderateImage(u, KEY); } catch (e) { console.error('moderateImage', e); results[u] = 'error'; continue; }
    const v = decide(scores, ctx.mature);
    if (!v.flagged) { results[u] = 'ok'; continue; }
    const rr = await fetch(URL_ + '/rest/v1/rpc/img_report', { method: 'POST', headers: H, body: JSON.stringify({ p_owner: user.id, p_url: u, p_kind: ctx.kind, p_story: ctx.story, p_severity: v.hard ? 'hard' : 'soft', p_reasons: { reasons: v.reasons, top: v.top, mature: ctx.mature } }) });
    if (!rr.ok) { console.error('img_report', (await rr.text()).slice(0, 200)); results[u] = 'error'; continue; }
    results[u] = v.hard ? 'rejected' : 'flagged';
  }
  return json({ results });
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve) D.serve((req: Request) => handle(req, D.env.toObject()));
