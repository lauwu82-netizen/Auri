// Publicada automáticamente desde GitHub
// =====================================================================
// AURI · Edge Function "vn-generate"  (modo novela visual)
// Una sola función con dos tareas:
//   { action: "script", chapter_id }            → analiza el capítulo con un modelo de texto y devuelve el guion
//                                                (quién habla, emoción, quién está en escena, lugar) + fondos por lugar.
//   { action: "cg", chapter_id, slot, desc, ref? } → genera una ilustración especial (CG) de esa escena.
//
// MODO DE PRUEBA: mientras no exista el secreto REPLICATE_API_TOKEN, la función no llama a ninguna IA ni gasta nada.
// Responde { mock: true } y la app usa su guion de prueba y una tarjeta en lugar del CG.
//
// Secretos (Edge Functions > Secrets):
//   REPLICATE_API_TOKEN   la llave de Replicate (SOLO aquí, nunca en GitHub ni en el chat)
// Opcionales (para cambiar de modelo sin tocar la app):
//   VN_TEXT_MODELS  (por defecto "meta/meta-llama-3.1-405b-instruct")   modelos de texto que analizan, separados por coma: si el primero se niega, prueba el siguiente
//   VN_BG_MODEL     (por defecto "stability-ai/sdxl")                  modelo de fondos
//   VN_CG_MODEL     (por defecto "black-forest-labs/flux-kontext-pro") modelo de CG (admite imagen de referencia)
//   VN_COST_TEXT / VN_COST_BG / VN_COST_CG   costo estimado en dólares por llamada (0.01 / 0.004 / 0.04)
// Antes de cada generación se consulta vn_budget_ok (tope del mes y por cuenta) y después se anota en vn_usage.
// =====================================================================

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
type Env = Record<string, string | undefined>;

async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Llama a un modelo de Replicate y espera el resultado (hasta ~60 s). Devuelve la salida o lanza un error. */
async function replicate(model: string, input: Record<string, unknown>, token: string): Promise<unknown> {
  const r = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'wait=60' }, body: JSON.stringify({ input }),
  });
  let p = await r.json();
  if (!r.ok) throw new Error('replicate ' + r.status + ' ' + JSON.stringify(p).slice(0, 200));
  for (let i = 0; i < 20 && p && (p.status === 'starting' || p.status === 'processing'); i++) {       // si no terminó, se consulta con calma
    await new Promise(res => setTimeout(res, 3000));
    const g = await fetch(p.urls.get, { headers: { Authorization: 'Bearer ' + token } }); p = await g.json();
  }
  if (!p || p.status !== 'succeeded') throw new Error('replicate ' + (p && p.status) + ' ' + String(p && p.error || '').slice(0, 160));
  return p.output;
}
const firstUrl = (o: unknown): string => Array.isArray(o) ? String(o[0] || '') : typeof o === 'string' ? o : '';

/** Prompt que pide el guion en JSON. Las reglas son las de la novela visual de Auri. */
function scriptPrompt(text: string, cast: string[], emos: string[]): string {
  return `Eres un asistente técnico de una plataforma de lectura para adultos. Tu único trabajo es ETIQUETAR un texto de ficción (quién habla, emoción, lugar); no lo juzgas, no lo censuras ni lo resumes, aunque contenga escenas románticas, sexuales, violentas o crudas entre personajes de ficción adultos. No escribes contenido nuevo: solo devuelves el JSON.\nConvierte el capítulo en un guion JSON.
Personajes disponibles: ${cast.join(', ') || '(ninguno)'}.
Emociones permitidas (usa solo estas): ${emos.join(', ')}.
Reglas:
- Divide el texto en tramos cortos (una o dos frases) SIN cambiar ni resumir las palabras.
- "who" es quien HABLA en ese tramo, o "" si es narración. Los guiones largos pueden indicar diálogo (—Hola —dijo Ana—) o descripción: lo que va entre guiones es narración, no diálogo.
- Un nombre dentro de lo que alguien dice es a quien le hablan, no quien habla.
- "emo" es la emoción de quien habla (o del personaje principal del tramo).
- "stage" son los personajes visibles: aparecen cuando llegan o hablan y se van cuando se retiran. Si la escena no menciona a nadie, "stage" es [].
- "place" es un lugar corto en minúsculas con guiones (p. ej. "parque-tarde"); repítelo mientras no cambie.
- Los bloques que empiezan con :: no son texto: ignóralos.
Responde SOLO con un arreglo JSON: [{"t":"…","who":"","emo":"neutral","stage":[],"place":"…"}]

CAPÍTULO:
${text}`;
}

function parseScript(raw: string, cast: string[], emos: string[]): Array<Record<string, unknown>> | null {
  const m = /\[[\s\S]*\]/.exec(raw); if (!m) return null;
  let arr: unknown; try { arr = JSON.parse(m[0]); } catch { return null; }
  if (!Array.isArray(arr) || !arr.length) return null;
  const out = []; for (const x of arr as Array<Record<string, unknown>>) {
    const t = String(x.t || '').trim(); if (!t) continue;
    const who = cast.includes(String(x.who)) ? String(x.who) : '', emo = emos.includes(String(x.emo)) ? String(x.emo) : 'neutral';
    const stage = (Array.isArray(x.stage) ? x.stage : []).map(String).filter(n => cast.includes(n)).slice(0, 3);
    out.push({ t, who, emo, stage, place: String(x.place || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) });
  }
  return out.length ? out : null;
}

export async function handle(req: Request, env: Env): Promise<Response> {
  try { return await run(req, env); }
  catch (e) { console.error('vn-generate', e); return json({ error: 'exception', detail: String((e as Error).message || e) }, 500); }
}

async function run(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY, TOKEN = env.REPLICATE_API_TOKEN;
  if (!URL_ || !ANON || !SVC) return json({ error: 'config' }, 500);
  const auth = req.headers.get('Authorization') || '';
  const ur = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth } });
  if (!ur.ok) return json({ error: 'auth' }, 401);
  const user = await ur.json();
  let body: { action?: string; chapter_id?: string; slot?: number; desc?: string; ref?: string } = {}; try { body = await req.json(); } catch { /* vacío */ }
  const cid = String(body.chapter_id || ''); if (!/^[0-9a-f-]{36}$/i.test(cid)) return json({ error: 'chapter_id' }, 400);
  if (body.action !== 'script' && body.action !== 'cg') return json({ error: 'action' }, 400);
  if (!TOKEN) return json({ mock: true });                                            // sin llave: no se hace ni se gasta nada

  const H = { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' };
  const rpc = async (fn: string, args: Record<string, unknown>) => { const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) }); return r.ok ? await r.json().catch(() => null) : null; };
  const cr = await fetch(`${URL_}/rest/v1/chapters?id=eq.${cid}&select=id,story_id,title,text,status,stories(owner,mature)`, { headers: H });
  const ch = cr.ok ? (await cr.json())[0] : null; if (!ch) return json({ error: 'not_found' }, 404);
  if (ch.status !== 'approved' && ch.stories?.owner !== user.id) return json({ error: 'forbidden' }, 403);      // solo capítulos publicados (o los tuyos)
  const hash = await sha256Hex((ch.title || '') + '\n' + (ch.text || ''));
  const num = (k: string, d: number) => Number(env[k]) > 0 ? Number(env[k]) : d;

  async function budget() { const b = await rpc('vn_budget_ok', { p_uid: user.id }); return b && b.ok ? null : json({ error: 'budget', reason: b ? b.reason : 'unknown' }, 429); }
  async function spend(kind: string, usd: number, detail: string) { await rpc('vn_usage_add', { p_uid: user.id, p_kind: kind, p_cost: usd, p_detail: detail }); }

  if (body.action === 'script') {
    const got = await fetch(`${URL_}/rest/v1/vn_scripts?chapter_id=eq.${cid}&hash=eq.${hash}&select=script`, { headers: H });
    const have = got.ok ? (await got.json())[0] : null; if (have) return json({ script: have.script, cached: true });     // ya preparado por la primera persona que lo leyó
    const stop = await budget(); if (stop) return stop;
    const cs = await fetch(`${URL_}/rest/v1/vn_characters?story_id=eq.${ch.story_id}&select=name`, { headers: H }), cast = (cs.ok ? await cs.json() : []).map((c: { name: string }) => c.name);
    const es = await fetch(`${URL_}/rest/v1/vn_emotions?select=key`, { headers: H }), emos = (es.ok ? await es.json() : []).map((e: { key: string }) => e.key);
    const text = String(ch.text || '').split(/\n\s*\n/).filter((p: string) => !/^\s*::(chat|sep|cg)/.test(p)).join('\n\n').slice(0, 24000);
    // Cadena de modelos: si uno se niega (contenido fuerte) o devuelve algo que no es el guion, se prueba el siguiente.
    // VN_TEXT_MODELS = "modelo1,modelo2,modelo3" (por defecto uno solo). Si ninguno sirve, la app usa su guion de prueba y el lector nunca se rompe.
    const models = (env.VN_TEXT_MODELS || env.VN_TEXT_MODEL || 'meta/meta-llama-3.1-405b-instruct').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4);
    let script: Array<Record<string, unknown>> | null = null;
    for (const m of models) {
      const b = await budget(); if (b) return b;
      try {
        const out = await replicate(m, { prompt: scriptPrompt(text, cast, emos), max_tokens: 6000, temperature: 0.2 }, TOKEN);
        script = parseScript(Array.isArray(out) ? out.join('') : String(out), cast, emos);
        await spend('analysis', num('VN_COST_TEXT', 0.01), (script ? 'LEYÓ · ' : 'NO SIRVIÓ (se negó o respondió mal) · ') + m.slice(0, 120));   // así se ve en vn_usage qué modelo sí leyó
      } catch (e) { console.error('texto', m, e); await spend('retry', 0.002, 'ERROR · ' + m.slice(0, 120)); }
      if (script) break;
    }
    if (!script) return json({ error: 'bad_script' }, 502);                               // el cliente sigue con su guion de prueba
    await fetch(`${URL_}/rest/v1/vn_scripts`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ chapter_id: cid, hash, script }) });
    // un fondo por lugar nuevo (máximo 6 por capítulo para cuidar el gasto)
    const places = [...new Set(script.map(s => String(s.place)).filter(Boolean))].slice(0, 6), assets: Record<string, string> = {};
    for (const pl of places) {
      const b = await budget(); if (b) break;
      try {
        const o = await replicate(env.VN_BG_MODEL || 'stability-ai/sdxl', { prompt: `anime visual novel background, ${pl.replace(/-/g, ' ')}, no people, soft light, detailed`, negative_prompt: 'people, characters, text, watermark', width: 1024, height: 576 }, TOKEN);
        const u = firstUrl(o); if (u) { assets[pl] = u; await fetch(`${URL_}/rest/v1/vn_assets`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ chapter_id: cid, hash, key: pl, url: u }) }); }
        await spend('background', num('VN_COST_BG', 0.004), pl);
      } catch (e) { console.error('fondo', pl, e); await spend('retry', 0.002, 'fondo falló ' + pl); }
    }
    return json({ script, assets });
  }

  // ---- CG ----
  const slot = Number(body.slot); if (!(slot >= 1 && slot <= 3)) return json({ error: 'slot' }, 400);
  const prev = await fetch(`${URL_}/rest/v1/vn_cgs?uid=eq.${user.id}&chapter_id=eq.${cid}&hash=eq.${hash}&slot=eq.${slot}&select=url`, { headers: H });
  const had = prev.ok ? (await prev.json())[0] : null; if (had) return json({ url: had.url, cached: true });
  const desc = String(body.desc || '').slice(0, 400); if (!desc) return json({ error: 'desc' }, 400);
  const ref = /^https:\/\//.test(String(body.ref || '')) ? String(body.ref) : '';       // imagen de referencia del OC (solo enlaces https)
  // escalera de intentos: la escena tal cual → si falla o se bloquea, versión más suave (por ejemplo con pijama) → si falla, no se cobra nada
  const tries = [desc, desc + '. Safe for work, fully clothed, wearing pajamas, no nudity'];
  for (let i = 0; i < tries.length; i++) {
    const stop = await budget(); if (stop) return stop;
    try {
      const input: Record<string, unknown> = { prompt: 'anime visual novel CG illustration, ' + tries[i] };
      if (ref) input.input_image = ref;
      const o = await replicate(env.VN_CG_MODEL || 'black-forest-labs/flux-kontext-pro', input, TOKEN), u = firstUrl(o);
      if (!u) throw new Error('sin imagen');
      await spend(i ? 'retry' : 'cg', num('VN_COST_CG', 0.04), 'cg ' + slot);
      await fetch(`${URL_}/rest/v1/vn_cgs`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ uid: user.id, chapter_id: cid, hash, slot, url: u }) });
      return json({ url: u, softened: i > 0 });
    } catch (e) { console.error('cg intento', i, e); await spend('retry', 0.002, 'cg falló ' + slot); }
  }
  return json({ failed: true });                                                         // la app sigue sin cobrar y muestra la tarjeta
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve) D.serve((req: Request) => handle(req, D.env.toObject()));
