// Publicada automáticamente desde GitHub
// =====================================================================
// AURI · Edge Function "vn-generate"  (modo novela visual)
// Una sola función con dos tareas:
//   { action: "script", chapter_id }            → analiza el capítulo con un modelo de texto y devuelve el guion
//                                                (quién habla, emoción, quién está en escena, lugar) + fondos por lugar.
//   { action: "cg", chapter_id, slot, desc, ref? } → genera una ilustración especial (CG) de esa escena.
//   { action: "sprite", story_id, name, emo, desc?, ref? } → sprite de torso hacia arriba, postura natural, con foto de referencia opcional.
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
//   VN_SPRITE_MODEL (sprites; por defecto el de CG) · VN_RMBG_MODEL (modelo que quita el fondo, vacío = no se usa; se elige en la prueba)
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
/** Replicate limita a 6 peticiones/min (ráfaga de 1) mientras el saldo sea menor a $5: si responde 429 se espera lo que pida y se reintenta. */
async function replicate(model: string, input: Record<string, unknown>, token: string): Promise<unknown> {
  for (let n = 0; ; n++) {
    try { return await replicate1(model, input, token); }
    catch (e) {
      const m = String((e as Error).message || e);
      if (n >= 3 || !/replicate 429/.test(m)) throw e;
      const ra = /"retry_after":\s*(\d+)/.exec(m);
      await new Promise(res => setTimeout(res, ((ra ? +ra[1] : 10) + 1) * 1000));
    }
  }
}
async function replicate1(model: string, input: Record<string, unknown>, token: string): Promise<unknown> {
  const r = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'wait=60' }, body: JSON.stringify({ input }),
  });
  let p = await r.json();
  if (r.status === 404) {                                   // modelos de la comunidad (no oficiales): se usa su última versión
    const m = await fetch(`https://api.replicate.com/v1/models/${model}`, { headers: { Authorization: 'Bearer ' + token } }), mj = m.ok ? await m.json() : null, ver = mj && mj.latest_version && mj.latest_version.id;
    if (!ver) throw new Error('replicate 404 modelo sin versión: ' + model);
    const r2 = await fetch('https://api.replicate.com/v1/predictions', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'wait=60' }, body: JSON.stringify({ version: ver, input }) });
    p = await r2.json(); if (!r2.ok) throw new Error('replicate ' + r2.status + ' ' + JSON.stringify(p).slice(0, 200));
  } else if (!r.ok) throw new Error('replicate ' + r.status + ' ' + JSON.stringify(p).slice(0, 200));
  for (let i = 0; i < 20 && p && (p.status === 'starting' || p.status === 'processing'); i++) {       // si no terminó, se consulta con calma
    await new Promise(res => setTimeout(res, 3000));
    const g = await fetch(p.urls.get, { headers: { Authorization: 'Bearer ' + token } }); p = await g.json();
  }
  if (!p || p.status !== 'succeeded') throw new Error('replicate ' + (p && p.status) + ' ' + String(p && p.error || '').slice(0, 160));
  return p.output;
}
/** Un modelo que MIRA una imagen y escribe cómo se ve el personaje (una vez por sprite; se guarda en vn_characters.look). */
async function describeLook(url: string, env: Env, TOKEN: string): Promise<string> {
  const o = await replicate(env.VN_VISION_MODEL || 'lucataco/ollama-llama3.2-vision-11b', {
    image: url,
    prompt: 'Describe ONLY the main character in this image for an illustrator who must draw the same character again. One paragraph in English, maximum 60 words: apparent species or type, hair (color, length, style), eyes, skin, clothing, accessories, distinctive features and main colors, and the art style. Ignore the background and objects. Do not mention nudity or anything sexual.',
  }, TOKEN);
  const txt = (Array.isArray(o) ? o.join('') : typeof o === 'string' ? o : '').replace(/\s+/g, ' ').trim();
  return txt.slice(0, 500);
}
const nameIn = (name: string, text: string) => name.trim().length > 1 && new RegExp('(^|[^\\p{L}\\p{N}])' + name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}\\p{N}])', 'iu').test(text);
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

/** Descripción de la cara de cada emoción para los sprites */
const EMO_EN: Record<string, string> = { neutral: 'calm neutral expression', feliz: 'happy, gentle smile', triste: 'sad, watery eyes', sonrojado: 'blushing, shy', asustado: 'scared, wide eyes', enojado: 'angry, frowning', avergonzado: 'embarrassed, blushing' };

/** Sprite de un personaje: de torso hacia arriba, postura natural, con foto de referencia opcional (solo la autoría del libro) */
async function sprite(body: { story_id?: string; name?: string; emo?: string; desc?: string; ref?: string }, uid: string, URL_: string, H: Record<string, string>,
  rpc: (fn: string, a: Record<string, unknown>) => Promise<any>, env: Env, TOKEN: string): Promise<Response> { // deno-lint-ignore no-explicit-any
  const sid = String(body.story_id || ''); if (!/^[0-9a-f-]{36}$/i.test(sid)) return json({ error: 'story_id' }, 400);
  const sr = await fetch(`${URL_}/rest/v1/stories?id=eq.${sid}&select=owner`, { headers: H }), st = sr.ok ? (await sr.json())[0] : null;
  if (!st || st.owner !== uid) return json({ error: 'forbidden' }, 403);                    // solo la autoría genera sprites de sus personajes
  const b = await rpc('vn_budget_ok', { p_uid: uid }); if (!(b && b.ok)) return json({ error: 'budget', reason: b ? b.reason : 'unknown' }, 429);
  const emo = EMO_EN[String(body.emo || 'neutral')] || EMO_EN.neutral, ref = /^https:\/\//.test(String(body.ref || '')) ? String(body.ref) : '';
  const prompt = 'Visual novel character sprite, bust-up shot from the torso up, natural relaxed posture, facing the viewer, arms relaxed, ' + emo +
    ', plain solid light gray background, nothing else in the image, no text, single character, clean anime style. ' + String(body.desc || '').slice(0, 300) +
    (ref ? ' Keep exactly the same character as in the reference image: same face, hair, eye color, outfit and colors.' : '');
  const input: Record<string, unknown> = { prompt, output_format: 'png' }; if (ref) input.input_image = ref;     // PNG (el fondo transparente se logra con VN_RMBG_MODEL)
  try {
    let url = firstUrl(await replicate(env.VN_SPRITE_MODEL || env.VN_CG_MODEL || 'black-forest-labs/flux-kontext-pro', input, TOKEN)); if (!url) throw new Error('sin imagen');
    await rpc('vn_usage_add', { p_uid: uid, p_kind: 'cg', p_cost: Number(env.VN_COST_CG) > 0 ? Number(env.VN_COST_CG) : 0.04, p_detail: 'sprite ' + String(body.name || '').slice(0, 40) });
    let transparent = false;                                                                  // quitar el fondo (si se configuró un modelo para eso) para que el sprite no lleve rectángulo
    if (env.VN_RMBG_MODEL) { try { const u2 = firstUrl(await replicate(env.VN_RMBG_MODEL, { image: url }, TOKEN)); if (u2) { url = u2; transparent = true; await rpc('vn_usage_add', { p_uid: uid, p_kind: 'other', p_cost: 0.01, p_detail: 'quitar fondo' }); } } catch (e) { console.error('rmbg', e); } }
    return json({ url, transparent });
  } catch (e) { console.error('sprite', e); await rpc('vn_usage_add', { p_uid: uid, p_kind: 'retry', p_cost: 0.002, p_detail: 'sprite falló' }); return json({ failed: true }); }
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
  let body: { action?: string; chapter_id?: string; story_id?: string; name?: string; emo?: string; slot?: number; desc?: string; ref?: string; me?: string; oc?: { name?: string; img?: string; hair?: string; eyes?: string } } = {}; try { body = await req.json(); } catch { /* vacío */ }
  if (body.action !== 'script' && body.action !== 'cg' && body.action !== 'sprite') return json({ error: 'action' }, 400);
  if (!TOKEN) return json({ mock: true });                                            // sin llave: no se hace ni se gasta nada
  const H = { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' };
  const rpc = async (fn: string, args: Record<string, unknown>) => { const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) }); return r.ok ? await r.json().catch(() => null) : null; };
  // ---- AuriGems: la Owner usa todo gratis; el resto paga (y se le devuelve si la generación falla) ----
  const pr = await fetch(`${URL_}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: H }), role = pr.ok ? ((await pr.json())[0] || {}).role : '', free = role === 'OWNER';
  const charge = async (item: string, ref: string, cyanOnly: boolean, dflt: number): Promise<Response | null> => {
    if (free) return null;
    const pq = await fetch(`${URL_}/rest/v1/vn_prices?item=eq.${item}&select=q`, { headers: H }), row = pq.ok ? (await pq.json())[0] : null, q = row && row.q > 0 ? row.q : dflt;
    const r = await rpc('gems_spend', { p_uid: user.id, p_q: q, p_reason: item, p_ref: ref, p_cyan_only: cyanOnly });
    if (!r) return json({ error: 'wallet' }, 503);                                    // sin billetera no se genera nada
    return r.ok ? null : json({ error: 'gems', need: r.need, have: r.have }, 402);
  };
  const refund = async (ref: string) => { if (!free) await rpc('gems_refund', { p_uid: user.id, p_ref: ref }); };
  if (body.action === 'sprite') {
    const sref = 'sprite:' + String(body.story_id || '') + ':' + String(body.name || '').slice(0, 30) + ':' + String(body.emo || '') + ':' + Date.now();
    const sst = await fetch(`${URL_}/rest/v1/stories?id=eq.${String(body.story_id || '')}&select=owner`, { headers: H }), so = sst.ok ? (await sst.json())[0] : null;
    if (!so || so.owner !== user.id) return json({ error: 'forbidden' }, 403);
    const no = await charge('sprite', sref, false, 16); if (no) return no;
    const rs = await sprite(body, user.id, URL_, H, rpc, env, TOKEN);
    if (rs.status !== 200) await refund(sref); else { const cl = rs.clone(); if ((await cl.json().catch(() => ({}))).failed) await refund(sref); }
    return rs;
  }
  const cid = String(body.chapter_id || ''); if (!/^[0-9a-f-]{36}$/i.test(cid)) return json({ error: 'chapter_id' }, 400);
  const cr = await fetch(`${URL_}/rest/v1/chapters?id=eq.${cid}&select=id,story_id,title,text,status,stories(owner,mature)`, { headers: H });
  const ch = cr.ok ? (await cr.json())[0] : null; if (!ch) return json({ error: 'not_found' }, 404);
  if (ch.status !== 'approved' && ch.stories?.owner !== user.id) return json({ error: 'forbidden' }, 403);      // solo capítulos publicados (o los tuyos)
  const hash = await sha256Hex((ch.title || '') + '\n' + (ch.text || ''));
  const num = (k: string, d: number) => Number(env[k]) > 0 ? Number(env[k]) : d;

  async function budget() { const b = await rpc('vn_budget_ok', { p_uid: user.id }); return b && b.ok ? null : json({ error: 'budget', reason: b ? b.reason : 'unknown' }, 429); }
  async function spend(kind: string, usd: number, detail: string) { await rpc('vn_usage_add', { p_uid: user.id, p_kind: kind, p_cost: usd, p_detail: detail }); }

  if (body.action === 'script') {
    const cref = 'chapter:' + cid + ':' + hash;
    { const no = await charge('chapter', cref, false, 24); if (no) return no; }          // todas las personas pagan el capítulo una vez (aunque el guion ya esté preparado)
    const got = await fetch(`${URL_}/rest/v1/vn_scripts?chapter_id=eq.${cid}&hash=eq.${hash}&select=script`, { headers: H });
    const have = got.ok ? (await got.json())[0] : null; if (have) return json({ script: have.script, cached: true });     // ya preparado por la primera persona que lo leyó
    const stop = await budget(); if (stop) { await refund(cref); return stop; }
    const cs = await fetch(`${URL_}/rest/v1/vn_characters?story_id=eq.${ch.story_id}&select=name`, { headers: H }), cast = (cs.ok ? await cs.json() : []).map((c: { name: string }) => c.name);
    const es = await fetch(`${URL_}/rest/v1/vn_emotions?select=key`, { headers: H }), emos = (es.ok ? await es.json() : []).map((e: { key: string }) => e.key);
    const text = String(ch.text || '').split(/\n\s*\n/).filter((p: string) => !/^\s*::(chat|sep|cg)/.test(p)).join('\n\n').slice(0, 24000);
    // Cadena de modelos: si uno se niega (contenido fuerte) o devuelve algo que no es el guion, se prueba el siguiente.
    // VN_TEXT_MODELS = "modelo1,modelo2,modelo3" (por defecto uno solo). Si ninguno sirve, la app usa su guion de prueba y el lector nunca se rompe.
    const models = (env.VN_TEXT_MODELS || env.VN_TEXT_MODEL || 'meta/meta-llama-3.1-405b-instruct').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4);
    let script: Array<Record<string, unknown>> | null = null;
    for (const m of models) {
      const b = await budget(); if (b) { await refund(cref); return b; }
      try {
        const out = await replicate(m, { prompt: scriptPrompt(text, cast, emos), max_tokens: 6000, temperature: 0.2 }, TOKEN);
        script = parseScript(Array.isArray(out) ? out.join('') : String(out), cast, emos);
        await spend('analysis', num('VN_COST_TEXT', 0.01), (script ? 'LEYÓ · ' : 'NO SIRVIÓ (se negó o respondió mal) · ') + m.slice(0, 120));   // así se ve en vn_usage qué modelo sí leyó
      } catch (e) { console.error('texto', m, e); await spend('retry', 0.002, 'ERROR · ' + m.slice(0, 120)); }
      if (script) break;
    }
    if (!script) { await refund(cref); return json({ error: 'bad_script' }, 502); }                              // el cliente sigue con su guion de prueba
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
  const desc = String(body.desc || '').slice(0, 400); if (!desc) return json({ error: 'desc' }, 400);
  const chash = await sha256Hex(hash + '\n' + desc);                                   // la descripción también cuenta: si la cambias, se genera una ilustración nueva
  const prev = await fetch(`${URL_}/rest/v1/vn_cgs?uid=eq.${user.id}&chapter_id=eq.${cid}&hash=eq.${chash}&slot=eq.${slot}&select=url`, { headers: H });
  const had = prev.ok ? (await prev.json())[0] : null; if (had) return json({ url: had.url, cached: true });
  const gref = 'cg:' + cid + ':' + hash + ':' + slot + ':' + Date.now();
  { const no = await charge('cg', gref, true, 24); if (no) return no; }                // los CG se pagan solo con gemas cian
  // Personajes que la escena nombra: sus descripciones (hechas mirando su imagen) y UNA imagen de referencia (la del lector si la nombra; si no, la del primero).
  const csr = await fetch(`${URL_}/rest/v1/vn_characters?story_id=eq.${ch.story_id}&select=id,name,sprites,look,look_src&order=pos`, { headers: H });
  // deno-lint-ignore no-explicit-any
  // El OC de quien lee (por ejemplo TN → Aoi) no está en vn_characters: la app manda su nombre, su foto/sprite (si es un enlace https) y cabello/ojos.
  const oc = body.oc && typeof body.oc === 'object' ? body.oc : null, ocName = String(oc && oc.name || '').slice(0, 40), ocImg = /^https:\/\//.test(String(oc && oc.img || '')) ? String(oc!.img) : '';
  // deno-lint-ignore no-explicit-any
  const named = ((csr.ok ? await csr.json() : []) as any[]).filter(c => nameIn(String(c.name || ''), desc)) as any[];
  if (ocName && nameIn(ocName, desc) && !named.some(c => String(c.name).toLowerCase().trim() === ocName.toLowerCase().trim())) {
    const hw = [oc!.hair ? String(oc!.hair).slice(0, 60) + ' hair' : '', oc!.eyes ? String(oc!.eyes).slice(0, 60) + ' eyes' : ''].filter(Boolean).join(', ');
    named.unshift({ id: '', name: ocName, sprites: ocImg ? { neutral: ocImg } : {}, look: ocImg ? '' : hw, look_src: '', oc: true });
  }
  named.splice(3);
  const me = String(body.me || '').toLowerCase().trim();
  const spriteOf = (c: { sprites?: Record<string, string> }) => { const v = c.sprites || {}; return [v.neutral, ...Object.values(v)].find(u => /^https:\/\//.test(String(u || ''))) || ''; };
  for (const c of named) {
    const src = spriteOf(c); if (!src || (c.look && c.look_src === src)) continue;
    try {
      if (await budget()) break;
      const look = await describeLook(src, env, TOKEN); if (!look) continue;
      await spend('other', num('VN_COST_VISION', 0.004), 'describir ' + String(c.name).slice(0, 30));
      c.look = look; c.look_src = src;
      if (c.id) await fetch(`${URL_}/rest/v1/vn_characters?id=eq.${c.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ look, look_src: src }) });
    } catch (e) { console.error('describir', c.name, e); await spend('retry', 0.002, ('describir falló ' + String(c.name).slice(0, 30) + ': ' + (e && (e as Error).message || e)).slice(0, 240)); }
  }
  // Con varios personajes, UNA sola imagen de referencia hace que Kontext copie esa cara a todos. Si ya hay descripción de cada uno, se genera solo con texto (cada personaje con su aspecto);
  // si falta alguna, se usa la imagen del lector/primero y se avisa que los demás son personas distintas.
  const allLooked = named.length > 1 && named.every(c => c.look);
  const refC = allLooked ? undefined : (named.find(c => String(c.name).toLowerCase().trim() === me && spriteOf(c)) || named.find(c => spriteOf(c))), ref = refC ? spriteOf(refC) : '';
  const others = refC ? named.filter(c => c !== refC).map(c => c.name) : [];
  const looks = named.filter(c => c.look).map(c => `${c.name}: ${String(c.look).replace(/[.\s]+$/, '')}`).join('; ');
  // escalera de intentos: escena no explícita → si falla o se bloquea, versión más suave (por ejemplo con pijama) → si falla, no se cobra nada
  // PROTEGE LA CUENTA de Replicate: nunca se pide nada explícito. El primer intento ya es "no explícito, sin desnudez" y el segundo es todavía más suave.
  const adults = ch.stories?.mature ? ' All characters are adults.' : '';
  const withLooks = (d: string) => d + (looks ? ' Characters appearance: ' + looks + '.' : '');
  const tries = [withLooks(desc) + '. Tasteful, non-explicit, no nudity, no sexual content.' + adults, withLooks(desc) + '. Safe for work, fully clothed, wearing pajamas, calm cozy mood, no nudity.' + adults];
  for (let i = 0; i < tries.length; i++) {
    const stop = await budget(); if (stop) { await refund(gref); return stop; }
    try {
      // Kontext EDITA la imagen de referencia: si no se le dice lo contrario, conserva fondo, objetos y pose. Aquí solo se usa para recordar cómo es el personaje.
      const input: Record<string, unknown> = { prompt: ref
        ? 'Create a brand new anime visual novel CG illustration. Use the reference image ONLY for ' + (refC ? refC.name : 'the main character') + ' (keep face, hair, eye color, outfit and colors).' + (others.length ? ' ' + others.join(' and ') + (others.length > 1 ? ' are' : ' is') + ' a DIFFERENT person: must NOT look like the reference; draw them with the hair, eyes and outfit given in Characters appearance.' : '') + ' Completely replace the background, objects and pose; do NOT keep anything else from the reference image. Scene: ' + tries[i]
        : 'anime visual novel CG illustration, ' + tries[i] };
      if (ref) input.input_image = ref;
      const o = await replicate(env.VN_CG_MODEL || 'black-forest-labs/flux-kontext-pro', input, TOKEN), u = firstUrl(o);
      if (!u) throw new Error('sin imagen');
      await spend(i ? 'retry' : 'cg', num('VN_COST_CG', 0.04), 'cg ' + slot);
      await fetch(`${URL_}/rest/v1/vn_cgs`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ uid: user.id, chapter_id: cid, hash: chash, slot, url: u }) });
      return json({ url: u, softened: i > 0 });
    } catch (e) { console.error('cg intento', i, e); await spend('retry', 0.002, ('cg falló ' + slot + ': ' + (e && (e as Error).message || e)).slice(0, 240)); }
  }
  await refund(gref);
  return json({ failed: true });                                                         // se devuelven las gemas y la app muestra la tarjeta
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve) D.serve((req: Request) => handle(req, D.env.toObject()));
