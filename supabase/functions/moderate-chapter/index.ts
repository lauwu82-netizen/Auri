// =====================================================================
// AURI · Edge Function "moderate-chapter"
// Revisa un capítulo con la API de moderación de OpenAI (gratuita) y le dice a la base de datos
// si se aprueba solo o si se queda pendiente para que moderación lo revise.
//
// Reglas (se pueden ajustar en las listas de abajo):
//  - Libro NO marcado +18: cualquier contenido sugerente se marca (umbral bajo).
//  - Libro +18: solo se marca lo prohibido o lo muy explícito (umbral alto).
//  - Posible sexualización de menores: SIEMPRE se marca, esté o no el libro como +18.
//  - Si la IA falla o no hay clave, no se aprueba nada: el capítulo sigue pendiente para moderación.
//
// Secretos que necesita (Edge Functions > Secrets):  OPENAI_API_KEY
// Opcional:  AI_MODE = auto (por defecto: lo limpio se publica solo) | advisory (solo avisa, moderación aprueba todo) | off
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solos (no los copies a ningún lado).
// =====================================================================

export const MODEL = 'omni-moderation-latest';

/** Umbrales (0 a 1): si la IA da un puntaje igual o mayor, el capítulo se marca para revisión humana */
export const T_GENERAL: Record<string, number> = {          // libros SIN marca +18
  'sexual': 0.25, 'sexual/minors': 0.15, 'violence': 0.92, 'violence/graphic': 0.5,
  'self-harm': 0.6, 'self-harm/intent': 0.5, 'self-harm/instructions': 0.3,
  'hate': 0.6, 'hate/threatening': 0.4, 'harassment/threatening': 0.6, 'illicit/violent': 0.6,
};
export const T_MATURE: Record<string, number> = {           // libros CON marca +18
  'sexual': 0.9, 'sexual/minors': 0.15, 'violence/graphic': 0.85,
  'self-harm/intent': 0.7, 'self-harm/instructions': 0.3,
  'hate': 0.8, 'hate/threatening': 0.5, 'harassment/threatening': 0.8, 'illicit/violent': 0.8,
};
export const LABEL: Record<string, string> = {
  'sexual': 'contenido sexual o sugerente', 'sexual/minors': 'posible contenido sexual con menores', 'violence': 'violencia',
  'violence/graphic': 'violencia gráfica', 'self-harm': 'autolesión', 'self-harm/intent': 'intención de autolesión',
  'self-harm/instructions': 'instrucciones de autolesión', 'hate': 'odio', 'hate/threatening': 'odio con amenazas',
  'harassment/threatening': 'acoso con amenazas', 'illicit/violent': 'actividad ilegal violenta', 'length': 'texto demasiado largo para revisar',
};
const MAX_CHARS = 300000, CHUNK = 2500, BATCH = 20;

/** Parte el texto en trozos de hasta ~2500 caracteres, cortando en párrafos o frases */
export function splitChunks(text: string): string[] {
  const out: string[] = []; let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const para of String(text || '').split(/\n+/)) {
    let p = para;
    while (p.length > CHUNK) {
      let cut = p.lastIndexOf('. ', CHUNK); if (cut < CHUNK / 2) cut = p.lastIndexOf(' ', CHUNK); if (cut < CHUNK / 2) cut = CHUNK;
      const piece = p.slice(0, cut + 1); p = p.slice(cut + 1);
      if (cur.length + piece.length > CHUNK) push(); cur += piece + '\n'; if (cur.length >= CHUNK) push();
    }
    if (cur.length + p.length > CHUNK) push(); cur += p + '\n';
  }
  push(); return out;
}

export type Reason = { cat: string; label: string; score: number; chunk: number };
export type Flags = { reasons: Reason[]; excerpt: string; mature: boolean; chunks: number };

/** Con el puntaje más alto de cada categoría decide si se marca y por qué */
export function decide(maxScores: Record<string, { score: number; chunk: number }>, mature: boolean, chunks: string[]): { verdict: 'clean' | 'flagged'; flags: Flags } {
  const T = mature ? T_MATURE : T_GENERAL, reasons: Reason[] = [];
  for (const cat of Object.keys(T)) {
    const m = maxScores[cat]; if (m && m.score >= T[cat]) reasons.push({ cat, label: LABEL[cat] || cat, score: Math.round(m.score * 100) / 100, chunk: m.chunk });
  }
  reasons.sort((a, b) => (b.cat === 'sexual/minors' ? 1 : 0) - (a.cat === 'sexual/minors' ? 1 : 0) || b.score - a.score);
  const top = reasons[0], ex = top ? (chunks[top.chunk] || '').replace(/\s+/g, ' ').slice(0, 280) : '';
  return { verdict: reasons.length ? 'flagged' : 'clean', flags: { reasons, excerpt: ex, mature, chunks: chunks.length } };
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function moderate(chunks: string[], key: string): Promise<Record<string, { score: number; chunk: number }>> {
  const max: Record<string, { score: number; chunk: number }> = {};
  for (let i = 0; i < chunks.length; i += BATCH) {
    const input = chunks.slice(i, i + BATCH); let res: Response | null = null;
    for (let tryN = 0; tryN < 3; tryN++) {
      res = await fetch('https://api.openai.com/v1/moderations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ model: MODEL, input }) });
      if (res.status !== 429 && res.status < 500) break; await new Promise((r) => setTimeout(r, 1200 * (tryN + 1)));
    }
    if (!res || !res.ok) throw new Error('openai ' + (res ? res.status : 'sin respuesta'));
    const data = await res.json();
    (data.results || []).forEach((r: { category_scores?: Record<string, number> }, k: number) => {
      for (const [cat, sc] of Object.entries(r.category_scores || {})) if (!max[cat] || sc > max[cat].score) max[cat] = { score: sc, chunk: i + k };
    });
  }
  return max;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function handle(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY, KEY = env.OPENAI_API_KEY, MODE = (env.AI_MODE || 'auto').toLowerCase();
  if (!URL_ || !ANON || !SVC) return json({ error: 'config' }, 500);
  if (MODE === 'off') return json({ result: 'off' });
  const auth = req.headers.get('Authorization') || '';
  const ur = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth } });
  if (!ur.ok) return json({ error: 'auth' }, 401);
  const user = await ur.json();
  let body: { chapter_id?: string } = {}; try { body = await req.json(); } catch { /* vacío */ }
  const cid = String(body.chapter_id || ''); if (!/^[0-9a-f-]{36}$/i.test(cid)) return json({ error: 'chapter_id' }, 400);
  const H = { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' };
  const cr = await fetch(`${URL_}/rest/v1/chapters?id=eq.${cid}&select=id,story_id,title,text,status,stories(owner,mature)`, { headers: H });
  const rows = cr.ok ? await cr.json() : []; const ch = rows[0];
  if (!ch) return json({ error: 'not_found' }, 404);
  if (!ch.stories || ch.stories.owner !== user.id) return json({ error: 'forbidden' }, 403);      // solo la autoría pide la revisión de su capítulo
  if (ch.status !== 'pending') return json({ result: 'skip' });
  const mature = !!ch.stories.mature, hash = await sha256Hex((ch.title || '') + '\n' + (ch.text || ''));
  let verdict: 'clean' | 'flagged', flags: Flags | null = null;
  const pr = await fetch(`${URL_}/rest/v1/chapter_ai?chapter_id=eq.${cid}&select=verdict,hash,mature,flags`, { headers: H });
  const prev = pr.ok ? (await pr.json())[0] : null;
  if (prev && prev.hash === hash && !!prev.mature === mature) { verdict = prev.verdict; flags = prev.flags; }      // ya se revisó este mismo texto: no se vuelve a gastar la IA
  else if ((ch.text || '').length > MAX_CHARS) { verdict = 'flagged'; flags = { reasons: [{ cat: 'length', label: LABEL.length, score: 1, chunk: 0 }], excerpt: '', mature, chunks: 0 }; }
  else {
    if (!KEY) return json({ error: 'no_key' }, 500);
    const chunks = splitChunks((ch.title ? ch.title + '\n' : '') + (ch.text || ''));
    try { const d = decide(await moderate(chunks, KEY), mature, chunks); verdict = d.verdict; flags = d.flags; }
    catch (e) { return json({ error: 'ai_unavailable', detail: String((e as Error).message || e) }, 502); }          // la IA falló: el capítulo sigue pendiente para moderación
  }
  const rr = await fetch(URL_ + '/rest/v1/rpc/ai_decide_chapter', { method: 'POST', headers: H, body: JSON.stringify({ cid, p_verdict: verdict, p_hash: hash, p_mature: mature, p_flags: flags, p_auto: MODE === 'auto' }) });
  if (!rr.ok) return json({ error: 'db', detail: await rr.text() }, 500);
  const result = await rr.json();
  return json({ result, verdict, reasons: (flags && flags.reasons || []).map((r) => r.label) });
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve) D.serve((req: Request) => handle(req, D.env.toObject()));
