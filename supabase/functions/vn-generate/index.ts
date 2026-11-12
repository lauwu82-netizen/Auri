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
//   VN_TEXT_MODELS  (por defecto "meta/meta-llama-3-70b-instruct,meta/meta-llama-3-8b-instruct")   modelos de texto que analizan, separados por coma: si el primero se niega, prueba el siguiente
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
let lastRep = 0;                                           // con poco crédito Replicate deja 1 petición cada ~10 s: se espacian las llamadas de esta misma función
async function replicate(model: string, input: Record<string, unknown>, token: string, maxRetry = 4): Promise<unknown> {
  for (let n = 0; ; n++) {
    const gap = lastRep + (Number(Deno.env.get('VN_REP_GAP_MS')) || 1500) - Date.now(); if (gap > 0) await new Promise(res => setTimeout(res, gap)); lastRep = Date.now();
    try { return await replicate1(model, input, token); }
    catch (e) {
      const m = String((e as Error).message || e);
      if (n >= maxRetry || !/replicate 429/.test(m)) throw e;
      const ra = /"retry_after":\s*(\d+)/.exec(m);
      await new Promise(res => setTimeout(res, ((ra ? +ra[1] : 12) + 1) * 1000));
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
  }, TOKEN, 1);
  const txt = (Array.isArray(o) ? o.join('') : typeof o === 'string' ? o : '').replace(/\s+/g, ' ').trim();
  return txt.slice(0, 500);
}
/** Las imágenes que devuelve Replicate caducan (≈1 hora): se copian al almacenamiento de Auri y se devuelve el enlace permanente. Si algo falla, se deja el original. */
async function persist(URL_: string, H: Record<string, string>, src: string, path: string): Promise<string> {
  try {
    const r = await fetch(src); if (!r.ok) return src;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0], ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg', buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.length || buf.length > 5 * 1024 * 1024) return src;
    const p = path + '.' + ext, up = await fetch(`${URL_}/storage/v1/object/images/${p}`, { method: 'POST', headers: { ...H, 'Content-Type': ct === 'image/png' || ct === 'image/webp' ? ct : 'image/jpeg', 'x-upsert': 'true' }, body: buf });
    return up.ok ? `${URL_}/storage/v1/object/public/images/${p}` : src;
  } catch (e) { console.error('persist', e); return src; }
}
const nameIn = (name: string, text: string) => name.trim().length > 1 && new RegExp('(^|[^\\p{L}\\p{N}])' + name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}\\p{N}])', 'iu').test(text);
const firstUrl = (o: unknown): string => Array.isArray(o) ? String(o[0] || '') : typeof o === 'string' ? o : '';
/** Crea UN fondo (sin personas). Por defecto Flux Schnell (oficial, barato, 16:9); VN_BG_MODEL puede cambiarlo. Devuelve la URL temporal de Replicate. */
async function genBgUrl(env: Env, TOKEN: string, scene: string): Promise<string> {
  const model = env.VN_BG_MODEL || 'black-forest-labs/flux-schnell', inside = /interior|inside|indoor|dentro|classroom|hallway|library|bedroom|kitchen|living-room|office|hospital|church|cafe|workshop/i.test(scene) && !/exterior|outside|outdoor|courtyard|campus|street/i.test(scene), outside = /exterior|outside|outdoor|courtyard|campus|street|park|garden|beach|forest|rooftop/i.test(scene), where = inside ? 'indoors, the inside of the room with walls, ceiling, windows and furniture, NOT the building exterior' : outside ? 'outdoors, exterior view' : '', prompt = `anime visual novel background, ${scene}, ${where ? where + ', ' : ''}no people, soft light, detailed, wide scene, no text`;
  const input = /flux/i.test(model) ? { prompt, aspect_ratio: '16:9', num_outputs: 1, output_format: 'jpg' } : { prompt, negative_prompt: 'people, characters, text, watermark', width: 1024, height: 576 };
  return firstUrl(await replicate(model, input, TOKEN, 2));
}

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
- "place" describe el LUGAR EXACTO donde están los personajes en ese momento, en inglés, minúsculas con guiones, máximo 55 caracteres. Indica SIEMPRE si están dentro o fuera: termina con "interior" o "exterior" seguido de la hora (day, evening o night). Si el texto dice que están DENTRO de un edificio (entran, están en un salón, en un pasillo, en una biblioteca…), usa "interior" y la estancia concreta (p. ej. "university-classroom-interior-day", "school-hallway-interior-evening"); si están en el patio, la calle o el campus, usa "exterior" (p. ej. "university-courtyard-exterior-day"). No uses el nombre del edificio solo: "university" sin estancia muestra la fachada. Repite el mismo valor mientras no cambien de lugar.
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
    out.push({ t, who, emo, stage, place: String(x.place || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60) });
  }
  return out.length ? out : null;
}

/** Descripción de la cara de cada emoción para los sprites */
const EMO_EN: Record<string, string> = { neutral: 'calm neutral expression', feliz: 'clearly HAPPY: bright smile, relaxed cheerful eyes', triste: 'clearly SAD: eyebrows tilted up in the middle, watery eyes, small downturned mouth', sonrojado: 'blushing, shy', asustado: 'scared, wide eyes', enojado: 'clearly ANGRY: eyebrows pulled down and furrowed, sharp intense glare, frowning tense mouth', avergonzado: 'embarrassed, blushing' };

/** Sprite de un personaje: de torso hacia arriba, postura natural, con foto de referencia opcional (solo la autoría del libro) */
async function sprite(body: { story_id?: string; name?: string; emo?: string; desc?: string; ref?: string }, uid: string, URL_: string, H: Record<string, string>,
  rpc: (fn: string, a: Record<string, unknown>) => Promise<any>, env: Env, TOKEN: string): Promise<Response> { // deno-lint-ignore no-explicit-any
  const sid = String(body.story_id || ''); if (!/^[0-9a-f-]{36}$/i.test(sid)) return json({ error: 'story_id' }, 400);
  const sr = await fetch(`${URL_}/rest/v1/stories?id=eq.${sid}&select=owner`, { headers: H }), st = sr.ok ? (await sr.json())[0] : null;
  if (!st || st.owner !== uid) return json({ error: 'forbidden' }, 403);                    // solo la autoría genera sprites de sus personajes
  const b = await rpc('vn_budget_ok', { p_uid: uid }); if (!(b && b.ok)) return json({ error: 'budget', reason: b ? b.reason : 'unknown' }, 429);
  const emo = EMO_EN[String(body.emo || 'neutral')] || EMO_EN.neutral, ref = /^https:\/\//.test(String(body.ref || '')) ? String(body.ref) : '';
  const prompt = ref
    ? 'Edit this character image. Keep the exact same character: same face shape, hair, eye color, outfit, colors, pose and framing. Change ONLY the facial expression to: ' + emo + '. The expression must be clearly different from the reference. Plain solid light gray background, nothing else, no text. ' + String(body.desc || '').slice(0, 200)
    : 'Visual novel character sprite, bust-up shot from the torso up, natural relaxed posture, facing the viewer, arms relaxed, ' + emo + ', plain solid light gray background, nothing else in the image, no text, single character, clean anime style. ' + String(body.desc || '').slice(0, 300);
  const input: Record<string, unknown> = { prompt, output_format: 'png' }; if (ref) input.input_image = ref;     // PNG (el fondo transparente se logra con VN_RMBG_MODEL)
  try {
    let url = firstUrl(await replicate(env.VN_SPRITE_MODEL || env.VN_CG_MODEL || 'black-forest-labs/flux-kontext-pro', input, TOKEN)); if (!url) throw new Error('sin imagen');
    await rpc('vn_usage_add', { p_uid: uid, p_kind: 'cg', p_cost: Number(env.VN_COST_CG) > 0 ? Number(env.VN_COST_CG) : 0.04, p_detail: 'sprite ' + String(body.name || '').slice(0, 40) });
    let transparent = false;                                                                  // quitar el fondo (si se configuró un modelo para eso) para que el sprite no lleve rectángulo
    const rm = env.VN_RMBG_MODEL === 'off' ? '' : (env.VN_RMBG_MODEL || '851-labs/background-remover');   // por defecto se quita el fondo; 'off' lo desactiva
    if (rm) { try { const u2 = firstUrl(await replicate(rm, { image: url }, TOKEN)); if (u2) { url = u2; transparent = true; await rpc('vn_usage_add', { p_uid: uid, p_kind: 'other', p_cost: 0.01, p_detail: 'quitar fondo' }); } } catch (e) { console.error('rmbg', e); await rpc('vn_usage_add', { p_uid: uid, p_kind: 'retry', p_cost: 0.002, p_detail: ('quitar fondo falló: ' + String((e as Error).message || e)).slice(0, 240) }); } }
    url = await persist(URL_, H, url, `ai/${uid}/sprite-${Date.now()}`);
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
  let body: { action?: string; variant?: number; mode?: string; message?: string; text?: string; title?: string; synopsis?: string; genre?: string; hist?: Array<{ r?: string; c?: string }>; place?: string; list?: boolean; chapter_id?: string; story_id?: string; name?: string; emo?: string; slot?: number; desc?: string; ref?: string; me?: string; oc?: { name?: string; img?: string; hair?: string; eyes?: string } } = {}; try { body = await req.json(); } catch { /* vacío */ }
  if (!['script', 'cg', 'sprite', 'bg', 'bglib', 'editor', 'whoami'].includes(String(body.action))) return json({ error: 'action' }, 400);
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
  // ---- Biblioteca global de fondos: solo la Owner los crea (una vez); el resto los lee de la tabla sin tocar Replicate ----
  if (body.action === 'bglib') {
    if (!free) return json({ error: 'forbidden' }, 403);
    const BGP: Record<string, string> = {
      'cozy-cafe': 'cozy cafe interior', 'library': 'quiet library with tall bookshelves', 'workshop': 'workshop with tools and warm light', 'school-hallway': 'school hallway',
      'school-classroom': 'empty school classroom with desks and windows', 'university-campus': 'university campus with trees', 'bedroom': 'tidy bedroom with soft light', 'kitchen': 'homey kitchen',
      'living-room': 'living room with sofa', 'park': 'city park with benches and trees', 'city-street-evening': 'city street in the evening', 'beach': 'beach with calm sea at sunset', 'forest': 'forest path with sunlight',
      'gothic-church': 'gothic church interior', 'hospital-room': 'hospital room', 'rooftop': 'building rooftop at dusk', 'nightclub-stage': 'club stage with colorful lights', 'office': 'modern office',
      'garden': 'flower garden', 'cemetery': 'quiet cemetery at dusk', 'train-station': 'train station platform', 'mansion-interior': 'grand mansion interior', 'home-interior': 'cozy home interior',
      'quiet-city-street-at-night': 'quiet city street at night', 'misty-forest-path': 'misty forest path', 'starry-night-sky-over-hills': 'starry night sky over hills', 'cozy-room-with-warm-lamp': 'cozy room with warm lamp',
      'rainy-window-evening': 'rainy window in the evening', 'sunset-over-city-rooftops': 'sunset over city rooftops'
    };
    if (body.list) return json({ keys: Object.keys(BGP) });
    const k = String(body.place || ''); if (!BGP[k]) return json({ error: 'place' }, 400);
    const ex = await fetch(`${URL_}/rest/v1/vn_bg_library?key=eq.${k}&select=url`, { headers: H }), eo = ex.ok ? (await ex.json())[0] : null; if (eo) return json({ url: eo.url, cached: true });
    try {
      // 1) generador gratuito (Pollinations, sin llave ni tarjeta); 2) Replicate solo si el gratuito falla
      let u = ''; const pq = `anime visual novel background, ${BGP[k]}, no people, soft light, detailed, wide scene, no text`;
      try {
        const fr = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(pq)}?width=1280&height=720&nologo=true&model=flux&seed=${Math.floor(Math.random() * 99999)}`);
        if (fr.ok && (fr.headers.get('content-type') || '').startsWith('image/')) { const buf = new Uint8Array(await fr.arrayBuffer()); if (buf.length > 5000 && buf.length < 5 * 1024 * 1024) { const ct = (fr.headers.get('content-type') || 'image/jpeg').split(';')[0], ext = ct === 'image/png' ? 'png' : 'jpg', pth = `ai/lib/${k}.${ext}`; const up = await fetch(`${URL_}/storage/v1/object/images/${pth}`, { method: 'POST', headers: { ...H, 'Content-Type': ct, 'x-upsert': 'true' }, body: buf }); if (up.ok) { const pu0 = `${URL_}/storage/v1/object/public/images/${pth}`; await fetch(`${URL_}/rest/v1/vn_bg_library`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: k, url: pu0 }) }); return json({ url: pu0, free: true }); } } }
      } catch (e) { console.error('pollinations', k, e); }
      const o = await genBgUrl(env, TOKEN, BGP[k]);
      u = o; if (!u) return json({ failed: true, why: 'sin imagen' });
      await rpc('vn_usage_add', { p_uid: user.id, p_kind: 'background', p_cost: Number(env.VN_COST_BG) > 0 ? Number(env.VN_COST_BG) : 0.004, p_detail: 'biblioteca ' + k });
      const pu = await persist(URL_, H, u, `ai/lib/${k}`);
      await fetch(`${URL_}/rest/v1/vn_bg_library`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: k, url: pu }) });
      return json({ url: pu });
    } catch (e) { console.error('lib', k, e); await rpc('vn_usage_add', { p_uid: user.id, p_kind: 'retry', p_cost: 0.002, p_detail: ('biblioteca falló ' + k + ': ' + (e && (e as Error).message || e)).slice(0, 240) }); return json({ failed: true, why: String(e && (e as Error).message || e).slice(0, 120) }); }
  }
  // ---- Diagnóstico (solo Owner): a qué cuenta de Replicate pertenece la llave y si una petición mínima pasa ----
  if (body.action === 'whoami') {
    if (!free) return json({ error: 'forbidden' }, 403);
    const out: Record<string, unknown> = {};
    try { const a = await fetch('https://api.replicate.com/v1/account', { headers: { Authorization: 'Bearer ' + TOKEN } }); const aj = await a.json().catch(() => ({})); out.account = a.ok ? { type: aj.type, username: aj.username, name: aj.name } : { status: a.status, body: JSON.stringify(aj).slice(0, 200) }; } catch (e) { out.account = String(e).slice(0, 120); }
    try {
      const r = await fetch('https://api.replicate.com/v1/models/meta/meta-llama-3-8b-instruct/predictions', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', Prefer: 'wait=30' }, body: JSON.stringify({ input: { prompt: 'Di hola', max_tokens: 8 } }) });
      const rj = await r.json().catch(() => ({}));
      out.predict = { status: r.status, state: rj.status, detail: String(rj.detail || rj.error || '').slice(0, 220), ratelimit: r.headers.get('x-ratelimit-remaining') || r.headers.get('ratelimit-remaining') || '' };
    } catch (e) { out.predict = String(e).slice(0, 120); }
    return json(out);
  }
  // ---- Chat de escritura: corrige, da ideas o escribe (solo la autoría de la historia; nunca en libros +18) ----
  if (body.action === 'editor') {
    const mode = ['chat', 'fix', 'ideas', 'write'].includes(String(body.mode)) ? String(body.mode) : 'chat';
    const sq = await fetch(`${URL_}/rest/v1/stories?id=eq.${String(body.story_id || '')}&select=owner,mature`, { headers: H }), so0 = sq.ok ? (await sq.json())[0] : null;
    if (!so0 || so0.owner !== user.id) return json({ error: 'forbidden' }, 403);
    if (so0.mature) return json({ error: 'mature' }, 403);                          // nada de contenido +18 hacia la IA (protege la cuenta de Replicate)
    const bq = await rpc('vn_budget_ok', { p_uid: user.id }); if (!(bq && bq.ok)) return json({ error: 'budget', reason: bq ? bq.reason : 'unknown' }, 429);
    const eref = 'editor:' + mode + ':' + user.id + ':' + Date.now();
    const no0 = await charge(mode === 'write' ? 'editor_write' : 'editor', eref, false, mode === 'write' ? 16 : 4); if (no0) return no0;
    const msg = String(body.message || '').slice(0, 1500), text = String(body.text || '').slice(0, 14000);
    const hist = (Array.isArray(body.hist) ? body.hist : []).slice(-6).map(h => (h && h.r === 'a' ? 'Auri: ' : 'Autora: ') + String(h && h.c || '').slice(0, 600)).join('\n');
    const sys = 'Eres Auri, una gata alienígena amable que ayuda a escribir historias. Responde siempre en español neutro, sin regionalismos. Nunca escribas contenido sexual explícito, violencia gráfica extrema ni nada sexual con menores; si te lo piden, rechaza con amabilidad y propón otra dirección. Si no sabes algo, dilo.';
    const ctx = `Libro: ${String(body.title || '').slice(0, 120)}\nGénero: ${String(body.genre || '').slice(0, 60)}\nSinopsis: ${String(body.synopsis || '').slice(0, 600)}`;
    let prompt = '';
    if (mode === 'fix') prompt = `${ctx}\n\nTarea: corrige SOLO la ortografía, la gramática, los acentos y la puntuación del capítulo. No cambies la voz, el estilo, el contenido ni el orden. No agregues ni quites escenas. Conserva los saltos de línea y los diálogos. Devuelve ÚNICAMENTE el capítulo corregido, sin comentarios antes ni después.\n\nCAPÍTULO:\n${text}`;
    else if (mode === 'ideas') prompt = `${ctx}\n\nLa autora tiene bloqueo creativo. ${msg ? 'Pide: ' + msg + '\n' : ''}Dale 5 ideas breves y concretas de cómo continuar o mejorar su historia, numeradas, de máximo dos líneas cada una.\n\nÚLTIMA PARTE DEL CAPÍTULO:\n${text.slice(-4000)}`;
    else if (mode === 'write') prompt = `${ctx}\n\nEscribe el siguiente fragmento o capítulo de la historia siguiendo este pedido de la autora: ${msg || 'continúa la historia'}.\nMantén el estilo, los nombres y el tono. Devuelve ÚNICAMENTE el texto narrativo, sin comentarios ni títulos, de unas 600 a 900 palabras.\n\nLO ESCRITO HASTA AHORA:\n${text.slice(-5000)}`;
    else prompt = `${ctx}\n\n${hist ? 'Conversación previa:\n' + hist + '\n\n' : ''}Autora: ${msg}\n\n${text ? 'Texto del capítulo actual (por si ayuda):\n' + text.slice(-3000) + '\n\n' : ''}Responde de forma breve y útil.`;
    const models0 = (env.VN_TEXT_MODELS || env.VN_TEXT_MODEL || 'meta/meta-llama-3-70b-instruct,meta/meta-llama-3-8b-instruct').split(',').map(x => x.trim()).filter(Boolean).slice(0, 2);
    let reply = '', why = '';
    for (const m of models0) {
      try {
        const out = await replicate(m, { prompt, system_prompt: sys, max_tokens: mode === 'fix' ? 6000 : 2500, temperature: mode === 'fix' ? 0.1 : 0.7 }, TOKEN, 3);
        reply = (Array.isArray(out) ? out.join('') : String(out || '')).trim();
        await rpc('vn_usage_add', { p_uid: user.id, p_kind: 'analysis', p_cost: mode === 'write' || mode === 'fix' ? 0.03 : 0.01, p_detail: ('EDITOR ' + mode + (reply ? ' · ' : ' VACÍO · ') + m).slice(0, 120) });
      } catch (e) { console.error('editor', m, e); why = String(e && (e as Error).message || e).slice(0, 160); await rpc('vn_usage_add', { p_uid: user.id, p_kind: 'retry', p_cost: 0.002, p_detail: ('EDITOR ERROR · ' + String(e && (e as Error).message || e)).slice(0, 200) }); }
      if (reply) break;
    }
    if (!reply) { await refund(eref); return json({ error: 'failed', why }, 502); }
    return json({ reply, mode });
  }
  // ---- Fondo con IA para una historia (desde el panel de novela visual): solo la autoría; nunca en libros +18 ----
  if (body.action === 'bgmake') {
    const sq2 = await fetch(`${URL_}/rest/v1/stories?id=eq.${String(body.story_id || '')}&select=owner,mature`, { headers: H }), s2 = sq2.ok ? (await sq2.json())[0] : null;
    if (!s2 || s2.owner !== user.id) return json({ error: 'forbidden' }, 403);
    if (s2.mature) return json({ error: 'mature' }, 403);
    const scene = String(body.desc || '').replace(/[^\p{L}\p{N} ,.'-]+/gu, ' ').trim().slice(0, 160); if (scene.length < 3) return json({ error: 'desc' }, 400);
    const bq2 = await rpc('vn_budget_ok', { p_uid: user.id }); if (!(bq2 && bq2.ok)) return json({ error: 'budget', reason: bq2 ? bq2.reason : 'unknown' }, 429);
    const bref = 'bgmake:' + user.id + ':' + Date.now();
    const no2 = await charge('bgmake', bref, false, 4); if (no2) return no2;
    try {
      const u = await genBgUrl(env, TOKEN, scene); if (!u) { await refund(bref); return json({ failed: true, why: 'Replicate no devolvió imagen' }); }
      await rpc('vn_usage_add', { p_uid: user.id, p_kind: 'background', p_cost: Number(env.VN_COST_BG) > 0 ? Number(env.VN_COST_BG) : 0.004, p_detail: 'fondo del panel · ' + scene.slice(0, 60) });
      const pu = await persist(URL_, H, u, `ai/bgmake/${String(body.story_id).slice(0, 8)}-${Date.now()}`);
      return json({ url: pu });
    } catch (e) { await refund(bref); const why = String(e && (e as Error).message || e).slice(0, 200); await rpc('vn_usage_add', { p_uid: user.id, p_kind: 'retry', p_cost: 0.002, p_detail: ('fondo del panel falló: ' + why).slice(0, 240) }); return json({ failed: true, why }); }
  }
  if (body.action === 'sprite') {
    if (env.VN_SPRITE_ON !== '1') return json({ off: true }, 503);                       // sprites con IA en pausa (VN_SPRITE_ON=1 los enciende)
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
  const hash = await sha256Hex('v2\n' + (ch.title || '') + '\n' + (ch.text || ''));
  const num = (k: string, d: number) => Number(env[k]) > 0 ? Number(env[k]) : d;

  async function budget() { const b = await rpc('vn_budget_ok', { p_uid: user.id }); return b && b.ok ? null : json({ error: 'budget', reason: b ? b.reason : 'unknown' }, 429); }
  async function spend(kind: string, usd: number, detail: string) { await rpc('vn_usage_add', { p_uid: user.id, p_kind: kind, p_cost: usd, p_detail: detail }); }

  const cachedAssets = async (): Promise<Record<string, string>> => {
    const r = await fetch(`${URL_}/rest/v1/vn_assets?chapter_id=eq.${cid}&hash=eq.${hash}&select=key,url`, { headers: H }), o: Record<string, string> = {};
    // deno-lint-ignore no-explicit-any
    if (r.ok) for (const x of (await r.json()) as any[]) o[String(x.key)] = String(x.url); return o;
  };
  // ---- Fondo de un lugar (uno por llamada: Replicate limita las peticiones y así la lectura nunca espera) ----
  if (body.action === 'bg') {
    const pl = String(body.place || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60); if (!pl) return json({ error: 'place' }, 400);
    let vr = Math.max(0, Math.min(1000, Math.floor(Number(body.variant) || 0)));
    if (vr > 0) { const cr2 = await fetch(`${URL_}/rest/v1/vn_assets?chapter_id=eq.${cid}&hash=eq.${hash}&key=like.n:*&select=key`, { method: 'HEAD', headers: { ...H, Prefer: 'count=exact' } }), t2 = Number((cr2.headers.get('content-range') || '').split('/')[1]); if (!(Number.isFinite(t2) && vr <= Math.floor(t2 / 100))) vr = 0; }   // no se puede pedir una variante que todavía no toca
    const pk = vr > 0 ? `${pl}-v${vr}` : pl;
    const have = (await cachedAssets())[pk]; if (have) return json({ url: have, cached: true });
    const stop = await budget(); if (stop) return stop;
    try {
      const u = await genBgUrl(env, TOKEN, pl.replace(/-/g, ' '));
      if (!u) return json({ failed: true, why: 'sin imagen' });
      await spend('background', num('VN_COST_BG', 0.004), pl);
      const pu = await persist(URL_, H, u, `ai/bg/${String(cid).slice(0, 8)}-${hash.slice(0, 12)}-${pk}`);
      await fetch(`${URL_}/rest/v1/vn_assets`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ chapter_id: cid, hash, key: pk, url: pu }) });
      return json({ url: pu });
    } catch (e) { console.error('fondo', pl, e); await spend('retry', 0.002, ('fondo falló ' + pl + ': ' + (e && (e as Error).message || e)).slice(0, 240)); return json({ failed: true, why: String(e && (e as Error).message || e).slice(0, 160) }); }
  }

  if (body.action === 'script') {
    const cref = 'chapter:' + cid + ':' + hash;
    { const no = await charge('chapter', cref, false, 24); if (no) return no; }          // todas las personas pagan el capítulo una vez (aunque el guion ya esté preparado)
    // Cada 100 lecturas el siguiente lector crea fondos nuevos y las 100 siguientes los reciben guardados.
    // Se cuenta con filas-marca en vn_assets (key "n:<id>"): sin SQL nuevo. Lectura #1..#100 -> variante 0; #101..#200 -> variante 1; etc.
    let variant = 0;
    try {
      const cr = await fetch(`${URL_}/rest/v1/vn_assets?chapter_id=eq.${cid}&hash=eq.${hash}&key=like.n:*&select=key`, { method: 'HEAD', headers: { ...H, Prefer: 'count=exact' } });
      const tot = Number((cr.headers.get('content-range') || '').split('/')[1]); variant = Number.isFinite(tot) && tot >= 0 ? Math.floor(tot / 100) : 0;
      await fetch(`${URL_}/rest/v1/vn_assets`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ chapter_id: cid, hash, key: 'n:' + crypto.randomUUID(), url: '-' }) });
    } catch (e) { console.error('variante', e); }
    const got = await fetch(`${URL_}/rest/v1/vn_scripts?chapter_id=eq.${cid}&hash=eq.${hash}&select=script`, { headers: H });
    const have = got.ok ? (await got.json())[0] : null; if (have) return json({ script: have.script, assets: {}, variant, cached: true });     // ya preparado por la primera persona que lo leyó
    const stop = await budget(); if (stop) { await refund(cref); return stop; }
    const cs = await fetch(`${URL_}/rest/v1/vn_characters?story_id=eq.${ch.story_id}&select=name`, { headers: H }), cast = (cs.ok ? await cs.json() : []).map((c: { name: string }) => c.name); if (!cast.includes('TN')) cast.push('TN');   // TN = la persona que lee (la app lo cambia por el nombre de su OC)
    const es = await fetch(`${URL_}/rest/v1/vn_emotions?select=key`, { headers: H }), emos = (es.ok ? await es.json() : []).map((e: { key: string }) => e.key);
    const text = String(ch.text || '').split(/\n\s*\n/).filter((p: string) => !/^\s*::(chat|sep|cg)/.test(p)).join('\n\n').slice(0, 24000);
    // Cadena de modelos: si uno se niega (contenido fuerte) o devuelve algo que no es el guion, se prueba el siguiente.
    // VN_TEXT_MODELS = "modelo1,modelo2,modelo3" (por defecto uno solo). Si ninguno sirve, la app usa su guion de prueba y el lector nunca se rompe.
    const models = (env.VN_TEXT_MODELS || env.VN_TEXT_MODEL || 'meta/meta-llama-3-70b-instruct,meta/meta-llama-3-8b-instruct').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4);
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
    return json({ script, assets: {}, variant });                                                                  // los fondos se piden aparte, uno por uno (action 'bg')
  }

  // ---- CG ----
  if (env.VN_CG_ON !== '1') return json({ off: true, failed: true });                  // CG con IA en pausa (VN_CG_ON=1 los enciende)
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
  const T0 = Date.now();                                                   // la función tiene un tiempo máximo: el análisis nunca debe impedir que se dibuje la escena
  for (const c of named) {
    if (Date.now() - T0 > 40000) break;
    const src = spriteOf(c); if (!src || (c.look && (c.look_src === src || c.look_src === 'manual'))) continue;   // 'manual' = la autoría escribió la descripción a mano
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
  const allLooked = named.length > 1;        // con 2+ personajes nunca se usa una sola imagen: Kontext la copiaría a todos (o inventaría al otro)
  const refC = allLooked ? undefined : (named.find(c => String(c.name).toLowerCase().trim() === me && spriteOf(c)) || named.find(c => spriteOf(c))), ref = refC ? spriteOf(refC) : '';
  const others = refC ? named.filter(c => c !== refC).map(c => c.name) : [];
  const looks = named.filter(c => c.look).map(c => `${c.name}: ${String(c.look).replace(/[.\s]+$/, '')}`).join('; ');
  // escalera de intentos: escena no explícita → si falla o se bloquea, versión más suave (por ejemplo con pijama) → si falla, no se cobra nada
  // PROTEGE LA CUENTA de Replicate: nunca se pide nada explícito. El primer intento ya es "no explícito, sin desnudez" y el segundo es todavía más suave.
  const adults = ch.stories?.mature ? ' All characters are adults.' : '';
  const withLooks = (d: string) => d + (looks ? ' Characters appearance: ' + looks + '.' : '');
  // OJO: nombrar lo que NO queremos ("no nudity", "no sexual content") mete esas palabras en el prompt y el filtro de Replicate (E005) se activa por ellas. Se pide en positivo.
  // 1.º intento: la escena tal cual, en tono sano. 2.º intento: versión tranquila (personajes de pie, sin contacto ni cercanía) y sin la descripción original de la acción.
  const tries = [withLooks(desc) + '. Wholesome, family-friendly, fully dressed in everyday clothes.' + adults, (named.length ? named.map(c => c.name).join(' and ') + ' standing calmly in the scene, friendly relaxed mood. ' : 'A calm peaceful scene. ') + (looks ? 'Characters appearance: ' + looks + '. ' : '') + 'Wholesome, family-friendly, fully dressed in everyday clothes, soft lighting.' + adults];
  let sensitive = false;
  for (let i = 0; i < tries.length; i++) {
    if (i > 0 && Date.now() - T0 > 70000) break;                                  // sin tiempo para una segunda versión
    const stop = await budget(); if (stop) { await refund(gref); return stop; }
    try {
      // Kontext EDITA la imagen de referencia: si no se le dice lo contrario, conserva fondo, objetos y pose. Aquí solo se usa para recordar cómo es el personaje.
      const input: Record<string, unknown> = { prompt: ref
        ? 'Create a brand new anime visual novel CG illustration. Use the reference image ONLY for ' + (refC ? refC.name : 'the main character') + ' (keep face, hair, eye color, outfit and colors).' + (others.length ? ' ' + others.join(' and ') + (others.length > 1 ? ' are' : ' is') + ' a DIFFERENT person: must NOT look like the reference; draw them with the hair, eyes and outfit given in Characters appearance.' : '') + ' Completely replace the background, objects and pose; do NOT keep anything else from the reference image. Do not add people not mentioned, and draw animals as real animals, not humans with animal ears. Scene: ' + tries[i]
        : 'Anime visual novel CG illustration. Draw exactly what the scene describes and nothing more: do not add people or characters that are not mentioned, and if it mentions an animal, draw the real animal (not a human girl or boy with animal ears). Scene: ' + tries[i] };
      if (ref) input.input_image = ref;
      const o = await replicate(env.VN_CG_MODEL || 'black-forest-labs/flux-kontext-pro', input, TOKEN), u = firstUrl(o);
      if (!u) throw new Error('sin imagen');
      await spend(i ? 'retry' : 'cg', num('VN_COST_CG', 0.04), 'cg ' + slot);
      const pu = await persist(URL_, H, u, `ai/${user.id}/cg-${chash.slice(0, 24)}-${slot}`);
      await fetch(`${URL_}/rest/v1/vn_cgs`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ uid: user.id, chapter_id: cid, hash: chash, slot, url: pu }) });
      return json({ url: pu, softened: i > 0 });
    } catch (e) { console.error('cg intento', i, e); if (/E005|sensitive|sensible/i.test(String((e as Error).message || e))) sensitive = true; await spend('retry', 0.002, ('cg falló ' + slot + ': ' + (e && (e as Error).message || e)).slice(0, 240)); }
  }
  await refund(gref);
  return json({ failed: true, sensitive });                                                         // se devuelven las gemas y la app muestra la tarjeta
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve) D.serve((req: Request) => handle(req, D.env.toObject()));
