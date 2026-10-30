'use strict';
/* =========================================================
   AURI · app.js  (Vanilla JS, SPA con rutas #/...)
   1. Utilidades   2. Almacenamiento   3. Auth local
   4. Mascota      5. Vistas           6. Router
   7. Eventos
   ========================================================= */

/* 1. UTILIDADES --------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
/** Etiquetas: se escriben con # (#romance lento #magia). Se guardan sin el # y se muestran con él */
function parseTags(v) {
  v = String(v || ''); const raw = v.includes('#') ? v.split('#') : v.split(',');
  const out = []; raw.forEach(t => { t = t.replace(/\s+/g, ' ').trim().replace(/^#+/, '').trim().slice(0, 30); if (t && !out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t); });
  return out.slice(0, 15);
}
const tagsText = tg => (tg || []).map(t => '#' + t).join(' ');
const tagChips = (tg, cls = '') => (tg || []).map(x => `<button type="button" class="tag tag-link ${cls}" data-act="tag-search" data-id="${esc(x)}" aria-label="${esc(t('Buscar la etiqueta {x}', { x }))}">#${esc(x)}</button>`).join('');
const popTags = (n = 10) => { const c = {}; publishedStories().filter(matureOK).filter(storyVisible).forEach(s => s.tags.forEach(t => { const k = t.toLowerCase(); c[k] = c[k] || { t, n: 0 }; c[k].n++; })); return Object.values(c).sort((a, b) => b.n - a.n).slice(0, n).map(x => x.t); };
const GENRES = { Fantasy: 'Fantasía', Romance: 'Romance', 'Slice of life': 'Costumbrista', 'Sci-fi': 'Ciencia ficción', Mystery: 'Misterio', Other: 'Otro' };
const genreName = g => t(GENRES[g] || g);
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = t(msg); el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* 2. ALMACENAMIENTO ----------------------------------------------- */
const LS = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); if (S.user && k.startsWith('auri.')) { try { sbHook(k); } catch {} } return true; } catch { toast('No se pudo guardar: almacenamiento lleno'); return false; } }
};
const S = { user: LS.get('auri.session', null), theme: LS.get('auri.themeSet', false) ? LS.get('auri.theme', 'auto') : 'auto', stories: [], favs: [], progress: {}, character: {} };
const uk = n => `auri.u.${S.user}.${n}`;           // datos separados por cuenta
const emptyChar = () => ({ name: '', nickname: '', hair: '', eyes: '', personality: '' });
const saveChars = () => LS.set(uk('chars'), { list: S.chars, active: S.activeId });
const MAX_CHARS = 10;                                  // cuántos personajes puede guardar cada persona
function loadChars() {
  const saved = LS.get(uk('chars'), null), old = LS.get(uk('reader'), null);
  const list = saved && saved.list ? saved.list : old && old.name ? [{ id: 1, ...emptyChar(), ...old }] : [];   // migra la tarjeta única anterior
  S.chars = list.filter(c => c.name || c.photo).slice(0, MAX_CHARS);
  S.activeId = saved ? saved.active : S.chars[0] && S.chars[0].id;
  S.character = S.chars.find(c => c.id === S.activeId) || S.chars[0] || { id: 0, ...emptyChar() }; S.activeId = S.character.id;
}
function setActive(id) { S.character = S.chars.find(c => c.id === id) || S.chars[0] || { id: 0, ...emptyChar() }; S.activeId = S.character.id; saveChars(); }
function loadUser() {
  fixRoles();                                          // el rol OWNER es solo del correo de la dueña; todas las demás cuentas son USER (o MODERATOR si aceptaron)
  S.stories = LS.get(uk('stories'), []).map(norm); S.favs = LS.get(uk('favs'), []);
  S.progress = LS.get(uk('progress'), {}); S.pos = LS.get(uk('pos'), {}); S.lib = LS.get(uk('lib'), []); S.cols = LS.get(uk('cols'), []); S.cfg = LS.get(uk('cfg'), {}); loadChars(); applyReading();
}
function applyTheme() {                                 // 'light' | 'dark' | 'auto' (sigue el modo del teléfono)
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.classList.toggle('dark', S.theme === 'dark' || (S.theme === 'auto' && !!(mq && mq.matches)));
  LS.set('auri.theme', S.theme);
  applyAccent();
}
const ACCENTS = ['rosa', 'azul', 'naranja'];
function accentOf(e) { const a = e === S.user ? cfg('accent') : ((getUsers()[e] || {}).accent || ''); return ACCENTS.includes(a) ? a : ''; }
function applyAccent() {                                // color de la app: el tuyo, o el de la persona cuyo perfil estás viendo
  let ac = ''; try { const m = /^#\/user\/([^/?]+)/.exec(location.hash || ''), v = m ? decodeURIComponent(m[1]) : null; ac = v && v !== S.user ? accentOf(v) : (S.user ? accentOf(S.user) : ''); } catch (e) { }
  if (ac) document.documentElement.dataset.accent = ac; else delete document.documentElement.dataset.accent;
}
/* --- Ajustes (se guardan por cuenta) --- */
const APP_VERSION = '0.9 (beta)';
const CFG_DEFAULTS = { align: 'left', margin: 'md', sepStyle: 'classic', rbg: 'auto', dropcap: true, fontSize: 'md', font: 'serif', lh: 'normal', music: 'ask', musicLast: '', skipReadAs: false, pcom: 'tap', spoilers: 'hide', showMature: null, lang: 'es', otherComm: 'no', hideStrikeBtn: false, hideBugFab: false, avoidTags: [], avoidWarns: [], hideDone: true, accent: 'violeta', showOnline: true, modShuffle: true, notif: { chapter: true, like: true, comment: true, follow: true } };
const cfg = k => {
  const c = S.cfg || {};
  if (k === 'showMature') { const u = getUsers()[S.user]; if (isMinor(u)) return false; return c.showMature == null ? isAdult(u) : c.showMature; }   // por defecto: visible solo si ya declaraste ser mayor de edad
  if (k === 'notif') return { ...CFG_DEFAULTS.notif, ...(c.notif || {}) };
  return c[k] ?? CFG_DEFAULTS[k];
};
const READ = { pad: { sm: '12px', md: '20px', lg: '34px' }, wd: { sm: '760px', md: '680px', lg: '600px' }, size: { sm: '17px', md: '19px', lg: '22px' }, lh: { compact: '1.7', normal: '1.95', relaxed: '2.25' }, font: { serif: 'var(--serif)', sans: 'var(--sans)' } };
const FONTS = [['serif', 'Clásica', null], ['sans', 'Moderna', null], ['lora', 'Lora', 'Lora:ital,wght@0,400;0,700;1,400;1,700'], ['literata', 'Literata', 'Literata:ital,wght@0,400;0,700;1,400;1,700'], ['crimson', 'Crimson Pro', 'Crimson+Pro:ital,wght@0,400;0,700;1,400;1,700'], ['garamond', 'EB Garamond', 'EB+Garamond:ital,wght@0,400;0,700;1,400;1,700'], ['merri', 'Merriweather', 'Merriweather:ital,wght@0,400;0,700;1,400;1,700'], ['baskerville', 'Libre Baskerville', 'Libre+Baskerville:ital,wght@0,400;0,700;1,400'], ['nunito', 'Nunito', 'Nunito:ital,wght@0,400;0,700;1,400;1,700'], ['atkinson', 'Atkinson', 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700']];
const FONT_CSS = { lora: "'Lora',Georgia,serif", literata: "'Literata',Georgia,serif", crimson: "'Crimson Pro',Georgia,serif", garamond: "'EB Garamond',Georgia,serif", merri: "'Merriweather',Georgia,serif", baskerville: "'Libre Baskerville',Georgia,serif", nunito: "'Nunito',system-ui,sans-serif", atkinson: "'Atkinson Hyperlegible',system-ui,sans-serif" };
Object.assign(READ.font, FONT_CSS);
const FONT_LOADED = new Set();
function loadFont(k) {                                  // carga la fuente solo cuando se usa (Google Fonts)
  const f = FONTS.find(x => x[0] === k); if (!f || !f[2] || FONT_LOADED.has(k) || !document.head) return; FONT_LOADED.add(k);
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + f[2] + '&display=swap'; document.head.appendChild(l);
}
/* Formato dentro del texto: **negrita** y *cursiva* (se escribe con los botones A del editor) */
const fmtText = h => String(h).replace(/\*\*([^\s*](?:[^*\n]*?[^\s*])?)\*\*/g, '<strong>$1</strong>').replace(/\*([^\s*](?:[^*\n]*?[^\s*])?)\*/g, '<em>$1</em>');
function applyReading() {                               // tamaño, interlineado y tipografía del lector, como variables CSS
  const r = document.documentElement.style; if (!r || !r.setProperty) return;
  r.setProperty('--read-size', READ.size[cfg('fontSize')]); r.setProperty('--read-lh', READ.lh[cfg('lh')]); r.setProperty('--read-font', READ.font[cfg('font')] || READ.font.serif); loadFont(cfg('font')); r.setProperty('--read-pad', READ.pad[cfg('margin')] || '20px'); r.setProperty('--read-w', READ.wd[cfg('margin')] || '680px'); document.documentElement.dataset.rbg = cfg('rbg'); document.documentElement.dataset.dropcap = cfg('dropcap') ? '1' : '0'; r.setProperty('--read-align', cfg('align') === 'justify' ? 'justify' : 'left');
  document.documentElement.lang = uiLang();
}
function setCfg(k, v) { S.cfg = { ...S.cfg, [k]: v }; LS.set(uk('cfg'), S.cfg); applyReading(); if (k === 'showOnline') { LAST_ON = null; sbBeat(); } }
const matureOK = s => cfg('showMature') || !s.mature || s.owner === S.user;   // ocultar +18 (tus propias obras siempre se ven)
/** Historias publicadas por cualquier cuenta de este dispositivo */
/** Normaliza historias antiguas: el estado de moderación pasa a cada capítulo */
const chapId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);   // id único y numérico por capítulo
const norm = s => {
  const { status, reason, ...r } = s, lg = { published: 'approved', pending: 'pending', rejected: 'rejected' }[status] || 'draft', seen = new Set();
  const chapters = (r.chapters || [{ id: 1, title: r.chapterTitle || 'Capítulo 1', text: r.chapterText || '' }]).map(c => {
    let id = c.id; while (id == null || seen.has(id)) id = chapId(); seen.add(id);        // sin ids repetidos
    return { status: lg, ...(status === 'rejected' && reason ? { reason } : {}), ...c, id };
  });
  return { cover: '', tags: [], warns: [], mature: false, phase: 'ongoing', prev: '', ...r, chapters };
};
/** Con la nube activa, las cuentas que solo viven en este navegador (antiguas, de prueba o de otra persona que entró aquí) no cuentan:
 *  solo se ve tu cuenta y la copia de las demás que viene de Supabase. Así no salen personas duplicadas. */
const isLiveUser = (e, u) => { if (!cloud()) return true; if (!u) return false; if (e === S.user) return true; if (!u.remote) return false; const ss = sbSes(); return !(ss && u.uid === ss.uid); };
function allStories() {                       // incluye historias de todas las cuentas del dispositivo
  const users = LS.get('auri.users', {}); let all = [];
  for (const email in users) if (isLiveUser(email, users[email])) all = all.concat(LS.get(`auri.u.${email}.stories`, []).map(s => ({ ...norm(s), author: users[email].name, owner: email })));
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/** Lo que ve el público: capítulos aprobados (o la última versión aprobada de uno que se está editando) */
const pubChapter = c => c.status === 'approved' ? c : c.live ? { ...c, status: 'approved', title: c.live.title, text: c.live.text, music: c.live.music, cover: c.live.cover } : null;
/** Solo es público el tramo de capítulos aprobados en orden consecutivo (1, 2, 3…) desde el primero */
const publicPrefix = chs => { const out = []; for (let idx = 0; idx < chs.length; idx++) { const p = pubChapter(chs[idx]); if (!p) break; out.push({ ...p, idx }); } return out; };
const takedown = () => G.get('takedown', []);                     // obras retiradas de Descubrir por moderación
const pubAll = () => allStories().filter(s => !s.private).map(s => ({ ...s, chapters: publicPrefix(s.chapters) })).filter(s => s.chapters.length);      // las historias privadas no salen en ninguna lista pública
const publishedStories = () => pubAll().filter(s => !takedown().includes(s.id));
const pendingBooks = () => allStories().filter(s => !s.private && s.chapters.some(c => c.status === 'pending'));
/** Lo que se muestra al abrir una historia: SIEMPRE lo que ve el público (solo capítulos aprobados), también para su autoría.
 *  Solo si la obra aún no es pública (nada aprobado) la autoría abre su copia completa para poder leerla. */
const findStory = id => {
  const pub = publishedStories().find(s => s.id === id); if (pub) return pub;
  if (isStaff()) { const t = pubAll().find(s => s.id === id); if (t) return t; }     // el equipo puede abrir obras retiradas para analizarlas
  const m = S.stories.find(s => s.id === id);
  return m ? { ...m, owner: S.user, author: userName(), chapters: m.chapters.map((c, idx) => ({ ...c, idx })) } : undefined;
};
const ownOf = s => S.stories.find(x => x.id === s.id) || s;     // la copia completa de la autoría (con capítulos en revisión)

/* DATOS SOCIALES (compartidos entre las cuentas de este dispositivo) */
const G = { get: (k, f) => LS.get('auri.' + k, f), set: (k, v) => { const r = LS.set('auri.' + k, v); if (k === 'users') sbProfileSoon(); return r; } };
const getUsers = () => G.get('users', {});
const uName = e => (getUsers()[e] || {}).name || 'Usuario';
/* ROLES: OWNER (solo este correo, para siempre) · MODERATOR (por invitación de la Owner) · USER (todas las demás cuentas).
   OJO: sin servidor esto es solo una barrera de interfaz; la seguridad real se aplica en el backend con correo verificado. */
const OWNER_EMAIL = 'aurihistoryapp@gmail.com';
const roleOf = e => { e = String(e || '').toLowerCase(); if (e === OWNER_EMAIL && !cloud()) return 'OWNER'; const r = (getUsers()[e] || {}).role; return r === 'OWNER' && cloud() ? 'OWNER' : r === 'ADMIN' ? 'ADMIN' : r === 'MODERATOR' ? 'MODERATOR' : 'USER'; };
const isOwner = () => !!S.user && roleOf(S.user) === 'OWNER';
const isMod = () => !!S.user && roleOf(S.user) === 'MODERATOR';
const isAdm = () => !!S.user && roleOf(S.user) === 'ADMIN';                // Administración (se llega solo desde Moderación, por invitación de la Owner)
const isStaff = () => !!S.user && roleOf(S.user) !== 'USER';              // Owner, Administración o Moderación: revisan capítulos
const canNews = () => isStaff();                                           // publicar anuncios: Owner, Administración y Moderación (Moderación pasa por aprobación)
const isAdmin = isOwner;                                   // panel general (revisar capítulos, noticias, borrar comentarios): solo la Owner
function fixRoles() {                                      // normaliza: cada cuenta guarda su rol; nadie más puede quedar como OWNER
  const us = getUsers(); let ch = false;
  for (const e in us) { const want = (e === OWNER_EMAIL && !cloud()) || (cloud() && us[e].role === 'OWNER') ? 'OWNER' : us[e].role === 'ADMIN' ? 'ADMIN' : us[e].role === 'MODERATOR' ? 'MODERATOR' : 'USER'; if (us[e].role !== want) { us[e].role = want; ch = true; } }
  if (ch) G.set('users', us);
}
const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Administración', MODERATOR: 'Moderación', USER: '' };
/* COMUNIDADES: Español (es) e Inglés (en). Cada cuenta pertenece a una; el equipo modera solo las suyas (la Owner, ambas) */
const COMMS = { es: 'Español', en: 'English' };
/** Región del dispositivo: Latinoamérica → Español; Estados Unidos y el resto del mundo → English (si el teléfono está en español, también Español). Solo es la sugerencia inicial */
const LATAM_TZ = /^(America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Mazatlan|Hermosillo|Tijuana|Bahia_Banderas|Bogota|Lima|Guayaquil|Caracas|La_Paz|Santiago|Punta_Arenas|Asuncion|Montevideo|Panama|Costa_Rica|Guatemala|El_Salvador|Tegucigalpa|Managua|Havana|Santo_Domingo|Puerto_Rico|Argentina\/.+|Buenos_Aires|Cordoba|Mendoza|Catamarca|Jujuy)|Pacific\/(Easter|Galapagos)|Chile\/.+)$/;
function detectComm() {
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; if (LATAM_TZ.test(tz)) return 'es'; } catch {}
  const l = String((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
  return l.startsWith('es') ? 'es' : 'en';
}
const commOf = e => (getUsers()[e] || {}).community === 'en' ? 'en' : 'es';
const myComm = () => S.user && !isGuest() ? commOf(S.user) : detectComm();
/* --- Idioma de la interfaz (i18n): t('texto en español', {vars}) → en inglés se busca en I18N.en; si falta, queda en español --- */
let UILANG = null;
const uiSetting = () => { const v = LS.get('auri.ui', 'auto'); return v === 'es' || v === 'en' ? v : 'auto'; };
const uiLang = () => UILANG || (UILANG = uiSetting() === 'auto' ? myComm() : uiSetting());      // 'auto' sigue a la comunidad de la cuenta (o a la región si no hay sesión)
const uiReset = () => { UILANG = null; document.documentElement.lang = uiLang(); };
const t = (s, v) => { let r = uiLang() === 'en' && window.I18N && I18N.en[s] != null ? I18N.en[s] : s; return v ? r.replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m) : r; };
const tx = (s, c, v) => uiLang() === 'en' && window.I18N && I18N.en[s + '@' + c] != null ? t(s + '@' + c, v) : t(s, v);   // misma frase en español, distinta traducción según el contexto
const tn = (n, one, other, v) => t(n === 1 ? one : other, { n, ...v });
const LOC = () => uiLang() === 'en' ? 'en' : 'es';                     // para toLocaleString y similares
const YN = () => uiLang() === 'en' ? 'YN' : 'TN';                      // cómo se escribe «nombre del lector» en cada idioma
const staffScope = e => { const r = roleOf(e); if (r === 'OWNER') return ['es', 'en']; if (r === 'USER') return []; const sc = ((getUsers()[e] || {}).scope || []).filter(x => COMMS[x]); return sc.length ? sc : [commOf(e)]; };
let MODC = 'all';                                                       // comunidad elegida en Moderación (solo si el equipo cubre ambas)
const modSel = () => staffScope(S.user).length > 1 ? MODC : 'all';
const inScope = c => c === 'all' || (staffScope(S.user).includes(c) && (modSel() === 'all' || modSel() === c));
const postComm = o => o && (o.comm === 'es' || o.comm === 'en') ? o.comm : 'all';    // sin comunidad = se ve en las dos (lo anterior)
const commVisible = c => c === 'all' || c === myComm() || cfg('otherComm') === 'yes' || (isStaff() && staffScope(S.user).includes(c));
const storyVisible = s => commVisible(commOf(s.owner));
const staffFor = c => [...new Set([OWNER_EMAIL, ...Object.keys(getUsers()).filter(e => roleOf(e) !== 'USER' && (c === 'all' || staffScope(e).includes(c)))])];
/** ¿La persona en sesión puede aplicar acciones de administración sobre esta cuenta? Owner: a todas menos a sí misma. Moderación: solo a USER. */
function canAct(tg) {
  tg = String(tg || '').toLowerCase(); if (!S.user || tg === S.user || !getUsers()[tg]) return false;
  const me = roleOf(S.user), tr = roleOf(tg);
  if (me !== 'OWNER' && !staffScope(S.user).includes(commOf(tg))) return false;      // Moderación y Administración actúan solo en su comunidad
  return me === 'OWNER' ? tr !== 'OWNER' : me === 'ADMIN' ? (tr === 'USER' || tr === 'MODERATOR') : me === 'MODERATOR' ? tr === 'USER' : false;   // strikes y suspensiones
}
const strikesOf = e => ((getUsers()[e] || {}).strikes || []).filter(x => !x.void);          // los anulados no cuentan
const activeBan = e => { const b = (getUsers()[e] || {}).ban; if (!b) return null; if (b.until && Date.parse(b.until) <= Date.now()) return null; return b; };
function logAction(type, target, extra, by) {
  if (modCloud() && S.user && !by) { const tu = sbIds(getUsers()).uid(target); sbApi('/rest/v1/modlog', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { type, by: sbSes().uid, target: tu || String(target || ''), extra: String(extra || '') } }); return; }
  const l = G.get('modlog', []); l.unshift({ id: Date.now() + Math.random().toString(36).slice(2, 5), type, by: by || S.user, target, extra: extra || '', date: new Date().toISOString() }); G.set('modlog', l.slice(0, 1000)); }
function pushNotif(to, o) { if (sbOut(to, o)) return; const k = 'notifs.' + to, l = G.get(k, []); l.unshift({ id: Date.now() + Math.random().toString(36).slice(2, 6), from: '', storyId: '', extra: '', chap: '', date: new Date().toISOString(), read: false, ...o }); G.set(k, l.slice(0, 100)); }
/* Acciones con verificación de permisos (devuelven un texto de error o '' si todo salió bien) */
function giveStrike(tg, reason) {
  reason = String(reason || '').trim(); if (!canAct(tg)) return t('No tienes permiso para esta acción.'); if (reason.length < 3) return t('Escribe el motivo del strike.');
  { const cu = modUid(tg); if (cu) return modDo('give_strike', { target: cu, reason: reason.slice(0, 500) }); }
  const us = getUsers(), id = 's' + Date.now().toString(36), arr = [...(us[tg].strikes || []), { id, reason: reason.slice(0, 500), by: S.user, date: new Date().toISOString() }];
  us[tg].strikes = arr; G.set('users', us); pushNotif(tg, { type: 'strike', extra: id }); logAction('strike', tg, reason.slice(0, 120)); return '';
}
const canBan = () => isOwner() || isAdm();             // suspender o bloquear: solo Administración y Owner
const appealsAll = () => G.get('appeals', []);
const openAppeals = () => appealsAll().filter(a => a.status === 'open' && inScope(commOf(a.user))).length;
const myAppeal = b => b && appealsAll().find(a => a.user === S.user && a.banDate === b.date);
function submitAppeal(text, imgs) {
  const b = activeBan(S.user); if (!b) return t('La cuenta ya no está suspendida.');
  text = String(text || '').trim(); if (text.length < 10) return t('Cuenta qué ocurrió con al menos 10 caracteres.');
  if (myAppeal(b)) return t('Ya se envió una apelación para esta decisión.');
  if (modCloud()) return sbImgConv((imgs || []).slice(0, 4)).then(im => modDo('submit_appeal', { txt: text.slice(0, 1000), imgs: im }));
  const l = appealsAll(); l.unshift({ id: Date.now(), user: S.user, banDate: b.date, ban: { reason: b.reason, by: b.by, until: b.until || null }, text: text.slice(0, 1000), imgs: (imgs || []).slice(0, 4), date: today(), status: 'open' });
  if (!G.set('appeals', l)) return t('No se pudo guardar. Prueba con menos imágenes o más livianas.');
  return '';
}
function annulStrike(tg, sid, reason) {
  reason = String(reason || '').trim(); if (!canAct(tg) || !canBan()) return t('Solo Administración y Owner pueden anular strikes.'); if (reason.length < 3) return t('Escribe el motivo de la anulación.');
  if (isUuid(sid) && modUid(tg)) return modDo('annul_strike', { sid, reason: reason.slice(0, 300) });
  const us = getUsers(), l = us[tg].strikes || [], i = l.findIndex(x => x.id === sid); if (i < 0) return t('Ese strike ya no existe.');
  l[i] = { ...l[i], void: { by: S.user, date: new Date().toISOString(), reason: reason.slice(0, 300) } }; us[tg].strikes = l; G.set('users', us);
  pushNotif(tg, { type: 'sys', extra: 'Un strike de tu cuenta fue anulado: {r}', xv: { r: reason.slice(0, 120) } }); logAction('strike-annul', tg, reason.slice(0, 100)); return '';
}
function applyBan(tg, days, reason) {
  reason = String(reason || '').trim(); if (!canAct(tg) || !canBan()) return t('Solo Administración y Owner pueden suspender o bloquear cuentas.'); if (reason.length < 3) return t('Escribe el motivo de la suspensión.');
  { const cu = modUid(tg); if (cu) return modDo('ban_user', { target: cu, days: +days > 0 ? +days : 0, reason: reason.slice(0, 500) }); }
  const us = getUsers(), d = +days; us[tg].ban = { reason: reason.slice(0, 500), by: S.user, date: new Date().toISOString(), until: d > 0 ? new Date(Date.now() + d * 864e5).toISOString() : null };
  G.set('users', us); logAction('ban', tg, (d > 0 ? d + ' día(s): ' : 'permanente: ') + reason.slice(0, 100)); return '';
}
function liftBan(tg) {
  if (!canAct(tg) || !canBan()) return t('Solo Administración y Owner pueden levantar una suspensión.');
  { const cu = modUid(tg); if (cu) return modDo('lift_ban', { target: cu }); }
  const us = getUsers(); delete us[tg].ban; G.set('users', us); logAction('unban', tg);
  G.set('appeals', appealsAll().map(a => a.user === tg && a.status === 'open' ? { ...a, status: 'released', handledBy: S.user, handledDate: today(), note: 'Cuenta liberada' } : a)); return '';
}
/* --- Cuenta de prueba «RiRi» (simula a otra persona). Para quitarla: Ajustes › Cuenta › Eliminar cuenta, o borra este bloque --- */
const TEST_EMAIL = 'lauwu82@gmail.com', TEST_PASS = 'RiRi12345';
async function seedTest() {
  try { if (localStorage.getItem('auri.testseeded')) return; const us = getUsers(); if (us[TEST_EMAIL]) { localStorage.setItem('auri.testseeded', '1'); return; }
    const salt = 'riri', hash = await sha(salt + TEST_PASS);
    us[TEST_EMAIL] = { name: 'RiRi', salt, hash, birth: '2000-01-01', gender: 'Mujer', interests: [], onboarded: true, termsAccepted: today(), created: today(), role: 'USER', strikes: [], test: true };
    G.set('users', us); localStorage.setItem('auri.testseeded', '1'); } catch (e) {}
}
function testRole(tg, role) {                           // solo Owner y solo sobre la cuenta de prueba: cambia el rol al instante (sin invitación) y pone el marco
  if (!isOwner() || !(getUsers()[tg] || {}).test) return; const us = getUsers();
  us[tg].role = role; us[tg].frameWorn = role !== 'USER'; G.set('users', us); logAction('test-role-' + role.toLowerCase(), tg);
}
function inviteRole(tg, role) {                          // solo la Owner asciende: USER → Moderación, Moderación → Administración
  if (!isOwner()) return t('Solo la Owner puede hacer ascensos.'); if (!canAct(tg)) return t('No tienes permiso para esta acción.');
  const u = getUsers()[tg], cur = roleOf(tg);
  if (role === 'MODERATOR' && cur !== 'USER') return t('Esta persona ya es parte del equipo.');
  if (role === 'ADMIN' && cur !== 'MODERATOR') return t('Solo una persona moderadora puede ascender a administración.');
  if (!isAdult(u)) return t('Solo personas mayores de 18 años pueden ser parte del equipo.');
  if (G.get('notifs.' + tg, []).some(n => n.type === 'modinvite' && !n.done)) return t('Ya tiene una invitación pendiente.');
  { const cu = modUid(tg); if (cu) return modDo('invite_role', { target: cu, new_role: role }); }
  pushNotif(tg, { type: 'modinvite', role, from: S.user }); logAction('invite-' + role.toLowerCase(), tg); return '';
}
const inviteMod = tg => inviteRole(tg, 'MODERATOR');
const myInvite = nid => G.get('notifs.' + S.user, []).find(n => n.id === nid && n.type === 'modinvite' && !n.done);
function answerInvite(nid, res) { const k = 'notifs.' + S.user; G.set(k, G.get(k, []).map(n => n.id === nid ? { ...n, done: res } : n)); }
function acceptInvite(nid) {
  const n = myInvite(nid), u = getUsers()[S.user]; if (!n) return t('Esta invitación ya no está disponible.');
  const want = n.role === 'ADMIN' ? 'ADMIN' : 'MODERATOR', cur = roleOf(S.user);
  if ((want === 'MODERATOR' && cur !== 'USER') || (want === 'ADMIN' && cur !== 'MODERATOR')) return t('Tu cuenta no puede aceptar esta invitación.');
  if (!isAdult(u)) return t('Solo personas mayores de 18 años pueden ser parte del equipo.');
  if (isUuid(nid) && modCloud()) return modDo('answer_invite', { nid, accept: true }, () => answerInvite(nid, 'accepted'));
  const us = getUsers(); us[S.user].role = want; us[S.user][want === 'ADMIN' ? 'admSince' : 'modSince'] = new Date().toISOString(); us[S.user].frameWorn = false; G.set('users', us);   // el marco nuevo es obligatorio
  answerInvite(nid, 'accepted'); pushNotif(OWNER_EMAIL, { type: 'sys', extra: want === 'ADMIN' ? '{n} aceptó tu invitación y ya es parte de la administración.' : '{n} aceptó tu invitación y ya es parte de la moderación.', xv: { n: u.name } }); logAction('accept-' + want.toLowerCase(), S.user); return '';
}
function declineInvite(nid) { const n = myInvite(nid); if (!n) return; answerInvite(nid, 'declined'); if (isUuid(nid) && modCloud()) { modDo('answer_invite', { nid, accept: false }); return; } pushNotif(OWNER_EMAIL, { type: 'sys', extra: n.role === 'ADMIN' ? '{n} rechazó la invitación a la administración.' : '{n} rechazó la invitación a la moderación.', xv: { n: uName(S.user) } }); }
function revokeMod(tg) {                                // "descender": Owner (Administración → Moderación, Moderación → USER) · Administración (Moderación → USER)
  const tr = roleOf(tg); if (!S.user || tg === S.user) return t('No tienes permiso para esta acción.');
  if (!(isOwner() ? (tr === 'MODERATOR' || tr === 'ADMIN') : isAdm() ? tr === 'MODERATOR' : false)) return t('No tienes permiso para esta acción.');
  { const cu = modUid(tg); if (cu) return modDo('revoke_role', { target: cu }); }
  const us = getUsers();
  if (tr === 'ADMIN') { us[tg].role = 'MODERATOR'; us[tg].frameWorn = true; delete us[tg].admSince; } else { us[tg].role = 'USER'; delete us[tg].frameWorn; delete us[tg].modSince; }
  G.set('users', us); pushNotif(tg, { type: 'sys', extra: tr === 'ADMIN' ? 'Tu rol de administración ha finalizado: sigues en el equipo de moderación.' : 'Tu participación en el equipo de moderación de Auri Studios ha finalizado.' });
  logAction(tr === 'ADMIN' ? 'demote-admin' : 'revoke', tg); return '';
}
/* Marcos de perfil: el de Owner solo existe para la Owner; el de moderación es obligatorio y no se puede quitar */
const FR_NAME = { own: 'Insignia de Owner', mod: 'Insignia de moderación', adm: 'Insignia de administración', top: 'Insignia Top 50' };
const frameLocked = e => ['MODERATOR', 'ADMIN'].includes(roleOf(e));                      // moderación y administración: su marco es fijo
function ownedFrames(e) { const u = getUsers()[e] || {}, l = []; if (roleOf(e) === 'OWNER') l.push('own'); if (u.frameTop) l.push('top'); return l; }   // los que esta persona tiene para elegir
const frameKey = e => {
  const r = roleOf(e), u = getUsers()[e] || {};
  if (r === 'ADMIN' && u.frameWorn) return 'adm'; if (r === 'MODERATOR' && u.frameWorn) return 'mod';       // el marco del rol manda y no se quita
  const own = ownedFrames(e); let sel = u.frameSel; if (sel === undefined && r === 'OWNER' && u.frameOn === false) sel = '';
  if (sel === '') return ''; return sel && own.includes(sel) ? sel : (own[0] || '');
};
/** Adornos de perfil (rediseño Cozy & Premium con volumen, sombra e iluminación).
 *  Sin líneas negras: el contorno es siempre un tono más oscuro del propio color.
 *  Abajo: A de Auri (Owner/Admin/Mod) o badge Top 50.
 *  Arriba: corona de Owner o moñito (colores de prueba). */
const BOWS = {
  white:  ['#f8f4fc', '#d4c8e0', '#b8a8c8', 'Blanco'],
  pink:   ['#f5d0de', '#e0a0b8', '#c07898', 'Rosa'],
  blue:   ['#d0e4f5', '#a0c0e0', '#7898c0', 'Azul claro'],
  red:    ['#f0b8b8', '#d88888', '#b86060', 'Rojo'],
  purple: ['#d8c8f0', '#b098d8', '#8870b8', 'Morado'],
  yellow: ['#f5e8b0', '#e0c878', '#c0a050', 'Amarillo'],
  green:  ['#c8e8d0', '#98c8a8', '#70a880', 'Verde']
};
/* Imágenes (PNG) de los adornos: aquí se pone el enlace de cada una, tal cual. Vacío = no se dibuja nada.
 *  Abajo: own (A de Owner), adm (A de administración), mod (A de moderación), top (50 del Top 50).
 *  Arriba: crown (corona de Owner) y los moñitos bow:white, bow:pink, bow:blue, bow:red, bow:purple, bow:yellow, bow:green, bow:orange. */
const COS_IMG = {
  own: 'https://i.postimg.cc/50kkVVhM/Photoroom-20261029-075816.png', adm: 'https://i.postimg.cc/W1wVPdXt/Photoroom-20261029-075830.png', mod: 'https://i.postimg.cc/6p0kmD5F/Photoroom-20261029-075844.png',
  top: 'https://i.postimg.cc/wxQP4XrM/Photoroom-20261029-062250.png', 'top:dark': 'https://i.postimg.cc/mksvzV6j/Photoroom-20261029-062208.png', crown: '',
  'bow:white': 'https://i.postimg.cc/rFzdZJpr/Photoroom-20261029-055834.png', 'bow:pink': 'https://i.postimg.cc/JzLLHrSt/Photoroom-20261029-060108.png', 'bow:blue': 'https://i.postimg.cc/259MGr94/Photoroom-20261029-060048.png',
  'bow:red': 'https://i.postimg.cc/zvCxsr7s/Photoroom-20261029-060014.png', 'bow:purple': 'https://i.postimg.cc/rFhmStCW/IMG-2622.png', 'bow:yellow': 'https://i.postimg.cc/GpTx0Rh9/Photoroom-20261029-055933.png',
  'bow:green': 'https://i.postimg.cc/ncd4CrX3/Photoroom-20261029-055905.png'
};
const AURI_LOGO = 'https://i.postimg.cc/QxZvxXBC/Photoroom-20261029-075902.png';
const cosOne = (k, c = '') => COS_IMG[k] ? `<img${c ? ` class="${c}"` : ''} src="${esc(COS_IMG[k])}" alt="" referrerpolicy="no-referrer" decoding="async">` : '';
const cosImg = k => k === 'top' ? cosOne('top', 'v-l') + cosOne('top:dark', 'v-d') : cosOne(k);   // Top 50: una versión clara y otra oscura, según el tema
const svgBot = cosImg, svgTop = cosImg;
const bowsOf = e => roleOf(e) === 'OWNER' ? Object.keys(BOWS) : ((getUsers()[e] || {}).bows || []).filter(k => BOWS[k]);   // lazos que tiene esa persona (la Owner tiene todos)
const topKey = e => {                                    // adorno de arriba que se muestra para esa persona
  const u = getUsers()[e] || {}, c = u.cosTop;
  if (roleOf(e) !== 'OWNER') return typeof c === 'string' && /^bow:/.test(c) && bowsOf(e).includes(c.split(':')[1]) ? c : '';   // un lazo regalado solo se ve si sigue siendo suyo
  if (c === undefined || c === null) return 'crown'; if (c === 'crown') return 'crown'; return /^bow:/.test(c) && BOWS[c.split(':')[1]] ? c : (c === '' ? '' : 'crown');
};
const ornHTMLk = (bot, top) => (top && cosImg(top) ? `<span class="orn orn-top ${top === 'crown' ? 'crown' : 'bow'}">${cosImg(top)}</span>` : '') + (bot && cosImg(bot) ? `<span class="orn orn-bot ${bot === 'top' ? 'b50' : 'bA'}">${cosImg(bot)}</span>` : '');
const nmCls = e => ({ OWNER: 'nm-own', ADMIN: 'nm-adm', MODERATOR: 'nm-mod' }[roleOf(e)] || '');   // solo el equipo tiene el usuario con color
const ornHTML = e => ornHTMLk(frameKey(e), topKey(e));
/* --- Forma y borde de la foto de perfil (por ahora solo la Owner; todo queda guardado para ponerlo a la venta después) --- */
const SHAPES = { '': 'Círculo', cat: 'Gato', heart: 'Corazón', star: 'Estrella', flower: 'Flor', cloud: 'Nube' };
const SHAPE_D = {"cat": "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.22 0.06L.44 .2ZM.56 .2L0.78 0.06L.89 .44Z", "heart": "M.5 .95C.1 .66 .02 .42 .08 .27C.15 .08 .39 .06 .5 .27C.61 .06 .85 .08 .92 .27C.98 .42 .9 .66 .5 .95Z", "star": "M0.466 0.111Q0.5 0.05 0.534 0.111L0.624 0.271Q0.659 0.332 0.727 0.345L0.907 0.382Q0.976 0.395 0.928 0.447L0.804 0.582Q0.757 0.633 0.765 0.703L0.786 0.885Q0.794 0.955 0.73 0.925L0.564 0.849Q0.5 0.82 0.436 0.849L0.27 0.925Q0.206 0.955 0.214 0.885L0.235 0.703Q0.243 0.633 0.196 0.582L0.072 0.447Q0.024 0.395 0.093 0.382L0.273 0.345Q0.341 0.332 0.376 0.271Z", "flower": "M0.3 0.5A0.2 0.2 0 1 1 0.7 0.5A0.2 0.2 0 1 1 0.3 0.5ZM0.3 0.23A0.2 0.2 0 1 1 0.7 0.23A0.2 0.2 0 1 1 0.3 0.23ZM0.534 0.365A0.2 0.2 0 1 1 0.934 0.365A0.2 0.2 0 1 1 0.534 0.365ZM0.534 0.635A0.2 0.2 0 1 1 0.934 0.635A0.2 0.2 0 1 1 0.534 0.635ZM0.3 0.77A0.2 0.2 0 1 1 0.7 0.77A0.2 0.2 0 1 1 0.3 0.77ZM0.066 0.635A0.2 0.2 0 1 1 0.466 0.635A0.2 0.2 0 1 1 0.066 0.635ZM0.066 0.365A0.2 0.2 0 1 1 0.466 0.365A0.2 0.2 0 1 1 0.066 0.365Z", "cloud": "M0.1 0.56A0.2 0.2 0 1 1 0.5 0.56A0.2 0.2 0 1 1 0.1 0.56ZM0.25 0.42A0.27 0.27 0 1 1 0.79 0.42A0.27 0.27 0 1 1 0.25 0.42ZM0.54 0.56A0.2 0.2 0 1 1 0.94 0.56A0.2 0.2 0 1 1 0.54 0.56ZM0.1 0.66A0.16 0.16 0 1 1 0.42 0.66A0.16 0.16 0 1 1 0.1 0.66ZM0.58 0.66A0.16 0.16 0 1 1 0.9 0.66A0.16 0.16 0 1 1 0.58 0.66ZM.26 .5H.74V.82H.26Z"};
const CAT_TW = ["M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.22 0.06L.44 .2ZM.56 .2L0.78 0.06L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.16 0.1L.44 .2ZM.56 .2L0.78 0.06L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.26 0.03L.44 .2ZM.56 .2L0.78 0.06L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.16 0.1L.44 .2ZM.56 .2L0.78 0.06L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.22 0.06L.44 .2ZM.56 .2L0.78 0.06L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.22 0.06L.44 .2ZM.56 .2L0.84 0.1L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.22 0.06L.44 .2ZM.56 .2L0.74 0.03L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.22 0.06L.44 .2ZM.56 .2L0.84 0.1L.89 .44Z", "M.08 .6A.42 .4 0 1 1 .92 .6A.42 .4 0 1 1 .08 .6ZM.11 .44L0.22 0.06L.44 .2ZM.56 .2L0.78 0.06L.89 .44Z"];
const HALOS = { pink: ['#f0a8c4', 'Rosa'], blue: ['#9cc4ec', 'Azul claro'], purple: ['#b79ce0', 'Morado'], mint: ['#9ed8b4', 'Menta'], yellow: ['#ecd47c', 'Amarillo'], peach: ['#f0b88c', 'Durazno'], white: ['#f4eefa', 'Blanco'], red: ['#e69090', 'Rojo'] };
function shapeDefs() {                              // recortes SVG compartidos (el gato mueve las orejitas cada 10 segundos)
  if (document.getElementById('shape-defs')) return;
  const tw = reduceMotion() ? '' : `<animate attributeName="d" dur="10s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.74;.8;.86;.9;.94;.97;.985;1" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values="${CAT_TW.join(';')}"/>`;
  const one = (k, d, extra = '') => `<clipPath id="sh-${k}" clipPathUnits="objectBoundingBox"><path d="${d}">${extra}</path></clipPath>`;
  document.body.insertAdjacentHTML('beforeend', `<svg id="shape-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${Object.keys(SHAPE_D).map(k => one(k, SHAPE_D[k], k === 'cat' ? tw : '')).join('')}</defs></svg>`);
}
const lookOf = e => { const u = getUsers()[e] || {}; if (roleOf(e) !== 'OWNER') return {}; return { shape: SHAPES[u.shape] && u.shape ? u.shape : '', halo: HALOS[u.halo] ? u.halo : '' }; };   // por ahora solo la Owner las tiene
const lookAttr = e => { const l = lookOf(e); return (l.shape ? ` data-shape="${l.shape}"` : '') + (l.halo ? ` data-halo="${l.halo}" style="--hc:${HALOS[l.halo][0]}"` : ''); };
const frWrap = (e, cls, av) => `<span class="fr ${cls}"${lookAttr(e)}>${av}${ornHTML(e)}</span>`;
const framedAvatar = (e, cls = '') => frWrap(e, cls, userAvatar(e, cls));
/* REGALOS (solo la Owner regala): marco exclusivo Top 50 · 53 cupos (50 para el top + 3 de prueba) · 24 h para reclamar */
const GIFT_TOTAL = 53, GIFT_MS = 24 * 3600 * 1000;
const giftsAll = () => G.get('gifts', []);
const giftLive = g => g.status === 'pending' || g.status === 'claimed';      // ocupan cupo; vencidos y retirados lo devuelven
const giftLeft = () => GIFT_TOTAL - giftsAll().filter(giftLive).length;
const leftTxt = iso => { const ms = Math.max(0, new Date(iso).getTime() - Date.now()), h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000); return h > 0 ? h + ' h ' + (m % 60) + ' min' : Math.max(1, m) + ' min'; };
function giftSweep() {                                  // los regalos sin reclamar a las 24 h se cancelan y el cupo vuelve a la Owner
  if (modCloud()) return;                                // en la nube lo hace el servidor
  const L = giftsAll(), now = Date.now(); let ch = false;
  L.forEach(g => { if (g.status === 'pending' && new Date(g.expires).getTime() <= now) {
    g.status = 'expired'; g.endDate = new Date().toISOString(); ch = true;
    pushNotif(OWNER_EMAIL, { type: 'sys', extra: 'El regalo para {n} venció sin reclamarse: el cupo volvió a ti.', xv: { n: uName(g.to) }, href: '#/moderation/gifts' });
    pushNotif(g.to, { type: 'sys', extra: 'Tu regalo (marco Top 50) se canceló porque pasaron 24 h sin reclamarlo.' });
    logAction('gift-expire', g.to, 'Marco Top 50 sin reclamar en 24 h · cupo devuelto', 'sistema'); } });
  if (ch) G.set('gifts', L);
}
function giftFind(raw) {                                // usuario (con o sin @) o correo
  const q = String(raw || '').trim().replace(/^@/, '').toLowerCase(); if (!q) return { err: t('Escribe el usuario o el correo.') };
  const us = getUsers(), ks = Object.keys(us), byMail = ks.find(e => e.toLowerCase() === q);
  if (byMail) return { e: byMail };
  const m = ks.filter(e => String((us[e] || {}).name || '').toLowerCase() === q);
  return m.length === 1 ? { e: m[0] } : m.length > 1 ? { err: t('Hay varias cuentas con ese nombre: usa el correo.') } : { err: t('No encontré esa cuenta.') };
}
function giftSend(raw) {
  if (!isOwner()) return t('Solo la Owner puede regalar.'); giftSweep();
  const f = giftFind(raw); if (f.err) return modCloud() ? giftSendCloud(raw, f.err) : f.err; const tg = f.e, u = getUsers()[tg];
  if (tg === S.user || roleOf(tg) === 'OWNER') return t('Ese marco es para otras cuentas.');
  if (u.frameTop || giftsAll().some(g => g.to === tg && g.status === 'pending')) return u.frameTop ? t('{n} ya tiene el marco.', { n: uName(tg) }) : t('{n} ya tiene un regalo pendiente.', { n: uName(tg) });
  if (giftLeft() <= 0) return t('Ya no quedan cupos: {n} de {n} en uso.', { n: GIFT_TOTAL });
  { const cu = modUid(tg); if (cu) return modDo('gift_send', { to_id: cu }); }
  const now = Date.now(), L = giftsAll(); L.unshift({ id: now + Math.random().toString(36).slice(2, 5), kind: 'top50', to: tg, by: S.user, date: new Date(now).toISOString(), expires: new Date(now + GIFT_MS).toISOString(), status: 'pending' }); G.set('gifts', L);
  pushNotif(tg, { type: 'sys', extra: '¡Te regalaron el marco exclusivo Top 50! Reclámalo en las próximas 24 h.', href: '#/gift' });
  logAction('gift-send', tg, 'Marco Top 50 · quedan ' + giftLeft() + ' de ' + GIFT_TOTAL); return '';
}
function giftClaim(id) {
  if (isUuid(id) && modCloud()) return modDo('gift_claim', { gid: id });
  giftSweep(); const L = giftsAll(), g = L.find(x => x.id === id); if (!g || g.to !== S.user) return t('Ese regalo no es tuyo.');
  if (g.status === 'expired') return t('Este regalo venció: pasaron 24 h sin reclamarlo.'); if (g.status !== 'pending') return t('Este regalo ya no está disponible.');
  g.status = 'claimed'; g.claimedDate = new Date().toISOString(); G.set('gifts', L);
  const us = getUsers(); if (us[S.user]) { us[S.user].frameTop = true; G.set('users', us); }
  pushNotif(OWNER_EMAIL, { type: 'sys', extra: '{n} reclamó su marco Top 50.', xv: { n: uName(S.user) }, href: '#/moderation/gifts' });
  logAction('gift-claim', S.user, 'Reclamó el marco Top 50'); return '';
}
function giftCancel(id) {
  if (!isOwner()) return; if (isUuid(id) && modCloud()) return modDo('gift_cancel', { gid: id }).then(e => e && toast(e)); const L = giftsAll(), g = L.find(x => x.id === id); if (!g || !giftLive(g)) return;
  const was = g.status; g.status = 'revoked'; g.endDate = new Date().toISOString(); G.set('gifts', L);
  if (was === 'claimed') { const us = getUsers(); if (us[g.to]) { delete us[g.to].frameTop; G.set('users', us); } }
  pushNotif(g.to, { type: 'sys', extra: was === 'claimed' ? 'Se retiró tu marco Top 50.' : 'Se canceló tu regalo del marco Top 50.' });
  logAction('gift-revoke', g.to, (was === 'claimed' ? 'Marco retirado' : 'Regalo cancelado') + ' · cupo devuelto');
}
let GIFTOV = null; const GIFTSEEN = new Set();
function giftPreview(e) { const u = getUsers()[e] || {}; return `<span class="fr xl">${avatarHTML(u.avatar, u.name, 'xl')}${ornHTMLk('top', '')}</span>`; }
function showGiftOverlay() {                            // al entrar, quien tiene un regalo pendiente lo ve primero
  if (GIFTOV || !S.user || isGuest()) return; giftSweep();
  const g = giftsAll().find(x => x.to === S.user && x.status === 'pending' && !GIFTSEEN.has(x.id)); if (!g) return; GIFTSEEN.add(g.id);
  const o = GIFTOV = document.createElement('div'); o.className = 'mod-ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="mod-ov-box"><div class="end-emoji">🎁</div><h1>${t('¡Te regalaron un marco!')}</h1><p>${t('Marco exclusivo {x} de Auri Studios', { x: '<b>Top 50</b>' })}</p><div class="mod-ov-av">${giftPreview(S.user)}</div><p class="helper">${t('Tienes {x} para reclamarlo. Si pasan 24 h, el regalo se cancela.', { x: '<b>' + esc(leftTxt(g.expires)) + '</b>' })}</p><p class="error-line" data-err role="alert"></p><button class="button" data-claim>${t('Reclamar marco')}</button><button class="link-btn" data-later style="color:#d9ccf0">${t('Más tarde')}</button></div>`;
  o.querySelector('[data-later]').onclick = () => { o.remove(); GIFTOV = null; };
  o.querySelector('[data-claim]').onclick = async () => { const r = await giftClaim(g.id); if (r) { o.querySelector('[data-err]').textContent = r; return; } o.querySelector('.end-emoji').textContent = '✨'; o.querySelector('h1').textContent = t('¡Es tuyo!'); o.classList.add('worn'); setTimeout(() => { o.classList.add('bye'); setTimeout(() => { o.remove(); GIFTOV = null; KEEP = true; render(); }, 380); }, 1100); };
  document.body.appendChild(o);
}
function giftView() {
  giftSweep(); const L = giftsAll(), g = L.find(x => x.to === S.user && x.status === 'pending'), got = L.some(x => x.to === S.user && x.status === 'claimed');
  return `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('🎁 Regalo')}</span><h2 style="margin-top:8px">${t('Marco exclusivo Top 50')}</h2></div></div>
  ${g ? `<section class="panel gift-card"><div class="gift-av">${giftPreview(S.user)}</div><p class="helper">${t('Te quedan {x} para reclamarlo. Pasadas las 24 h el regalo se cancela y no se puede recuperar.', { x: '<b>' + esc(leftTxt(g.expires)) + '</b>' })}</p><p class="error-line" data-err role="alert"></p><button class="button" data-act="gift-claim" data-id="${esc(g.id)}">${t('Reclamar marco')}</button></section>`
    : got ? `<section class="panel gift-card"><div class="gift-av">${giftPreview(S.user)}</div><p class="helper">${t('Ya reclamaste tu marco Top 50. Se ve en tu perfil y junto a tu nombre.')}</p></section>`
    : empty('Sin regalos por ahora', 'Cuando te regalen algo, aparecerá aquí y en tus notificaciones.', '<a class="button" href="#/">' + t('Volver al inicio') + '</a>')}</main>`;
}
function giftsView(tabs) {                              // pestaña de la Owner dentro de Moderación
  giftSweep(); const L = giftsAll(), left = giftLeft(), pend = L.filter(g => g.status === 'pending'), got = L.filter(g => g.status === 'claimed'), hist = L.filter(g => g.status === 'expired' || g.status === 'revoked');
  const row = (g, info, act) => `<div class="log-row"><div class="log-top"><b>${esc(uName(g.to))}</b><time class="helper">${esc(info)}</time></div><div class="helper">${esc(g.to)}</div>${act ? `<div class="rp-acts" style="margin-top:8px">${act}</div>` : ''}</div>`;
  const fd = iso => new Date(iso).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('🎁 Regalos')}</span><h2 style="margin-top:8px">${t('Marco Top 50')}</h2><p>${t('Solo tú puedes regalarlo. Quien lo recibe tiene 24 h para reclamarlo; si no lo hace, el regalo se cancela y el cupo vuelve a ti.')}</p></div></div>
  <section class="panel gift-top"><div class="gift-av">${giftPreview(S.user)}</div><div class="gift-count"><b>${left}</b><span>${t('de {n} cupos disponibles', { n: GIFT_TOTAL })}</span><small class="helper">${t('50 para el top + 3 de prueba')}</small></div></section>
  <section class="panel" style="margin-top:14px"><h3 style="margin-bottom:8px">${t('Regalar a una cuenta')}</h3><div class="form-group"><label for="g-to">${t('Usuario o correo')}</label><input id="g-to" class="field" autocomplete="off" placeholder="${esc(t('Ej: RiRi o correo@ejemplo.com'))}"></div><p class="error-line" data-err role="alert"></p><button class="button" data-act="gift-send" ${left > 0 ? '' : 'disabled'}>${t('Regalar marco')}</button><p class="helper" style="margin-top:8px">${t('También puedes regalarlo desde el perfil de la persona, en Administración.')}</p></section>
  <h3 style="margin:18px 0 8px">${t('Esperando que lo reclamen')} (${pend.length})</h3>${pend.length ? pend.map(g => row(g, t('Le quedan {x}', { x: leftTxt(g.expires) }), `<button class="button danger sm" data-act="gift-cancel" data-id="${esc(g.id)}">${t('Cancelar regalo')}</button>`)).join('') : '<p class="helper">' + t('Ninguno.') + '</p>'}
  <h3 style="margin:18px 0 8px">${t('Reclamados')} (${got.length})</h3>${got.length ? got.map(g => row(g, t('Reclamado {d}', { d: fd(g.claimedDate) }), `<button class="button secondary sm" data-act="gift-cancel" data-id="${esc(g.id)}">${t('Quitar marco')}</button>`)).join('') : '<p class="helper">' + t('Ninguno.') + '</p>'}
  <h3 style="margin:18px 0 8px">${t('Historial')}</h3>${hist.length ? hist.map(g => row(g, (g.status === 'expired' ? t('Venció sin reclamar') : t('Retirado')) + ' · ' + fd(g.endDate), '')).join('') : '<p class="helper">' + t('Aún no hay movimientos.') + '</p>'}</main>`;
}
const avatarHTML = (src, name, cls = '') => `<span class="avatar ${cls}">${src ? `<img src="${esc(src)}" alt="" data-i="${esc([...(name || '?')][0].toUpperCase())}">` : esc([...(name || '?')][0].toUpperCase())}</span>`;
const userAvatar = (e, cls = '') => avatarHTML((getUsers()[e] || {}).avatar, uName(e), cls);
/* Bloquear y silenciar: cada cuenta guarda sus listas (auri.u.<correo>.blocked / .muted) */
const bl = (e, k) => LS.get('auri.u.' + e + '.' + k, []);
const iBlock = e => !!S.user && bl(S.user, 'blocked').includes(e), iMute = e => !!S.user && bl(S.user, 'muted').includes(e);
const hidesFrom = e => !!S.user && !!e && e !== S.user && (iBlock(e) || iMute(e) || bl(e, 'blocked').includes(S.user));   // sus comentarios no se ven (los que bloqueaste, silenciaste o te bloquearon)
const hidesStory = o => !!S.user && !!o && o !== S.user && (iBlock(o) || bl(o, 'blocked').includes(S.user));
const noPing = (to, from) => !!from && (bl(to, 'blocked').includes(from) || bl(to, 'muted').includes(from) || bl(from, 'blocked').includes(to));
function setBM(k, e, on) { const l = bl(S.user, k).filter(x => x !== e); LS.set('auri.u.' + S.user + '.' + k, on ? [...l, e] : l); }
function blockUser(e) {
  setBM('blocked', e, true); const f = follows(); f[S.user] = (f[S.user] || []).filter(x => x !== e); f[e] = (f[e] || []).filter(x => x !== S.user); G.set('follows', f);
}
const follows = () => G.get('follows', {});
const following = e => follows()[e] || [];
const followers = e => Object.keys(follows()).filter(f => following(f).includes(e));
/** Fecha relativa («Hace 2 h»): el id de cada comentario es su marca de tiempo; se refresca sola cada 30 s */
function relTime(ts) {
  const n = parseInt(String(ts), 10); if (!n || n < 1e12) return ''; const sec = Math.max(0, Math.floor((Date.now() - n) / 1000));
  if (sec < 60) return t('Hace un momento'); const m = Math.floor(sec / 60); if (m < 60) return t('Hace {n} min', { n: m });
  const h = Math.floor(m / 60); if (h < 24) return t('Hace {n} h', { n: h }); const d = Math.floor(h / 24); if (d < 30) return tn(d, 'Hace {n} día', 'Hace {n} días');
  const mo = Math.floor(d / 30); if (mo < 12) return tn(mo, 'Hace {n} mes', 'Hace {n} meses'); const y = Math.floor(d / 365); return tn(y, 'Hace {n} año', 'Hace {n} años');
}
const relSpan = c => `<time class="rel-t" data-ts="${esc(String(c.id))}" title="${esc(c.date || '')}">${esc(relTime(c.id) || c.date || '')}</time>`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (uiLang() === 'en' ? `${MESES_EN[+m[2] - 1]} ${+m[3]}, ${m[1]}` : `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}`) : ''; };
const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const likes = id => G.get('likes', {})[id] || [];
const comments = (id, ci) => { const l = G.get('comments', {})[id] || []; return ci == null ? l : l.filter(c => (c.ch | 0) === ci); };   // ci = posición del capítulo: cada capítulo tiene sus propios comentarios (los antiguos, sin capítulo, van al 1)
const news = () => G.get('news', []);
const pubOK = o => !o.status || o.status === 'published';               // sin estado = publicado (lo anterior)
const newsPub = () => news().filter(pubOK).filter(n => commVisible(postComm(n)));
const POST_ROLE = { OWNER: 'Owner', ADMIN: 'Administración', MODERATOR: 'Moderación' };
function byline(o) {                                    // quién publicó: siempre el rol; el nombre solo si no lo ocultó (la Owner siempre lo ve)
  const by = o.by || OWNER_EMAIL, role = t(POST_ROLE[o.byRole || roleOf(by)] || 'Auri Studios'), real = uName(by) === 'Usuario' ? 'Auri Studios' : uName(by);
  return o.anon ? (isOwner() ? `${role} · ${real} ${t('(nombre oculto al público)')}` : role) : `${real} · ${role}`;
}
const postMeta = (anon, cid) => ({ byRole: roleOf(S.user), anon: !!anon, comm: (($('#' + cid) || {}).value) || (staffScope(S.user).length > 1 ? 'all' : staffScope(S.user)[0] || 'es'), ...(isMod() ? { status: 'pending' } : {}) });
const notifyApprovers = () => 0;                      // ya no se avisa por notificación al equipo: lo pendiente se ve con el contador rojo en Moderación
/** Una noticia son bloques: cada párrafo puede llevar su propia imagen (cualquier proporción). Las noticias antiguas (solo texto) se convierten al vuelo */
const newsBlocks = n => Array.isArray(n.blocks) && n.blocks.length ? n.blocks : String(n.text || '').split(/\n\s*\n/).filter(Boolean).map(t => ({ t, img: '' }));
const newsCover = n => { const b = n && newsBlocks(n).find(x => safeImg(x.img)); return b ? b.img : ''; };
const unread = () => G.get('notifs.' + S.user, []).filter(n => !n.read).length;
function notify(to, type, storyId, extra = '', chap = '', from = S.user) {
  if (!to || (to === S.user && type !== 'chapter')) return;
  if (noPing(to, from)) return;                                  // bloqueada o silenciada: no llegan avisos
  if (['chapter', 'like', 'comment', 'follow'].includes(type) && ((LS.get('auri.u.' + to + '.cfg', {}).notif || {})[type] === false)) return;   // la persona apagó este tipo de aviso (los de moderación no se pueden apagar)
  if (sbOut(to, { type, from, storyId, extra, chap })) return;   // con la nube activa, el aviso va directo a la otra persona
  const k = 'notifs.' + to, list = G.get(k, []);
  if ((type === 'like' || type === 'follow') && list.some(n => n.type === type && n.from === S.user && n.storyId === storyId)) return;
  list.unshift({ id: Date.now() + Math.random().toString(36).slice(2, 6), type, from, storyId, extra, chap, date: new Date().toISOString(), read: false });
  G.set(k, list.slice(0, 100));
}
function toggleFollow(e) {
  if (iBlock(e) || bl(e, 'blocked').includes(S.user)) return toast('No puedes seguir a esta persona.');
  const f = follows(), l = f[S.user] || [], was = l.includes(e);
  f[S.user] = was ? l.filter(x => x !== e) : [...l, e]; G.set('follows', f);
  if (!was) notify(e, 'follow', '');
}
function toggleLike(s) {
  const all = G.get('likes', {}), l = all[s.id] || [], was = l.includes(S.user);
  all[s.id] = was ? l.filter(x => x !== S.user) : [...l, S.user]; G.set('likes', all);
  if (!was) notify(s.owner, 'like', s.id);
}
function addComment(s, text, ci) {
  const all = G.get('comments', {}), id = Date.now(); (all[s.id] = all[s.id] || []).push({ id, by: S.user, text, date: today(), ...(ci > 0 ? { ch: ci } : {}) });
  G.set('comments', all); notify(s.owner, 'comment', s.id, text.slice(0, 80), `${(ci | 0) + 1}:${id}`);
}
/** Recorta la foto al centro en cuadrado y la reduce (ahorra localStorage) */
/** Recorta al centro con "cover" (llena w×h sin deformar) y reduce; guarda como JPEG para ahorrar espacio */
/** Recorta al centro con "cover" (llena w×h sin deformar); q = calidad JPEG */
function cropPhoto(file, w, h, cb, q = .85) {
  if (!file || !file.type.startsWith('image/')) return toast(t('Elige un archivo de imagen.'));
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.max(w / img.width, h / img.height), sw = w / k, sh = h / k, c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
      cb(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => toast(t('No se pudo leer esa imagen.')); img.src = r.result;
  };
  r.readAsDataURL(file);
}
/** Reduce la imagen COMPLETA (sin recortar nada) para que quepa en maxW×maxH; conserva sus proporciones */
/** Imagen de noticias: se conserva COMPLETA y con su proporción (vertical, horizontal o larga); solo se reduce su ancho si es enorme */
function newsPhoto(file, cb) {
  if (!file || !file.type.startsWith('image/')) return toast(t('Elige un archivo de imagen.'));
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / img.width, 5000 / img.height), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', .8));
    };
    img.onerror = () => toast(t('No se pudo leer esa imagen.')); img.src = r.result;
  };
  r.readAsDataURL(file);
}
function fitPhoto(file, maxW, maxH, cb, q = .85) {
  if (!file || !file.type.startsWith('image/')) return toast(t('Elige un archivo de imagen.'));
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width, maxH / img.height), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => toast(t('No se pudo leer esa imagen.')); img.src = r.result;
  };
  r.readAsDataURL(file);
}
const squarePhoto = (file, size, cb) => cropPhoto(file, size, size, cb);
/** Foto de perfil (círculo) y portada del perfil: se abre el editor para mover y hacer zoom antes de guardar. src = enlace o dato de la imagen ya puesta */
const PH = { avatar: { w: 256, h: 256, q: .85, round: true, title: () => t('Ajusta tu foto'), info: () => t('Se guardará a 256×256 px.'), key: 'avatar' },
  banner: { w: 960, h: 360, q: .78, wide: true, title: () => t('Ajusta tu portada de perfil'), ratio: () => t('Se guarda en proporción 8:3.'), info: () => t('Se guardará a 960×360 px.'), key: 'banner' } };
function editPhoto(fileOrSrc, kind) {
  const c = PH[kind], open = src => coverEditor(src, d => { const u = getUsers(); u[S.user][c.key] = d; G.set('users', u); render(); }, 0, 0, { w: c.w, h: c.h, q: c.q, round: c.round, shape: kind === 'avatar' && roleOf(S.user) === 'OWNER' ? (getUsers()[S.user] || {}).shape : '', wide: c.wide, title: c.title(), ratio: c.ratio ? c.ratio() : ' ', info: c.info() });
  if (typeof fileOrSrc === 'string') return open(fileOrSrc);
  const f = fileOrSrc; if (!f || !f.type.startsWith('image/')) return toast(t('Elige un archivo de imagen.'));
  const r = new FileReader(); r.onload = () => open(r.result); r.readAsDataURL(f);
}

/* 3. AUTENTICACIÓN LOCAL ------------------------------------------
   Demostración: los datos viven solo en este navegador. Para producción
   hace falta un servidor real (contraseñas y verificación de edad).    */
async function sha(text) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch { let h = 5381; for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return 'x' + h; }
}
/* --- Registro con cuestionario: cumpleaños, género e intereses --- */
const MIN_AGE = 13;                                    // edad mínima para crear una cuenta (ajústala según tu país)
const GENDERS = ['Hombre', 'Mujer', 'No binario', 'Otro'];
const INTERESTS = [['Anime', '🌸'], ['AU', '🌀'], ['Enemies to lovers', '⚔️'], ['Dark romance', '🖤'], ['Cute', '🧸'], ['Fluff', '☁️'], ['Slow burn', '🕯️'], ['Friends to lovers', '🤝'], ['Angst', '💔'], ['Hurt/comfort', '🩹'],
  ['Comedia', '😂'], ['Drama', '🎭'], ['Romance', '💞'], ['Fantasía', '🧙'], ['Ciencia ficción', '🚀'], ['Misterio', '🔍'], ['Terror', '👻'], ['Slice of life', '🍵'], ['Escuela', '🏫'], ['Mafia', '🕶️'],
  ['Vampiros', '🧛'], ['Isekai', '🌌'], ['Histórico', '🏰'], ['Found family', '🏡'], ['Reader insert (TN)', '🪞'], ['K-pop', '🎤'], ['Videojuegos', '🎮'], ['Original', '✨'],
  ['LGBTQ+', '🏳️‍🌈'], ['Yaoi', '💙'], ['Yuri', '💗'], ['Poliamor', '🫶']];
const INTEREST_NAMES = INTERESTS.map(i => i[0]);
const ageOf = birth => { const b = new Date(birth + 'T00:00:00'); if (isNaN(b)) return null; const t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a; };
const validBirth = v => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false; const [y, m, d] = v.split('-').map(Number), dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && dt <= new Date() && y >= 1900; };
const isMinor = u => !!(u && u.birth) && ageOf(u.birth) < 18;
const isAdult = u => !!u && (u.birth ? ageOf(u.birth) >= 18 : !!u.adultDeclared);   // con fecha de nacimiento: por la edad real; cuentas anteriores: por su declaración

/* ---------- NUBE: cuentas reales con Supabase (sin librerías, con fetch) ----------
   CLOUD_ON = true  → registro e inicio de sesión van a Supabase.
   CLOUD_ON = false → todo queda en este navegador (modo local). */
const CLOUD_ON = true;
const SB_URL = 'https://gnhhxvqjtvchjmtizzua.supabase.co', SB_KEY = 'sb_publishable_WiBRY3Btm372sZZBPb6ybQ_BqYeylma';   // clave pública: es segura en la página
function cloud() { return CLOUD_ON && !!SB_URL; }
const sbSes = () => LS.get('auri.sb', null);
let SB_REFRESH = null, SB_PT;
async function sbFetch(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try { res = await fetch(SB_URL + path, { method, headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { return { ok: false, net: true, status: 0, data: null }; }
  let data = null; try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}
const sbCode = d => String((d && (d.error_code || d.code || d.error)) || '').toLowerCase();
const sbMsg = d => String((d && (d.msg || d.message || d.error_description || d.error)) || '').toLowerCase();
function sbSave(d) {
  const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), uid: d.user && d.user.id, email: d.user && d.user.email };
  LS.set('auri.sb', s); return s;
}
async function sbToken() {                              // devuelve un token vigente (lo renueva si está por vencer)
  const s = sbSes(); if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  if (!SB_REFRESH) SB_REFRESH = (async () => {
    const r = await sbFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
    if (r.ok && r.data && r.data.access_token) return sbSave({ ...r.data, user: r.data.user || { id: s.uid, email: s.email } }).access_token;
    if (r.net) return s.access_token;                   // sin conexión: se conserva la sesión
    localStorage.removeItem('auri.sb'); return null;
  })().finally(() => { SB_REFRESH = null; });
  return SB_REFRESH;
}
const sbApi = async (path, o = {}) => sbFetch(path, { ...o, token: await sbToken() });
/** Copia el perfil de la nube a este dispositivo para que el resto de la app lo use. */
async function sbMirror() {
  const s = sbSes(); if (!s) return false;
  const [p, q] = await Promise.all([sbApi('/rest/v1/profiles?id=eq.' + s.uid + '&select=*'), sbApi('/rest/v1/profile_private?id=eq.' + s.uid + '&select=*')]);
  const pr = p.ok && Array.isArray(p.data) && p.data[0]; if (!pr) return false;
  const pv = (q.ok && Array.isArray(q.data) && q.data[0]) || {};
  const email = String(s.email || pv.email || '').toLowerCase(), us = LS.get('auri.users', {}), old = us[email] || {};
  us[email] = { ...old, uid: s.uid, cloud: true, name: pr.name, community: pr.community === 'en' ? 'en' : 'es', bio: pr.bio || old.bio || '', avatar: pr.avatar || old.avatar || '', banner: pr.banner || old.banner || '',
    role: pr.role, scope: Array.isArray(pr.scope) ? pr.scope : [], frameWorn: !!pr.frame_worn, frameSel: pr.frame_sel == null ? undefined : pr.frame_sel, cosTop: pr.cos_top == null ? undefined : pr.cos_top, shape: pr.photo_shape || '', halo: pr.halo || '', accent: pr.accent || '', mbti: pr.mbti || '', mbtiTheme: !!pr.mbti_theme, hideLists: !!pr.hide_lists, frameTop: !!pr.frame_top, bows: Array.isArray(pr.bows) ? pr.bows : [], modSince: pr.mod_since || undefined, admSince: pr.adm_since || undefined,
    birth: pv.birth || old.birth || '', gender: pv.gender || old.gender || '', interests: pv.interests || old.interests || [], onboarded: true,
    termsAccepted: pr.terms_accepted || old.termsAccepted, created: String(pr.created_at || '').slice(0, 10) || old.created, strikes: old.strikes || [] };
  LS.set('auri.users', us);
  if ((!pr.avatar && old.avatar) || (!pr.banner && old.banner) || (!pr.bio && old.bio)) sbProfileSoon();       // la nube estaba vacía: sube lo que ya tenías
  const pc = LS.get('auri.pendingcfg.' + email, null);
  if (pc) { if (!localStorage.getItem('auri.u.' + email + '.cfg')) LS.set('auri.u.' + email + '.cfg', pc); localStorage.removeItem('auri.pendingcfg.' + email); }
  return email;
}
function sbProfileSoon() { if (!cloud() || !sbSes()) return; clearTimeout(SB_PT); SB_PT = setTimeout(sbPushProfile, 800); }
async function sbPushProfile() {                         // sube tus cambios de perfil (nombre, bio, fotos, comunidad)
  const s = sbSes(); if (!s) return; const em = String(s.email).toLowerCase(); let u = LS.get('auri.users', {})[em]; if (!u || !u.cloud) return;
  const av = await sbImgConv(u.avatar || ''), bn = await sbImgConv(u.banner || '');
  if (av !== (u.avatar || '') || bn !== (u.banner || '')) { const us = LS.get('auri.users', {}); if (us[em]) { us[em] = { ...us[em], ...(av !== (u.avatar || '') && us[em].avatar === u.avatar ? { avatar: av } : {}), ...(bn !== (u.banner || '') && us[em].banner === u.banner ? { banner: bn } : {}) }; LS.set('auri.users', us); u = us[em]; } }
  await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: { name: u.name, bio: u.bio || '', avatar: av, banner: bn, community: u.community === 'en' ? 'en' : 'es', frame_worn: !!u.frameWorn } });
}
/* ---------- Conexión (punto verde): se guarda cada minuto en tu perfil; solo se ve si tú lo permites ---------- */
let PRES_OFF = false, LAST_ON = null;
const PRES = {};                                           // clave de usuario → { at, on, ls }
async function sbBeat() {
  const s = sbSes(); if (!cloud() || !s || !S.user || isGuest() || PRES_OFF || document.visibilityState !== 'visible') return;
  const on = cfg('showOnline') !== false; if (!on && LAST_ON === false) return; LAST_ON = on;
  const r = await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: on ? { show_online: true, last_seen: new Date().toISOString() } : { show_online: false } });
  if (!r.ok && !r.net && r.status >= 400 && r.status < 500) PRES_OFF = true;      // las columnas aún no existen (falta el SQL 12): no se insiste
}
async function sbPres(e) {
  const u = getUsers()[e]; if (!cloud() || !sbSes() || PRES_OFF || !u || !u.uid || e === S.user) return;
  const c = PRES[e]; if (c && Date.now() - c.at < 25000) return;
  const r = await sbApi('/rest/v1/profiles?id=eq.' + u.uid + '&select=last_seen,show_online');
  if (!r.ok || !Array.isArray(r.data)) { if (!r.net && r.status >= 400 && r.status < 500) PRES_OFF = true; return; }
  const row = r.data[0] || {}, was = onlineDot(e) !== '';
  PRES[e] = { at: Date.now(), on: row.show_online !== false, ls: row.last_seen ? Date.parse(row.last_seen) : 0 };
  if (was !== (onlineDot(e) !== '') && location.hash === '#/user/' + encodeURIComponent(e)) { KEEP = true; render(); }
}
function onlineDot(e) {
  const ok = e === S.user ? cfg('showOnline') !== false && !!sbSes() && cloud() : (() => { const c = PRES[e]; return !!c && c.on && c.ls && Date.now() - c.ls < 150000; })();
  return ok ? `<span class="pf-on" role="img" aria-label="${esc(t('Conectado'))}" title="${esc(t('Conectado'))}"></span>` : '';
}
setInterval(() => { sbBeat(); const m = /^#\/user\/(.+)$/.exec(location.hash); if (m) sbPres(decodeURIComponent(m[1])); }, 60000);
setTimeout(sbBeat, 4000);
async function sbPushFrame() {
  const s = sbSes(); if (!cloud() || !s || PRES_OFF) return; const u = LS.get('auri.users', {})[String(s.email).toLowerCase()]; if (!u) return;
  await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { frame_sel: u.frameSel === undefined ? null : u.frameSel } });
}
async function sbPushCos() {
  const s = sbSes(); if (!cloud() || !s || PRES_OFF) return; const u = LS.get('auri.users', {})[String(s.email).toLowerCase()]; if (!u) return;
  await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { cos_top: u.cosTop === undefined ? null : u.cosTop } });
}
async function sbPushLook() {
  const s = sbSes(); if (!cloud() || !s || PRES_OFF) return; const u = LS.get('auri.users', {})[String(s.email).toLowerCase()]; if (!u) return;
  await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { photo_shape: u.shape || '', halo: u.halo || '' } });
}
async function sbPushLists() {
  const s = sbSes(); if (!cloud() || !s || PRES_OFF) return; const u = LS.get('auri.users', {})[String(s.email).toLowerCase()]; if (!u) return;
  await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { hide_lists: !!u.hideLists } });
}
async function cloudLogin(email, pass) {
  const r = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pass } });
  if (r.net) return t('No hay conexión con el servidor. Inténtalo de nuevo.');
  if (!r.ok || !r.data || !r.data.access_token) {
    const c = sbCode(r.data), m = sbMsg(r.data);
    if (c === 'email_not_confirmed' || m.includes('not confirmed')) return t('Confirma tu correo: te enviamos un enlace.');
    if (r.status === 429) return t('Demasiados intentos. Espera un momento.');
    return t('Correo o contraseña incorrectos.');
  }
  sbSave(r.data);
  if (!(await sbMirror())) { localStorage.removeItem('auri.sb'); return t('No se pudo cargar tu perfil. Inténtalo de nuevo.'); }
  return '';
}
async function cloudSignup() {
  const { name, email, pass } = PENDING;
  const r = await sbFetch('/auth/v1/signup', { method: 'POST', body: { email, password: pass, data: { name, community: QZ.comm === 'en' ? 'en' : 'es', birth: QZ.birth, gender: QZ.gender, interests: QZ.interests } } });
  if (r.net) return { err: t('No hay conexión con el servidor. Inténtalo de nuevo.') };
  if (!r.ok) {
    const c = sbCode(r.data), m = sbMsg(r.data);
    if (c === 'user_already_exists' || m.includes('already')) return { err: t('Ese correo ya tiene una cuenta.'), back: true };
    if (c === 'weak_password') return { err: t('La contraseña debe tener al menos 8 caracteres.'), back: true };
    if (m.includes('database error')) return { err: t('Ese nombre de usuario ya está en uso.'), back: true };
    if (r.status === 429 || c.includes('rate')) return { err: t('Demasiados intentos. Espera un momento.') };
    return { err: t('No se pudo crear la cuenta. Inténtalo de nuevo.') };
  }
  LS.set('auri.pendingcfg.' + email, { showMature: ageOf(QZ.birth) >= 18 && QZ.mature });   // la opción +18 del cuestionario
  if (r.data && r.data.access_token) { sbSave(r.data); if (await sbMirror()) return { session: true }; return { err: t('No se pudo cargar tu perfil. Inténtalo de nuevo.') }; }
  return { confirm: true };                              // el proyecto pide confirmar el correo
}
async function sbBoot() {                                // al abrir la app: renueva la sesión y trae el perfil al día
  if (!cloud() || !S.user || isGuest()) return;
  const out = () => { S.user = null; localStorage.removeItem('auri.session'); render(); };
  if (!sbSes() || !(await sbToken())) return out();
  if (await sbMirror()) { loadUser(); render(); }
}
/* ---------- NUBE · historias y capítulos ----------
   Cada historia/capítulo local se guarda en Supabase con un id (uuid) que contiene el id local, así que no hay que cambiar nada en la app:
   - tus obras: lo local manda, y se sube; el estado de revisión (aprobado/rechazado) lo decide la nube.
   - obras de otras personas: se descargan a una copia local (cuenta «u-<id>@cloud.auri») y el resto de la app las lee como siempre. */
const hx = (n, d) => Number(n).toString(16).padStart(d, '0');
const sNum = id => { const m = /^story-(\d{1,15})$/.exec(String(id)); const n = m ? +m[1] : NaN; return Number.isSafeInteger(n) && n < 2 ** 48 ? n : null; };
const sUuid = id => { const n = sNum(id); return n == null ? null : '00000000-0000-0000-0000-' + hx(n, 12); };
const sBack = u => 'story-' + parseInt(String(u).replace(/-/g, '').slice(20), 16);
const cUuid = (sid, cid) => { const n = sNum(sid); if (n == null || !Number.isSafeInteger(cid) || cid < 0 || cid >= 2 ** 52) return null; const a = hx(n, 12), c = hx(cid, 16); return `${a.slice(0, 8)}-${a.slice(8)}-${c.slice(0, 4)}-${c.slice(4, 8)}-0000${c.slice(8)}`; };
const cBack = u => { const h = String(u).replace(/-/g, ''); return parseInt(h.slice(12, 20) + h.slice(24), 16); };
const remoteKey = uid => 'u-' + uid + '@cloud.auri';
const hsh = s => { s = String(s); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h + ':' + s.length; };
const PHASES = ['ongoing', 'paused', 'finished'], CH_ST = ['draft', 'pending', 'rejected', 'approved'];
const infoSig = l => hsh(JSON.stringify([l.title || '', l.synopsis || '', l.genre || '', l.fandom || '', l.tags || [], l.cover || '', !!l.mature, l.phase || 'ongoing', l.prev || '', l.useReaderCharacter !== false, !!l.private]));
const contSig = c => hsh([c.title || '', c.text || '', c.cover || '', c.music || ''].join('\u0001'));
const sameCont = (c, r) => (c.title || '') === (r.title || '') && (c.text || '') === (r.text || '') && (c.cover || '') === (r.cover || '') && (c.music || '') === (r.music || '');
const infoFromRow = r => ({ title: r.title, synopsis: r.synopsis || '', genre: r.genre || '', fandom: r.fandom || '', tags: r.tags || [], warns: Array.isArray(r.warnings) ? r.warnings : [], cover: r.cover || '', mature: !!r.mature, phase: r.phase || 'ongoing', prev: r.prev ? sBack(r.prev) : '', useReaderCharacter: r.use_reader_character !== false, private: !!r.private });
const day = v => String(v || '').slice(0, 10);
let SB_BUSY = false, SB_ST, SB_QUIET = false, SB_Q = { all: false, st: false, soc: new Set() };
function sbStoriesSoon() { if (!cloud() || !sbSes() || SB_QUIET) return; SB_Q.st = true; clearTimeout(SB_ST); SB_ST = setTimeout(() => sbRefresh({ st: true }), 1500); }
async function sbRefresh(only) {                          // sube lo tuyo, trae lo de todas las personas y dibuja de nuevo si algo cambió
  if (!cloud()) return;
  if (only === undefined) SB_Q.all = true; else { if (only.st) SB_Q.st = true; (only.soc || []).forEach(x => SB_Q.soc.add(x)); }
  if (SB_BUSY) return; SB_BUSY = true;
  try {
    while (SB_Q.all || SB_Q.st || SB_Q.soc.size) {
      const q = SB_Q; SB_Q = { all: false, st: false, soc: new Set() }; let ch = false; const me = sbSes() && S.user && !isGuest();
      if (me && (q.all || q.st)) ch = (await sbSyncOwn()) || ch;
      if (q.all || q.st) ch = (await sbPullPublic()) || ch;
      if (me && (q.all || q.soc.has('dm'))) ch = (await sbSyncMsgs()) || ch;
      if (me && q.all) ch = (await sbSyncMod()) || ch;
      if (me && q.all) ch = (await sbSyncPosts()) || ch; else if (!me && q.all) ch = (await sbPullPostsPublic()) || ch;
      if (me && (q.all || [...q.soc].some(x => x !== 'dm'))) { const set = new Set(q.soc); ['comments', 'comment_likes'].some(x => set.has(x)) && ['comments', 'comment_likes'].forEach(x => set.add(x)); ['pcom', 'pcom_likes'].some(x => set.has(x)) && ['pcom', 'pcom_likes'].forEach(x => set.add(x)); ch = (await sbSyncSocial(q.all ? null : [...set])) || ch; }
      const ae = document.activeElement && document.activeElement.tagName;
      if (ch && !W && ae !== 'INPUT' && ae !== 'TEXTAREA' && !/^#\/(write|story\/[^/]+\/\d)/.test(location.hash)) render();
    }
  } catch (e) { console.warn('sync', e); }
  finally { SB_BUSY = false; }
}
async function sbSyncOwn() {
  const ses = sbSes(), me = ses && String(ses.email || '').toLowerCase(); if (!ses || !S.user || S.user !== me) return false;
  await sbImgLocal(uk('stories'));                         // portadas: primero a Storage
  const uid = ses.uid, K = uk('cloudsync'), st = LS.get(K, {}), stS = new Set(st.s || []), stC = new Set(st.c || []), sigS = st.si || {}, sigC = st.ci || {};
  const [rs, rc, rp] = await Promise.all([
    sbApi('/rest/v1/stories?owner=eq.' + uid + '&select=*&limit=2000'),
    sbApi('/rest/v1/chapters?select=*,stories!inner(owner)&stories.owner=eq.' + uid + '&order=position&limit=10000'),
    sbApi('/rest/v1/chapter_published?select=*,stories!inner(owner)&stories.owner=eq.' + uid + '&limit=10000')]);
  if (!rs.ok || !rc.ok || !Array.isArray(rs.data) || !Array.isArray(rc.data)) return false;      // sin conexión: no se toca nada
  const cs = new Map(rs.data.map(r => [r.id, r])), cc = new Map(rc.data.map(r => [r.id, r])), pub = new Map(((rp.ok && Array.isArray(rp.data)) ? rp.data : []).map(r => [r.chapter_id, r]));
  const comm = (getUsers()[S.user] || {}).community === 'en' ? 'en' : 'es';
  const local = LS.get(K.replace('cloudsync', 'stories'), []).map(norm); let changed = false;
  const putS = [], patchS = [], putC = [], patchC = [], delC = [], delS = [], newS = new Set(), newC = new Set(), nSigS = {}, nSigC = {};
  const liveOf = u => { const p = pub.get(u); return p ? { title: p.title, text: p.text, music: p.music || '', cover: p.cover || '' } : undefined; };
  const fromCloudCh = r => { const c = { id: cBack(r.id), title: r.title, text: r.text, status: r.status, ...(r.cover ? { cover: r.cover } : {}), ...(r.music ? { music: r.music } : {}) }; if (r.status === 'rejected' && r.reason) c.reason = r.reason; if (r.status !== 'approved') { const lv = liveOf(r.id); if (lv) c.live = lv; } return c; };
  const out = [], aiPend = LS.get(uk('aipend'), {}), annList = [];                  // capítulos que la IA aprobó mientras tanto: se avisa a quien sigue el libro
  for (const l0 of local) {
    const l = { ...l0, chapters: l0.chapters.map(c => ({ ...c })) }, su = sUuid(l.id), pre0 = publicPrefix(l0.chapters).length;
    if (!su) { out.push(l); continue; }                                       // ids que no son de la nube (pruebas): se quedan solo aquí
    const R = cs.get(su);
    if (!R && stS.has(su)) { changed = true; continue; }                      // la borraste en otro lugar
    const row = { id: su, owner: uid, community: comm, title: l.title || '', synopsis: l.synopsis || '', genre: l.genre || '', fandom: l.fandom || '', tags: l.tags || [], cover: l.cover || '', mature: !!l.mature,
      phase: PHASES.includes(l.phase) ? l.phase : 'ongoing', prev: l.prev && sUuid(l.prev) ? sUuid(l.prev) : null, use_reader_character: l.useReaderCharacter !== false, terms: false, ...(l.private || (R && R.private) ? { private: !!l.private } : {}), ...((l.warns && l.warns.length) || (R && R.warnings && R.warnings.length) ? { warnings: l.warns || [] } : {}) };
    if (!R) putS.push(row);
    else if (sigS[su] === infoSig(l)) { const ni = infoFromRow(R); if (infoSig({ ...l, ...ni }) !== infoSig(l)) { Object.assign(l, ni); changed = true; } }   // no la tocaste: manda la nube (p. ej. cambio de moderación)
    else { const same = ['title', 'synopsis', 'genre', 'fandom', 'cover', 'phase'].every(k => (R[k] || '') === (row[k] || '')) && !!R.mature === row.mature && JSON.stringify(R.tags || []) === JSON.stringify(row.tags) && (R.prev || null) === row.prev && (R.use_reader_character !== false) === row.use_reader_character && !!R.private === !!l.private; if (!same) patchS.push(row); }
    nSigS[su] = infoSig(l);
    // capítulos
    const mine = new Set();
    l.chapters.forEach((c, i) => {
      const cu = cUuid(l.id, c.id); if (!cu) return; mine.add(cu);
      const C = cc.get(cu), rowC = () => ({ id: cu, story_id: su, position: i, title: c.title || '', text: c.text || '', cover: c.cover || '', music: c.music || '', status: CH_ST.includes(c.status) ? c.status : 'draft', reason: c.reason || '' });
      if (!C) { putC.push(rowC()); newC.add(cu); return; }
      const edited = sigC[cu] !== undefined ? sigC[cu] !== contSig(c) : !sameCont(c, C);
      if (edited && !sameCont(c, C)) { patchC.push({ ...rowC(), _pos: C.position }); }
      else {
        if (!sameCont(c, C)) { Object.assign(c, fromCloudCh(C)); changed = true; }     // la editaste en otro lugar: manda la nube
        else if (C.status === 'approved' || C.status === 'rejected' || c.status === 'approved' || c.status === 'rejected') {
          if (c.status !== C.status || (c.reason || '') !== (C.reason || '')) {
            if (C.status === 'approved' && c.status !== 'approved' && aiPend[cu]) { annList.push({ id: l.id, pre: pre0, cu }); }
            c.status = C.status; if (C.status === 'approved') { delete c.live; delete c.reason; } else if (C.status === 'rejected') c.reason = C.reason || ''; else { delete c.reason; }
            changed = true;
          }
        } else if (c.status !== C.status) patchC.push({ ...rowC(), _pos: C.position });
        if (C.position !== i && !patchC.some(p => p.id === cu)) patchC.push({ ...rowC(), _pos: C.position, _only: 1 });
      }
    });
    for (const [cu, C] of cc) if (C.story_id === su && !mine.has(cu)) {          // capítulo que está en la nube y no aquí
      if (stC.has(cu)) delC.push(cu);                                               // lo borraste: se borra allá
      else { l.chapters.splice(Math.min(C.position, l.chapters.length), 0, fromCloudCh(C)); changed = true; }
    }
    l.chapters.forEach(c => { const cu = cUuid(l.id, c.id); if (cu) nSigC[cu] = contSig(c); });
    if (l.chapters.some(c => c.status === 'approved') && !l.publishedAt) { const p = [...pub.values()].filter(x => x.story_id === su).map(x => day(x.published_at)).sort()[0]; l.publishedAt = p || today(); changed = true; }
    out.push(l);
  }
  for (const [su, R] of cs) if (!local.some(x => sUuid(x.id) === su)) {               // historias de la nube que este dispositivo no tiene
    if (stS.has(su)) { delS.push(su); continue; }                                   // las borraste aquí
    const chs = [...cc.values()].filter(c => c.story_id === su).sort((a, b) => a.position - b.position).map(fromCloudCh);
    const id = sBack(su), p = [...pub.values()].filter(x => x.story_id === su).map(x => day(x.published_at)).sort()[0];
    out.push({ id, ...infoFromRow(R), chapters: chs, updatedAt: day(R.updated_at) || today(), ...(p ? { publishedAt: p } : {}) }); changed = true;
    nSigS[su] = infoSig(infoFromRow(R)); chs.forEach(c => { const cu = cUuid(id, c.id); if (cu) nSigC[cu] = contSig(c); });
  }
  // --- subir ---
  const bad = []; const wr = async (p, o) => { const r = await sbApi(p, o); if (!r.ok) bad.push(p + ' ' + r.status); return r; };
  const MIN = { Prefer: 'return=minimal' };
  if (delC.length) await wr('/rest/v1/chapters?id=in.(' + delC.join(',') + ')', { method: 'DELETE', headers: MIN });
  if (delS.length) await wr('/rest/v1/stories?id=in.(' + delS.join(',') + ')', { method: 'DELETE', headers: MIN });
  if (putS.length) await wr('/rest/v1/stories', { method: 'POST', headers: { ...MIN, Prefer: 'return=minimal,resolution=merge-duplicates' }, body: putS });
  for (const r of patchS) { const { id, owner, community, ...rest } = r; await wr('/rest/v1/stories?id=eq.' + id, { method: 'PATCH', headers: MIN, body: rest }); }
  const moves = patchC.filter(p => p._pos !== p.position);                           // cambios de orden: primero se apartan para no chocar
  for (const p of moves) await wr('/rest/v1/chapters?id=eq.' + p.id, { method: 'PATCH', headers: MIN, body: { position: 100000 + p.position } });
  for (const p of patchC) { const { id, story_id, _pos, _only, ...rest } = p; await wr('/rest/v1/chapters?id=eq.' + id, { method: 'PATCH', headers: MIN, body: _only ? { position: rest.position } : rest }); }
  if (putC.length) await wr('/rest/v1/chapters', { method: 'POST', headers: MIN, body: putC });
  if (bad.length) { console.warn('sync', bad); if (changed) { SB_QUIET = true; try { LS.set(K.replace('cloudsync', 'stories'), out); S.stories = out.map(norm); } finally { SB_QUIET = false; } } return changed; }   // reintenta más tarde
  const sIds = out.map(x => sUuid(x.id)).filter(Boolean), cIds = []; out.forEach(x => x.chapters.forEach(c => { const cu = cUuid(x.id, c.id); if (cu) cIds.push(cu); }));
  LS.set(K, { s: sIds, c: cIds, si: Object.fromEntries(sIds.map(u => [u, nSigS[u] || sigS[u]])), ci: Object.fromEntries(cIds.map(u => [u, nSigC[u] || sigC[u]])) });
  if (changed) { SB_QUIET = true; try { LS.set(K.replace('cloudsync', 'stories'), out); S.stories = out.map(norm); } finally { SB_QUIET = false; } }
  if (annList.length) { const seenS = new Set(); annList.forEach(a => { if (!seenS.has(a.id)) { seenS.add(a.id); announceChapters(a.id, a.pre); } delete aiPend[a.cu]; }); LS.set(uk('aipend'), aiPend); }
  sbAiScan(out);
  return changed;
}
/* ---------- Revisión automática con IA (primer filtro) ----------
   Después de subir un capítulo que queda "pending", la app le pide a la función «moderate-chapter» que lo revise en el servidor.
   Limpio → la base de datos lo aprueba y se publica; marcado → sigue oculto para moderación. Si algo falla, el capítulo simplemente sigue pendiente. */
const AI_RUN = new Set(), AI_FNS = ['moderate-chapter', 'bright-handler'];      // nombre de la función en Supabase (se prueba cada uno hasta que uno exista)
let AI_FN = '', AI_ERR = false;
function sbAiScan(out) {
  if (!cloud() || !sbSes() || !S.user || isGuest()) return;
  const K = uk('aiseen2'), seen = LS.get(K, {}), now = Date.now(), todo = [];
  out.forEach(l => { const su = sUuid(l.id); if (!su || l.private) return; l.chapters.forEach(c => {
    if (c.status !== 'pending') return; const cu = cUuid(l.id, c.id); if (!cu || AI_RUN.has(cu)) return;
    const sig = contSig(c) + '|' + (l.mature ? 1 : 0), sn = seen[cu]; if (sn && sn.sig === sig && (sn.ok || now < sn.retry)) return;
    todo.push({ sid: l.id, cid: c.id, cu, sig }); }); });
  if (!todo.length) return; todo.forEach(x => AI_RUN.add(x.cu));
  (async () => { for (const x of todo) await sbAiCheck(x, K); })();
}
async function sbAiCheck(x, K) {
  { const pd = LS.get(uk('aipend'), {}); pd[x.cu] = 1; LS.set(uk('aipend'), pd); }      // si la IA lo aprueba, al sincronizar se avisa a quienes siguen el libro
  const s0 = S.stories.find(v => v.id === x.sid), before = s0 ? publicPrefix(s0.chapters).length : 0;
  let r = { ok: false };
  for (const fn of (AI_FN ? [AI_FN] : AI_FNS)) {
    try { r = await sbApi('/functions/v1/' + fn, { method: 'POST', body: { chapter_id: x.cu } }); } catch (e) { r = { ok: false }; }
    if (r.ok) { AI_FN = fn; break; }
    if (r.status && r.status !== 404 && !r.net) break;                   // la función existe y respondió con un error: se queda con ese error
  }
  AI_RUN.delete(x.cu); const seen = LS.get(K, {});
  if (r.ok && r.data && r.data.result) {
    seen[x.cu] = { sig: x.sig, ok: true }; LS.set(K, seen); const res = r.data.result;
    if (res === 'approved') toast('Tu capítulo pasó la revisión automática y ya está publicado ✓');
    else if (res === 'flagged') { const rs = (r.data.reasons || []).map(x => t(x)).join(', '); toast(t('Tu capítulo quedó en revisión: el equipo de moderación lo revisará pronto.') + (rs ? ' ' + t('La IA detectó:') + ' ' + rs + '.' : '')); }
    else if (res === 'clean_advisory') toast('La IA no encontró problemas, pero está en modo "solo avisar": moderación lo aprobará.');
    else if (res === 'clean_waiting') toast('La IA no encontró problemas. Se publicará cuando se apruebe el capítulo anterior.');
    else if (res === 'off') toast('La revisión automática está apagada: moderación revisará tu capítulo.');
    else if (res === 'stale') toast('Cambiaste el capítulo durante la revisión. Se volverá a revisar.');
    if (res !== 'approved' && res !== 'clean_waiting') { const pd = LS.get(uk('aipend'), {}); delete pd[x.cu]; LS.set(uk('aipend'), pd); }
    await sbRefresh();
  } else {
    seen[x.cu] = { sig: x.sig, ok: false, retry: Date.now() + (r.status === 404 ? 30 : 3) * 60000 }; LS.set(K, seen);
    const code = r.data && (r.data.error || r.data.message), det = r.data && r.data.detail ? ' · ' + String(r.data.detail).slice(0, 120) : '';
    LS.set('auri.ai.lasterr', { at: new Date().toISOString(), status: r.status || 0, code: code || '', detail: det });
    if (r.status && r.status !== 404 && !AI_ERR) { AI_ERR = true; toast(t('Revisión automática no disponible ({e}). Moderación revisará tu capítulo.', { e: (code || r.status) + det })); }
  }   // sin función o sin conexión: sigue pendiente y se reintenta más tarde
}
async function sbPullPublic() {                           // trae las obras de otras personas (y la cola de revisión si eres del equipo)
  const ses = sbSes(), uid = ses && ses.uid, staff = !!S.user && !isGuest() && !!ses && roleOf(S.user) !== 'USER';
  const [rs, rp, rt, rc] = await Promise.all([
    sbApi('/rest/v1/stories?select=*&order=updated_at.desc&limit=2000'),
    sbApi('/rest/v1/chapter_published?select=*&order=position&limit=10000'),
    sbApi('/rest/v1/takedowns?select=story_id&limit=2000'),
    staff ? sbApi('/rest/v1/chapters?select=*&status=in.(pending,rejected)&limit=2000') : Promise.resolve(null)]);
  const rai = staff ? await sbApi('/rest/v1/chapter_ai?select=chapter_id,flags,verdict&limit=2000') : null, aiBy = new Map(((rai && rai.ok && Array.isArray(rai.data)) ? rai.data : []).map(a => [a.chapter_id, { ...(a.flags || {}), verdict: a.verdict }]));
  if (staff) {                                           // quién está revisando cada libro ahora mismo
    const rcl = await sbApi('/rest/v1/review_claims?select=*&at=gte.' + encodeURIComponent(new Date(Date.now() - CLAIM_MS).toISOString())), sig0 = JSON.stringify(Object.entries(CLAIMS).filter(([, v]) => v.by !== S.user));
    if (rcl.ok && Array.isArray(rcl.data)) {
      for (const k in CLAIMS) if (CLAIMS[k].by !== S.user) delete CLAIMS[k];
      const others = rcl.data.filter(r => r.user_id !== uid), nm = {};
      if (others.length) { const pn = await sbApi('/rest/v1/profiles?select=id,name&id=in.(' + [...new Set(others.map(r => r.user_id))].join(',') + ')'); if (pn.ok && Array.isArray(pn.data)) pn.data.forEach(p => { nm[p.id] = p.name; }); }
      others.forEach(r => { CLAIMS[sBack(r.story_id)] = { by: remoteKey(r.user_id), name: nm[r.user_id] || '', at: Date.parse(r.at) }; });
      if (JSON.stringify(Object.entries(CLAIMS).filter(([, v]) => v.by !== S.user)) !== sig0 && location.hash.startsWith('#/moderation')) setTimeout(() => { KEEP = true; render(); }, 0);
    }
  }
  if (!rs.ok || !rp.ok || !Array.isArray(rs.data) || !Array.isArray(rp.data)) return false;
  const stories = rs.data.filter(r => r.owner !== uid), sIds = new Set(stories.map(r => r.id));
  const pubBy = new Map(), wkBy = new Map();
  rp.data.forEach(p => { if (sIds.has(p.story_id)) (pubBy.get(p.story_id) || pubBy.set(p.story_id, []).get(p.story_id)).push(p); });
  if (rc && rc.ok && Array.isArray(rc.data)) rc.data.forEach(c => { if (sIds.has(c.story_id)) (wkBy.get(c.story_id) || wkBy.set(c.story_id, []).get(c.story_id)).push(c); });
  const owners = [...new Set(stories.filter(r => (pubBy.get(r.id) || wkBy.get(r.id) || []).length).map(r => r.owner))];
  let prof = [];
  if (owners.length) { const rpf = await sbApi('/rest/v1/profiles?select=*&id=in.(' + owners.join(',') + ')'); if (!rpf.ok || !Array.isArray(rpf.data)) return false; prof = rpf.data; }
  const us = LS.get('auri.users', {}); let blob = '';
  const prevOwners = LS.get('auri.cloudowners', []);
  for (const o of owners) {
    const pr = prof.find(x => x.id === o); if (!pr) continue; const key = remoteKey(o), old = us[key] || {};
    us[key] = { ...old, uid: o, cloud: true, remote: true, name: pr.name, community: pr.community === 'en' ? 'en' : 'es', bio: pr.bio || '', avatar: pr.avatar || '', banner: pr.banner || '', role: pr.role || 'USER', scope: Array.isArray(pr.scope) ? pr.scope : [],
      frameWorn: !!pr.frame_worn, frameSel: pr.frame_sel == null ? undefined : pr.frame_sel, cosTop: pr.cos_top == null ? undefined : pr.cos_top, shape: pr.photo_shape || '', halo: pr.halo || '', accent: pr.accent || '', mbti: pr.mbti || '', mbtiTheme: !!pr.mbti_theme, hideLists: !!pr.hide_lists, frameTop: !!pr.frame_top, bows: Array.isArray(pr.bows) ? pr.bows : [], modSince: pr.mod_since || undefined, admSince: pr.adm_since || undefined, onboarded: true, created: day(pr.created_at) || old.created, strikes: old.strikes || [] };
    const list = [];
    for (const r of stories.filter(x => x.owner === o)) {
      const pubs = (pubBy.get(r.id) || []), wk = (wkBy.get(r.id) || []), cmap = new Map();
      pubs.forEach(p => cmap.set(p.chapter_id, { pos: p.position, c: { id: cBack(p.chapter_id), title: p.title, text: p.text, status: 'approved', ...(p.cover ? { cover: p.cover } : {}), ...(p.music ? { music: p.music } : {}) } }));
      wk.forEach(w => { const p = pubs.find(x => x.chapter_id === w.id); cmap.set(w.id, { pos: w.position, c: { id: cBack(w.id), title: w.title, text: w.text, status: w.status, ...(w.status === 'rejected' && w.reason ? { reason: w.reason } : {}), ...(w.cover ? { cover: w.cover } : {}), ...(w.music ? { music: w.music } : {}), ...(w.status === 'pending' && aiBy.get(w.id) ? { ai: aiBy.get(w.id) } : {}),
        ...(p ? { live: { title: p.title, text: p.text, music: p.music || '', cover: p.cover || '' } } : {}) } }); });
      const chs = [...cmap.values()].sort((a, b) => a.pos - b.pos).map(x => x.c); if (!chs.length) continue;
      const first = pubs.map(p => day(p.published_at)).sort()[0];
      list.push({ id: sBack(r.id), ...infoFromRow(r), chapters: chs, updatedAt: day(r.updated_at) || today(), ...(first ? { publishedAt: first } : {}) });
    }
    blob += key + JSON.stringify(list); LS.set(`auri.u.${key}.stories`, list);
  }
  prevOwners.filter(k => !owners.some(o => remoteKey(o) === k)).forEach(k => localStorage.removeItem(`auri.u.${k}.stories`));
  const td = rt.ok && Array.isArray(rt.data) ? rt.data.map(x => sBack(x.story_id)) : null; if (td) blob += JSON.stringify(td);
  const usBlob = JSON.stringify(Object.fromEntries(Object.entries(us).filter(([k]) => k.endsWith('@cloud.auri'))));
  const hash = hsh(blob + usBlob), changed = hash !== LS.get('auri.cloudhash', '');
  LS.set('auri.users', us); LS.set('auri.cloudowners', owners.map(remoteKey)); LS.set('auri.cloudhash', hash); if (td) LS.set('auri.takedown', td);
  return changed;
}
function sbChapterStatus(id, cid, status, reason) {       // el equipo aprueba o rechaza: se guarda en la nube
  if (!cloud() || !sbSes()) return; const cu = cUuid(id, cid); if (!cu) return;
  sbApi('/rest/v1/chapters?id=eq.' + cu, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { status, reason: reason || '' } }).then(r => {
    if (!r.ok) { const m = String((r.data && r.data.message) || ''); toast(/anteriores/i.test(m) ? t('Aprueba antes los capítulos anteriores.') : t('No se pudo guardar el cambio. Inténtalo de nuevo.')); }
    sbRefresh();
  });
}
function sbStoryPatch(id, body) { const su = sUuid(id); if (!cloud() || !sbSes() || !su) return; sbApi('/rest/v1/stories?id=eq.' + su, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body }).then(() => sbRefresh()); }
function sbTakedown(id, on) {
  const su = sUuid(id); if (!cloud() || !sbSes() || !su) return;
  (on ? sbApi('/rest/v1/takedowns', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: { story_id: su, by: sbSes().uid } }) : sbApi('/rest/v1/takedowns?story_id=eq.' + su, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })).then(() => sbRefresh());
}
setInterval(() => { if (document.visibilityState !== 'hidden') sbRefresh(); }, 90000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sbRefresh(); LAST_ON = null; sbBeat(); } });
/* ---------- NUBE · seguir, me gusta, favoritos, biblioteca, comentarios y datos personales ----------
   Cada tipo de dato se sincroniza igual: se compara lo de este dispositivo, lo de la nube y lo de la última vez.
   - Lo que tú cambiaste se sube; lo que cambió otra persona se baja; lo que borraste se borra en la nube. */
const myUid = () => (sbSes() || {}).uid || null;
const strHex = s => [...String(s)].map(ch => (ch.charCodeAt(0) & 255).toString(16).padStart(2, '0')).join('').slice(0, 32).padEnd(32, '0');   // ids de hasta 16 caracteres
const idUuid = s => { const h = strHex(s); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const uuidId = u => { const h = String(u).replace(/-/g, ''); let s = ''; for (let i = 0; i < 32; i += 2) { const c = parseInt(h.slice(i, i + 2), 16); if (!c) break; s += String.fromCharCode(c); } return s; };
const idTime = s => { const n = parseInt(String(s).slice(0, 13), 10); return n > 1e12 ? new Date(n).toISOString() : new Date().toISOString(); };
function sbIds(us) {                                        // correo/clave local ↔ id en la nube
  const me = myUid(), fw = new Map([[S.user, me]]), bw = new Map([[me, S.user]]);
  for (const k in us) { const u = us[k]; if (u && u.uid && !u.remote && k !== S.user && u.uid !== me) { fw.set(k, u.uid); bw.set(u.uid, k); } }   // otras cuentas reales de este mismo dispositivo
  for (const k in us) { const u = us[k]; if (u && u.uid && u.remote) { fw.set(k, u.uid); if (u.uid !== me) bw.set(u.uid, k); } }   // si hubo otra sesión en este dispositivo, la copia de tu propia cuenta no debe reemplazar tu clave
  return { me, uid: k => fw.get(k) || null, key: u => bw.get(u) || null };
}
const SOC_KV = ['cols', 'progress', 'pos', 'cfg', 'chars', 'dmread'];
const rowSets = {                                            // tablas de pares (persona, cosa)
  follows: { path: '/rest/v1/follows?select=*&limit=50000', table: 'follows', id: r => r.follower + '>' + r.followee, mine: (r, c) => r.follower === c.me, del: r => `follower=eq.${r.follower}&followee=eq.${r.followee}` },
  likes: { path: '/rest/v1/likes?select=*&limit=50000', table: 'likes', id: r => r.user_id + '|' + r.story_id, mine: (r, c) => r.user_id === c.me, del: r => `user_id=eq.${r.user_id}&story_id=eq.${r.story_id}` },
  subscriptions: { path: '/rest/v1/subscriptions?select=*&limit=50000', table: 'subscriptions', id: r => r.user_id + '|' + r.story_id, mine: (r, c) => r.user_id === c.me, del: r => `user_id=eq.${r.user_id}&story_id=eq.${r.story_id}` },
  favorites: { path: '/rest/v1/favorites?select=*&limit=50000', table: 'favorites', id: r => r.user_id + '|' + r.story_id, mine: () => true, del: r => `user_id=eq.${r.user_id}&story_id=eq.${r.story_id}` },
  library: { path: '/rest/v1/library?select=*&limit=50000', table: 'library', id: r => r.user_id + '|' + r.story_id, mine: () => true, del: r => `user_id=eq.${r.user_id}&story_id=eq.${r.story_id}` },
  blocks: { path: '/rest/v1/blocks?select=*&limit=50000', table: 'blocks', id: r => r.blocked + '|' + r.kind, mine: () => true, del: r => `blocker=eq.${r.blocker}&blocked=eq.${r.blocked}&kind=eq.${r.kind}` },
  comment_likes: { path: '/rest/v1/comment_likes?select=*&limit=50000', table: 'comment_likes', id: r => r.comment_id + '|' + r.user_id, mine: (r, c) => r.user_id === c.me, del: r => `comment_id=eq.${r.comment_id}&user_id=eq.${r.user_id}` },
  paragraph_comment_likes: { path: '/rest/v1/paragraph_comment_likes?select=*&limit=50000', table: 'paragraph_comment_likes', id: r => r.comment_id + '|' + r.user_id, mine: (r, c) => r.user_id === c.me, del: r => `comment_id=eq.${r.comment_id}&user_id=eq.${r.user_id}` }
};
const SOC_ORDER = ['follows', 'likes', 'subscriptions', 'favorites', 'library', 'blocks', 'comments', 'comment_likes', 'pcom', 'pcom_likes', 'user_data'];
const SOC_TABLE = { pcom: 'paragraph_comments', pcom_likes: 'paragraph_comment_likes' };
/* --- lo de este dispositivo, en el mismo formato que la nube --- */
function socLocal(n, c) {
  const L = new Map(), put = (row, id, m, v) => L.set(id, { id, m, v: v || '1', row }), me = c.me;
  if (n === 'follows') { const f = G.get('follows', {}); for (const a in f) { const ua = c.uid(a); if (!ua) continue; for (const b of f[a] || []) { const ub = c.uid(b); if (ub && ua !== ub) { const r = { follower: ua, followee: ub }; put(r, rowSets.follows.id(r), ua === me); } } } }
  else if (n === 'likes' || n === 'subscriptions') { const o = G.get(n === 'likes' ? 'likes' : 'subs', {}); for (const sid in o) { const su = sUuid(sid); if (!su) continue; for (const k of o[sid] || []) { const u = c.uid(k); if (u) { const r = { user_id: u, story_id: su }; put(r, rowSets[n].id(r), u === me); } } } }
  else if (n === 'favorites' || n === 'library') { for (const sid of (n === 'favorites' ? S.favs : S.lib) || []) { const su = sUuid(sid); if (su) { const r = { user_id: me, story_id: su }; put(r, rowSets[n].id(r), true); } } }
  else if (n === 'blocks') { for (const kind of ['block', 'mute']) for (const k of bl(S.user, kind === 'block' ? 'blocked' : 'muted')) { const u = c.uid(k); if (u) { const r = { blocker: me, blocked: u, kind }; put(r, rowSets.blocks.id(r), true); } } }
  else if (n === 'comments' || n === 'comment_likes') {
    const all = G.get('comments', {});
    for (const sid in all) { const su = sUuid(sid); if (!su) continue; for (const cm of all[sid] || []) { const u = c.uid(cm.by); if (!u) continue; const cu = idUuid(cm.id);
      if (n === 'comments') { const r = { id: cu, story_id: su, user_id: u, parent_id: cm.parent != null && cm.parent !== '' ? idUuid(cm.parent) : null, text: String(cm.text || '').slice(0, 2000) || '·', edited: !!cm.edited, chapter_pos: Number.isInteger(cm.ch) && cm.ch > 0 ? cm.ch : 0, created_at: idTime(cm.id) }; put(r, cu, u === me, r.text + '\u0001' + (r.edited ? 1 : 0)); }
      else for (const k of cm.lk || []) { const lu = c.uid(k); if (lu) { const r = { comment_id: cu, user_id: lu }; put(r, rowSets.comment_likes.id(r), lu === me); } } } }
  }
  else if (n === 'pcom' || n === 'pcom_likes') {
    const all = G.get('pcom', {});
    for (const key in all) { const [sid, ci, pi] = key.split('|'), su = sUuid(sid); if (!su) continue; for (const cm of all[key] || []) { const u = c.uid(cm.by); if (!u) continue; const cu = idUuid(cm.id);
      if (n === 'pcom') { const r = { id: cu, story_id: su, chapter_pos: +ci || 0, para_idx: +pi || 0, q: String(cm.q || ''), user_id: u, parent_id: cm.parent != null && cm.parent !== '' ? idUuid(cm.parent) : null, text: String(cm.text || '').slice(0, 1000) || '·', spoiler: !!cm.spoiler, created_at: idTime(cm.id) }; put(r, cu, u === me, r.text + '\u0001' + (r.spoiler ? 1 : 0)); }
      else for (const k of cm.lk || []) { const lu = c.uid(k); if (lu) { const r = { comment_id: cu, user_id: lu }; put(r, rowSets.paragraph_comment_likes.id(r), lu === me); } } } }
  }
  else if (n === 'user_data') { for (const k of SOC_KV) { const raw = localStorage.getItem(uk(k)); if (raw == null) continue; let val; try { val = JSON.parse(raw); } catch { continue; } put({ user_id: me, key: k, value: val }, k, true, hsh(raw)); } }
  return L;
}
function socCloud(n, rows, c) {
  const C = new Map();
  rows.forEach(r => {
    if (n === 'comments') C.set(r.id, { id: r.id, m: r.user_id === c.me, v: r.text + '\u0001' + (r.edited ? 1 : 0), row: r });
    else if (n === 'pcom') C.set(r.id, { id: r.id, m: r.user_id === c.me, v: r.text + '\u0001' + (r.spoiler ? 1 : 0), row: r });
    else if (n === 'user_data') C.set(r.key, { id: r.key, m: true, v: hsh(JSON.stringify(r.value)), row: r });
    else { const S0 = rowSets[SOC_TABLE[n] ? 'paragraph_comment_likes' : n]; C.set(S0.id(r), { id: S0.id(r), m: S0.mine(r, c), v: '1', row: r }); }
  });
  return C;
}
/* --- guarda en este dispositivo el resultado (devuelve true si algo cambió) --- */
function socWrite(n, F, c, fin) {
  const rows = [...F.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(e => e[1].row); let changed = false;
  const store = (key, val, raw) => { const cur = localStorage.getItem(key); const nv = JSON.stringify(val); if (cur !== nv && !(cur == null && (Array.isArray(val) ? !val.length : val && typeof val === 'object' ? !Object.keys(val).length : false))) { localStorage.setItem(key, nv); changed = true; } };
  if (n === 'follows') { const o = {}; rows.forEach(r => { const a = c.key(r.follower), b = c.key(r.followee); if (a && b) (o[a] = o[a] || []).push(b); }); store('auri.follows', o); }
  else if (n === 'likes' || n === 'subscriptions') { const o = {}; rows.forEach(r => { const k = c.key(r.user_id); if (k) (o[sBack(r.story_id)] = o[sBack(r.story_id)] || []).push(k); }); store(n === 'likes' ? 'auri.likes' : 'auri.subs', o); }
  else if (n === 'favorites') { S.favs = rows.map(r => sBack(r.story_id)); store(uk('favs'), S.favs); }
  else if (n === 'library') { S.lib = rows.map(r => sBack(r.story_id)); store(uk('lib'), S.lib); }
  else if (n === 'blocks') { for (const [kind, nm] of [['block', 'blocked'], ['mute', 'muted']]) { const keep = bl(S.user, nm).filter(k => !c.uid(k)); store('auri.u.' + S.user + '.' + nm, [...keep, ...rows.filter(r => r.kind === kind).map(r => c.key(r.blocked)).filter(Boolean)]); } }
  else if (n === 'comments') {
    const lk = {}; (fin.comment_likes ? [...fin.comment_likes.values()] : []).forEach(x => { const k = c.key(x.row.user_id); if (k) (lk[x.row.comment_id] = lk[x.row.comment_id] || []).push(k); });
    const o = {}; rows.slice().sort((a, b) => uuidId(a.id).localeCompare(uuidId(b.id))).forEach(r => { const by = c.key(r.user_id); if (!by) return; const sid = sBack(r.story_id), id = Number(uuidId(r.id));
      (o[sid] = o[sid] || []).push({ id, by, text: r.text, date: String(r.created_at || '').slice(0, 10), ...(r.chapter_pos > 0 ? { ch: r.chapter_pos } : {}), ...(r.parent_id ? { parent: Number(uuidId(r.parent_id)) } : {}), ...(r.edited ? { edited: true } : {}), ...(lk[r.id] ? { lk: lk[r.id] } : {}) }); });
    store('auri.comments', o);
  }
  else if (n === 'pcom') {
    const lk = {}; (fin.pcom_likes ? [...fin.pcom_likes.values()] : []).forEach(x => { const k = c.key(x.row.user_id); if (k) (lk[x.row.comment_id] = lk[x.row.comment_id] || []).push(k); });
    const o = {}; rows.slice().sort((a, b) => uuidId(a.id).localeCompare(uuidId(b.id))).forEach(r => { const by = c.key(r.user_id); if (!by) return; const key = sBack(r.story_id) + '|' + r.chapter_pos + '|' + r.para_idx;
      (o[key] = o[key] || []).push({ id: uuidId(r.id), by, text: r.text, date: String(r.created_at || '').slice(0, 10), spoiler: !!r.spoiler, q: r.q || '', ...(r.parent_id ? { parent: uuidId(r.parent_id) } : {}), ...(lk[r.id] ? { lk: lk[r.id] } : {}) }); });
    store('auri.pcom', o);
  }
  else if (n === 'user_data') { rows.forEach(r => { const key = uk(r.key), nv = JSON.stringify(r.value); if (localStorage.getItem(key) !== nv) { localStorage.setItem(key, nv); changed = true; } });
    if (changed) { S.cols = LS.get(uk('cols'), []); S.progress = LS.get(uk('progress'), {}); S.pos = LS.get(uk('pos'), {}); S.cfg = LS.get(uk('cfg'), {}); loadChars(); applyReading(); } }
  return changed;
}
async function socBulk(table, rows) {                // inserta por lotes; si el lote falla, fila por fila. Devuelve {ok:Set, dead:Set(error permanente), retry:Set}
  const out = { ok: new Set(), dead: new Set(), retry: new Set() }; if (!rows.length) return out;
  const H = { Prefer: 'return=minimal,resolution=ignore-duplicates' }, p = '/rest/v1/' + table;
  const r = await sbApi(p, { method: 'POST', headers: H, body: rows }); if (r.ok) { rows.forEach(x => out.ok.add(x._id)); return out; }
  const noCol = q => q && !q.ok && !q.net && /chapter_pos/.test(JSON.stringify(q.data || ''));      // aún no se corrió el SQL de comentarios por capítulo: se queda aquí y se reintenta
  if (r.net || r.status >= 500 || noCol(r)) { rows.forEach(x => out.retry.add(x._id)); return out; }
  for (const x of rows) { const { _id, ...b } = x; const q = await sbApi(p, { method: 'POST', headers: H, body: b }); (q.ok ? out.ok : (q.net || q.status >= 500 || noCol(q)) ? out.retry : out.dead).add(_id); }
  return out;
}
let SOC_ONLY = null, SOC_BUSY = false;
async function sbSyncSocial(only) {
  const ses = sbSes(); if (!ses || !S.user || String(ses.email).toLowerCase() !== S.user || isGuest()) return false;
  if (SOC_BUSY) { SOC_ONLY = null; return false; } SOC_BUSY = true;
  try {
    await sbImgLocal(uk('chars'));                         // fotos de personajes: primero a Storage
    const names = SOC_ORDER.filter(n => !only || only.includes(n)), K = uk('cloudsoc'), B = LS.get(K, {}), me = ses.uid;
    const paths = { comments: '/rest/v1/comments?select=*&order=created_at&limit=50000', pcom: '/rest/v1/paragraph_comments?select=*&order=created_at&limit=50000', pcom_likes: rowSets.paragraph_comment_likes.path, user_data: '/rest/v1/user_data?select=*&limit=1000' };
    const res = await Promise.all(names.map(n => sbApi(paths[n] || rowSets[n].path)));
    if (res.some(r => !r.ok || !Array.isArray(r.data))) return false;                  // sin conexión o sin permiso: no se toca nada
    // personas que aparecen en la nube y aún no conocemos
    let us = LS.get('auri.users', {}), ids = sbIds(us); const need = new Set();
    res.forEach(r => r.data.forEach(x => ['user_id', 'follower', 'followee', 'blocked'].forEach(f => { if (x[f] && !ids.key(x[f])) need.add(x[f]); })));
    if (need.size) { const list = [...need]; for (let i = 0; i < list.length; i += 80) { const pr = await sbApi('/rest/v1/profiles?select=*&id=in.(' + list.slice(i, i + 80).join(',') + ')'); if (pr.ok && Array.isArray(pr.data)) pr.data.forEach(p => { us[remoteKey(p.id)] = sbPseudo(p, us[remoteKey(p.id)]); }); } LS.set('auri.users', us); ids = sbIds(us); }
    const c = { me, uid: ids.uid, key: ids.key }, fin = {}; let changed = false; const staff = isStaff();
    for (let i = 0; i < names.length; i++) {
      const n = names[i], C = socCloud(n, res[i].data, c), L = socLocal(n, c), b = B[n] || {}, F = new Map(), add = [], edit = [], del = [], settled = {};
      for (const id of new Set([...L.keys(), ...C.keys()])) {
        const l = L.get(id), cl = C.get(id), bv = b[id], mine = (l || cl).m;
        if (!mine) { if (cl) F.set(id, cl); else if (l && staff && bv !== undefined && (n === 'comments' || n === 'pcom')) del.push(l); continue; }
        if (l && !cl) { if (bv !== undefined) continue; add.push(l); F.set(id, l); }
        else if (!l && cl) { if (bv !== undefined) del.push(cl); else F.set(id, cl); }
        else if (bv !== undefined && l.v !== bv) { if (l.v !== cl.v) edit.push(l); F.set(id, l); }
        else F.set(id, cl);
      }
      // subir
      const table = SOC_TABLE[n] || (rowSets[n] ? rowSets[n].table : n), dead = new Set(), retry = new Set();
      if (add.length) {
        if (n === 'user_data') { const r = await sbApi('/rest/v1/user_data', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: add.map(x => ({ ...x.row, updated_at: new Date().toISOString() })) }); if (!r.ok) add.forEach(x => ((r.net || r.status >= 500) ? retry : dead).add(x.id)); }
        else { const o = await socBulk(table, add.map(x => ({ ...x.row, _id: x.id }))); o.dead.forEach(id => dead.add(id)); o.retry.forEach(id => retry.add(id)); }
      }
      for (const l of edit) { const body = n === 'comments' ? { text: l.row.text, edited: true } : n === 'user_data' ? { value: l.row.value, updated_at: new Date().toISOString() } : null; if (!body) continue;
        const r = await sbApi('/rest/v1/' + table + (n === 'user_data' ? '?user_id=eq.' + me + '&key=eq.' + l.id : '?id=eq.' + l.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body }); if (!r.ok && (r.net || r.status >= 500)) retry.add(l.id); }
      for (const x of del) { const q = n === 'comments' || n === 'pcom' ? 'id=eq.' + x.row.id : n === 'user_data' ? '' : rowSets[n].del(x.row); if (!q) continue; const r = await sbApi('/rest/v1/' + table + '?' + q, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); if (!r.ok && (r.net || r.status >= 500)) retry.add(x.id); }
      dead.forEach(id => F.delete(id));                                                  // la nube lo rechazó (p. ej. obra no publicada): se quita de aquí
      fin[n] = F; B[n] = Object.fromEntries([...F.entries()].filter(([id]) => !retry.has(id)).map(([id, x]) => [id, x.v]));
    }
    for (const n of names) { if (socWrite(n, fin[n], c, fin)) changed = true; }
    LS.set(K, B);
    return changed;
  } finally { SOC_BUSY = false; }
}
function sbPseudo(pr, old) {                                   // copia local de la cuenta de otra persona (sin datos privados)
  old = old || {};
  return { ...old, uid: pr.id, cloud: true, remote: true, name: pr.name, community: pr.community === 'en' ? 'en' : 'es', bio: pr.bio || '', avatar: pr.avatar || '', banner: pr.banner || '', role: pr.role || 'USER', scope: Array.isArray(pr.scope) ? pr.scope : [],
    frameWorn: !!pr.frame_worn, frameSel: pr.frame_sel == null ? undefined : pr.frame_sel, cosTop: pr.cos_top == null ? undefined : pr.cos_top, shape: pr.photo_shape || '', halo: pr.halo || '', accent: pr.accent || '', mbti: pr.mbti || '', mbtiTheme: !!pr.mbti_theme, hideLists: !!pr.hide_lists, frameTop: !!pr.frame_top, bows: Array.isArray(pr.bows) ? pr.bows : [], modSince: pr.mod_since || undefined, admSince: pr.adm_since || undefined, onboarded: true, created: day(pr.created_at) || old.created, strikes: old.strikes || [] };
}
const SOC_G = { 'auri.likes': ['likes'], 'auri.follows': ['follows'], 'auri.comments': ['comments', 'comment_likes'], 'auri.pcom': ['pcom', 'pcom_likes'], 'auri.subs': ['subscriptions'] };
let SB_SOC_T;
function sbHook(k) {                                          // se llama cada vez que la app guarda algo: decide qué hay que sincronizar
  if (!cloud() || !sbSes() || SB_QUIET || !S.user) return;
  if (k === `auri.u.${S.user}.stories`) return sbStoriesSoon();
  if (k === 'auri.news' || k === 'auri.banners' || k === 'auri.newsdrafts') { if (POST_QUIET) return; clearTimeout(POST_T); POST_T = setTimeout(() => sbSyncPosts().then(c => c && softRender()), 1000); return; }
  if (k === 'auri.dm' || k === 'auri.notifs.' + S.user) { clearTimeout(SB_MSG_T); SB_MSG_T = setTimeout(() => sbSyncMsgs().then(c => c && msgUi()), 500); return; }
  let n = SOC_G[k]; const pre = `auri.u.${S.user}.`;
  if (!n && k.startsWith(pre)) { const s = k.slice(pre.length); n = { favs: ['favorites'], lib: ['library'], blocked: ['blocks'], muted: ['blocks'] }[s] || (SOC_KV.includes(s) ? ['user_data'] : null); }
  if (!n) return;
  const slow = k.endsWith('.pos') || k.endsWith('.progress'); SB_Q.soc.add(n[0]); n.forEach(x => SB_Q.soc.add(x));
  clearTimeout(SB_SOC_T); SB_SOC_T = setTimeout(() => sbRefresh({ soc: [] }), slow ? 15000 : 1200);
}
/* ---------- NUBE · mensajes, solicitudes de mensaje y avisos ----------
   Los mensajes no se editan: se suben los nuevos y se bajan los de la otra persona. Las solicitudes y los avisos se copian tal cual desde la nube. */
const isUuid = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x));
let MSG_BUSY = false, MSG_AGAIN = false, MSG_LAST = 0, SB_MSG_T, DM_SHOWN = '';
const stable = o => JSON.stringify(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
async function sbKnow(list) {                                 // trae los perfiles de personas que aún no conocemos
  const us = LS.get('auri.users', {}); let ids = sbIds(us); const need = [...new Set(list.filter(u => u && !ids.key(u)))];
  if (!need.length) return ids;
  for (let i = 0; i < need.length; i += 80) { const pr = await sbApi('/rest/v1/profiles?select=*&id=in.(' + need.slice(i, i + 80).join(',') + ')'); if (pr.ok && Array.isArray(pr.data)) pr.data.forEach(p => { us[remoteKey(p.id)] = sbPseudo(p, us[remoteKey(p.id)]); }); }
  LS.set('auri.users', us); return sbIds(us);
}
function dmFailText(r) {
  const m = String((r.data && r.data.message) || '');
  return /enlaces|correos|tel[eé]fono/i.test(m) ? t('La solicitud no puede incluir enlaces, correos ni números de teléfono.') : /Ya existe/i.test(m) ? t('Ya existe una solicitud de mensaje con esta persona.') : t('No se pudo enviar el mensaje.');
}
async function sbAdults() {                                  // ¿cada persona de la nube es mayor de edad? (solo un sí/no)
  const us = LS.get('auri.users', {}), now = Date.now(), need = Object.values(us).filter(u => u && u.remote && u.uid && (!u.adultAt || now - u.adultAt > 3600e3)).map(u => u.uid); let ch = false;
  for (let i = 0; i < need.length; i += 200) {
    const r = await sbApi('/rest/v1/rpc/adult_flags', { method: 'POST', body: { ids: need.slice(i, i + 200) } }); if (!r.ok || !Array.isArray(r.data)) break;
    const u2 = LS.get('auri.users', {}); r.data.forEach(x => { const k = remoteKey(x.id), u = u2[k]; if (!u) return; if (!u.adultAt || u.adultDeclared !== !!x.adult) ch = true; u2[k] = { ...u, adultDeclared: !!x.adult, adultAt: now }; }); localStorage.setItem('auri.users', JSON.stringify(u2));
  }
  return ch;
}
async function sbSyncMsgs() {
  const ses = sbSes(); if (!cloud() || !ses || !S.user || isGuest() || String(ses.email || '').toLowerCase() !== S.user) return false;
  if (MSG_BUSY) { MSG_AGAIN = true; return false; } MSG_BUSY = true; MSG_LAST = Date.now(); let changed = false;
  try {
    const me = ses.uid, CK = uk('dmcur'), cur = LS.get(CK, ''); let ids = sbIds(LS.get('auri.users', {}));
    // 1) subir los mensajes nuevos, en orden
    const out = []; const d0 = G.get('dm', {});
    for (const k in d0) for (const m of d0[k]) if (m.by === S.user && !m.ok && !m.u) { const o = k.split('|').find(x => x !== S.user), ru = ids.uid(o); if (ru) out.push({ k, m, ru, o }); }
    out.sort((a, b) => a.m.id - b.m.id);
    for (const x of out) {
      const su = x.m.sid ? sUuid(x.m.sid) : null, imgUrl = x.m.img ? await sbImgConv(x.m.img) : '';
      const r = await sbApi('/rest/v1/messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { sender: me, recipient: x.ru, text: x.m.text || '', story_id: su, img: imgUrl } });
      if (r.net || r.status >= 500) break;                                   // sin conexión: se intenta de nuevo luego
      const all = G.get('dm', {}), l = all[x.k] || [], i = l.findIndex(z => z.id === x.m.id && z.by === S.user && !z.u); if (i < 0) continue;
      if (r.ok && Array.isArray(r.data) && r.data[0]) { l[i] = { ...l[i], u: r.data[0].id, ok: 1, id: Date.parse(r.data[0].created_at) || l[i].id, ...(imgUrl ? { img: imgUrl } : {}) }; delete l[i].n; }
      else if (l[i].n) {                                                      // la nube lo rechazó: se quita y se avisa
        l.splice(i, 1); const rq = dmReq(), kk = S.user + '>' + x.o; if (rq[kk] === 'pending' && !l.some(z => z.by === S.user)) { delete rq[kk]; localStorage.setItem('auri.dmreq', JSON.stringify(rq)); }
        toast(dmFailText(r));
      } else l[i] = { ...l[i], ok: 2 };                                        // mensaje antiguo que no se puede subir: queda solo en este dispositivo
      all[x.k] = l; localStorage.setItem('auri.dm', JSON.stringify(all)); changed = true;
    }
    // 2) bajar mensajes, solicitudes y avisos
    const [rm, rr, rn] = await Promise.all([
      sbApi('/rest/v1/messages?select=*&or=(sender.eq.' + me + ',recipient.eq.' + me + ')&order=created_at.asc&limit=2000' + (cur ? '&created_at=gt.' + encodeURIComponent(cur) : '')),
      sbApi('/rest/v1/dm_requests?select=*&limit=2000'),
      sbApi('/rest/v1/notifications?select=*&user_id=eq.' + me + '&order=created_at.desc&limit=100')]);
    const ok = r => r.ok && Array.isArray(r.data), pool = [];
    if (ok(rm)) rm.data.forEach(r => pool.push(r.sender, r.recipient)); if (ok(rr)) rr.data.forEach(r => pool.push(r.sender, r.recipient)); if (ok(rn)) rn.data.forEach(r => pool.push(r.from_user));
    ids = await sbKnow(pool); if (await sbAdults()) changed = true;
    if (ok(rm) && rm.data.length) {
      const all = G.get('dm', {}); let ch = false;
      for (const r of rm.data) { const a = ids.key(r.sender), b = ids.key(r.recipient); if (!a || !b) continue; const k = dmKey(a, b), l = all[k] = all[k] || [];
        if (l.some(z => z.u === r.id)) continue;
        l.push({ id: Date.parse(r.created_at) || Date.now(), by: a, text: r.text || '', ...(r.story_id ? { sid: sBack(r.story_id) } : {}), ...(r.img ? { img: r.img } : {}), u: r.id, ok: 1 }); ch = true; }
      if (ch) { for (const k in all) all[k] = all[k].sort((x, y) => x.id - y.id).slice(-300); localStorage.setItem('auri.dm', JSON.stringify(all)); changed = true; }
      LS.set(CK, rm.data.reduce((a, r) => (r.created_at > a ? r.created_at : a), cur));
    }
    if (ok(rr)) {
      const rq = dmReq(), nq = {}, unpushed = (a, b) => (G.get('dm', {})[dmKey(a, b)] || []).some(m => m.by === a && !m.ok);
      rr.data.forEach(r => { const a = ids.key(r.sender), b = ids.key(r.recipient); if (a && b) nq[a + '>' + b] = r.status; });
      const res = {}; for (const k in rq) { const [a, b] = k.split('>'); if (ids.uid(a) && ids.uid(b) && (a === S.user || b === S.user) && !(k in nq) && !(a === S.user && unpushed(a, b))) continue; res[k] = rq[k]; }
      Object.assign(res, nq);
      if (stable(res) !== stable(rq)) { localStorage.setItem('auri.dmreq', JSON.stringify(res)); changed = true; }
    }
    if (ok(rn)) {
      const nk = 'notifs.' + S.user, local = G.get(nk, []), CNK = uk('cloudnotif'), B = new Set(LS.get(CNK, [])), cfg = (LS.get(uk('cfg'), {}).notif) || {};
      const rows = new Map(rn.data.map(r => [r.id, r])), localIds = new Set(local.map(n => n.id)), keep = [], del = [], rd = [];
      for (const n of local) {
        if (!isUuid(n.id)) { keep.push(n); continue; }
        const r = rows.get(n.id); if (!r) { if (!B.has(n.id)) keep.push(n); continue; }
        if (n.read && !r.read) rd.push(n.id); keep.push({ ...n, read: !!(n.read || r.read), ...(r.done ? { done: r.done } : {}) });
      }
      for (const r of rn.data) {
        if (localIds.has(r.id)) continue;
        if (B.has(r.id)) { del.push(r.id); continue; }                       // la borraste en este dispositivo
        if (['chapter', 'like', 'comment', 'follow'].includes(r.type) && cfg[r.type] === false) continue;   // apagaste este tipo de aviso
        keep.push({ id: r.id, type: r.type, from: r.type === 'sys' ? '' : ids.key(r.from_user) || '', storyId: r.story_id ? sBack(r.story_id) : '', extra: r.extra || '', chap: r.chap || '', date: r.created_at, read: !!r.read,
          ...(r.xv ? { xv: r.xv } : {}), ...(r.href ? { href: r.href } : {}), ...(r.role ? { role: r.role } : {}), ...(r.done ? { done: r.done } : {}) });
      }
      keep.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
      const nl = keep.slice(0, 100);
      if (JSON.stringify(nl) !== JSON.stringify(local)) { localStorage.setItem('auri.' + nk, JSON.stringify(nl)); changed = true; }
      if (rd.length) await sbApi('/rest/v1/notifications?id=in.(' + rd.join(',') + ')', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { read: true } });
      if (del.length) await sbApi('/rest/v1/notifications?id=in.(' + del.join(',') + ')', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      LS.set(CNK, rn.data.map(r => r.id).filter(id => !del.includes(id)));
    }
  } catch (e) { console.warn('msgs', e); }
  finally { MSG_BUSY = false; if (MSG_AGAIN) { MSG_AGAIN = false; setTimeout(() => sbSyncMsgs().then(c => c && msgUi()), 300); } }
  return changed;
}
/** Avisos para otras personas: van directo a la nube (cada quien los baja en su dispositivo) */
function sbOut(to, o) {
  if (!cloud() || !sbSes() || isGuest() || !S.user) return false;
  const u = getUsers()[to]; if (!u || !u.remote || !u.uid) return false;
  const fu = (isStaff() && o.from && (getUsers()[o.from] || {}).uid) || myUid();
  const body = { user_id: u.uid, type: o.type, from_user: fu, story_id: o.storyId ? sUuid(o.storyId) : null, chap: String(o.chap || ''), extra: String(o.extra || ''), xv: o.xv || null, href: o.href || null, role: o.role || null };
  sbApi('/rest/v1/notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body }).then(r => {
    if (!r.ok && !r.net && r.status < 500 && body.story_id) sbApi('/rest/v1/notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { ...body, story_id: null } });
  });
  return true;
}
/** Redibuja lo necesario cuando llegan mensajes o avisos nuevos */
function msgUi() {
  const m = location.hash.match(/^#\/messages\/(.+)$/), ae = document.activeElement && document.activeElement.tagName, typing = ae === 'INPUT' || ae === 'TEXTAREA';
  if (m) { const to = decodeURIComponent(m[1]); if (DM_SHOWN !== to + ':' + dmMode(S.user, to) && !typing) { KEEP = true; return render(); } return paintDm(to); }
  if (!typing && !W && !/^#\/(write|story\/[^/]+\/\d)/.test(location.hash)) { KEEP = true; render(); }
}
setInterval(() => { if (document.visibilityState === 'hidden' || !S.user || isGuest() || !cloud() || !sbSes()) return; const on = /^#\/messages/.test(location.hash); if (Date.now() - MSG_LAST > (on ? 4000 : 20000)) sbSyncMsgs().then(c => c && msgUi()); }, 2000);
/* ---------- NUBE · moderación ----------
   Strikes, suspensiones, apelaciones, reportes, regalos e invitaciones los decide el servidor (funciones RPC con permisos propios).
   Aquí solo se piden las acciones y se trae el estado a la copia local, para que el resto de la app lo lea como siempre. */
function modCloud() { const s = sbSes(); return cloud() && !!s && !!S.user && !isGuest() && String(s.email || '').toLowerCase() === S.user; }
function modUid(e) { return modCloud() ? (sbIds(getUsers()).uid(e) || null) : null; }
const isP = r => !!r && typeof r.then === 'function';
function modErr(r) { if (r.net) return t('Sin conexión. Inténtalo de nuevo.'); const m = String((r.data && (r.data.message || r.data.msg)) || '').replace(/\.$/, ''); return m ? t(m) : t('No se pudo completar la acción.'); }
async function modDo(fn, args, after) {                    // devuelve '' si salió bien o el texto del error
  const r = await sbApi('/rest/v1/rpc/' + fn, { method: 'POST', body: args });
  if (!r.ok) return modErr(r);
  try { if (after) await after(r); } catch (e) {}
  await sbSyncMod(true); return '';
}
async function modReport(o) {
  const ids = sbIds(getUsers()), ci = o.ci === '' || o.ci == null ? NaN : +o.ci;
  const body = { type: o.type, story_id: o.sid ? sUuid(o.sid) : null, comment_id: o.sid && o.cid !== '' && o.cid != null && Number.isSafeInteger(+o.cid) ? cUuid(o.sid, +o.cid) : null, chapter_pos: Number.isInteger(ci) ? ci : null,
    target: o.target ? ids.uid(o.target) : null, owner: o.owner ? ids.uid(o.owner) : null, title: o.title || '', excerpt: o.excerpt || '', reasons: o.reasons || [], text: o.text || '', imgs: await sbImgConv(o.imgs || []), community: commOf(o.owner || o.target || S.user), label: o.label || '' };
  let r = await sbApi('/rest/v1/reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body });
  if (!r.ok && !r.net && r.status < 500 && body.story_id) r = await sbApi('/rest/v1/reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { ...body, story_id: null, comment_id: null } });
  if (!r.ok) return modErr(r);
  await sbSyncMod(true); return '';
}
/* REGALOS de lazos (solo la Owner regala; sin límite y sin vencimiento; el marco del equipo no se regala) */
async function bowGift(tg, bow, on) {
  if (!isOwner()) return t('Solo la Owner puede regalar.'); if (!BOWS[bow] || roleOf(tg) === 'OWNER' || tg === S.user) return t('Ese lazo es para otras cuentas.');
  { const cu = modUid(tg); if (cu) return modDo(on ? 'bow_gift' : 'bow_take', { to_id: cu, bow }); }
  const us = getUsers(), u = us[tg]; if (!u) return t('No encontré esa cuenta.');
  const cur = (u.bows || []).filter(x => x !== bow); u.bows = on ? [...cur, bow] : cur;
  if (!on && u.cosTop === 'bow:' + bow) u.cosTop = '';
  G.set('users', us);
  pushNotif(tg, { type: 'sys', extra: on ? '¡Te regalaron un lazo ({n})! Puedes ponértelo en Insignias y adornos.' : 'Se retiró un lazo de tu perfil ({n}).', xv: { n: t(BOWS[bow][3]) } });
  logAction(on ? 'bow-gift' : 'bow-take', tg, (on ? 'Lazo regalado · ' : 'Lazo retirado · ') + BOWS[bow][3]); return '';
}
function openBowGift(tg) {
  const m = document.createElement('div'); m.className = 'modal sheet';
  const draw = () => { const own = bowsOf(tg); m.querySelector('.cos-sw').innerHTML = Object.keys(BOWS).map(k => `<button type="button" class="cos-b ${own.includes(k) ? 'on' : ''}" data-bow="${k}" aria-pressed="${own.includes(k)}" aria-label="${esc(t(BOWS[k][3]))}" title="${esc(t(BOWS[k][3]))}">${cosOne('bow:' + k)}</button>`).join(''); };
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Lazos para {n}', { n: esc(uName(tg)) })}</h2><p class="helper">${t('Toca un lazo para regalarlo; vuelve a tocarlo para quitarlo. No tiene límite ni vence.')}</p><div class="cos-sw"></div><p class="error-line" data-err role="alert"></p></div>`;
  draw();
  m.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-bow]');
    if (b) { const k = b.dataset.bow, r = await bowGift(tg, k, !bowsOf(tg).includes(k)); if (r) m.querySelector('[data-err]').textContent = r; else { m.querySelector('[data-err]').textContent = ''; draw(); } return; }
    if (ev.target === m || ev.target.closest('[data-no]')) { m.remove(); KEEP = true; render(); }
  });
  document.body.appendChild(m);
}
async function giftSendCloud(raw, err) {                   // la Owner puede regalar a cuentas que este dispositivo aún no conoce
  const q = String(raw || '').trim().replace(/^@/, ''); if (!q) return err;
  const r = await sbApi('/rest/v1/rpc/find_user', { method: 'POST', body: { q } });
  if (!r.ok || !Array.isArray(r.data) || !r.data.length) return err;
  if (r.data.length > 1) return t('Hay varias cuentas con ese nombre: usa el correo.');
  await sbKnow([r.data[0].id]); return modDo('gift_send', { to_id: r.data[0].id });
}
function softRender(force) {
  const ae = document.activeElement && document.activeElement.tagName;
  if (document.querySelector('.modal') || (!force && (ae === 'INPUT' || ae === 'TEXTAREA')) || W || /^#\/(write|story\/[^/]+\/\d)/.test(location.hash)) return;
  KEEP = true; render();
}
let MOD_BUSY = false, MOD_LAST = 0, MOD_PROF = 0;
const modSig = () => { const us = LS.get('auri.users', {}), o = {}; for (const k in us) { const u = us[k]; if (u && (u.remote || k === S.user)) o[k] = [u.role, u.scope, u.frameWorn, u.frameSel, u.frameTop, u.bows, u.strikes, u.ban, u.modSince, u.admSince]; } return JSON.stringify([o, G.get('reports', []), G.get('appeals', []), G.get('gifts', []), G.get('modlog', [])]); };
async function sbSyncMod(force) {
  if (!modCloud()) return false;
  if (MOD_BUSY) return false; MOD_BUSY = true; MOD_LAST = Date.now();
  try {
    const me = sbSes().uid, owner = isOwner(), before = modSig();
    if (owner || giftsAll().some(g => g.to === S.user && g.status === 'pending')) await sbApi('/rest/v1/rpc/gifts_sweep', { method: 'POST', body: {} });
    const get = p => sbApi(p).then(r => (r.ok && Array.isArray(r.data) ? r.data : null));
    const [st, bn, ap, rp, gf, ml] = await Promise.all([get('/rest/v1/strikes?select=*&order=created_at&limit=5000'), get('/rest/v1/bans?select=*&limit=5000'), get('/rest/v1/appeals?select=*&order=created_at.desc&limit=1000'),
      get('/rest/v1/reports?select=*&order=created_at.desc&limit=1000'), get('/rest/v1/gifts?select=*&order=created_at.desc&limit=500'), owner ? get('/rest/v1/modlog?select=*&order=created_at.desc&limit=1000') : Promise.resolve(null)]);
    if (!st && !bn && !ap && !rp && !gf) return false;                                  // sin conexión: no se toca nada
    const pool = [me]; [st, bn, ap, rp, gf, ml].forEach(L => (L || []).forEach(x => ['user_id', 'by', 'void_by', 'ban_by', 'handled_by', 'to_user', 'target', 'owner'].forEach(f => { if (isUuid(x[f])) pool.push(x[f]); })));
    const ids = await sbKnow(pool), k = u => (u && ids.key(u)) || '', us = LS.get('auri.users', {}), mine = key => { const u = us[key]; return !!u && (u.remote || key === S.user); };
    if (st) { const m = {}; st.forEach(x => { const key = k(x.user_id); if (key) (m[key] = m[key] || []).push({ id: x.id, reason: x.reason, by: k(x.by), date: x.created_at, ...(x.void ? { void: { by: k(x.void_by), date: x.void_at || x.created_at, reason: x.void_reason || '' } } : {}) }); });
      for (const key in us) if (mine(key)) us[key] = { ...us[key], strikes: m[key] || [] }; }
    if (bn) { const m = {}, now = Date.now(); bn.forEach(x => { if (x.until && Date.parse(x.until) <= now) return; const key = k(x.user_id); if (key) m[key] = { reason: x.reason, by: k(x.by), date: x.created_at, until: x.until || null }; });
      for (const key in us) { if (!mine(key)) continue; if (m[key]) us[key] = { ...us[key], ban: m[key] }; else if (us[key].ban) { const c = { ...us[key] }; delete c.ban; us[key] = c; } } }
    const need = [me]; if (force || Date.now() - MOD_PROF > 600000) { MOD_PROF = Date.now(); for (const key in us) if (us[key] && us[key].remote && us[key].uid) need.push(us[key].uid); }
    for (let i = 0; i < need.length; i += 80) {
      const pr = await sbApi('/rest/v1/profiles?select=*&id=in.(' + need.slice(i, i + 80).join(',') + ')');
      if (pr.ok && Array.isArray(pr.data)) pr.data.forEach(p => { const key = ids.key(p.id); if (key && us[key]) us[key] = { ...us[key], role: p.role, scope: Array.isArray(p.scope) ? p.scope : [], frameWorn: !!p.frame_worn, frameSel: p.frame_sel == null ? undefined : p.frame_sel, hideLists: !!p.hide_lists, frameTop: !!p.frame_top, bows: Array.isArray(p.bows) ? p.bows : [], modSince: p.mod_since || undefined, admSince: p.adm_since || undefined }; });
    }
    LS.set('auri.users', us);
    if (ap) G.set('appeals', ap.map(x => ({ id: x.id, user: k(x.user_id), banDate: x.ban_date, ban: { reason: x.ban_reason || '', by: k(x.ban_by), until: x.ban_until || null }, text: x.text, imgs: x.imgs || [], date: day(x.created_at), status: x.status, handledBy: k(x.handled_by), handledDate: day(x.handled_at), note: x.note || '' })));
    if (rp) G.set('reports', rp.map(x => ({ id: x.id, by: k(x.by), type: x.type, imgs: x.imgs || [], sid: x.story_id ? sBack(x.story_id) : '', cid: x.comment_id ? cBack(x.comment_id) : '', ci: x.chapter_pos == null ? undefined : x.chapter_pos, target: k(x.target), owner: k(x.owner), title: x.title || '', excerpt: x.excerpt || '', reasons: x.reasons || [], text: x.text || '', label: x.label || '', date: day(x.created_at), status: x.status, handledBy: k(x.handled_by), handledDate: day(x.handled_at) })));
    if (gf) G.set('gifts', gf.map(x => ({ id: x.id, kind: x.kind, to: k(x.to_user), by: k(x.by), date: x.created_at, expires: x.expires_at, status: x.status, claimedDate: x.claimed_at || '', endDate: x.ended_at || '' })));
    if (ml) G.set('modlog', ml.map(x => ({ id: x.id, type: x.type, by: k(x.by) || 'sistema', target: isUuid(x.target) ? k(x.target) || x.target : x.target, extra: x.extra || '', date: x.created_at })));
    return modSig() !== before;
  } catch (e) { console.warn('mod', e); return false; }
  finally { MOD_BUSY = false; }
}
let BUG_LAST = 0;
setInterval(() => { if (document.visibilityState === 'hidden' || !modCloud() || !isOwner()) return; const on = /^#\/moderation\/bugs/.test(location.hash); if (Date.now() - BUG_LAST > (on ? 8000 : 60000)) { BUG_LAST = Date.now(); sbBugs().then(c => c && softRender()); } }, 4000);
setInterval(() => { if (document.visibilityState === 'hidden' || !modCloud()) return; const on = /^#\/(moderation|gift|strike|admin)/.test(location.hash); if (Date.now() - MOD_LAST > (on ? 8000 : 60000)) sbSyncMod().then(c => c && softRender()); }, 3000);
/* ---------- NUBE · noticias, banners y borradores ----------
   La app sigue guardando todo en su copia local; aquí se compara con la nube y se sube/baja solo lo que cambió.
   Los ids locales (números) se convierten en uuids fijos para no tocar el resto del código. Los permisos los decide el servidor. */
const P_ID = { news: '00000000-0000-0001-0000-', banners: '00000000-0000-0002-0000-', newsdrafts: '00000000-0000-0003-0000-' };
const pUuid = (kind, id) => { let s = String(id == null ? '' : id); if (isUuid(s)) return s; if (kind === 'newsdrafts') s = s.replace(/^d/, ''); const n = /^\d{1,15}$/.test(s) ? +s : NaN; return Number.isSafeInteger(n) ? P_ID[kind] + hx(n, 12) : null; };
const pBack = (kind, u) => { u = String(u || ''); if (!u.startsWith(P_ID[kind])) return u; const n = parseInt(u.slice(-12), 16); return kind === 'newsdrafts' ? 'd' + n : n; };
const pDay = o => o.date || (+o.id > 1e12 ? new Date(+o.id).toISOString().slice(0, 10) : '');
const pTs = d => (d ? d + 'T12:00:00+00:00' : null);
const POST_ST = { published: 'approved', pending: 'pending', rejected: 'rejected' }, POST_BACK = { approved: 'published', pending: 'pending', rejected: 'rejected' };
const postCommon = (o, c) => ({ anon: !!o.anon, comm: postComm(o), status: POST_ST[o.status || 'published'] || 'approved', reason: o.reason || '', created_at: pTs(pDay(o)), edited_at: pTs(o.edited), by: c.uid(o.by || OWNER_EMAIL) || null });
const postBack = (r, c) => ({ by: c.key(r.by) || '', byRole: r.by_role, anon: !!r.anon, comm: r.comm, status: POST_BACK[r.status] || 'published', reason: r.reason || '', date: day(r.created_at), ...(r.edited_at ? { edited: day(r.edited_at) } : {}) });
const POSTS = {
  news: { path: '/rest/v1/news?select=*&order=created_at.desc&limit=500',
    row: (o, c) => ({ id: pUuid('news', o.id), type: o.type || 'Anuncio', title: o.title || '', text: o.text || '', blocks: Array.isArray(o.blocks) ? o.blocks : [], ...postCommon(o, c) }),
    from: (r, c) => ({ id: pBack('news', r.id), type: r.type, title: r.title, text: r.text || '', blocks: Array.isArray(r.blocks) ? r.blocks : [], ...postBack(r, c) }) },
  banners: { path: '/rest/v1/banners?select=*&order=position,created_at&limit=500',
    row: (o, c) => ({ id: pUuid('banners', o.id), kind: o.kind === 'book' ? 'book' : o.kind === 'poll' ? 'poll' : 'event', story_id: o.kind === 'book' ? sUuid(o.storyId) : null, ...(o.kind === 'poll' ? { poll: { options: (Array.isArray(o.options) ? o.options : []).slice(0, 6), ends: o.ends || null } } : {}), news_id: o.newsId != null && o.newsId !== '' ? pUuid('news', o.newsId) : null, title: o.title || '', text: o.text || '', btn: o.btn || '', ...postCommon(o, c) }),
    from: (r, c) => ({ id: pBack('banners', r.id), kind: r.kind, ...(r.story_id ? { storyId: sBack(r.story_id) } : {}), ...(r.news_id ? { newsId: pBack('news', r.news_id) } : {}), ...(r.kind === 'poll' ? { options: r.poll && Array.isArray(r.poll.options) ? r.poll.options : [], ends: (r.poll && r.poll.ends) || '' } : {}), title: r.title || '', text: r.text || '', btn: r.btn || '', ...postBack(r, c) }) },
  newsdrafts: { path: '/rest/v1/news_drafts?select=*&order=updated_at.desc&limit=100',
    row: (o, c) => ({ id: pUuid('newsdrafts', o.id), user_id: c.me, type: o.type || 'Actualización', title: o.title || '', blocks: Array.isArray(o.blocks) ? o.blocks : [], updated_at: new Date(Date.parse(o.updated) || 0).toISOString() }),
    from: r => ({ id: pBack('newsdrafts', r.id), type: r.type, title: r.title || '', blocks: Array.isArray(r.blocks) ? r.blocks : [], updated: new Date(Date.parse(r.updated_at) || 0).toISOString() }) }
};
const pSig = (n, o, c) => { const { id, by, created_at, user_id, ...rest } = POSTS[n].row(o, c); return JSON.stringify(rest); };
const pSort = (n, a) => (n === 'news' ? a.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')) || (+y.id || 0) - (+x.id || 0)) : n === 'newsdrafts' ? a.sort((x, y) => String(y.updated).localeCompare(String(x.updated))) : a);
let POST_BUSY = false, POST_AGAIN = false, POST_QUIET = false, POST_LAST = 0, POST_T;
async function postColl(n, rows, c, B, canPush, writeBase) {
  const cf = POSTS[n], local = LS.get('auri.' + n, []), L = new Map(), CL = new Map(), raw = new Map(), base = B[n] || {}, out = new Map(), ops = [], mine = o => isOwner() || n === 'newsdrafts' || (o.by || OWNER_EMAIL) === S.user;
  local.forEach(o => { const u = pUuid(n, o.id); if (u) L.set(u, o); });
  rows.forEach(r => { CL.set(r.id, cf.from(r, c)); raw.set(r.id, r); });
  for (const u of new Set([...L.keys(), ...CL.keys()])) {
    const l = L.get(u), cl = CL.get(u), b = base[u];
    if (l && !cl) { if (b !== undefined) continue; if (canPush && mine(l)) { ops.push({ t: 'ins', u, o: l }); out.set(u, l); } continue; }          // lo borraron en la nube / lo nuevo se sube
    if (!l && cl) { if (b !== undefined && canPush && (isOwner() || n === 'newsdrafts' || raw.get(u).by === c.me)) ops.push({ t: 'del', u, cl }); else out.set(u, cl); continue; }   // lo borraste aquí / lo nuevo se baja
    const ls = pSig(n, l, c), cs = pSig(n, cl, c);
    if (ls !== cs && b !== undefined && ls !== b && cs === b && canPush && mine(l)) { ops.push({ t: 'upd', u, o: l, cl, cs }); out.set(u, l); }
    else out.set(u, { ...l, ...cl });
  }
  // orden de las tarjetas del banner: manda lo local solo si lo reordenaste tú
  let order = null;
  if (n === 'banners') {
    const cloudOrder = rows.map(r => r.id).filter(u => out.has(u)), news = [...out.keys()].filter(u => !CL.has(u)), localOrder = local.map(o => pUuid(n, o.id)).filter(u => out.has(u));
    const bo = (B.order || []).filter(u => out.has(u)), lo = localOrder.filter(u => (B.order || []).includes(u));
    order = canPush && lo.length > 1 && JSON.stringify(lo) !== JSON.stringify(bo) ? [...localOrder.filter(u => CL.has(u) || !news.includes(u)), ...cloudOrder.filter(u => !localOrder.includes(u)), ...news.filter(u => !localOrder.includes(u))] : [...cloudOrder, ...news];
    order = [...new Set(order)];
  }
  const nb = {}; let net = false;
  const send = async (t, u, o, extra) => {
    if (t === 'del') return sbApi('/rest/v1/' + (n === 'newsdrafts' ? 'news_drafts' : n) + '?id=eq.' + u, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    const row = cf.row(o, c); if (n === 'banners') row.position = Math.max(0, order.indexOf(u));
    if (t === 'ins') { if (!row.by) delete row.by; if (!row.created_at) delete row.created_at; return sbApi('/rest/v1/' + (n === 'newsdrafts' ? 'news_drafts' : n), { method: 'POST', headers: { Prefer: 'return=minimal' }, body: row }); }
    delete row.id; delete row.by; delete row.user_id; if (!row.created_at) delete row.created_at; delete row.kind;
    return sbApi('/rest/v1/' + (n === 'newsdrafts' ? 'news_drafts' : n) + '?id=eq.' + u, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: row });
  };
  for (const op of ops) {
    const r = await send(op.t, op.u, op.o);
    if (r.ok) { if (op.t !== 'del') nb[op.u] = pSig(n, op.o, c); continue; }
    if (r.net || r.status >= 500) { net = true; if (op.t === 'upd') nb[op.u] = base[op.u]; if (op.t === 'del') out.set(op.u, op.cl); continue; }     // sin conexión: se intenta de nuevo luego
    if (op.t === 'ins') out.delete(op.u);                                                                  // la nube lo rechazó (permiso o dato que falta): se quita
    else if (op.t === 'upd') { out.set(op.u, op.cl); nb[op.u] = op.cs; }
    else out.set(op.u, op.cl);
  }
  for (const [u, o] of out) if (!(u in nb) && !ops.some(p => p.u === u && p.t === 'ins' && net)) nb[u] = CL.has(u) && !ops.some(p => p.u === u && p.t === 'upd' && net) ? pSig(n, CL.get(u), c) : undefined;
  Object.keys(nb).forEach(k => nb[k] === undefined && delete nb[k]);
  // posiciones del banner que cambiaron
  if (n === 'banners' && canPush) for (const [i, u] of order.entries()) { const r0 = raw.get(u); if (r0 && r0.position !== i && !ops.some(p => p.u === u) && (isOwner() || r0.by === c.me)) await sbApi('/rest/v1/banners?id=eq.' + u, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { position: i } }); }
  let list = [...out.values()]; if (order) { const idx = new Map(order.map((u, i) => [u, i])); list.sort((a, b) => (idx.get(pUuid(n, a.id)) ?? 1e9) - (idx.get(pUuid(n, b.id)) ?? 1e9)); } else pSort(n, list);
  writeBase[n] = nb; if (order) writeBase.order = order;
  return list;
}
async function sbSyncPosts() {
  const ses = sbSes(); if (!cloud() || !ses || !S.user || isGuest() || String(ses.email || '').toLowerCase() !== S.user) return false;
  if (POST_BUSY) { POST_AGAIN = true; return false; } POST_BUSY = true; POST_LAST = Date.now(); let changed = false;
  try {
    if (isStaff()) { await sbImgLocal('auri.news'); await sbImgLocal('auri.newsdrafts'); }
    const me = ses.uid, K = uk('cloudposts'), B = LS.get(K, {}), canPush = isStaff(), nbs = { order: B.order || [] }, names = canPush ? ['news', 'banners', 'newsdrafts'] : ['news', 'banners'];
    const res = await Promise.all(names.map(n => sbApi(POSTS[n].path)));
    const pool = []; res.forEach(r => (r.ok && Array.isArray(r.data) ? r.data : []).forEach(x => x.by && pool.push(x.by)));
    const ids = await sbKnow(pool), c = { me, uid: ids.uid, key: ids.key };
    for (let i = 0; i < names.length; i++) {
      const n = names[i]; if (!res[i].ok || !Array.isArray(res[i].data)) { nbs[n] = B[n] || {}; continue; }
      const list = await postColl(n, res[i].data, c, B, canPush, nbs);
      if (JSON.stringify(list) !== JSON.stringify(LS.get('auri.' + n, []))) { POST_QUIET = true; try { LS.set('auri.' + n, list); } finally { POST_QUIET = false; } changed = true; }
    }
    LS.set(K, { ...B, ...nbs });
    if (await sbSyncPolls()) changed = true;
  } catch (e) { console.warn('posts', e); }
  finally { POST_BUSY = false; if (POST_AGAIN) { POST_AGAIN = false; setTimeout(() => sbSyncPosts().then(c => c && softRender()), 400); } }
  return changed;
}
async function sbPullPostsPublic() {                          // sin cuenta (invitado): solo lee lo aprobado
  let changed = false;
  for (const n of ['news', 'banners']) {
    const r = await sbApi(POSTS[n].path); if (!r.ok || !Array.isArray(r.data)) continue;
    const list = r.data.map(x => POSTS[n].from(x, { key: () => '' })); pSort(n, list);
    if (JSON.stringify(list) !== JSON.stringify(LS.get('auri.' + n, []))) { POST_QUIET = true; try { LS.set('auri.' + n, list); } finally { POST_QUIET = false; } changed = true; }
  }
  if (await sbSyncPolls()) changed = true;
  return changed;
}
setInterval(() => { if (document.visibilityState === 'hidden' || !cloud() || !sbSes() || !S.user || isGuest()) return; const on = /^#\/(news|moderation|)$|^#\/(news|moderation)\//.test(location.hash) || location.hash === '#/' || !location.hash; if (Date.now() - POST_LAST > (on ? 15000 : 60000)) sbSyncPosts().then(c => c && softRender()); }, 4000);
/* ---------- NUBE · imágenes (Supabase Storage) ----------
   Las fotos se guardan en el bucket público «images», en la carpeta de quien las sube (images/<id>/<huella>.jpg).
   La app sigue creando las fotos como siempre (reducidas, en base64); al sincronizar se suben y el dato local pasa a ser solo el enlace.
   Si algo falla (sin conexión, bucket sin crear) la foto se queda como estaba y se intenta de nuevo en la siguiente sincronización. */
const IMG_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;
const IMG_PUB = () => SB_URL + '/storage/v1/object/public/images/';
const isStoreUrl = u => typeof u === 'string' && u.startsWith(IMG_PUB());
const IMG_UP = new Map();                                      // foto en base64 → promesa del enlace (para no subir dos veces lo mismo)
function sbUpImg(d) {
  if (IMG_UP.has(d)) return IMG_UP.get(d);
  const pr = (async () => {
    try {
      const ses = sbSes(); if (!cloud() || !ses || !ses.uid) return null;
      const m = IMG_RE.exec(d); if (!m) return null;
      const blob = await (await fetch(d)).blob(); if (!blob.size || blob.size > 5242880) return null;
      const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
      const path = ses.uid + '/' + hex + '.' + (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()), K = 'auri.imgdone', done = LS.get(K, {});
      if (done[path]) return IMG_PUB() + path;
      const tok = await sbToken(); if (!tok) return null;
      const r = await fetch(SB_URL + '/storage/v1/object/images/' + path, { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + tok, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: blob });
      if (!r.ok) return null;
      done[path] = 1; LS.set(K, done); imgSweepSoon(); return IMG_PUB() + path;
    } catch (e) { return null; }
  })();
  IMG_UP.set(d, pr); pr.then(u => { if (!u) IMG_UP.delete(d); });
  return pr;
}
async function imgCollect(v, map) {                            // sube todas las fotos en base64 que haya dentro de v
  if (typeof v === 'string') { if (v.length > 300 && IMG_RE.test(v) && !map.has(v)) { const u = await sbUpImg(v); if (u) map.set(v, u); } return; }
  if (Array.isArray(v)) { for (const x of v) await imgCollect(x, map); return; }
  if (v && typeof v === 'object') for (const k in v) await imgCollect(v[k], map);
}
function imgReplace(v, map) {                                  // cambia cada foto subida por su enlace; devuelve [valor, ¿cambió?]
  if (typeof v === 'string') return map.has(v) ? [map.get(v), true] : [v, false];
  if (Array.isArray(v)) { let ch = false; const o = v.map(x => { const [y, c] = imgReplace(x, map); ch = ch || c; return y; }); return [ch ? o : v, ch]; }
  if (v && typeof v === 'object') { let ch = false; const o = {}; for (const k in v) { const [y, c] = imgReplace(v[k], map); ch = ch || c; o[k] = y; } return [ch ? o : v, ch]; }
  return [v, false];
}
async function sbImgConv(v) { const map = new Map(); await imgCollect(v, map); return map.size ? imgReplace(v, map)[0] : v; }
async function sbImgLocal(key) {                               // sube las fotos de un dato local y lo reescribe (leyendo de nuevo, por si cambió mientras se subía)
  if (!cloud() || !sbSes()) return false;
  const v = LS.get(key, null); if (v == null) return false;
  const map = new Map(); await imgCollect(v, map); if (!map.size) return false;
  const [nv, ch] = imgReplace(LS.get(key, null), map); if (ch) LS.set(key, nv); return ch;
}
let PENDING = null, QZ = null;                         // registro en curso: la cuenta SOLO se crea al terminar el cuestionario
async function register({ name, email, pass, pass2 }) {      // paso 0: correo y contraseña
  email = email.trim().toLowerCase(); name = name.trim();
  const users = LS.get('auri.users', {});
  if (!name) return t('Escribe tu nombre de usuario.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('Ingresa un correo válido.');
  if (pass.length < 8) return t('La contraseña debe tener al menos 8 caracteres.');
  if (pass !== pass2) return t('Las contraseñas no coinciden.');
  if (await nameTaken(name)) return t('Ese nombre de usuario ya está en uso.');
  if (!cloud() && users[email]) return t('Ese correo ya tiene una cuenta.');
  const salt = Math.random().toString(36).slice(2);
  PENDING = { name, email, salt, hash: cloud() ? '' : await sha(salt + pass), pass: cloud() ? pass : '' }; QZ = { step: 1, comm: detectComm(), birth: '', gender: '', interests: [], mature: false, blocked: false, terms: false };
  go('/signup'); return '';
}
let CREATING = false;
async function createAccount() {                       // último paso: se crea la cuenta con las respuestas
  if (cloud()) {
    if (CREATING) return; CREATING = true;
    try {
      const r = await cloudSignup(), email = PENDING.email;
      if (r.err) { if (r.back) { PENDING = null; QZ = null; go('/register'); } return toast(r.err); }
      if (r.confirm) { PENDING = null; QZ = null; toast(t('Te enviamos un correo para confirmar tu cuenta. Después inicia sesión.')); return go('/login'); }
      const kept = isGuest() ? adoptGuest(email) : false;
      if (kept) { const pc = LS.get('auri.u.' + email + '.cfg', {}); LS.set('auri.u.' + email + '.cfg', { ...pc, showMature: ageOf(QZ.birth) >= 18 && QZ.mature }); }
      PENDING = null; QZ = null; uiReset(); startSession(email); return toast(kept ? t('¡Listo! Cuenta creada y progreso conservado ✨') : t('¡Listo! Tu cuenta está creada ✨'));
    } finally { CREATING = false; }
  }
  const { name, email, salt, hash } = PENDING, users = LS.get('auri.users', {});
  if (users[email]) { PENDING = null; QZ = null; go('/register'); return toast(t('Ese correo ya tiene una cuenta.')); }
  users[email] = { name, salt, hash, community: QZ.comm === 'en' ? 'en' : 'es', birth: QZ.birth, gender: QZ.gender, interests: QZ.interests, onboarded: true, termsAccepted: today(), created: today(), role: email === OWNER_EMAIL ? 'OWNER' : 'USER', strikes: [] };
  LS.set('auri.users', users);
  const kept = isGuest() ? adoptGuest(email) : false;
  LS.set('auri.u.' + email + '.cfg', { ...(kept ? LS.get('auri.u.' + email + '.cfg', {}) : {}), showMature: ageOf(QZ.birth) >= 18 && QZ.mature });   // la opción +18 del cuestionario enciende "Mostrar contenido +18"
  PENDING = null; QZ = null; uiReset(); startSession(email); toast(kept ? t('¡Listo! Cuenta creada y progreso conservado ✨') : t('¡Listo! Tu cuenta está creada ✨'));
}
async function login({ email, pass }) {
  email = email.trim().toLowerCase();
  if (cloud()) { const er = await cloudLogin(email, pass); if (er) return er; if (isGuest()) wipeGuest(); startSession(email); return ''; }
  const u = LS.get('auri.users', {})[email];
  if (!u || u.hash !== await sha(u.salt + pass)) return t('Correo o contraseña incorrectos.');
  if (isGuest()) wipeGuest();                          // lo guardado como invitado se pierde: queda lo de esa cuenta
  startSession(email); return '';
}
function startSession(email) { S.user = email; UILANG = null; LS.set('auri.session', email); loadUser(); go('/'); sbRefresh(); }
function logout() { if (cloud() && sbSes()) { sbToken().then(tk => tk && sbFetch('/auth/v1/logout', { method: 'POST', token: tk })).catch(() => {}); } localStorage.removeItem('auri.sb'); S.user = null; UILANG = null; localStorage.removeItem('auri.session'); go('/start'); }
const userName = () => (LS.get('auri.users', {})[S.user] || {}).name || '';
/* --- Modo invitado: cuenta temporal local; no da likes ni comenta; al crear cuenta su progreso se conserva --- */
const GUEST = 'invitado@auri.local', isGuest = () => S.user === GUEST;
const guestKeys = () => Object.keys(localStorage).filter(k => k.startsWith('auri.u.' + GUEST + '.'));
function wipeGuest() {                                 // borra al invitado y todo lo guardado como tal
  const users = LS.get('auri.users', {}); delete users[GUEST]; LS.set('auri.users', users);
  guestKeys().forEach(k => localStorage.removeItem(k));
}
function adoptGuest(email) {                           // copia el progreso del invitado a la cuenta nueva y elimina al invitado
  const pre = 'auri.u.' + GUEST + '.', ks = guestKeys(); ks.forEach(k => localStorage.setItem('auri.u.' + email + '.' + k.slice(pre.length), localStorage.getItem(k)));
  wipeGuest(); return ks.length > 0;
}
function startGuest() {
  const users = LS.get('auri.users', {});
  if (!users[GUEST]) { users[GUEST] = { name: 'Invitado', guest: true, onboarded: true, termsAccepted: today(), created: today(), role: 'USER', strikes: [] }; LS.set('auri.users', users); }
  startSession(GUEST);
}
const GUEST_ACTS = { 'dm-why': 'enviar mensajes', 'dm-book': 'enviar mensajes', like: 'dar me gusta', 'c-like': 'dar me gusta', 'pc-like': 'dar me gusta', follow: 'seguir a otras personas', 'c-reply': 'comentar', 'c-edit': 'comentar', 'c-save': 'comentar', 'c-del': 'comentar', 'c-more': 'comentar', 'pc-reply': 'comentar', 'pc-send': 'comentar', 'pc-more': 'comentar', 'pc-del': 'comentar', 'report-story': 'reportar contenido', 'report-comment': 'reportar contenido', 'report-pc': 'reportar contenido', 'report-user': 'reportar contenido', mute: 'silenciar o bloquear', block: 'silenciar o bloquear' };
function guestGate(why) {                              // pantallazo: primero crear cuenta o iniciar sesión
  const old = $('#guest-gate'); if (old) old.remove();
  const m = document.createElement('div'); m.className = 'modal sheet'; m.id = 'guest-gate';
  m.innerHTML = `<div class="modal-box mini-box wl-gate" role="alertdialog" aria-modal="true" aria-label="${esc(t('Se necesita una cuenta'))}">${mascot('wl-gate-m')}<h2>${t('Se necesita una cuenta para {what}', { what: esc(t(why)) })}</h2><p class="helper">${t('Crear una cuenta es gratis y el progreso de lectura actual se conserva. Si ya existe una cuenta, basta con iniciar sesión.')}</p>
  <div class="wl-actions"><button type="button" class="button" data-g="register">${t('Crear cuenta')}</button><button type="button" class="button secondary" data-g="login">${t('Iniciar sesión')}</button><button type="button" class="button ghost" data-g="no">${t('Ahora no')}</button></div></div>`;
  m.addEventListener('click', e => { const g = e.target.closest('[data-g]'); if (!g && e.target !== m) return; m.remove(); if (!g || g.dataset.g === 'no') return;
    const ps = $('#pc-sheet'); if (ps) { ps.remove(); PCS = null; } go('/' + g.dataset.g); });
  document.body.appendChild(m);
}

const interestChips = (sel, act) => `<div class="qz-chips">${INTERESTS.map(([n, e]) => `<button type="button" class="qz-chip ${sel.includes(n) ? 'on' : ''}" data-act="${act}" data-v="${esc(n)}" aria-pressed="${sel.includes(n)}">${e} ${esc(t(n))}</button>`).join('')}</div>`;
function signupView() {
  const q = QZ, adult = validBirth(q.birth) && ageOf(q.birth) >= 18;
  const top = `<div class="qz-top"><button class="icon-btn" data-act="qz-back" aria-label="${esc(t('Atrás'))}">‹</button><div class="qz-dots" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${q.step}" aria-label="${esc(t('Paso {n} de 3', { n: q.step }))}">${[1, 2, 3].map(i => `<i class="qz-dot ${i < q.step ? 'done' : i === q.step ? 'on' : ''}"></i>`).join('')}</div><span style="width:40px"></span></div>`;
  if (q.blocked) return `<main class="qz-wrap"><div class="qz-card" style="justify-content:center;text-align:center"><div class="end-emoji">🌙</div><h1>${t('Todavía no puedes unirte')}</h1><p class="helper">${t('Auri es para personas de {n} años o más, así que no podemos crear tu cuenta. ¡Gracias por entender!', { n: MIN_AGE })}</p><div class="qz-foot"><button class="button" data-act="qz-exit">${t('Volver al inicio')}</button></div></div></main>`;
  let body;
  if (q.step === 1) body = `<span class="eyebrow">${t('Paso {n} de 3', { n: 1 })}</span><h1>${t('¿Cuándo es tu cumpleaños? 🎂')}</h1><p class="helper">${t('Lo usamos para mostrarte contenido adecuado para tu edad. No se muestra en tu perfil.')}</p>
    <input id="qz-birth" type="date" class="field" style="margin-top:18px" min="1900-01-01" max="${today()}" value="${esc(q.birth)}" aria-label="${esc(t('Fecha de nacimiento'))}"><p class="error" id="qz-err"></p>
    <h2 style="margin-top:14px">${t('¿En qué comunidad quieres estar?')}</h2><p class="helper">${t('Cada comunidad tiene sus propias historias, noticias y equipo de moderación.')} ${q.comm === detectComm() ? t('La elegimos según tu región; puedes cambiarla.') + ' ' : ''}${t('Después podrás elegir ver también la otra.')}</p>
    <div class="qz-opts" role="radiogroup">${Object.entries(COMMS).map(([k, n]) => `<button type="button" class="qz-opt ${q.comm === k ? 'on' : ''}" role="radio" aria-checked="${q.comm === k}" data-act="qz-comm" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="qz-foot"><button class="button" style="width:100%" data-act="qz-next">${t('Siguiente ›')}</button></div>`;
  else if (q.step === 2) body = `<span class="eyebrow">${t('Paso {n} de 3', { n: 2 })}</span><h1>${t('¿Cuál es tu género?')}</h1><p class="helper">${t('Elige la opción con la que te identifiques.')}</p>
    <div class="qz-opts" role="radiogroup">${GENDERS.map(g => `<button type="button" class="qz-opt ${q.gender === g ? 'on' : ''}" role="radio" aria-checked="${q.gender === g}" data-act="qz-gender" data-v="${g}">${esc(t(g))}</button>`).join('')}</div>
    <div class="qz-foot"><button class="button" style="width:100%" data-act="qz-next" ${q.gender ? '' : 'disabled'}>${t('Siguiente ›')}</button></div>`;
  else body = `<span class="eyebrow">${t('Paso {n} de 3', { n: 3 })}</span><h1>${t('¿Qué te gusta leer?')}</h1><p class="helper">${t('Elige todos los temas que quieras. Necesitamos al menos uno.')}</p>
    ${interestChips(q.interests, 'qz-int')}
    ${adult ? `<p class="helper" style="margin-top:6px">${t('Solo para mayores de edad')}</p><div class="qz-chips"><button type="button" class="qz-chip mature ${q.mature ? 'on' : ''}" data-act="qz-18" aria-pressed="${q.mature}">🔞 ${t('Contenido +18')}</button></div>` : ''}
    <label class="check qz-terms"><input type="checkbox" data-act="qz-terms" ${q.terms ? 'checked' : ''}><span>${t('Acepto los {terms} y la {privacy} de Auri.', { terms: '<button type="button" class="link-btn" data-act="terms">' + t('términos y condiciones') + '</button>', privacy: '<button type="button" class="link-btn" data-act="privacy">' + t('política de privacidad') + '</button>' })}</span></label>
    <div class="qz-foot"><p class="qz-count">${q.interests.length ? tn(q.interests.length, '{n} elegido', '{n} elegidos') : t('Elige al menos uno')}${q.terms ? '' : ' · ' + t('falta aceptar los términos')}</p><button class="button" style="width:100%" data-act="qz-finish" ${q.interests.length && q.terms ? '' : 'disabled'}>${t('Crear mi cuenta ✨')}</button></div>`;
  return `<main class="qz-wrap">${top}<div class="qz-card">${body}</div></main>`;
}

/* 4. MASCOTA ------------------------------------------------------ */
const mascot = (cls = '') => `<svg class="${cls}" viewBox="0 0 240 230" role="img" aria-label="${t('Auri, la gata alienígena')}">
<path d="M52 100 37 29Q35 20 43 25L100 58ZM188 100 203 29Q205 20 197 25L140 58Z" fill="url(#auri-fur)" stroke="#754caf" stroke-width="4" stroke-linejoin="round"/>
<path d="M57 94 46 39Q45 35 49 38L88 61ZM183 94 194 39Q195 35 191 38L152 61Z" fill="#efb8d7"/>
<path d="M46 116c0-45 33-73 74-73s74 28 74 73v38c0 36-30 58-74 58s-74-22-74-58z" fill="url(#auri-fur)" stroke="#754caf" stroke-width="4"/>
<path d="M72 135c0-22 19-40 48-40s48 18 48 40v20c0 19-19 32-48 32s-48-13-48-32z" fill="url(#auri-belly)"/>
<ellipse cx="91" cy="111" rx="7" ry="10" fill="#49365b"/><ellipse cx="149" cy="111" rx="7" ry="10" fill="#49365b"/>
<circle cx="93" cy="108" r="2.5" fill="#fff"/><circle cx="151" cy="108" r="2.5" fill="#fff"/>
<path d="M115 124q5-5 10 0-5 7-10 0" fill="#bf729f"/><path d="M120 130q-5 9-12 4M120 130q5 9 12 4" fill="none" stroke="#604770" stroke-width="2.5" stroke-linecap="round"/>
<path d="M77 124H48m31 8H45m118-8h29m-29 8h32" stroke="#754caf" stroke-width="2" stroke-linecap="round"/>
<path d="M104 38c0-9 7-15 16-15s16 6 16 15" fill="none" stroke="#754caf" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="19" r="8" fill="#f1bfdc" stroke="#754caf" stroke-width="3"/>
<path d="M47 180q-29 12-20 32 10 17 32 1" fill="none" stroke="#754caf" stroke-width="9" stroke-linecap="round"/>
<path d="M88 207v9m64-9v9" stroke="#754caf" stroke-width="9" stroke-linecap="round"/></svg>`;

/* 5. VISTAS ------------------------------------------------------- */
/* --- Cabecera mínima + barra de navegación inferior (estilo app móvil) --- */
let SEARCH_OPEN = false, NOTIF_OPEN = false;
const IC = (p, w = 2) => `<svg viewBox="0 0 24 24" aria-hidden="true" style="stroke-width:${w}">${p}</svg>`;
const ICON = {
  gear: IC('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  search: IC('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  bell: IC('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  home: IC('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  books: IC('<path d="M4 4h5v16H4zM11 4h5v16h-5zM18 5l3 1-4 14-3-1z"/>'),
  plus: IC('<path d="M12 5v14M5 12h14"/>', 2.8),
  news: IC('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'),
  user: IC('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  mail: IC('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7.5 8.5 6 8.5-6"/>')
};
function shell(path, html) {
  const pop = NOTIF_OPEN ? notifPop() : '', n = unread(), mcTot = modCounts().total;      // (primero la ventanita: al abrirla marca como leídas y el contador baja)
  const item = (href, label, ic, on, bd = 0) => `<a class="bn-item ${on ? 'active' : ''}" href="${href}" ${on ? 'aria-current="page"' : ''}><span class="bn-ic">${ic}${bd ? `<b class="badge">${bd > 99 ? '99+' : bd}</b>` : ''}</span><span>${label}</span></a>`;
  const fab = (path === '/' || path === '/profile') && !isGuest() && !cfg('hideBugFab') && !/^#\/profile\/edit/.test(location.hash) ? `<button type="button" class="bug-fab" data-act="report" aria-label="${esc(t('Reportar un error'))}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6 21.6 20.4H2.4Z"/><path d="M12 9.6v5"/><circle cx="12" cy="17.4" r=".6" fill="currentColor"/></svg></button>` : '';
  return `<div class="shell"><header class="topbar tb2">
    <div class="search-bar ${SEARCH_OPEN ? 'open' : ''}"><input id="sq" class="field" type="search" placeholder="${esc(SM === 'users' ? t('Buscar usuarios…') : t('Buscar títulos, etiquetas o fandoms…'))}" aria-label="${esc(t('Buscar'))}" value="${esc(Q)}"><button class="icon-btn" data-act="search-close" aria-label="${esc(t('Cerrar búsqueda'))}">✕</button></div>
  </header>${html}${pop}${fab}
  <nav class="bottom-nav" aria-label="${esc(t('Navegación principal'))}">${item('#/', t('Inicio'), ICON.home, path === '/')}${item('#/library', t('Biblioteca'), ICON.books, path === '/library')}<a class="bn-plus ${path === '/write' ? 'active' : ''}" href="#/write" aria-label="${esc(t('Crear historia'))}">${ICON.plus}</a>${item('#/news', t('Noticias'), ICON.news, path === '/news')}${item('#/profile', t('Mi Perfil'), ICON.user, path === '/profile', mcTot)}</nav></div>`;
}
const empty = (title, copy, action = '') => `<div class="empty">${mascot()}<h3>${esc(t(title))}</h3><p>${esc(t(copy))}</p>${action}</div>`;
const badgeText = s => { const st = storyState(s), p = s.chapters.filter(c => c.status === 'pending').length; return st !== 'published' ? t(STATUS[st]) : p ? t('{n} cap. en revisión', { n: p }) : ''; };
const bmRib = s => bmOf(s.id) ? '<span class="bm-rib" aria-hidden="true"></span>' : '';
const coverHTML = (s, i) => `<div class="cover c${(i % 5) + 1}">${bmRib(s)}${s.cover ? `<img class="cover-img" src="${esc(s.cover)}" alt="${esc(t('Portada de {title}', { title: s.title }))}" loading="lazy" data-t="${esc(s.title || t('Sin título'))}">` : `<span class="cover-title">${esc(s.title || t('Sin título'))}</span>`}</div>`;

/* --- Auth --- */
function authView(mode) {
  const reg = mode === 'register';
  return `<main class="auth-wrap"><div class="brand-big">${mascot()}</div>
  <h1>${reg ? t('Crea tu cuenta') : t('Inicia sesión')}</h1>
  <p class="helper" style="text-align:center;margin-bottom:18px">${reg ? t('Guarda tus historias y tu personaje lector.') : t('Inicia sesión para seguir leyendo y escribiendo.')}</p>
  <form class="panel" data-form="${mode}" novalidate><div class="form-grid" style="grid-template-columns:1fr">
    ${reg ? `<div class="form-group"><label for="a-name">${t('Nombre de usuario')}</label><input id="a-name" class="field" autocomplete="nickname" maxlength="30" value="${PENDING ? esc(PENDING.name) : ''}"></div>` : ''}
    <div class="form-group"><label for="a-email">${t('Correo')}</label><input id="a-email" type="email" class="field" autocomplete="email" placeholder="${esc(t('tucorreo@ejemplo.com'))}" value="${reg && PENDING ? esc(PENDING.email) : ''}"></div>
    <div class="form-group"><label for="a-pass">${t('Contraseña')}</label><input id="a-pass" type="password" class="field" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="${esc(t('Mínimo 8 caracteres'))}"></div>
    ${reg ? `<div class="form-group"><label for="a-pass2">${t('Repite la contraseña')}</label><input id="a-pass2" type="password" class="field" autocomplete="new-password"></div>
    <p class="helper" style="margin:2px 0 0">${t('Después te haremos 3 preguntas rápidas: tu cumpleaños, tu género y los temas que te gustan.')}</p>` : ''}
  </div><p class="error" id="auth-error" role="alert"></p>
  <button class="button" style="width:100%" type="submit">${reg ? t('Crear cuenta') : t('Entrar')}</button></form>
  <p class="helper" style="text-align:center;margin-top:16px">${reg ? t('¿Ya tienes cuenta?') + ' <a class="link-btn" href="#/login">' + t('Inicia sesión') + '</a>' : t('¿Primera vez?') + ' <a class="link-btn" href="#/register">' + t('Crea tu cuenta') + '</a>'}</p>
  <p class="helper" style="text-align:center;margin-top:4px"><a class="link-btn" href="#/start">${t('Volver')}</a></p>
  <p class="notice" style="margin-top:14px">${t('Tu cuenta se guarda solo en este navegador. Auri todavía no envía datos a ningún servidor.')}</p></main>`;
}

/* --- Mensajes: requisitos, filtro de seguridad y vistas --- */
const ageGroup = e => { const u = getUsers()[e]; if (u && u.remote && !u.adultAt && S.user && e !== S.user) return ageGroup(S.user); return u && isAdult(u) ? 'adult' : 'minor'; };   // de una cuenta de la nube aún sin comprobar se asume el mismo rango (la nube decide al enviar)      // 17 o menos (o edad sin confirmar) = menores · 18+ = mayores de edad
const mutual = (a, b) => following(a).includes(b) && following(b).includes(a);
function dmWhy(a, b) {                                  // '' = pueden escribirse; si no, la razón
  if (!getUsers()[b]) return t('Esta persona no existe en este dispositivo.');
  if (a === b) return t('No se puede enviar mensajes a la propia cuenta.');
  if (bl(a, 'blocked').includes(b) || bl(b, 'blocked').includes(a)) return t('No se puede enviar mensajes a esta persona.');
  if (ageGroup(a) !== ageGroup(b)) return t('Los mensajes solo están disponibles entre personas del mismo rango de edad: menores de 18 con menores, y mayores de edad con mayores de edad.');
  if (ageGroup(a) === 'minor' && !mutual(a, b)) return t('Para enviarse mensajes, ambas personas deben seguirse mutuamente.');
  return '';                                              // mayores de edad: pueden escribir (o enviar una solicitud, ver dmMode)
}
/** Solicitudes de mensaje entre mayores de edad: 'A>B' → pending | accepted | rejected (rechazar no avisa a quien la envió) */
const dmReq = () => G.get('dmreq', {});
const dmSt = (a, b) => dmReq()[a + '>' + b] || '';
/** ok = pueden chatear · new = puede enviar su solicitud · sent = esperando respuesta · incoming = tiene una solicitud para responder */
function dmMode(a, b) {
  if (ageGroup(a) === 'minor') return 'ok';
  if (dmSt(a, b) === 'accepted' || dmSt(b, a) === 'accepted') return 'ok';
  if (dmSt(b, a) === 'pending') return 'incoming';
  if (dmSt(a, b) === 'pending' || dmSt(a, b) === 'rejected') return 'sent';
  return 'new';
}
const REQ_MAX = 300;
const dmKey = (a, b) => [a, b].sort().join('|');
const dmAll = () => G.get('dm', {});
const dmThread = e => dmAll()[dmKey(S.user, e)] || [];
const dmHidden = e => dmSt(e, S.user) === 'rejected' && dmMode(S.user, e) === 'new';          // solicitud rechazada: no se vuelve a mostrar
const dmIncoming = () => !S.user ? [] : Object.keys(dmReq()).filter(k => dmReq()[k] === 'pending' && k.split('>')[1] === S.user).map(k => k.split('>')[0])
  .filter(e => getUsers()[e] && !dmBlocked(e) && dmThread(e).length).map(e => ({ other: e, last: dmThread(e)[dmThread(e).length - 1] })).sort((a, b) => b.last.id - a.last.id);
const dmRead = () => LS.get(uk('dmread'), {});
const dmBlocked = e => bl(S.user, 'blocked').includes(e) || bl(e, 'blocked').includes(S.user);
function dmConvos() {
  if (!S.user) return []; const all = dmAll();
  return Object.keys(all).filter(k => k.split('|').includes(S.user)).map(k => ({ key: k, other: k.split('|').find(x => x !== S.user), last: all[k][all[k].length - 1] })).filter(x => x.last && getUsers()[x.other] && !dmBlocked(x.other) && dmMode(S.user, x.other) !== 'incoming' && !dmHidden(x.other)).sort((a, b) => b.last.id - a.last.id);
}
const dmUnread = () => { if (!S.user || isGuest()) return 0; const r = dmRead(); return dmConvos().filter(x => x.last.by !== S.user && x.last.id > (r[x.key] || 0)).length + dmIncoming().length; };
/** Filtro de chats de menores: teléfonos, correos, enlaces, usuarios y redes sociales, y frases para pedir datos o fotos */
const DM_NET = ['kik', 'wechat', 'imessage', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'wasap', 'guasap', 'telegram', 'snapchat', 'discord', 'twitter', 'youtube', 'messenger', 'skype', 'onlyfans', 'twitch', 'omegle', 'pinterest', 'tumblr'];
const DM_NUM = { cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
function dmUnsafe(text) {
  const raw = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const digits = raw.replace(/\b(cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|zero|one|two|three|four|five|six|seven|eight|nine)\b/g, w => DM_NUM[w]);
  if (/(?:\d[\s().\-_*]*){7,}/.test(digits)) return 'números de teléfono';
  const leet = raw.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/\$/g, 's');
  if (DM_NET.some(n => new RegExp(n.split('').join('[^a-z]{0,3}') + '(?![a-z])').test(leet)) || /\b(ig|fb|insta|wpp|wsp|snap|tt|tg|whats|wats)\b/.test(leet)) return 'redes sociales';
  if (/\S+@\S+\.\S+|\barroba\b|\b(gmail|hotmail|outlook|yahoo|icloud)\b/.test(raw) || /(^|\s)@\w{3,}/.test(raw) || /\w+\s*(\bat\b|\(at\))\s*\w+\s*(\bdot\b|\(dot\))\s*(com|net|org)\b/.test(raw)) return 'correos o usuarios';
  if (/https?:|www\.|\.(com|net|org|me|gg|tv|ly|io|link)\b|\bt\.me|\bwa\.me/.test(raw)) return 'enlaces';
  if (/\b(mi|tu|su)\s+(numero|num|cel|celular|telefono|tel|correo|mail|direccion|insta|face|whats)\b/.test(raw) || /\b(pasa|pasame|dame|dime|manda|mandame|envia|enviame)\s+(tu\s+|su\s+)?(num|numero|cel|celular|telefono|whats|insta|face|tiktok|correo|mail|direccion|foto|fotos)\b/.test(raw) || /\b(donde vives|tu ubicacion|nudes?|sexting|desnud[ao]s?|pack de fotos)\b/.test(raw) || /\b(my|your|ur)\s+(number|num|phone|cell|email|e-mail|mail|address|insta|snap|whatsapp|discord|tiktok)\b/.test(raw) || /\b(send|give|gimme|text|dm)\s+(me\s+)?(your|ur|ya)\s+(num|number|phone|cell|insta|snap|socials?|email|address|pics?|pictures?|photos?|nudes?)\b/.test(raw) || /\b(where do you live|where u live|your location|naked|send pics|send nudes|pic of you)\b/.test(raw)) return 'datos personales o fotos';
  return '';
}
function dmSend(to, msg) {                              // devuelve '' si se envió; si no, el motivo
  const why = dmWhy(S.user, to); if (why) return why;
  const minor = ageGroup(S.user) === 'minor', mode = dmMode(S.user, to);
  if (mode === 'incoming') return t('Primero responde su solicitud de mensaje.');
  if (mode === 'sent') return t('Tu solicitud ya fue enviada. Si la aceptan, podrán seguir escribiéndose.');
  if (mode === 'new') {                                   // solicitud: UN mensaje escrito, sin fotos, obras, enlaces ni datos de contacto
    const tx = String(msg.text || '').trim(); if (msg.img || msg.sid || !tx) return t('La solicitud solo puede ser un mensaje escrito.');
    if (tx.length > REQ_MAX) return t('La solicitud puede tener hasta {n} caracteres.', { n: REQ_MAX });
    const u = dmUnsafe(tx); if (u) return t('Por seguridad, la solicitud no puede incluir {u}. No se envió.', { u: t(u) });
    const rq = dmReq(); rq[S.user + '>' + to] = 'pending'; G.set('dmreq', rq); msg = { text: tx };
  }
  if (msg.img && minor) return t('El envío de fotos no está disponible en chats de menores.');
  if (msg.text && minor) { const u = dmUnsafe(msg.text); if (u) return t('Por seguridad, en chats de menores no se pueden compartir {u}. El mensaje no se envió.', { u: t(u) }); }
  if (msg.sid) { const st = publishedStories().find(x => x.id === msg.sid); if (!st) return t('Esa obra ya no está disponible.'); if (minor && st.mature) return t('Las obras +18 no se pueden enviar en chats de menores.'); }
  const all = dmAll(), k = dmKey(S.user, to), l = all[k] = all[k] || [];
  l.push({ id: Date.now(), by: S.user, ...msg, ...(cloud() ? { n: 1 } : {}) }); all[k] = l.slice(-300); return G.set('dm', all) ? '' : t('No se pudo guardar el mensaje.');
}
const hm = ts => new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
const dayLab = ts => { const d = new Date(ts), now = new Date(), y = new Date(Date.now() - 864e5), same = (a, b) => a.toDateString() === b.toDateString(); return same(d, now) ? t('Hoy') : same(d, y) ? t('Ayer') : d.toLocaleDateString(LOC(), { day: 'numeric', month: 'long' }); };
function dmBubble(m) {
  const mine = m.by === S.user; let body = '';
  if (m.sid) { const st = publishedStories().find(x => x.id === m.sid);
    body = !st ? '<div class="dm-book gone">' + t('Esta obra ya no está disponible.') + '</div>' : st.mature && !matureOK(st) ? '<div class="dm-book gone">' + t('Obra +18 oculta por la configuración de contenido.') + '</div>'
      : `<a class="dm-book" href="#/story/${esc(st.id)}" data-dir="next"><span class="dm-cv">${coverHTML(st, 0)}</span><span class="dm-bt"><small>${t('Obra recomendada')}</small><b>${esc(st.title)}</b><em>${t('por {a}', { a: esc(st.author || '') })}</em><span class="pill">${t('Abrir')}</span></span></a>`; }
  else if (m.img && safeImg(m.img)) body = `<img class="dm-img" src="${esc(m.img)}" alt="${esc(t('Foto enviada'))}">`;
  else body = `<span class="dm-txt">${esc(m.text || '')}</span>`;
  return `<div class="dm-row ${mine ? 'me' : 'you'}"><div class="dm-b">${body}<time>${hm(m.id)}</time></div></div>`;
}
function dmMsgsHTML(to) {
  const th = dmHidden(to) ? [] : dmThread(to); if (!th.length) return '<p class="helper dm-empty">' + t('Aún no hay mensajes. Escribe el primero o recomienda una obra.') + '</p>';
  let out = '', last = ''; th.forEach(m => { const d = dayLab(m.id); if (d !== last) { out += `<div class="dm-day">${esc(d)}</div>`; last = d; } out += dmBubble(m); }); return out;
}
function paintDm(to, force) {
  const box = $('#dm-msgs'); if (!box) return; const th = dmHidden(to) ? [] : dmThread(to), sig = th.length + ':' + ((th[th.length - 1] || {}).id || 0) + ':' + dmMode(S.user, to);
  if (!force && box.dataset.sig === sig) return;
  box.innerHTML = dmMsgsHTML(to); box.dataset.sig = sig; window.scrollTo(0, document.body.scrollHeight);
  if (th.length && dmMode(S.user, to) !== 'incoming') { const r = dmRead(); r[dmKey(S.user, to)] = th[th.length - 1].id; LS.set(uk('dmread'), r); }
}
function dmAfter() { const m = location.hash.match(/^#\/messages\/(.+)$/); if (m && S.user && !isGuest()) paintDm(decodeURIComponent(m[1]), true); }
function dmView(sub) {
  if (sub) {
    const to = decodeURIComponent(sub), u = getUsers()[to]; if (!u || dmBlocked(to) && !dmThread(to).length) return `<main class="page">${empty('No se puede abrir esta conversación', 'La persona no existe o hay un bloqueo entre ambas cuentas.', '<a class="button" href="#/messages">' + t('Volver a mensajes') + '</a>')}</main>`;
    const why = dmWhy(S.user, to), minor = ageGroup(S.user) === 'minor', mode = why ? 'ok' : dmMode(S.user, to);
    DM_SHOWN = to + ':' + mode;
    const reqBox = mode === 'incoming' ? `<div class="notice dm-req"><b>${t('Solicitud de mensaje')}</b><p>${t('{n} quiere escribirte. Solo puede enviar este mensaje; tú decides si la aceptas.', { n: esc(u.name) })}</p><div class="row-btns"><button type="button" class="button sm" data-act="dmr-ok" data-id="${esc(to)}">${t('Aceptar')}</button><button type="button" class="button secondary sm" data-act="dmr-no" data-id="${esc(to)}">${t('Rechazar')}</button><button type="button" class="button danger sm" data-act="dmr-block" data-id="${esc(to)}">${t('Bloquear')}</button></div></div>`
      : mode === 'sent' ? `<div class="notice dm-lock">${t('Solicitud enviada. Si la persona la acepta, podrán seguir escribiéndose.')}</div>` : '';
    const reqForm = mode === 'new' ? `<div class="dm-compose"><p class="dm-safe">${t('Primero envía una solicitud: un solo mensaje escrito, sin fotos ni enlaces. La otra persona decide si la acepta.')}</p>
      <form data-form="dm" data-to="${esc(to)}" class="c-compose"><div class="c-pill"><input id="dm-text" maxlength="${REQ_MAX}" placeholder="${esc(t('Escribe tu mensaje de solicitud…'))}" aria-label="${esc(t('Escribe un mensaje'))}" autocomplete="off"><button class="c-send" type="submit" aria-label="${esc(t('Enviar solicitud'))}">${ICO_SEND}</button></div></form><p class="error" id="dm-err" role="alert"></p></div>` : '';
    return `<main class="dm"><header class="dm-head"><a class="icon-btn" href="#/messages" data-dir="prev" aria-label="${esc(t('Volver a mensajes'))}">‹</a><a class="dm-who" href="#/user/${encodeURIComponent(to)}" data-dir="next">${userAvatar(to)}<b>${esc(u.name)}</b></a>
      <span class="dm-hacts"><button type="button" class="link-btn" data-act="report-user" data-id="${esc(to)}">${t('Reportar')}</button><button type="button" class="link-btn danger-link" data-act="block" data-id="${esc(to)}">${t('Bloquear')}</button></span></header>
      ${minor ? '<p class="dm-safe">' + t('Chat de menores: no se permiten teléfonos, enlaces, redes sociales ni fotos.') + '</p>' : ''}
      <div id="dm-msgs" class="dm-msgs" aria-live="polite"></div>
      ${why ? `<div class="notice dm-lock">${esc(why)}</div>` : mode !== 'ok' ? reqBox + reqForm : `<div class="dm-compose"><div class="dm-tools"><button type="button" class="chip" data-act="dm-book" data-id="${esc(to)}">${t('Enviar una obra para recomendar')}</button>${minor ? '' : `<label class="chip" style="cursor:pointer">${t('Enviar una foto')}<input id="dm-img" type="file" accept="image/*" data-to="${esc(to)}" hidden></label>`}</div>
      <form data-form="dm" data-to="${esc(to)}" class="c-compose"><div class="c-pill"><input id="dm-text" maxlength="500" placeholder="${esc(t('Escribe un mensaje…'))}" aria-label="${esc(t('Escribe un mensaje'))}" autocomplete="off"><button class="c-send" type="submit" aria-label="${esc(t('Enviar mensaje'))}">${ICO_SEND}</button></div></form><p class="error" id="dm-err" role="alert"></p></div>`}</main>`;
  }
  const cv = dmConvos(), r = dmRead(), have = new Set(cv.map(x => x.other)), inc = dmIncoming(), cand = following(S.user).filter(e => !have.has(e) && !inc.some(x => x.other === e) && dmWhy(S.user, e) === '' && dmMode(S.user, e) !== 'sent');
  const row = (e, sub, right, href) => `<a class="dm-item" href="#/messages/${encodeURIComponent(e)}" data-dir="next">${framedAvatar(e)}<span class="dm-it"><b>${esc(uName(e))}</b><small>${sub}</small></span>${right}</a>`;
  const prev = m => m.sid ? t('Obra recomendada') : m.img ? t('Foto') : esc(clip(m.text, 60));
  return `<main class="page story-layout"><div class="set-head"><a class="icon-btn" href="#/" data-dir="prev" aria-label="${esc(t('Volver'))}">‹</a><h2>${t('Mensajes')}</h2></div>
  ${inc.length ? `<h3 class="set-group">${t('Solicitudes de mensaje')}</h3><div class="set-list">${inc.map(x => row(x.other, esc(clip(x.last.text, 60)), `<span class="dm-meta"><i class="dm-dot" aria-label="${esc(t('Sin leer'))}"></i></span>`)).join('')}</div>` : ''}
  ${cv.length ? `<div class="set-list">${cv.map(x => { const un = x.last.by !== S.user && x.last.id > (r[x.key] || 0); return row(x.other, `${x.last.by === S.user ? t('Tú: ') : ''}${prev(x.last)}`, `<span class="dm-meta">${relSpan(x.last)}${un ? '<i class="dm-dot" aria-label="' + esc(t('Sin leer')) + '"></i>' : ''}</span>`); }).join('')}</div>` : ''}
  ${cand.length ? `<h3 class="set-group">${t('Escribir a')}</h3><div class="set-list">${cand.map(e => row(e, ageGroup(S.user) === 'minor' ? t('Se siguen mutuamente') : t('Enviar solicitud de mensaje'), '<span class="dm-meta">›</span>')).join('')}</div>` : ''}
  ${!cv.length && !cand.length && !inc.length ? empty('Aún no hay conversaciones', ageGroup(S.user) === 'minor' ? 'Cuando dos personas se sigan mutuamente y estén en el mismo rango de edad, podrán escribirse desde aquí o desde el perfil.' : 'Entra al perfil de otra persona mayor de edad y envíale una solicitud de mensaje. Aquí verás las que te lleguen.') : ''}
  <section class="panel dm-rules"><h3>${t('Quiénes pueden escribirse')}</h3><ul><li>${t('Menores de 18 solo hablan con menores de 18, y mayores de edad solo con mayores de edad.')}</li><li>${t('Menores de 18: ambas personas deben seguirse mutuamente.')}</li><li>${t('Mayores de edad: primero se envía una solicitud con un solo mensaje escrito, sin fotos ni enlaces. La otra persona puede aceptar, rechazar o bloquear.')}</li><li>${t('Con la solicitud aceptada, entre mayores de edad se pueden enviar fotos.')}</li><li>${t('En chats de menores no hay fotos y se bloquean teléfonos, enlaces y redes sociales.')}</li><li>${t('Una vez que pueden chatear, se pueden recomendar obras.')}</li></ul></section></main>`;
}
/** Aceptar, rechazar o bloquear una solicitud. Rechazar y bloquear NO avisan a quien la envió */
async function dmAnswer(from, action) {
  const me = S.user; if (dmSt(from, me) !== 'pending') return;
  if (cloud() && sbSes() && !isGuest()) {
    const fu = sbIds(LS.get('auri.users', {})).uid(from);
    if (fu) { const r = await sbApi('/rest/v1/rpc/answer_dm_request', { method: 'POST', body: { from_user: fu, action } }); if (!r.ok) return toast(t('No se pudo guardar el cambio. Inténtalo de nuevo.')); }
  }
  const all = dmReq(); all[from + '>' + me] = action === 'accept' ? 'accepted' : 'rejected'; G.set('dmreq', all);
  if (action === 'block') blockUser(from);
  if (action === 'accept' && !(cloud() && sbSes())) pushNotif(from, { type: 'sys', extra: '{n} aceptó tu solicitud de mensaje.', xv: { n: uName(me) } });
  if (action === 'accept') { toast(t('Solicitud aceptada')); KEEP = true; render(); return; }
  toast(action === 'block' ? t('Cuenta bloqueada') : t('Solicitud rechazada')); go('/messages');
}
function openDmBookPicker(to) {
  const m = document.createElement('div'); m.className = 'modal sheet'; let tab = 'home', q = ''; const minor = ageGroup(S.user) === 'minor';
  m.innerHTML = `<div class="modal-box bp-box" role="dialog" aria-modal="true" aria-label="${esc(t('Enviar una obra para recomendar'))}"><button class="icon-btn close-x" data-x aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Enviar una obra para recomendar')}</h2><p class="helper">${t('Toca una obra y se envía en el chat.')}</p>
  <div class="bp-tabs"><button type="button" class="chip active" data-t="home">${t('Inicio')}</button><button type="button" class="chip" data-t="lib">${t('Mis guardados')}</button><button type="button" class="chip" data-t="favs">${t('Mis favoritos')}</button></div>
  <input class="field bp-q" type="search" placeholder="${esc(t('Buscar por título o autoría…'))}" aria-label="${esc(t('Buscar obra'))}"><div class="bp-list"></div></div>`;
  const list = m.querySelector('.bp-list');
  const src = () => { const all = publishedStories().filter(matureOK).filter(x => !(minor && x.mature)); return (tab === 'favs' ? all.filter(x => S.favs.includes(x.id)) : tab === 'lib' ? all.filter(x => S.lib.includes(x.id)) : all).filter(x => !q || `${x.title} ${x.author}`.toLowerCase().includes(q)); };
  const paint = () => { const l = src(); list.innerHTML = l.length ? l.map((x, i) => `<button type="button" class="bp-item" data-id="${esc(x.id)}"><span class="bp-cv">${coverHTML(x, i)}</span><span class="bp-t"><b>${esc(x.title)}</b><small>${t('por {a}', { a: esc(x.author || '') })}</small></span><span class="bp-add">${t('Enviar')}</span></button>`).join('')
    : `<p class="helper" style="text-align:center;margin:18px 0">${tab === 'favs' ? t('Aún no hay obras favoritas.') : tab === 'lib' ? t('Aún no hay obras guardadas.') : t('No hay obras publicadas.')}</p>`; };
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = ev => { if (ev.target === m) m.remove(); };
  m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('active', x === b)); paint(); });
  m.querySelector('.bp-q').oninput = ev => { q = ev.target.value.trim().toLowerCase(); paint(); };
  list.onclick = ev => { const it = ev.target.closest('.bp-item'); if (!it) return; const r = dmSend(to, { sid: it.dataset.id }); if (r) return toast(r); m.remove(); paintDm(to, true); toast('Obra enviada'); };
  paint(); document.body.appendChild(m);
}
setInterval(() => { if (!S.user || isGuest()) return; const m = location.hash.match(/^#\/messages\/(.+)$/); if (m) paintDm(decodeURIComponent(m[1])); }, 2500);
document.addEventListener('change', e => { const f = e.target; if (!f || f.id !== 'dm-img' || !f.files || !f.files[0]) return; const to = f.dataset.to, file = f.files[0]; f.value = '';
  fitPhoto(file, 900, 900, img => { const r = dmSend(to, { img }); if (r) return toast(r); paintDm(to, true); }, .72); });

/* --- Primer uso: bienvenida, acceso e invitado --- */
let WLI = 0;
const WI = {
  book: IC('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>'),
  chat: IC('<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.4A8 8 0 1 1 21 12z"/>'),
  note: IC('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  shield: IC('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  down: IC('<path d="M12 5v14M6 13l6 6 6-6"/>')
};
const WL_SLIDES = [
  () => `<div class="wl-art">${mascot('wl-mascot')}</div><h1>${t('Te damos la bienvenida a Auri')}</h1><p>${t('Un rincón acogedor para leer fanfics, escribir historias y compartirlas con una comunidad que ama los libros tanto como Auri.')}</p>`,
  () => `<div class="wl-art"><div class="wl-demo"><div class="wl-oc"><span class="wl-av">L</span><span class="wl-ocx"><b>Luna</b><small>${t('OC · cabello plateado · ojos violetas')}</small></span></div>
    <p class="wl-from">«${t('TN sonrió bajo la luna…')}»</p><span class="wl-ic wl-down">${WI.down}</span><p class="wl-to">«<mark>Luna</mark> ${t('sonrió bajo la luna…')}»</p></div></div>
    <span class="eyebrow">${t('Función estrella')}</span><h1>${t('Usa tu OC como protagonista de tus historias favoritas')}</h1><p>${t('Nombre, apodo y personalidad de tu OC reemplazan al TN en fanfics compatibles, sin cambiar la historia original.')}</p>`,
  () => `<h1>${t('Pensada para disfrutar cada capítulo')}</h1><div class="wl-feats">${[
    ['book', 'Biblioteca y progreso', 'Cada historia recuerda en qué capítulo quedó la lectura.'],
    ['chat', 'Comentarios por párrafo', 'Reacciona en momentos exactos, con spoilers difuminados.'],
    ['note', 'Música en capítulos', 'Autorías pueden sumar una canción para acompañar.'],
    ['shield', 'Sin anuncios entre capítulos', 'Lectura cómoda en una comunidad moderada y segura.']
  ].map(([i, ti, d], k) => `<div class="wl-feat" style="--i:${k}"><span class="wl-ic">${WI[i]}</span><span><b>${t(ti)}</b><small>${t(d)}</small></span></div>`).join('')}</div>`
];
function welcomeView() {
  const n = WL_SLIDES.length, last = WLI >= n - 1;
  return `<main class="wl" aria-roledescription="${esc(t('presentación'))}"><button type="button" class="link-btn wl-skip" data-act="wl-done" style="${last ? 'visibility:hidden' : ''}">${t('Saltar')}</button>
  <section class="wl-slide" aria-live="polite">${WL_SLIDES[WLI]()}</section>
  <div class="wl-dots">${WL_SLIDES.map((_, i) => `<button type="button" class="wl-dot ${i === WLI ? 'on' : ''}" data-act="wl-go" data-i="${i}" aria-label="${esc(t('Pantalla {i} de {n}', { i: i + 1, n }))}"></button>`).join('')}</div>
  <div class="wl-nav">${WLI > 0 ? '<button type="button" class="button ghost" data-act="wl-prev">' + t('Atrás') + '</button>' : '<span></span>'}<button type="button" class="button" data-act="${last ? 'wl-done' : 'wl-next'}">${last ? t('Comenzar') : t('Siguiente')}</button></div></main>`;
}
function startView() {
  return `<main class="auth-wrap wl-start"><div class="brand-big">${mascot()}</div><h1>Auri</h1><p class="helper" style="text-align:center;margin-bottom:22px">${t('Leer, escribir y compartir fanfics.')}</p>
  <div class="wl-actions"><a class="button" href="#/register">${t('Crear cuenta')}</a><a class="button secondary" href="#/login">${t('Iniciar sesión')}</a><button type="button" class="button ghost" data-act="guest-enter">${t('Entrar como invitado')}</button></div>
  <p class="notice" style="margin-top:18px">${t('Como invitado se puede explorar y leer, pero no dar me gusta ni comentar. Al crear una cuenta después, el progreso de lectura se conserva.')}</p>
  <p class="helper" style="text-align:center;margin-top:10px"><button type="button" class="link-btn" data-act="wl-replay">${t('Ver de nuevo la presentación')}</button></p></main>`;
}
const guestCard = () => `<div class="panel wl-guest"><div class="wl-guest-top">${avatarHTML('', t('Invitado'), 'xl')}<div><h2 class="serif">${t('Invitado')}</h2><p>${t('Explorando sin cuenta: se puede leer, guardar historias en la biblioteca y crear personajes.')}</p></div></div>
  <div class="wl-actions"><a class="button" href="#/register">${t('Crear cuenta')}</a><a class="button secondary" href="#/login">${t('Iniciar sesión')}</a></div>
  <p class="helper">${t('Al crear una cuenta, el progreso, la biblioteca y los personajes se conservan. Al iniciar sesión en una cuenta existente, lo guardado como invitado se pierde.')}</p></div>`;
const guestProfile = () => `<main class="page">${guestCard()}${charsSection()}</main>`;
const guestWall = what => `<main class="page"><div class="empty wl-wall">${mascot()}<h3>${t('Se necesita una cuenta para {what}', { what: t(what) })}</h3><p>${t('Crearla es gratis y el progreso de lectura actual se conserva.')}</p><div class="wl-actions"><a class="button" href="#/register">${t('Crear cuenta')}</a><a class="button secondary" href="#/login">${t('Iniciar sesión')}</a></div></div></main>`;
const guestCompose = what => `<div class="wl-compose"><span>${t('Se necesita una cuenta para {what}', { what: t(what) })}</span><button type="button" class="button sm" data-act="guest-cta">${t('Crear cuenta')}</button></div>`;

/* --- Descubrir --- */
let Q = '', GEN = 'All';
function storyCard(s, i) {                       // portada limpia; título + favorito y autoría + badge +18 debajo
  const fav = S.favs.includes(s.id), b = badgeText(s);
  return `<article class="mini"><a href="#/story/${esc(s.id)}" aria-label="${esc(s.title)}">${coverHTML(s, i)}</a>
  <div class="mini-row"><a class="mini-title" href="#/story/${esc(s.id)}">${esc(s.title)}</a><button class="mini-fav" data-act="fav" data-id="${esc(s.id)}" aria-label="${esc(t('Favorito'))}" aria-pressed="${fav}">${fav ? '♥' : '♡'}</button></div>
  <div class="mini-meta">${s.owner ? `<a href="#/user/${encodeURIComponent(s.owner)}">${esc(s.author)}</a>` : `<span>${esc(userName())}</span>`}</div>${b ? `<div class="mini-pill">${esc(b)}</div>` : ''}</article>`;
}
/* --- Nombres de usuario únicos --- */
const nameKey = n => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();
async function nameTaken(name, except) {                 // ¿ya hay otra persona con ese usuario? (sin importar mayúsculas)
  const k = nameKey(name); if (!k) return false;
  if (cloud()) { const r = await sbFetch('/rest/v1/rpc/name_taken', { method: 'POST', token: await sbToken(), body: { n: String(name).replace(/\s+/g, ' ').trim() } }); if (r.ok && typeof r.data === 'boolean') return r.data; }
  return Object.entries(getUsers()).some(([e, u]) => e !== except && e !== GUEST && nameKey(u.name) === k);
}
/* --- Buscar usuarios (Descubrir) --- */
let SM = 'books', UF = 'all', SB_UQ;                     // SM: qué se busca (libros o usuarios); UF: filtro propio de usuarios
function usersList() {
  const qs = nameKey(String(Q).replace(/^@/, '')), owners = new Set(publishedStories().map(s => s.owner)), cnt = {}; publishedStories().forEach(s => { cnt[s.owner] = (cnt[s.owner] || 0) + 1; });
  let l = Object.entries(getUsers()).filter(([e, u]) => e !== GUEST && u && u.name && isLiveUser(e, u) && commVisible(u.community === 'en' ? 'en' : 'es') && !hidesStory(e)
    && (UF === 'authors' ? owners.has(e) : UF === 'team' ? roleOf(e) !== 'USER' : true) && (!qs || nameKey(u.name).includes(qs)));
  l.sort((a, b) => { const A = nameKey(a[1].name), B = nameKey(b[1].name); return (qs ? (B.startsWith(qs) - A.startsWith(qs)) : 0) || A.localeCompare(B); });
  if (!l.length) return empty(t('No encontramos usuarios'), qs ? t('Prueba con otro nombre.') : t('Aún no hay usuarios aquí.'), '');
  return `<div class="user-list">${l.slice(0, 60).map(([e, u]) => `<a class="user-card panel" href="#/user/${encodeURIComponent(e)}" data-dir="next">${frWrap(e, 'sm', avatarHTML(u.avatar, u.name, 'sm'))}
    <div class="uc-txt"><b>${esc(u.name)}</b>${ROLE_LABEL[roleOf(e)] ? `<span class="role-tag ${roleOf(e).toLowerCase()}">🛡 ${t(ROLE_LABEL[roleOf(e)])}</span>` : ''}<span class="helper">${cnt[e] ? tn(cnt[e], '{n} libro publicado', '{n} libros publicados') : t('Sin libros publicados')}</span></div></a>`).join('')}</div>`;
}
async function sbSearchUsers() {                         // trae de Supabase a las personas que coinciden (aunque no hayan publicado nada)
  const qs = String(Q).replace(/^@/, '').trim(); if (!cloud() || SM !== 'users' || qs.length < 2) return;
  const r = await sbApi('/rest/v1/profiles?select=*&name=ilike.' + encodeURIComponent('*' + qs.replace(/[*%_,()]/g, '') + '*') + '&limit=40'); if (!r.ok || !Array.isArray(r.data)) return;
  const us = LS.get('auri.users', {}), me = sbSes() && sbSes().uid; let ch = false;
  r.data.filter(p => p.id !== me).forEach(pr => { const key = remoteKey(pr.id), old = us[key];
    const n = { ...(old || {}), uid: pr.id, cloud: true, remote: true, name: pr.name, community: pr.community === 'en' ? 'en' : 'es', bio: pr.bio || '', avatar: pr.avatar || '', banner: pr.banner || '', role: pr.role || 'USER', scope: Array.isArray(pr.scope) ? pr.scope : [],
      frameWorn: !!pr.frame_worn, frameSel: pr.frame_sel == null ? undefined : pr.frame_sel, cosTop: pr.cos_top == null ? undefined : pr.cos_top, shape: pr.photo_shape || '', halo: pr.halo || '', accent: pr.accent || '', mbti: pr.mbti || '', mbtiTheme: !!pr.mbti_theme, hideLists: !!pr.hide_lists, frameTop: !!pr.frame_top, bows: Array.isArray(pr.bows) ? pr.bows : [], modSince: pr.mod_since || undefined, admSince: pr.adm_since || undefined, onboarded: true, created: day(pr.created_at) || (old || {}).created, strikes: (old || {}).strikes || [] };
    if (JSON.stringify(old) !== JSON.stringify(n)) { us[key] = n; ch = true; } });
  if (ch) { LS.set('auri.users', us); const l = $('#list'); if (l && SM === 'users') l.innerHTML = usersList(); }
}
/* --- Feed de Inicio: filas con scroll, «Podría interesarte» y grupos con portadas --- */
const FEED = { row: 2, group: 3 };                  // mínimo de libros para mostrar una fila o un grupo (subir cuando haya más libros)
const tagsOf = s => [...(s.tags || []), ...(s.fandom && tagKey(s.fandom) !== 'original' ? [s.fandom] : [])];   // etiquetas + fandom (naruto, bts…)
const tagKey = x => String(x || '').trim().toLowerCase();
const WARNS = { violence: 'Violencia', death: 'Muerte de personajes', abuse: 'Abuso o maltrato', selfharm: 'Autolesión o suicidio', ed: 'Trastornos alimentarios', sexual: 'Contenido sexual', lang: 'Lenguaje fuerte', drugs: 'Drogas o alcohol' };
const warnsOf = s => (s.warns || []).filter(k => WARNS[k]);
const avoidWarns = () => (cfg('avoidWarns') || []).filter(k => WARNS[k]);
const avoidList = () => (cfg('avoidTags') || []).map(tagKey).filter(Boolean);
const avoidOK = s => { const a = avoidList(), w = avoidWarns(); return s.owner === S.user || ((!a.length || !tagsOf(s).some(x => a.includes(tagKey(x)))) && (!w.length || !warnsOf(s).some(k => w.includes(k)))); };    // oculta libros con etiquetas que la persona quiere evitar
const doneOK = s => !cfg('hideDone') || s.owner === S.user || !(S.progress[s.id] && bookProgress(s).finished);
const feedPool = () => publishedStories().filter(matureOK).filter(storyVisible).filter(avoidOK).filter(doneOK).filter(s => !hidesStory(s.owner));
function feedTags(pool) {                              // etiqueta (minúsculas) -> {label, n}
  const m = {}; pool.forEach(s => tagsOf(s).forEach(x => { const k = tagKey(x); if (!k) return; m[k] = m[k] || { label: String(x).trim(), n: 0 }; m[k].n++; })); return m;
}
function tasteTags(pool) {                             // etiquetas de lo que lees, guardas o te gusta (de más a menos)
  const w = {};
  pool.forEach(s => { let n = 0; if (S.progress[s.id]) n += 3; if (S.lib.includes(s.id)) n += 2; if (S.favs.includes(s.id)) n += 2; if (S.user && likes(s.id).includes(S.user)) n += 2;
    if (n) tagsOf(s).forEach(x => { const k = tagKey(x); if (k) w[k] = (w[k] || 0) + n; }); });
  return Object.entries(w).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
const feedScore = s => likes(s.id).length * 2 + (G.get('comments', {})[s.id] || []).length;
const feedRow = (title, sub, list, more) => `<section class="feed-sec"><div class="feed-head"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${more ? `<a class="feed-more" href="#/explore/${encodeURIComponent(more)}">${t('Ver todo')}</a>` : ''}</div><div class="feed-row">${list.map(storyCard).join('')}</div></section>`;
function groupCard(k, pool, tags) {                    // cuadro con portadas pequeñas: «Explorar dark romance»
  const l = pool.filter(s => tagsOf(s).some(x => tagKey(x) === k)).sort((a, b) => feedScore(b) - feedScore(a)).slice(0, 4), lab = (tags[k] || { label: k }).label;
  return `<a class="feed-group" href="#/explore/${encodeURIComponent(k)}" aria-label="${esc(t('Explorar {tag}', { tag: lab }))}"><div class="fg-top"><b>${esc(t('Explorar {tag}', { tag: lab }))}</b><span>›</span></div><div class="fg-covers">${l.map((s, i) => coverHTML(s, i)).join('')}</div></a>`;
}
function feedHTML() {
  const pool = feedPool(); if (pool.length < FEED.row) return '';
  const tags = feedTags(pool), taste = tasteTags(pool), out = [], used = new Set();
  const rowOK = l => l.length >= FEED.row;
  const featIds = new Set(crPub().filter(b => b.kind === 'book').map(b => b.storyId)), feat = pool.filter(s => featIds.has(s.id)).slice(0, 12);
  if (rowOK(feat)) out.push(feedRow(t('Destacados'), '', feat));
  const top = taste.filter(k => tags[k]).slice(0, 5);                  // para ti
  if (top.length) {
    const cand = pool.filter(s => s.owner !== S.user && !S.progress[s.id] && !S.lib.includes(s.id) && !S.favs.includes(s.id)).map(s => { const hit = top.filter(k => tagsOf(s).some(x => tagKey(x) === k)); return { s, hit, sc: hit.reduce((a, k) => a + (6 - top.indexOf(k)), 0) + (hit.length > 1 ? 3 : 0) }; }).filter(x => x.hit.length).sort((a, b) => b.sc - a.sc || feedScore(b.s) - feedScore(a.s)).slice(0, 12);
    if (rowOK(cand)) { const lab = [...new Set(cand.slice(0, 4).flatMap(x => x.hit))].slice(0, 2).map(k => '#' + tags[k].label).join(' · '); out.push(feedRow(t('Podría interesarte'), t('Porque lees {tags}', { tags: lab }), cand.map(x => x.s))); cand.forEach(x => used.add(x.s.id)); }
  }
  const groups = Object.keys(tags).filter(k => tags[k].n >= FEED.group).sort((a, b) => (top.indexOf(b) + 1 || 0) - (top.indexOf(a) + 1 || 0) || tags[b].n - tags[a].n);
  const day = today(), hash = [...day].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const pickG = groups.length ? groups[hash % groups.length] : '';
  const rnd = Object.keys(tags).filter(k => tags[k].n >= FEED.row && k !== pickG); const rk = rnd.length ? rnd[(hash * 7) % rnd.length] : '';
  if (groups[0]) out.push(groupCard(groups[0], pool, tags));
  if (rk) out.push(feedRow('#' + esc(tags[rk].label), t('Una etiqueta para explorar hoy'), pool.filter(s => tagsOf(s).some(x => tagKey(x) === rk)).slice(0, 12), rk));
  const recent = Date.now() - 30 * 864e5, scored = pool.filter(s => feedScore(s) > 0);
  const hot = scored.filter(s => new Date(s.updatedAt || 0).getTime() >= recent).sort((a, b) => feedScore(b) - feedScore(a)).slice(0, 12), all = scored.sort((a, b) => feedScore(b) - feedScore(a)).slice(0, 12);
  if (rowOK(hot)) out.push(feedRow(t('Lo más famoso del momento'), '', hot));
  if (pickG && pickG !== groups[0]) out.push(groupCard(pickG, pool, tags));
  if (rowOK(all) && all.map(s => s.id).join() !== hot.map(s => s.id).join()) out.push(feedRow(t('Lo más famoso de Auri'), '', all));
  return out.length ? out.join('') + `<div class="section-head feed-all"><div><h2>${t('Todas las historias')}</h2></div></div>` : '';
}
function exploreView(k) {
  k = tagKey(k); const pool = feedPool(), tags = feedTags(pool), l = pool.filter(s => tagsOf(s).some(x => tagKey(x) === k)).sort((a, b) => feedScore(b) - feedScore(a)), lab = (tags[k] || { label: k }).label;
  return `<main class="page"><a class="back-link" href="#/">‹ ${t('Volver')}</a><div class="section-head"><div><span class="eyebrow">${t('Explorar')}</span><h2 style="margin-top:8px">#${esc(lab)}</h2><p>${t('{n} libros', { n: l.length })}</p></div></div>
  ${l.length ? `<div class="story-grid">${l.map(storyCard).join('')}</div>` : empty(t('Aún no hay libros con esta etiqueta.'), '', '<a class="button secondary" href="#/">' + t('Volver') + '</a>')}</main>`;
}
function similarBooks(s, max = 15) {                  // libros parecidos al que acabas de leer (comparten etiquetas), con algo de azar entre empates
  const mine = new Set(tagsOf(s).map(tagKey)); if (!mine.size) return [];
  return feedPool().filter(x => x.id !== s.id && x.owner !== S.user && !(S.progress[x.id] && bookProgress(x).finished)).map(x => ({ x, n: tagsOf(x).filter(k => mine.has(tagKey(k))).length, r: Math.random() })).filter(o => o.n > 0).sort((a, b) => b.n - a.n || a.r - b.r).slice(0, max).map(o => o.x);
}
function discoverList() {
  if (SM === 'users') return usersList();
  const live = publishedStories().filter(matureOK).filter(storyVisible).filter(avoidOK).filter(s => !hidesStory(s.owner));
  const qs = Q.trim().toLowerCase(), tq = qs.includes('#') ? parseTags(qs).map(x => x.toLowerCase()) : null;      // «#romance #au» busca por etiquetas
  const f = live.filter(s => (GEN === 'All' || s.genre === GEN) && (tq ? tq.every(t => s.tags.some(x => x.toLowerCase() === t || x.toLowerCase().includes(t))) : `${s.title} ${s.synopsis} ${s.fandom} ${s.tags.join(' ')}`.toLowerCase().includes(qs)));
  if (f.length) { const pool = feedPool(), tg = feedTags(pool), qk = tagKey(tq && tq.length === 1 ? tq[0] : qs), gc = qs && tg[qk] && tg[qk].n >= FEED.group ? groupCard(qk, pool, tg) : '';
    return (!qs && GEN === 'All' ? feedHTML() : '') + gc + `<div class="story-grid">${f.map(storyCard).join('')}</div>`; }
  if (!live.length) return empty(t('El estante de Auri está vacío'), t('Aquí aparecerán las historias creadas por las personas usuarias. Puedes escribir la primera.'), '<a class="button secondary" href="#/write">' + t('Crear la primera historia') + '</a>');
  return empty(t('No encontramos historias'), t('Prueba con otra búsqueda o género.'), '<button class="button secondary" data-act="clear">' + t('Borrar filtros') + '</button>');
}
/* --- Banner de Inicio: carrusel (noticias automáticas + tarjetas manuales de la Owner) --- */
const crAll = () => G.get('banners', []);
const crPub = () => crAll().filter(pubOK).filter(b => commVisible(postComm(b)));
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
let CARI = 0, CARTIMER = null, CARHOLD = 0;            // tarjeta actual, temporizador y pausa tras tocar/deslizar
/* --- Encuestas: tarjetas del banner con pregunta y de 2 a 6 opciones. Un voto por persona, no se cambia. Los resultados se ven tras votar, al cerrar o si eres del equipo --- */
let PCACHE = null;
const pollCache = () => PCACHE || (PCACHE = LS.get(uk('pollcache'), {}));
const pollInfo = b => { const opts = (Array.isArray(b.options) ? b.options : []).map(x => String(x)).slice(0, 6), ends = b.ends || ''; return { opts, ends, closed: !!ends && ends < today() }; };
function pollRes(b) {
  const p = pollInfo(b), n = p.opts.length; let counts = Array(n).fill(0), mine = -1;
  if (cloud()) { const c = pollCache()[pUuid('banners', b.id)]; if (c) { counts = counts.map((_, i) => (c.c && c.c[i]) || 0); mine = Number.isInteger(c.mine) ? c.mine : -1; } }
  else { const v = G.get('pollvotes', {})[b.id] || {}; Object.values(v).forEach(i => { if (Number.isInteger(i) && i >= 0 && i < n) counts[i]++; }); const m = v[S.user]; mine = Number.isInteger(m) ? m : -1; }
  return { ...p, counts, total: counts.reduce((a, x) => a + x, 0), mine, show: mine >= 0 || p.closed || (!isGuest() && isStaff()) };
}
async function sbSyncPolls() {                              // trae los conteos (el servidor solo los entrega a quien puede verlos)
  if (!cloud()) return false;
  const ids = crAll().filter(b => b.kind === 'poll' && pubOK(b)).map(b => pUuid('banners', b.id)).filter(Boolean); if (!ids.length) return false;
  const r = await sbApi('/rest/v1/rpc/poll_counts', { method: 'POST', body: { bids: ids } }); if (!r.ok || !Array.isArray(r.data)) return false;
  const next = {}; ids.forEach(u => { next[u] = { c: [], mine: -1 }; });
  r.data.forEach(x => { const o = next[x.banner_id]; if (!o) return; if (x.opt === -1) o.mine = +x.n >= 0 ? +x.n : -1; else o.c[x.opt] = +x.n; });
  const same = JSON.stringify(next) === JSON.stringify(pollCache()); PCACHE = next; LS.set(uk('pollcache'), next); return !same;
}
async function pollVote(b, i) {                             // devuelve '' si salió bien o el texto del error
  if (isGuest()) return t('Inicia sesión para votar.');
  const p = pollRes(b); if (p.closed) return t('Esa encuesta ya cerró.'); if (p.mine >= 0) return t('Ya votaste en esta encuesta.'); if (!(i >= 0 && i < p.opts.length)) return t('Elige una opción válida.');
  if (cloud()) { const r = await sbApi('/rest/v1/rpc/vote_poll', { method: 'POST', body: { bid: pUuid('banners', b.id), option_idx: i } }); if (!r.ok) { await sbSyncPolls(); return modErr(r); } await sbSyncPolls(); return ''; }
  const all = G.get('pollvotes', {}); all[b.id] = { ...(all[b.id] || {}), [S.user]: i }; G.set('pollvotes', all); return '';
}
function pollPaint(m, b) {
  const p = pollRes(b), canVote = !isGuest() && !p.closed && p.mine < 0, res = p.show && (!canVote || m.dataset.res === '1');
  const pct = i => p.total ? Math.round(p.counts[i] * 100 / p.total) : 0;
  const body = res
    ? `<div class="poll-list">${p.opts.map((o, i) => `<div class="poll-row ${p.mine === i ? 'mine' : ''}"><span class="poll-bar" style="width:${pct(i)}%"></span><span class="poll-t">${esc(o)}${p.mine === i ? ' ✓' : ''}</span><b>${pct(i)}%</b></div>`).join('')}</div><p class="helper" style="text-align:center">${t('{n} voto(s)', { n: p.total })}</p>`
    : `<div class="poll-list">${p.opts.map((o, i) => `<button type="button" class="poll-opt" data-i="${i}" ${canVote ? '' : 'disabled'}>${esc(o)}</button>`).join('')}</div>`;
  const note = isGuest() ? t('Inicia sesión para votar.') : p.closed ? t('Esta encuesta cerró.') : p.mine >= 0 ? t('Gracias por votar. Tu voto no se puede cambiar.') : p.ends ? t('Cierra el {d}', { d: esc(p.ends) }) : t('Elige una opción. Solo puedes votar una vez.');
  m.innerHTML = `<div class="modal-box poll-box" role="dialog" aria-modal="true" aria-label="${esc(b.title)}"><button class="icon-btn close-x" data-x aria-label="${esc(t('Cerrar'))}">✕</button><span class="eyebrow">📊 ${t('Encuesta')}</span><h2>${esc(b.title)}</h2>${body}<p class="helper" id="poll-note" style="text-align:center">${note}</p>
  ${canVote && p.show ? `<button type="button" class="button ghost sm" data-tog style="margin:0 auto;display:flex">${res ? t('Volver a votar') : t('Ver resultados')}</button>` : ''}</div>`;
}
function pollModal(id) {
  const b = crAll().find(x => String(x.id) === String(id)); if (!b || b.kind !== 'poll') return;
  const old = $('#poll-modal'); if (old) old.remove();
  const m = document.createElement('div'); m.id = 'poll-modal'; m.className = 'modal'; m.dataset.res = '';
  m.onclick = async e => {
    if (e.target === m || e.target.closest('[data-x]')) return m.remove();
    if (e.target.closest('[data-tog]')) { m.dataset.res = m.dataset.res === '1' ? '' : '1'; return pollPaint(m, b); }
    const o = e.target.closest('.poll-opt'); if (!o || o.disabled) return;
    m.querySelectorAll('.poll-opt').forEach(x => { x.disabled = true; });
    const err = await pollVote(b, +o.dataset.i); pollPaint(m, b);
    if (err) { const nt = $('#poll-note'); if (nt) nt.textContent = err; } else { m.dataset.res = '1'; pollPaint(m, b); softRender(); }
  };
  pollPaint(m, b); document.body.appendChild(m);
  if (cloud()) sbSyncPolls().then(ch => { if (ch && document.body.contains(m)) pollPaint(m, b); });
}
function carSlides() {                                 // primero las tarjetas manuales (recomendaciones y eventos), luego las últimas noticias
  const pub = publishedStories().filter(matureOK).filter(storyVisible), out = [], dOf = (b, n) => b.date || (n && n.date) || (+b.id > 1e12 ? new Date(+b.id).toISOString().slice(0, 10) : '');
  crPub().forEach(b => {
    if (b.kind === 'book') { const st = pub.find(x => x.id === b.storyId); if (!st) return;
      out.push({ k: 'book', by: byline(b), badge: '📚 ' + t('Recomendado'), title: b.title || st.title, text: b.text || st.synopsis, cover: st.cover, au: st.author || '', date: dOf(b), sub: `📖 ${st.title}${st.author ? ' · ' + st.author : ''}`, href: `#/story/${esc(st.id)}/${st.chapters[0].idx + 1}`, tn: st.useReaderCharacter ? st.id : '', btn: b.btn || t('Leer ahora') }); }
    else if (b.kind === 'poll') { const p = pollRes(b); if (p.opts.length < 2) return;
      out.push({ k: 'poll', by: byline(b), badge: '📊 ' + t('Encuesta'), title: b.title, text: p.closed ? t('Esta encuesta cerró.') : p.mine >= 0 ? t('Ya votaste. Toca para ver los resultados.') : (p.ends ? t('Cierra el {d}', { d: p.ends }) + ' · ' : '') + t('{n} opciones', { n: p.opts.length }), date: dOf(b), act: 'poll-open', id: b.id, btn: p.closed || p.mine >= 0 ? t('Ver resultados') : t('Votar') }); }
    else { const n = b.newsId ? news().find(x => String(x.id) === String(b.newsId)) : null;
      out.push({ k: 'event', by: byline(b), badge: '🎉 ' + t('Evento'), date: dOf(b, n), title: b.title, text: b.text, cover: newsCover(n), wide: true, href: n ? '#/news/' + n.id : '', btn: b.btn || t('Ver más') }); }
  });
  newsPub().slice(0, 4).forEach(n => out.push({ k: 'news', by: byline(n), badge: '📣 ' + t(n.type || 'Noticia'), date: n.date, title: n.title, text: n.text, cover: newsCover(n), wide: true, href: '#/news/' + n.id, btn: t('Leer noticia') }));
  return out.slice(0, 8);
}
function carouselHTML() {
  const sl = carSlides(); if (!sl.length) return '';
  const card = (x, i) => `<article class="cr-slide cr-${x.k}" role="group" aria-roledescription="${esc(t('diapositiva'))}" aria-label="${esc(t('{i} de {n}', { i: i + 1, n: sl.length }))}">${safeImg(x.cover) ? `<img class="cr-bg" src="${esc(x.cover)}" alt="" aria-hidden="true">` : ''}<div class="cr-txt"><span class="eyebrow">${esc(x.badge)}</span>${x.date ? `<span class="cr-date">${t('Publicado el {d}', { d: esc(x.date) })}</span>` : ''}${x.by ? `<span class="cr-by">${t('Por {x}', { x: esc(x.by) })}</span>` : ''}<h2>${esc(clip(x.title, 70))}</h2>${x.sub && x.sub.indexOf(x.title) < 0 ? `<div class="cr-sub">${esc(clip(x.sub, 60))}</div>` : ''}<p>${esc(clip(x.text, 130))}</p>
    ${x.act ? `<button type="button" class="button secondary sm" data-act="${x.act}" data-id="${esc(x.id)}">${esc(x.btn)}</button>` : x.href ? `<a class="button secondary sm" href="${x.href}" data-dir="next" ${x.tn ? `data-readas="${esc(x.tn)}"` : ''}>${esc(x.btn)}</a>` : ''}</div>${safeImg(x.cover) ? `<div class="cr-cv ${x.wide ? 'wide' : ''}"><img class="cr-cover ${x.wide ? 'wide' : ''}" src="${esc(x.cover)}" alt="">${x.au ? `<span class="cr-au">${t('Por: {x}', { x: esc(x.au) })}</span>` : ''}</div>` : ''}</article>`;
  return `<section class="carousel" aria-roledescription="${esc(t('carrusel'))}" aria-label="${esc(t('Novedades de Auri'))}"><div class="cr-track" id="cr-track">${sl.map(card).join('')}</div>
  ${sl.length > 1 ? `<div class="cr-dots">${sl.map((_, i) => `<button type="button" class="cr-dot ${i === CARI ? 'on' : ''}" data-act="car-go" data-i="${i}" aria-label="${esc(t('Ir a la tarjeta {i}', { i: i + 1 }))}"></button>`).join('')}</div>` : ''}</section>`;
}
const carStep = t => t.children.length > 1 ? t.children[1].offsetLeft - t.children[0].offsetLeft : (t.clientWidth || 1);
function carGo(i) { const t = $('#cr-track'); if (!t || !t.children) return; const n = t.children.length; if (!n) return; i = (i + n) % n; t.scrollTo({ left: i * carStep(t), behavior: reduceMotion() ? 'auto' : 'smooth' }); }
function carInit() {                                   // se llama tras cada dibujado: restaura la posición, sincroniza los puntos y cambia sola cada 5 s
  clearInterval(CARTIMER); CARTIMER = null;
  const t = $('#cr-track'); if (!t || !t.children) return; const n = t.children.length; if (!n) return;
  if (CARI >= n) CARI = 0; t.scrollLeft = CARI * carStep(t);
  let raf = 0;
  t.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const i = Math.round(t.scrollLeft / carStep(t)); if (i !== CARI) { CARI = i; document.querySelectorAll('.cr-dot').forEach((d, k) => d.classList.toggle('on', k === i)); } }); }, { passive: true });
  ['pointerdown', 'touchstart', 'wheel'].forEach(ev => t.addEventListener(ev, () => { CARHOLD = Date.now() + 8000; }, { passive: true }));   // si la persona interactúa, el carrusel espera
  if (n < 2 || reduceMotion()) return;
  CARTIMER = setInterval(() => { if (!document.body.contains(t)) { clearInterval(CARTIMER); CARTIMER = null; return; } if (document.hidden || Date.now() < CARHOLD) return; carGo(CARI + 1); }, 5000);
}
/* ---------- Estados (burbujas de las personas que sigues) ----------
   Un pensamiento o un libro recomendado, 24 h. Debajo de cada persona sale "Nuevo capítulo" si publicó uno que aún no lees.
   Menores: no ven pensamientos de cuentas adultas (sí recomendaciones y capítulos). Un punto junto al nombre marca lo nuevo. */
const ST_MS = 24 * 3600 * 1000, ST_MAX = 140, ST_BAD = /(https?:\/\/|www\.|[a-z0-9._-]+@[a-z0-9-]+\.|[0-9][0-9 .-]{6,}[0-9])/i;
let ST = { list: [], at: 0, sig: '' };                    // lista de la nube con claves locales
const stSeen = () => LS.get(uk('stseen'), {});
const stMark = (k, v) => { const m = stSeen(); m[k] = v; LS.set(uk('stseen'), m); };
const stLocal = () => G.get('statuses', {});
function stOkLocal(r) {                                   // mismas reglas que el servidor, para el modo sin nube
  if (r.e === S.user) return true; if (hidesFrom(r.e)) return false;
  const me = getUsers()[S.user], adult = isAdult(me);
  if (r.kind === 'thought' && isAdult(getUsers()[r.e]) !== adult) return false;
  if (r.mature && !adult) return false;
  if (r.kind === 'rec') { const b = findStory(r.sid); if (!b || (b.mature && !adult)) return false; }
  return true;
}
/** Estados visibles ahora mismo: [{e, kind, text, sid, mature, at, exp}] */
function stAll() {
  if (modCloud()) return ST.list.filter(r => r.exp > Date.now());
  const fl = following(S.user), L = stLocal();
  return Object.keys(L).map(e => ({ e, ...L[e] })).filter(r => r.exp > Date.now() && (r.e === S.user || fl.includes(r.e)) && stOkLocal(r));
}
async function stLoad(force) {
  if (!modCloud() || isGuest()) return; if (!force && Date.now() - ST.at < 45000) return; ST.at = Date.now();
  const r = await sbApi('/rest/v1/rpc/status_feed', { method: 'POST', body: { p_user: null } }); if (!r.ok || !Array.isArray(r.data)) return;
  const ids = await sbKnow(r.data.map(x => x.user_id)), list = [];
  r.data.forEach(x => { const e = ids.key(x.user_id); if (e) list.push({ e, kind: x.kind, text: x.text || '', sid: x.story_id ? sBack(x.story_id) : '', mature: !!x.mature, at: Date.parse(x.created_at), exp: Date.parse(x.expires_at) }); });
  const sig = JSON.stringify(list); if (sig !== ST.sig) { ST.sig = sig; ST.list = list; softRender(); }
}
const stGet = e => stAll().find(r => r.e === e) || ((ST.prof || {})[e] && (ST.prof[e].row && ST.prof[e].row.exp > Date.now()) ? ST.prof[e].row : null);
async function stProfLoad(e) {                           // estado de una persona que no sigues (para su perfil); el servidor aplica las reglas de edad y bloqueo
  const u = getUsers()[e] || {}; ST.prof = ST.prof || {}; const c = ST.prof[e];
  if (!modCloud() || isGuest() || e === S.user || !u.uid || (c && Date.now() - c.at < 45000)) return; ST.prof[e] = { at: Date.now(), row: c ? c.row : null };
  const r = await sbApi('/rest/v1/rpc/status_feed', { method: 'POST', body: { p_user: u.uid } }); if (!r.ok || !Array.isArray(r.data)) return;
  const x = r.data[0], row = x ? { e, kind: x.kind, text: x.text || '', sid: x.story_id ? sBack(x.story_id) : '', mature: !!x.mature, at: Date.parse(x.created_at), exp: Date.parse(x.expires_at) } : null;
  const had = !!(c && c.row); ST.prof[e] = { at: Date.now(), row }; if (!!row !== had || (row && c && c.row && c.row.at !== row.at)) softRender();
}
function stProfBubble(e) {                               // burbuja junto a la foto en el perfil
  stProfLoad(e); const r = stGet(e); if (!r) return '';
  return `<button type="button" class="st-bub pf-bub" data-act="st-open" data-id="${esc(e)}"><span>${esc(stBubText(r))}</span></button>`;
}
async function stPublish(kind, text, sid, mature) {
  if (modCloud()) {
    const r = await sbApi('/rest/v1/rpc/status_set', { method: 'POST', body: { p_kind: kind, p_text: text, p_story: kind === 'rec' ? sUuid(sid) : null, p_mature: !!mature } });
    if (!r.ok) return modErr(r); ST.at = 0; await stLoad(true); return '';
  }
  const L = stLocal(), now = Date.now(); L[S.user] = { kind, text: kind === 'thought' ? text : '', sid: kind === 'rec' ? sid : '', mature: kind === 'thought' ? !!mature && isAdult(getUsers()[S.user]) : !!(findStory(sid) || {}).mature, at: now, exp: now + ST_MS }; G.set('statuses', L); return '';
}
async function stRemove() {
  if (modCloud()) { const r = await sbApi('/rest/v1/rpc/status_clear', { method: 'POST', body: {} }); if (!r.ok) return modErr(r); ST.at = 0; await stLoad(true); return ''; }
  const L = stLocal(); delete L[S.user]; G.set('statuses', L); return '';
}
/** Libros con capítulo nuevo (para ti) de personas que sigues */
function stNewChap(e) {
  const cut = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), me = S.user;
  return publishedStories().filter(s => s.owner === e && storyVisible(s) && !hidesStory(s.owner) && s.updatedAt >= cut && !(s.mature && isMinor(getUsers()[me]))).filter(s => { const pc = s.chapters.filter(pubChapter); return pc.length && !readList(s.id).includes(pc[pc.length - 1].idx); }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}
function stBubText(r) {
  if (r.kind === 'rec') { const b = findStory(r.sid); return t('recomendó «{x}»', { x: b ? clip(b.title, 40) : t('un libro') }); }
  return clip(r.text, 70);
}
function stRow() {
  if (!S.user || isGuest()) return ''; stLoad();
  const all = stAll(), by = {}; all.forEach(r => { by[r.e] = r; }); const seen = stSeen(), me = S.user;
  const people = [...new Set([...following(me), ...Object.keys(by)])].filter(e => e !== me && getUsers()[e] && !hidesFrom(e));
  const items = people.map(e => ({ e, st: by[e] || null, ch: stNewChap(e) })).filter(x => x.st || x.ch).map(x => ({ ...x, nw: (x.st && x.st.at > (seen[x.e] || 0)) || (x.ch && seen['c:' + x.e] !== x.ch.id + ':' + x.ch.updatedAt) }));
  items.sort((a, b) => (b.nw ? 1 : 0) - (a.nw ? 1 : 0) || ((b.st && b.st.at) || 0) - ((a.st && a.st.at) || 0));
  const mine = by[me];
  const item = (e, st, ch, nw, isMe) => {
    const bub = st ? `<button type="button" class="st-bub" data-act="st-open" data-id="${esc(e)}"><span>${esc(stBubText(st))}</span></button>` : isMe ? `<button type="button" class="st-bub empty" data-act="st-new"><span>${t('Comparte algo…')}</span></button>` : '<span class="st-bub gap"></span>';
    const av = `<button type="button" class="st-av" data-act="${st ? 'st-open' : isMe ? 'st-new' : 'st-prof'}" data-id="${esc(e)}" aria-label="${esc(uName(e))}">${framedAvatar(e, 'sm')}${isMe && !st ? '<i class="st-plus" aria-hidden="true">+</i>' : ''}</button>`;
    return `<div class="st-it${st ? ' has' : ''}">${bub}${av}<div class="st-nm"><span>${esc(isMe ? t('Tú') : uName(e))}</span>${nw ? '<i class="st-dot" aria-label="' + esc(t('Nuevo')) + '"></i>' : ''}</div>${ch ? `<button type="button" class="st-sub" data-act="st-chap" data-id="${esc(ch.id)}" data-e="${esc(e)}">${t('Nuevo capítulo')}</button>` : ''}</div>`;
  };
  return `<section class="st-row" aria-label="${esc(t('Personas que sigues'))}">${item(me, mine, null, false, true)}${items.map(x => item(x.e, x.st, x.ch, x.nw, false)).join('')}</section>`;
}
function stModal(e) {
  const r = stGet(e); if (!r) return; stMark(e, r.at);
  const b = r.kind === 'rec' ? findStory(r.sid) : null, mine = e === S.user, m = document.createElement('div'); m.className = 'modal sheet';
  const body = r.kind === 'rec' ? (b ? `<div class="st-book">${coverHTML(b, 0)}<div><b>${esc(b.title)}</b><small class="helper">${t('por {a}', { a: esc(b.author || '') })}</small><p>${esc(clip(b.synopsis, 140))}</p></div></div><a class="button" href="#/story/${esc(b.id)}" data-dir="next" data-close>${t('Leer ahora')}</a>` : `<p class="helper">${t('Este libro ya no está disponible.')}</p>`) : `<p class="st-full">${esc(r.text)}</p>${r.mature ? `<small class="helper">${t('Contenido +18')}</small>` : ''}`;
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><div class="st-head">${framedAvatar(e, 'sm')}<div><b>${esc(mine ? t('Tu estado') : uName(e))}</b><small class="helper">${t('Dura {x} más', { x: leftTxt(new Date(r.exp).toISOString()) })}</small></div></div>${body}
  ${mine ? `<div class="st-acts"><button type="button" class="button secondary" data-new>${t('Cambiar')}</button><button type="button" class="button danger" data-del>${t('Quitar')}</button></div>` : `<div class="st-acts"><a class="button secondary" href="#/user/${encodeURIComponent(e)}" data-dir="next" data-close>${t('Ver perfil')}</a><button type="button" class="link-btn" data-rep>${t('Reportar')}</button></div>`}</div>`;
  m.addEventListener('click', async ev => {
    if (ev.target === m || ev.target.closest('[data-no]') || ev.target.closest('[data-close]')) { m.remove(); return; }
    if (ev.target.closest('[data-new]')) { m.remove(); stForm(); return; }
    if (ev.target.closest('[data-del]')) { await stRemove(); m.remove(); KEEP = true; render(); return; }
    if (ev.target.closest('[data-rep]')) { m.remove(); openReportFor('user', { target: e, owner: e, label: t('a {n}', { n: uName(e) }) }); }
  });
  document.body.appendChild(m); KEEP = true; render();
}
function stForm() {
  if (isGuest()) return toast(t('Crea una cuenta para publicar.'));
  const me = getUsers()[S.user], adult = isAdult(me);
  const ids = [...new Set([...(S.favs || []), ...(S.lib || [])])], books = ids.map(findStory).filter(b => b && b.owner !== S.user && storyVisible(b) && !(b.mature && !adult));
  const html = `<div class="st-tabs"><button type="button" class="st-tab on" data-m="thought">${t('Pensamiento')}</button><button type="button" class="st-tab" data-m="rec">${t('Recomendar un libro')}</button></div>
  <div data-p="thought"><textarea class="textarea" data-txt maxlength="${ST_MAX}" placeholder="${esc(t('¿Qué piensas hoy?'))}"></textarea><small class="helper"><span data-n>0</span>/${ST_MAX}</small>
  ${adult ? `<label class="imgr-opt" style="margin-top:8px"><input type="checkbox" data-mat><span>${t('Tiene temas +18 (solo lo verán personas mayores de edad)')}</span></label>` : ''}</div>
  <div data-p="rec" hidden>${books.length ? `<div class="imgr-list">${books.map(b => `<label class="imgr-opt"><input type="radio" name="st-b" value="${esc(b.id)}"><span>${esc(clip(b.title, 50))}</span></label>`).join('')}</div>` : `<p class="helper">${t('Guarda un libro de otra persona en tu biblioteca o favoritos para poder recomendarlo.')}</p>`}</div>
  <p class="helper" style="margin-top:8px">${t('Dura 24 horas y lo ven las personas que te siguen.')}</p>`;
  let mode = 'thought';
  const m = formModal('Tu estado', html, 'Publicar', async mm => {
    if (mode === 'thought') { const x = mm.querySelector('[data-txt]').value.trim(); if (!x) return t('Escribe algo.'); if (ST_BAD.test(x)) return t('Los pensamientos no pueden incluir enlaces, correos ni números de teléfono.'); const r = await stPublish('thought', x, '', !!(mm.querySelector('[data-mat]') || {}).checked); if (!r) { KEEP = true; render(); } return r; }
    const c = mm.querySelector('[name=st-b]:checked'); if (!c) return t('Elige un libro.'); const r = await stPublish('rec', '', c.value, false); if (!r) { KEEP = true; render(); } return r;
  });
  m.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; m.querySelectorAll('.st-tab').forEach(x => x.classList.toggle('on', x === b)); m.querySelectorAll('[data-p]').forEach(p => { p.hidden = p.dataset.p !== mode; }); });
  m.addEventListener('input', ev => { if (ev.target.matches('[data-txt]')) m.querySelector('[data-n]').textContent = ev.target.value.length; });
}
setInterval(() => { if (document.visibilityState === 'visible' && modCloud()) stLoad(); }, 60000);
setTimeout(() => { if (modCloud()) stLoad(true); }, 4000);
function discoverView() {
  const gens = ['All', ...new Set(publishedStories().filter(storyVisible).map(s => s.genre))];
  const modeRow = `<div class="filter-row mode-row" role="group" aria-label="${esc(t('Qué buscar'))}"><button class="chip ${SM === 'books' ? 'active' : ''}" data-act="sm" data-id="books" aria-pressed="${SM === 'books'}">${t('Libros')}</button><button class="chip ${SM === 'users' ? 'active' : ''}" data-act="sm" data-id="users" aria-pressed="${SM === 'users'}">${t('Usuarios')}</button></div>`;
  return `<main class="page">${AURI_LOGO ? `<div class="feed-logo"><img src="${esc(AURI_LOGO)}" alt="Auri" referrerpolicy="no-referrer" decoding="async"></div>` : ''}${carouselHTML() || `<section class="hero"><span class="eyebrow">${t('✦ Un pequeño hogar para grandes emociones')}</span>
  <h1>${t('Encuentra tu próxima emoción favorita.')}</h1><p>${t('Historias para leer a gusto, personajes que te acompañan y un rincón para crear algo propio.')}</p>
  <a class="button secondary" href="#/library">${t('Ir a mi biblioteca')}</a>${mascot('mascot')}</section>`}
  ${stRow()}${modeRow}
  ${SM === 'users' ? `<div class="section-head"><div><h2>${t('Personas en Auri')}</h2><p>${t('Busca por nombre de usuario.')}</p></div></div>
  <div class="filter-row">${[['all', 'Todos'], ['authors', 'Con libros publicados'], ['team', 'Equipo']].map(([k, n]) => `<button class="chip ${UF === k ? 'active' : ''}" data-act="uf" data-id="${k}">${t(n)}</button>`).join('')}</div>` : `
  <div class="section-head"><div><h2>${t('Historias que te roban el sueño')}</h2><p>${t('Libros creados por personas usuarias.')}</p></div></div>
  ${popTags().length ? `<div class="tag-row" aria-label="${esc(t('Etiquetas populares'))}"><span class="helper">${t('Etiquetas:')}</span>${popTags().map(x => `<button type="button" class="tag tag-link ${Q.trim().toLowerCase() === '#' + x.toLowerCase() ? 'on' : ''}" data-act="tag-search" data-id="${esc(x)}">#${esc(x)}</button>`).join('')}</div>` : ''}
  <div class="filter-row">${gens.map(g => `<button class="chip ${GEN === g ? 'active' : ''}" data-act="genre" data-id="${esc(g)}">${g === 'All' ? t('Todos') : esc(genreName(g))}</button>`).join('')}</div>
  `}
  <div id="list">${discoverList()}</div></main>`;
}

/* --- Escribir (portada, capítulos ilimitados, +18 y revisión) --- */
const STATUS = { draft: 'Borrador', pending: 'En revisión', rejected: 'Rechazada', published: 'Publicada', private: 'Privada' };
const CH_STATUS = { draft: 'Borrador', pending: 'En revisión', rejected: 'Rechazado', approved: 'Aprobado' };
const CH_MARK = { approved: ' ✓', pending: ' ⏳', rejected: ' ✕' };
/** Estado general de la obra, derivado de sus capítulos */
const storyState = s => s.private ? 'private' : publicPrefix(s.chapters).length ? 'published' : s.chapters.some(x => x.status === 'pending') ? 'pending' : s.chapters.some(x => x.status === 'rejected') ? 'rejected' : 'draft';
const statusNote = s => { const p = s.chapters.filter(c => c.status === 'pending').length;
  return [p ? t('{n} capítulo(s) en revisión: aún no se ven en la app.', { n: p }) : '', ...s.chapters.filter(c => c.status === 'rejected').map(c => t('«{title}» fue rechazado{reason}. Edítalo y vuelve a enviarlo.', { title: c.title, reason: c.reason ? ': ' + c.reason : '' }))].filter(Boolean).join(' '); };
// Borrador de términos: conviene que una persona con formación legal los revise antes de lanzar la app
const trLegal = h => h.replace(/<li>([\s\S]*?)<\/li>/g, (m, x) => '<li>' + t(x) + '</li>');   // traduce cada punto legal por separado
const TERMS = `<ol>
<li><b>Etiqueta +18.</b> Marca tu historia como +18 si tiene contenido sexual sugerido, violencia intensa, drogas o temas delicados para menores. Si dudas, márcala.</li>
<li><b>Nivel permitido.</b> El contenido +18 en Auri es solo escrito y de nivel «soft»: se permiten escenas sugerentes o románticas, sin descripciones sexuales explícitas.</li>
<li><b>Menores.</b> Está prohibido sexualizar a personajes menores de 18 años, incluso en ficción. Esas historias se rechazan y pueden causar la suspensión de la cuenta.</li>
<li><b>Contenido prohibido.</b> Contenido sexual explícito, apología del odio, acoso, violencia extrema gratuita, datos personales de terceras personas y plagio.</li>
<li><b>Revisión.</b> Toda historia pasa por moderación antes de aparecer en Descubrir. Puede aprobarse, rechazarse con un motivo o retirarse después si incumple estas reglas.</li>
<li><b>Revisión con IA.</b> Una IA hace una primera revisión de tus capítulos. Si marca uno, queda oculto hasta que una persona del equipo lo revise y decida. La IA puede equivocarse: la decisión final siempre es de una persona.</li>
<li><b>Imágenes.</b> Las fotos de perfil, banners y portadas (de libros y capítulos) cumplen las mismas reglas. Una IA las revisa; si marca una por error, puedes pedir que la revise una persona del equipo. Las imágenes de gravedad extrema se rechazan sin apelación y pueden causar la suspensión de la cuenta.</li>
<li><b>Responsabilidad.</b> Eres responsable de tu contenido y de etiquetarlo bien. Una etiqueta incorrecta puede ser motivo de rechazo.</li>
<li><b>Lectores.</b> Las historias +18 solo se muestran a cuentas que declaren ser mayores de 18 años. Por ahora es una declaración, no una verificación de identidad.</li>
<li><b>Convivencia.</b> Trata bien a las demás personas: el acoso, el odio y el spam no están permitidos en comentarios ni perfiles. Puedes reportar contenido y bloquear o silenciar cuentas.</li>
<li><b>Autoría y fanfics.</b> Tus historias siguen siendo tuyas. En los fanfics respeta a quienes crearon el material original y no copies textos ajenos.</li></ol>`;
function showTerms() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${t('Términos y condiciones de contenido')}</h2><div class="terms">${trLegal(TERMS)}</div><button class="button" data-act="close-modal" style="width:100%;margin-top:14px">${t('Entendido')}</button></div>`;
  document.body.appendChild(m);
}
let W = null, WPREVIEW = false, WCUR = 0;
const newDraft = () => ({ id: 'story-' + Date.now(), title: '', synopsis: '', genre: 'Fantasy', fandom: 'Original', tags: [], warns: [], cover: '', chapters: [{ id: 1, title: t('Capítulo {n}', { n: 1 }), text: '', status: 'draft' }], mature: false, phase: 'ongoing', prev: '', terms: false, useReaderCharacter: true, updatedAt: today() });
const wc = x => t('{w} palabras · {c} caracteres', { w: x.trim() ? x.trim().split(/\s+/).length : 0, c: x.length });
function collect() {                                   // lee solo los campos de la pantalla que está abierta
  if ($('#w-title')) {                                 // pantalla de datos de la historia
    W.title = $('#w-title').value; W.synopsis = $('#w-syn').value; W.genre = $('#w-genre').value; W.fandom = $('#w-fandom').value;
    W.tags = parseTags($('#w-tags').value);
  }
  if ($('#w-phase')) W.phase = $('#w-phase').value;   // estado del libro
  if ($('#w-prev')) W.prev = $('#w-prev').value;      // saga: libro anterior
  if ($('#w-terms')) W.terms = $('#w-terms').checked;
  const t = $('#w-ch-text');
  if (t) {                                             // pantalla de un capítulo: se busca por id, nunca por posición
    const ch = W.chapters.find(c => c.id === +t.dataset.cid);
    if (ch) { ch.title = ($('#w-ch-title') || { value: ch.title }).value; ch.text = t.value; ch.music = ($('#w-ch-music') || { value: '' }).value.trim(); }
  }
}
const coverPrev = () => W.cover ? `<img src="${esc(W.cover)}" alt="${esc(t('Vista previa de la portada'))}">` : t('Sin portada');
const TN_RE = /[\[(]\s*(?:T\/N|Y\/N|TN|YN)\s*[\])]|\b(?:T\/N|Y\/N)\b|\b(?:TN|YN)\b/gi;
/** TN / T/N / [TN] / (T/N) → nombre del personaje. "TN" en MAYÚSCULAS da el nombre en MAYÚSCULAS; "tn" o "Tn" lo dan tal cual */
/** Color de cabello y de ojos: T/P, T/C, T/CP, T/C/P, T/O, T/CO, T/C/O… (español) y H/C, Y/H/C, E/C, Y/E/C (inglés). Se reemplazan con los datos del personaje; si no hay dato, queda tal cual. */
const HE_TOK = { h: ['T/C/P', 'T/C/C', 'T/CP', 'T/CC', 'T/P', 'T/C', 'Y/H/C', 'H/C', 'TCP', 'TCC', 'YHC'], e: ['T/C/OJ', 'T/C/O', 'T/COJ', 'T/CO', 'T/OJ', 'T/O', 'Y/E/C', 'E/C', 'TCOJ', 'TCO', 'YEC'] };
const HE_KEY = Object.fromEntries([...HE_TOK.h.map(k => [k, 'hair']), ...HE_TOK.e.map(k => [k, 'eyes']), ['TP', 'hair'], ['HC', 'hair'], ['TO', 'eyes'], ['EC', 'eyes']]);
const HE_ALL = [...HE_TOK.h, ...HE_TOK.e].sort((a, b) => b.length - a.length).map(k => k.replace(/\//g, '\\/')).join('|');
const HE_RE = new RegExp('(^|[^\\w/])(' + HE_ALL + ')(?![\\w/])|[\\[(]\\s*(' + HE_ALL + '|TP|TO|HC|EC)\\s*[\\])]', 'gi');
const fillHE = (text, ch) => { const v = { hair: String((ch && ch.hair) || '').trim(), eyes: String((ch && ch.eyes) || '').trim() }; if (!v.hair && !v.eyes) return text;
  return text.replace(HE_RE, (m, pre, bare, br) => { const tok = (bare || br).replace(/\s/g, ''), up = tok.toUpperCase(), k = HE_KEY[up];
    if (!k || !v[k]) return m; if (br && /^(TP|TO|HC|EC)$/i.test(tok) && tok !== up) return m;      // «(to)» en minúsculas es la palabra inglesa, no un marcador
    return (bare ? pre : '') + v[k]; }); };
const fillTN = (text, name) => text.replace(TN_RE, m => ['TN', 'YN'].includes(m.replace(/[^A-Za-z]/g, '')) ? name.toLocaleUpperCase(LOC()) : name);
/* Comentarios por párrafo: ocultos al leer; se tocan los párrafos para comentar. Se guardan por libro + capítulo + párrafo (con una "huella" del párrafo) */
const PC_MAX = 400, paraSplit = t => String(t || '').split(/\n\s*\n/);
const pQ = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 30);            // huella: si el autor reescribe el párrafo, esos comentarios dejan de mostrarse
const pcKey = (sid, ci, pi) => sid + '|' + ci + '|' + pi;
const pcAll = () => G.get('pcom', {});
const pcPara = (sid, ci, pi) => { const s = findStory(sid), ch = s && s.chapters.find(c => c.idx === ci); return ch ? paraSplit(ch.text)[pi] : undefined; };
const pcList = (sid, ci, pi, all = pcAll()) => { const t = pcPara(sid, ci, pi); return t === undefined ? [] : (all[pcKey(sid, ci, pi)] || []).filter(c => c.q === pQ(t)); };
function insertSep() {                                // inserta un separador de escena como párrafo propio
  const ta = $('#w-ch-text'); if (!ta) return; ta.focus();
  const v = ta.value, a = ta.selectionEnd, pre = v.slice(0, a), post = v.slice(a);
  const before = !pre ? '' : /\n\n$/.test(pre) ? '' : /\n$/.test(pre) ? '\n' : '\n\n', after = !post ? '\n\n' : /^\n\n/.test(post) ? '' : /^\n/.test(post) ? '\n' : '\n\n';
  const ins = before + '::sep' + after; ta.setRangeText(ins, a, a, 'end');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function applyAlign(kind) {                            // alinea el párrafo (o los párrafos seleccionados): se guarda como ::c  ::r  ::j al inicio
  const ta = $('#w-ch-text'); if (!ta) return; ta.focus();
  const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
  const st = (() => { const i = v.lastIndexOf('\n\n', a - 1); return i < 0 ? 0 : i + 2; })();
  const en = (() => { const i = v.indexOf('\n\n', b); return i < 0 ? v.length : i; })();
  const seg = v.slice(st, en).split(/(\n\s*\n)/).map((p, i) => i % 2 ? p : (p.replace(/^::[crj] /, '') ? (kind === 'left' ? '' : '::' + kind + ' ') + p.replace(/^::[crj] /, '') : p)).join('');
  ta.setRangeText(seg, st, en, 'preserve'); ta.setSelectionRange(Math.min(a + (seg.length - (en - st)), seg.length + st), Math.min(b + (seg.length - (en - st)), seg.length + st));
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function applyFmt(kind) {
  const ta = $('#w-ch-text'); if (!ta) return; ta.focus();
  const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, m = kind === 'bold' ? '**' : '*';
  const done = () => { ta.dispatchEvent(new Event('input', { bubbles: true })); };
  if (kind === 'plain') {                              // quita formato de lo seleccionado, o sale del formato si no hay selección
    if (a !== b) { const sel = v.slice(a, b).replace(/\*+/g, ''); ta.setRangeText(sel, a, b, 'select'); return done(); }
    let p = a; while (v[p] === '*') p++; if (p !== a) { ta.setSelectionRange(p, p); } return;
  }
  if (a !== b) {                                      // con selección: pone o quita el formato
    const sel = v.slice(a, b), wrapped = sel.startsWith(m) && sel.endsWith(m) && sel.length > 2 * m.length;
    const out = v.slice(a - m.length, a) === m && v.slice(b, b + m.length) === m && m !== '*' ? true : false;
    if (wrapped) ta.setRangeText(sel.slice(m.length, -m.length), a, b, 'select');
    else if (out) { ta.setRangeText(sel, a - m.length, b + m.length, 'select'); }
    else ta.setRangeText(m + sel + m, a, b, 'select');
    return done();
  }
  if (v.slice(a, a + m.length) === m && v[a + m.length] !== '*') { const p = a + m.length; ta.setSelectionRange(p, p); return; }   // ya estabas dentro: salir del formato
  ta.setRangeText(m + m, a, a, 'end'); ta.setSelectionRange(a + m.length, a + m.length); done();   // sin selección: abre el formato y sigue escribiendo dentro
}
function dcap(h) {                                  // letra capital: la primera letra del primer párrafo con texto; si empieza con «(» «—» «"», eso va chiquito al lado
  const m = /^((?:<[^>]+>)*)((?:&[a-z]+;|&#\d+;|[^\p{L}\p{N}<&\s])*)([\p{L}\p{N}])/u.exec(h.replace(/^\s+/, '')); if (!m) return h;
  return m[1] + `<span class="dc-l">${m[2] ? `<i class="dc-pu">${m[2]}</i>` : ''}${m[3]}</span>` + h.replace(/^\s+/, '').slice(m[0].length);
}
function readerText(text, on, pc) {
  const name = S.character.name || t('Lectora'), raw = paraSplit(text), all = pc && cfg('pcom') !== 'off' ? pcAll() : null; let first = true;
  return `<div class="reader-text">${(on ? fillHE(fillTN(text, name), S.character) : text).split(/\n\s*\n/).map((p, i) => {
    const n = all && cfg('pcom') === 'dots' ? (all[pcKey(pc.sid, pc.ci, i)] || []).filter(c => c.q === pQ(raw[i])).length : 0;
    if (/^\s*::sep\s*$/.test(p)) return sepHTML('scene-sep');
    if (!p.trim()) return '';                        // párrafos vacíos (líneas en blanco de más): no dibujan nada
    const am = /^::([crj]) /.exec(p); let h = fmtText(esc(am ? p.slice(4) : p)); if (first) { first = false; h = dcap(h); }
    return `<p data-bi="${i}"${all ? ` data-pi="${i}"` : ''}${am ? ` class="al-${am[1]}"` : ''}>${h}${n ? `<span class="pc-n" aria-label="${tn(n, '{n} comentario', '{n} comentarios')}">${n}</span>` : ''}</p>`; }).join('')}</div>`;
}
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>';
function confirmBox(msg, onYes) {                // cuadro de confirmación propio (no usa confirm() del navegador)
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="alertdialog" aria-modal="true"><h2>${esc(msg)}</h2><p class="helper">${t('Esta acción no se puede deshacer.')}</p>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">${t('Cancelar')}</button><button class="button danger" data-yes style="flex:1">${t('Eliminar')}</button></div></div>`;
  m.querySelector('[data-no]').onclick = () => m.remove();
  m.querySelector('[data-yes]').onclick = () => { m.remove(); onYes(); };
  document.body.appendChild(m);
}
/** Elimina por chapter.id (nunca por posición) y actualiza el estado sin mutarlo */
function deleteChapter(cid) {
  collect();
  const gone = W.chapters.find(c => c.id === cid); if (!gone) return;
  W.chapters = W.chapters.filter(c => c.id !== cid);
  if (!W.chapters.length) W.chapters = [{ id: chapId(), title: t('Capítulo {n}', { n: 1 }), text: '', status: 'draft' }];
  persistDraft(); toast(t('«{title}» eliminado', { title: gone.title || t('Capítulo') })); KEEP = true; render();
}
function ensureW(editId) {
  if (W && (editId ? W.id === editId : !S.stories.some(x => x.id === W.id))) return;
  const orig = editId && S.stories.find(s => s.id === editId);
  if (editId && !orig) { W = null; return; }
  W = orig ? { ...JSON.parse(JSON.stringify(orig)), terms: false } : newDraft(); WPREVIEW = false;
}
/** /write → datos · /write/ID → datos · /write/ID/chapters → lista · /write/ID/ch/CID → un capítulo */
function writeRoute(editId, sub, cid) {
  ensureW(editId);
  if (!W) return `<main class="page">${empty(t('Historia no encontrada'), t('Puede que se haya eliminado.'), '<a class="button" href="#/library">' + t('Ir a mi biblioteca') + '</a>')}</main>`;
  if (!editId) return infoView(false);
  return sub === 'chapters' ? chaptersView() : sub === 'ch' ? chapterView(+cid) : infoView(true);
}
const needTerms = () => !(getUsers()[S.user] || {}).termsAccepted;     // cuentas anteriores al nuevo registro: aceptan una sola vez aquí
const submitBlock = () => W.private ? `<div class="panel" style="margin-top:16px"><p class="notice" style="margin:0 0 4px">🔒 ${t('Historia privada: solo tú la ves y no pasa por moderación.')}</p><button class="button" style="margin-top:12px;width:100%" data-act="save-draft">${t('Guardar')}</button></div>` : `<div class="panel" style="margin-top:16px">${needTerms() ? `<label class="check"><input type="checkbox" id="w-terms" ${W.terms ? 'checked' : ''}><span>${t('Acepto los {terms} de Auri.', { terms: '<button type="button" class="link-btn" data-act="terms">' + t('términos y condiciones') + '</button>' })}</span></label>` : ''}
  <p class="notice" style="margin:0 0 4px">🔞 ${t('Si tu historia tiene contenido +18, acuérdate de marcarla como +18 antes de enviarla. Los términos ya los aceptaste al crear tu cuenta.')}</p>
  <button class="button" style="margin-top:12px;width:100%" data-act="publish">${t('Enviar a revisión')}</button>
  <p class="helper" style="margin-top:8px">${t('Se envían todos los capítulos terminados que aún no están en revisión. Moderación los revisa en orden: la historia aparece en Descubrir cuando se aprueba el primero.')}</p></div>`;

/** Botón de acceso a los capítulos (debajo de los datos del libro) */
const chaptersEntry = () => { const n = W.chapters.length, pend = W.chapters.filter(c => c.status === 'pending').length;
  return `<section class="panel ch-entry"><div><strong>${t('Capítulos')}</strong><div class="helper">${tn(n, '{n} capítulo', '{n} capítulos')}${pend ? ' · ' + t('{n} en revisión', { n: pend }) : ''}. ${t('Cada uno se edita en su propia pantalla.')}</div></div><button class="button secondary" data-act="ch-list">${t('Editar capítulos')}</button></section>`; };
/* Paso 1: datos de la historia */
function infoView(existing) {
  const g0 = W.genre || 'Fantasy';
  return `<main class="page story-layout nb">
  <section class="nb-hero"><span class="nb-spark s1" aria-hidden="true"></span><span class="nb-spark s2" aria-hidden="true"></span><span class="nb-spark s3" aria-hidden="true"></span>
    <span class="nb-eye">${existing ? t('Datos de la historia') : t('Paso 1 de 2 · Tu libro nuevo')}</span>
    <h2>${existing ? t('Edita los datos') : t('Aquí empieza una historia')}</h2>
    <p>${existing ? t('Cambia lo que quieras: se guarda al tocar el botón de abajo.') : t('Dale cara a tu libro. Después escribirás el capítulo 1.')}</p>
    <div class="nb-stage"><div class="nb-book" data-g="${esc(g0)}"><div class="cover-prev" id="cover-prev">${coverPrev()}</div><span class="nb-bt" id="nb-bt">${esc(W.title)}</span></div></div>
    <div class="nb-cover-btns"><label class="button secondary sm" style="cursor:pointer">${t('Subir imagen')}<input id="cover-file" type="file" accept="image/*" hidden></label><button class="button ghost sm" data-act="cover-adjust" type="button">${t('Ajustar imagen')}</button><button class="button ghost sm" data-act="clear-cover" type="button">${t('Quitar portada')}</button></div>
    <input id="cover-url" class="field nb-url" placeholder="${esc(t('…o pega la URL de una imagen'))}" value="${W.cover.startsWith('data:') ? '' : esc(W.cover)}">
    <span class="helper nb-help">${t('Puedes subir cualquier tamaño: después la ajustas (mover y zoom) a la proporción 2:3 de las tarjetas.')}</span>
  </section>
  <section class="panel nb-sec"><h3 class="nb-h"><b>1</b>${t('Portada y título')}</h3><div class="form-grid">
    <div class="form-group full"><label for="w-title">${t('Título')}</label><input id="w-title" class="field nb-title" value="${esc(W.title)}" placeholder="${esc(t('Ponle un nombre…'))}"></div>
    <div class="form-group full"><label for="w-syn">${t('Sinopsis')}</label><textarea id="w-syn" class="textarea" placeholder="${esc(t('Unas líneas para invitar a leer…'))}">${esc(W.synopsis)}</textarea></div>
  </div></section>
  <section class="panel nb-sec"><h3 class="nb-h"><b>2</b>${t('De qué trata')}</h3><div class="form-grid">
    <div class="form-group full"><label class="nb-lab">${t('Género')}</label><div class="nb-genres" role="group" aria-label="${esc(t('Género'))}">${Object.keys(GENRES).map(g => `<button type="button" class="nb-g ${g0 === g ? 'on' : ''}" data-act="w-genre" data-id="${esc(g)}" aria-pressed="${g0 === g}">${esc(t(GENRES[g]))}</button>`).join('')}</div>
      <select id="w-genre" hidden>${Object.keys(GENRES).map(g => `<option value="${g}" ${g0 === g ? 'selected' : ''}>${esc(t(GENRES[g]))}</option>`).join('')}</select></div>
    <div class="form-group full"><label for="w-fandom">${t('Fandom / universo')}</label><input id="w-fandom" class="field" value="${esc(W.fandom)}"></div>
    <div class="form-group full"><label for="w-phase">${t('Estado del libro')}</label><select id="w-phase" class="select">${Object.keys(PHASE).map(k => `<option value="${k}" ${(W.phase || 'ongoing') === k ? 'selected' : ''}>${esc(t(PHASE[k]))}</option>`).join('')}</select></div>
  </div></section>
  <section class="panel nb-sec"><h3 class="nb-h"><b>3</b>${t('Cómo te van a encontrar')}</h3><div class="form-grid">
    <div class="form-group full"><label for="w-tags">${t('Etiquetas')} <span class="helper" style="display:inline">· ${t('mínimo 3 para publicar')}</span></label><input id="w-tags" class="field" value="${esc(tagsText(W.tags))}" placeholder="${esc(t('#romance lento #magia #enemies to lovers'))}" autocapitalize="none"><div id="w-tags-prev" class="tag-prev">${W.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div><div class="tag-sug"><span class="helper">${t('Sugeridas:')}</span>${[...new Set([...popTags(6), 'lgbtq+', 'yaoi', 'yuri', t('poliamor'), t('romance lento'), 'au'])].slice(0, 10).map(t => `<button type="button" class="tag tag-link" data-act="tag-add" data-id="${esc(t)}">#${esc(t)}</button>`).join('')}</div><span class="helper">${t('Escribe cada etiqueta con # al inicio. Ej: #romance lento #magia. Así la gente te encuentra al buscar por etiquetas.')}</span></div>
    <div class="form-group full"><label>${t('Avisos de contenido')} <span class="helper" style="display:inline">· ${t('opcional, ayuda a quien lee')}</span></label><div class="warn-chips" role="group">${Object.keys(WARNS).map(k => `<button type="button" class="chip ${(W.warns || []).includes(k) ? 'active' : ''}" data-act="warn-toggle" data-id="${k}" aria-pressed="${(W.warns || []).includes(k)}">${t(WARNS[k])}</button>`).join('')}</div></div>
  ${sagaBox()}
  </div></section>
  <section class="panel nb-sec nb-tg"><h3 class="nb-h"><b>4</b>${t('Ajustes del libro')}</h3>
  <div class="toggle-line"><div><strong>${t('Tarjeta de personaje lector')}</strong><div class="helper">${t('Reemplaza TN / T/N por el nombre de tu personaje.')}</div></div>
  <button type="button" role="switch" class="switch" aria-checked="${W.useReaderCharacter}" data-act="toggle-tn" aria-label="${esc(t('Usar tarjeta de personaje lector'))}"></button></div>
  <div class="toggle-line"><div><strong>${t('Historia privada')}</strong><div class="helper">${t('Solo tú la ves: no aparece en Descubrir, búsquedas ni tu perfil público, y no pasa por moderación.')}</div></div>
  <button type="button" role="switch" class="switch" aria-checked="${!!W.private}" data-act="toggle-priv" aria-label="${esc(t('Historia privada'))}"></button></div>
  ${isMinor(getUsers()[S.user]) ? '' : `<div class="toggle-line"><div><strong>${t('Historia +18')}</strong><div class="helper">${t('Actívalo si tiene contenido sugerente o temas para mayores de edad. Una vez publicada, quitar la marca +18 necesita aprobación de moderación.')}</div></div>
  <button type="button" role="switch" class="switch" aria-checked="${W.mature}" data-act="toggle-18" aria-label="${esc(t('Historia +18'))}"></button></div>`}
  </section>
  <div class="nb-go">${existing ? '<button class="button" data-act="info-save">' + t('Guardar cambios') + '</button>' : '<button class="button" data-act="save-next">' + t('Guardar y siguiente ›') + '</button>'}</div>${existing ? chaptersEntry() : ''}</main>`;
}

/* Lista de capítulos de la historia */
function chaptersView() {
  const n = W.chapters.length;
  return `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">☰ ${t('Capítulos')}</span><h2 style="margin-top:8px">${esc(W.title)}</h2><p>${t('Cada capítulo se escribe en su propia pantalla.')}</p></div><button class="button secondary sm" data-act="info-go">✎ ${t('Datos de la historia')}</button></div>
  ${statusNote(W) ? `<p class="notice" style="margin-bottom:14px">${esc(statusNote(W))}</p>` : ''}
  <div class="ch-list ch-list-big">${W.chapters.map((c, i) => `<div class="ch-item"><button type="button" class="ch-open" data-act="ch-go" data-cid="${c.id}"><b>${t('Cap. {n}', { n: i + 1 })}</b><span>${esc(c.title || t('Sin título'))}</span><i>${CH_MARK[c.status] || ''}</i></button><button type="button" class="icon-btn ch-trash" data-act="ch-trash" data-cid="${c.id}" aria-label="${esc(t('Eliminar {x}', { x: c.title || t('capítulo {n}', { n: i + 1 }) }))}">${TRASH}</button></div>`).join('')}</div>
  <button type="button" class="button secondary" data-act="ch-add" style="margin:12px 0">＋ ${t('Capítulo {n}', { n: n + 1 })}</button>${submitBlock()}</main>`;
}

const safeImg = u => typeof u === 'string' && (/^data:image\//.test(u) || isStoreUrl(u));
const SEPS = { classic: ['Clásico', 'free', '<rect x="17" y="7" width="10" height="10" rx="2" transform="rotate(45 22 12)"/><circle cx="8" cy="12" r="1.8" opacity=".45"/><circle cx="36" cy="12" r="1.8" opacity=".45"/>'],
  dots: ['Puntos', 'free', '<circle cx="8" cy="12" r="2.4" opacity=".55"/><circle cx="22" cy="12" r="2.8"/><circle cx="36" cy="12" r="2.4" opacity=".55"/>'],
  moon: ['Luna y estrellas', 'free', '<path d="M22 2a10 10 0 1 0 0 20a13 13 0 0 1 0-20z"/><circle cx="35" cy="7" r="1.6" opacity=".6"/><circle cx="9" cy="15" r="1.2" opacity=".5"/>'],
  leaves: ['Hojas', 'free', '<path d="M22 2c-8 4-9 13 0 20c9-7 8-16 0-20z"/><path d="M22 6v14" stroke="#fff" stroke-opacity=".55" stroke-width="1" fill="none"/><circle cx="8" cy="13" r="1.4" opacity=".45"/><circle cx="36" cy="13" r="1.4" opacity=".45"/>'],
  paws: ['Huellitas', 'free', '<g><ellipse cx="11" cy="15.5" rx="4" ry="3.2"/><circle cx="6" cy="9.6" r="1.7"/><circle cx="11" cy="7.6" r="1.7"/><circle cx="16" cy="9.6" r="1.7"/></g><g><ellipse cx="33" cy="15.5" rx="4" ry="3.2"/><circle cx="28" cy="9.6" r="1.7"/><circle cx="33" cy="7.6" r="1.7"/><circle cx="38" cy="9.6" r="1.7"/></g>'],
  bow: ['Moño', 'free', '<path d="M22 12c-5-8-15-6-12 1c3 5 12 0 12-1zM22 12c5-8 15-6 12 1c-3 5-12 0-12-1z"/><circle cx="22" cy="12" r="3"/>'] };
const sepOK = k => !SEPS[k] ? false : SEPS[k][1] === 'free' || isStaff(S.user);      // los de tienda/pase se desbloquean con compra (por ahora solo el equipo los ve)
const sepKey = () => sepOK(cfg('sepStyle')) ? cfg('sepStyle') : 'classic';
const sepSvg = k => `<svg viewBox="0 0 44 24" aria-hidden="true" fill="currentColor">${SEPS[k][2]}</svg>`;
const sepHTML = (cls, k = sepKey()) => `<div class="${cls} sp-${k}" aria-hidden="true"><i></i><span class="sp-mid">${sepSvg(k)}</span><i></i></div>`;
const chHead = (num, title) => { const plain = /^\s*cap[ií]tulo\s*\d+\s*$/i.test(title || '') || !(title || '').trim(); return `<div class="ch-head">${plain ? '' : `<span class="ch-no">${t('Capítulo {n}', { n: num })}</span>`}<h1 class="rf-h">${esc(plain ? (title || '').trim() || t('Capítulo {n}', { n: num }) : title)}</h1>${sepHTML('ch-orn')}</div>`; };
const chHero = (c, cls = 'ch-hero') => safeImg(c.cover) ? `<img class="${cls}" src="${esc(c.cover)}" alt="${esc(t('Portada del capítulo'))}">` : '';
const chCoverBox = ch => `<div class="chc-box">${safeImg(ch.cover)
  ? `<div class="chc-prev"><img src="${esc(ch.cover)}" alt="${esc(t('Portada del capítulo'))}"><label class="button secondary sm chc-change">${t('Cambiar')}<input id="chc-file" type="file" accept="image/*" hidden></label><button type="button" class="icon-btn chc-x" data-act="chc-clear" aria-label="${esc(t('Quitar portada del capítulo'))}">✕</button></div>`
  : `<label class="chc-add">🖼 ${t('Portada del capítulo (opcional)')}<input id="chc-file" type="file" accept="image/*" hidden></label>`}</div>`;
/* Pantalla individual para escribir UN capítulo: a pantalla completa, sin la barra de la app */
function chapterView(cid) {
  const i = W.chapters.findIndex(c => c.id === cid);
  if (i < 0) return `<main class="page">${empty(t('Capítulo no encontrado'), t('Puede que se haya eliminado.'), '<button class="button" data-act="ch-list">' + t('Ver capítulos') + '</button>')}</main>`;
  const ch = W.chapters[i], n = W.chapters.length, before = W.chapters[i - 1], after = W.chapters[i + 1], st = ch.status || 'draft';
  if (WPREVIEW) return `<div class="rf"><header class="rf-top"><button class="button ghost sm" data-act="back-edit">${t('‹ Volver a escribir')}</button><div class="rf-title">${t('Vista previa · Cap. {n}', { n: i + 1 })}</div><span style="width:44px"></span></header>
  <article class="rf-body">${chHero(ch)}${chHead(i + 1, ch.title)}${readerText(ch.text || t('Aquí aparecerá el texto de tu capítulo.'), W.useReaderCharacter)}</article></div>`;
  return `<div class="wf"><header class="wf-top"><button class="button ghost sm" data-act="ch-list" aria-label="${esc(t('Guardar y salir a la lista de capítulos'))}">✕ ${t('Salir')}</button>
  <span class="grow">${t('Cap. {i} de {n}', { i: i + 1, n })} · <span class="pill st-${st}">${t(CH_STATUS[st])}</span> <span id="w-saved"></span></span><button class="button secondary sm" data-act="preview">${t('Vista previa')}</button><button class="button sm wf-done" data-act="kb-done">${t('Listo')}</button></header>
  ${st === 'rejected' && ch.reason ? `<p class="notice">${t('Rechazado: {reason}', { reason: esc(ch.reason) })}</p>` : ''}${ch.live ? `<p class="notice">${t('Mientras se revisa esta edición, los lectores siguen viendo la versión aprobada anterior.')}</p>` : ''}
  ${chCoverBox(ch)}
  <input id="w-ch-title" class="wf-title" data-cid="${ch.id}" value="${esc(ch.title)}" placeholder="${esc(t('Título del capítulo'))}">
  <textarea id="w-ch-text" class="wf-text" data-cid="${ch.id}" placeholder="${esc(t('Érase una vez…'))}">${esc(ch.text)}</textarea>
  <div class="fmt-bar" role="toolbar" aria-label="${esc(t('Formato del texto'))}"><button type="button" class="fmt-b" data-act="fmt" data-id="plain" aria-label="${esc(t('Texto normal'))}"><span>A</span></button><button type="button" class="fmt-b" data-act="fmt" data-id="bold" aria-label="${esc(t('Negrita'))}"><span style="font-weight:800">A</span></button><button type="button" class="fmt-b" data-act="fmt" data-id="italic" aria-label="${esc(t('Cursiva'))}"><span style="font-style:italic">A</span></button><span class="fmt-sep" aria-hidden="true"></span><button type="button" class="fmt-b fmt-al" data-act="scene-sep" aria-label="${esc(t('Separador de escena'))}" title="${esc(t('Separador de escena'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h6M15 12h6"/><path d="M12 8.5l3.5 3.5-3.5 3.5-3.5-3.5z"/></svg></button><span class="fmt-sep" aria-hidden="true"></span>${[['left', 'Alinear a la izquierda', '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'], ['c', 'Centrar', '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'], ['r', 'Alinear a la derecha', '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'], ['j', 'Justificar', '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>']].map(a => `<button type="button" class="fmt-b fmt-al" data-act="align" data-id="${a[0]}" aria-label="${esc(t(a[1]))}" title="${esc(t(a[1]))}"><svg viewBox="0 0 24 24" aria-hidden="true">${a[2]}</svg></button>`).join('')}<span class="helper fmt-hint">${t('Selecciona texto o escribe para aplicar el formato')}</span></div>
  <footer class="wf-bottom"><details class="wf-music" ${ch.music ? 'open' : ''}><summary class="helper" style="cursor:pointer">🎵 ${t('Canción del capítulo (opcional)')}</summary><input id="w-ch-music" class="field" style="margin-top:8px" value="${esc(ch.music || '')}" placeholder="${esc(t('Enlace de YouTube, Spotify o un .mp3'))}"><span class="helper">${t('Quien lee decide si la reproduce. Se revisa junto con el capítulo.')} ${t('Cada capítulo tiene su propio enlace: la música se detiene al pasar al siguiente capítulo.')}</span></details>
  <div class="wf-actions"><span class="helper" id="w-count">${wc(ch.text)}</span><span class="wf-btns">${before ? `<button type="button" class="button ghost sm" data-act="ch-go" data-cid="${before.id}">‹ ${t('Cap. {n}', { n: i })}</button>` : ''}<button class="button secondary sm" data-act="save-draft">💾 ${t('Guardar borrador')}</button>${after ? `<button type="button" class="button sm" data-act="ch-go" data-cid="${after.id}">${t('Cap. {n}', { n: i + 2 })} ›</button>` : `<button type="button" class="button sm" data-act="ch-add">＋ ${t('Cap. {n}', { n: n + 1 })}</button>`}</span></div></footer></div>`;
}
/** Lee las historias tal como están guardadas AHORA (moderación puede haber cambiado estados mientras tenías la pantalla abierta) */
const freshStories = () => LS.get(uk('stories'), []).map(norm);
const INFO_FIELDS = ['title', 'synopsis', 'genre', 'fandom', 'tags', 'cover', 'mature', 'phase', 'prev', 'useReaderCharacter'];
/** Guarda SOLO los datos generales (título, sinopsis, portada, género, etiquetas…). Parte del libro tal como está guardado: no toca los capítulos
 *  ni su estado de moderación, y no pide capítulos nuevos ni términos. Devuelve true si guardó. */
function requestUnmature(sid, title) {                  // la autoría pide quitar +18 de una obra ya publicada: queda en Reportes para moderación
  const l = G.get('reports', []);
  if (l.some(r => r.type === 'reclass' && r.sid === sid && (r.status || 'open') === 'open')) return t('Ya hay una solicitud en revisión para esta obra.');
  if (modCloud()) { modReport({ type: 'reclass', sid, owner: S.user, title: title || '', label: title || '' }).then(e => { if (e) toast(e); }); return t('Solicitud enviada. La obra sigue marcada +18 hasta que moderación la revise.'); }
  l.unshift({ id: Date.now(), type: 'reclass', sid, owner: S.user, by: S.user, title: title || '', date: today(), status: 'open' }); G.set('reports', l);
  return t('Solicitud enviada. La obra sigue marcada +18 hasta que moderación la revise.');
}
function staffSetMature(sid, v) {
  const st = allStories().find(x => x.id === sid); if (!st) return null;
  const k = 'auri.u.' + st.owner + '.stories'; LS.set(k, LS.get(k, []).map(x => x.id === sid ? { ...x, mature: v } : x)); if (st.owner === S.user) S.stories = freshStories(); else sbStoryPatch(sid, { mature: !!v }); return st;
}
function saveInfoOnly(silent) {
  if (!W) return false;
  collect();
  { const stv = freshStories().find(x => x.id === W.id);
    if (isMinor(getUsers()[S.user])) W.mature = false;
    else if (stv && stv.mature && !W.mature && publicPrefix(stv.chapters).length && !isStaff()) W.mature = true; }      // quitar +18 de una obra publicada necesita aprobación
  if (!W.title.trim()) { if (!silent) toast(t('Ponle un título a tu historia.')); return false; }
  fixSaga();
  const info = Object.fromEntries(INFO_FIELDS.map(k => [k, W[k]])), stored = freshStories().find(s => s.id === W.id);
  const rec = stored ? { ...stored, ...info } : { ...JSON.parse(JSON.stringify(W)), ...info, updatedAt: today() };
  delete rec.saved; delete rec.terms;
  const list = [rec, ...freshStories().filter(s => s.id !== W.id)];
  if (!LS.set(uk('stories'), list)) return false;
  S.stories = list; W.chapters = rec.chapters; return true;
}
/** Paso 1 → guarda los datos y pasa a escribir */
function saveInfo() {
  collect();
  if (!W.title.trim()) return toast(t('Ponle un título para continuar.'));
  persistDraft(); W.saved = true;
  const only = W.chapters.length === 1 && !W.chapters[0].text.trim();
  go(only ? `/write/${W.id}/ch/${W.chapters[0].id}` : `/write/${W.id}/chapters`);
}
function addChapter() {
  autosave();
  const id = chapId(); W.chapters = [...W.chapters, { id, title: t('Capítulo {n}', { n: W.chapters.length + 1 }), text: '', status: 'draft' }];
  persistDraft(); go(`/write/${W.id}/ch/${id}`);
}

/** Cada capítulo conserva su propio estado. Si se edita, vuelve a borrador (y si estaba aprobado, los lectores siguen viendo la versión aprobada) */
function reconcile(chs, prev) {
  return chs.map(c => {
    const p = prev && prev.chapters.find(x => x.id === c.id);
    if (!p) return { ...c, status: c.status || 'draft' };
    const out = { ...c, status: p.status }; delete out.reason; delete out.live;
    if (p.title === c.title && p.text === c.text && (p.music || '') === (c.music || '') && (p.cover || '') === (c.cover || '')) { if (p.reason) out.reason = p.reason; if (p.live) out.live = p.live; return out; }
    out.status = 'draft';
    const live = p.live || (p.status === 'approved' ? { title: p.title, text: p.text, music: p.music, cover: p.cover } : null); if (live) out.live = live;
    return out;
  });
}
/** Guarda en silencio al cambiar de capítulo */
function autosave() { if (!W) return; collect(); if ($('#w-title') && S.stories.some(s => s.id === W.id)) saveInfoOnly(true); else persistDraft(); }   // en la pantalla de datos solo se guardan los datos
function persistDraft() {
  if (!W || !W.title.trim()) return;
  const cur = freshStories();
  W.chapters = reconcile(W.chapters, cur.find(s => s.id === W.id)); W.updatedAt = today();
  fixSaga(); const { saved, ...clean } = W, list = [clean, ...cur.filter(s => s.id !== W.id)];
  if (LS.set(uk('stories'), list)) S.stories = list;
}
function saveStory(submit) {
  collect();
  if (!W.title.trim()) return toast(t('Ponle un título antes de guardar.'));
  const badM = W.chapters.find(c => c.music && !musicEmbed(c.music)); if (badM) return toast(t('El enlace de música de «{title}» no es válido (YouTube, Spotify o un .mp3).', { title: badM.title }));
  const cur = freshStories();
  let chs = reconcile(W.chapters, cur.find(s => s.id === W.id));
  const toSend = chs.filter(c => c.status === 'draft' && c.text.trim());
  if (submit && W.private) submit = false;                       // una historia privada no se envía a revisión
  if (submit) {
    if (!toSend.length) return toast(t('No hay capítulos nuevos o editados para enviar.'));
    if (W.tags.length < 3) return toast(t('Agrega al menos 3 etiquetas para poder publicar.'));
    if (needTerms()) { if (!W.terms) return toast(t('Debes aceptar los términos y condiciones para enviar.')); const us = getUsers(); if (us[S.user]) { us[S.user].termsAccepted = today(); G.set('users', us); } }
    chs = chs.map(c => toSend.includes(c) ? { ...c, status: 'pending' } : c);
  }
  W.chapters = chs; W.updatedAt = today();
  fixSaga(); const { saved, ...clean } = W, list = [clean, ...cur.filter(s => s.id !== W.id)];
  if (!LS.set(uk('stories'), list)) return;
  S.stories = list; W.saved = true; WPREVIEW = false;
  if (submit) {
    toast(toSend.length === 1 ? t('Capítulo enviado a revisión') : t('Capítulos enviados a revisión')); TAB = 'draft'; go('/library');
  } else toast(t('Borrador guardado ✓'));
}
/** Portada: al elegir una imagen se abre el ajustador (mover, zoom, ver completa) y se guarda al tamaño ideal 480×720 (2:3) */
let COVSRC = null;                                     // imagen original (reducida) para poder volver a ajustarla
function loadCover(file) {
  if (!file || !file.type.startsWith('image/')) return toast(t('Elige un archivo de imagen.'));
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); COVSRC = c.toDataURL('image/jpeg', .9); coverEditor(COVSRC, applyCover, img.width, img.height);
    };
    img.onerror = () => toast(t('No se pudo leer esa imagen.'));
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
function applyCover(d) { W.cover = d; const p = $('#cover-prev'); if (p) p.innerHTML = coverPrev(); const u = $('#cover-url'); if (u) u.value = ''; }
function coverEditor(src, done, ow, oh, o = {}) {
  const OW = o.w || 480, OH = o.h || 720, asp = OH / OW;
  const img = new Image(); if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
  img.onload = () => {
    const iw = img.naturalWidth, ih = img.naturalHeight, FW = o.wide ? Math.max(200, Math.min(340, (window.innerWidth || 390) - 90)) : Math.max(160, Math.min(260, Math.round((window.innerWidth || 390) * (asp > 1 ? .6 : .7)))), FH = Math.round(FW * asp);
    const kc = Math.max(FW / iw, FH / ih), kf = Math.min(FW / iw, FH / ih), zmin = Math.min(1, kf / kc);
    let z = 1, ox = (FW - iw * kc) / 2, oy = (FH - ih * kc) / 2;
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="modal-box cv-box" role="dialog" aria-modal="true" aria-label="${esc(o.title || t('Ajustar portada'))}"><h2>${o.title || t('Ajusta tu portada')}</h2><p class="helper" style="margin:0 0 10px">${t('Arrastra la imagen para moverla y usa el zoom.')} ${o.ratio || t('Se guarda en proporción 2:3.')}</p>
    <div class="cv-frame ${o.round ? 'cv-round' : ''}${o.shape && SHAPES[o.shape] ? ' cv-shape' : ''}" ${o.shape && SHAPES[o.shape] ? `data-shape="${o.shape}"` : ''} style="width:${FW}px;height:${FH}px"><img class="cv-img" alt="" draggable="false" src="${esc(src)}"></div>
    <label class="cv-zoom"><span>Zoom</span><input type="range" min="${zmin}" max="3" step="0.01" value="1" aria-label="Zoom"></label>
    <div class="cv-quick"><button type="button" class="button ghost sm" data-q="fill">${t('Rellenar')}</button><button type="button" class="button ghost sm" data-q="fit">${t('Ver completa')}</button><button type="button" class="button ghost sm" data-q="center">${t('Centrar')}</button></div>
    <p class="helper cv-info">${ow && oh ? t('Original: {w}×{h} px.', { w: ow, h: oh }) + ' ' : ''}${o.info || t('Se guardará a 480×720 px, el tamaño ideal para portadas (las imágenes grandes se reducen solas).')}</p>
    <div style="display:flex;gap:10px;margin-top:12px"><button class="button ghost" data-no style="flex:1">${t('Cancelar')}</button><button class="button" data-yes style="flex:1">${t('Aplicar')}</button></div></div>`;
    const el = m.querySelector('.cv-img'), fr = m.querySelector('.cv-frame'), rg = m.querySelector('input[type=range]');
    const paint = () => {
      const w = iw * kc * z, h = ih * kc * z;
      ox = w <= FW ? (FW - w) / 2 : Math.min(0, Math.max(FW - w, ox)); oy = h <= FH ? (FH - h) / 2 : Math.min(0, Math.max(FH - h, oy));
      el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.left = ox + 'px'; el.style.top = oy + 'px'; rg.value = z;
    };
    const setZ = nz => { const w0 = iw * kc * z, h0 = ih * kc * z, fx = (FW / 2 - ox) / w0, fy = (FH / 2 - oy) / h0; z = Math.min(3, Math.max(zmin, nz)); ox = FW / 2 - fx * iw * kc * z; oy = FH / 2 - fy * ih * kc * z; paint(); };
    rg.oninput = () => setZ(+rg.value);
    m.querySelector('.cv-quick').onclick = e => { const q = e.target.dataset && e.target.dataset.q; if (!q) return; if (q === 'fill') { z = 1; ox = (FW - iw * kc) / 2; oy = (FH - ih * kc) / 2; } else if (q === 'fit') { z = zmin; } else { ox = (FW - iw * kc * z) / 2; oy = (FH - ih * kc * z) / 2; } paint(); };
    let drag = null;
    fr.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox, oy }; if (fr.setPointerCapture) fr.setPointerCapture(e.pointerId); });
    fr.addEventListener('pointermove', e => { if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; paint(); });
    ['pointerup', 'pointercancel'].forEach(t => fr.addEventListener(t, () => { drag = null; }));
    m.querySelector('[data-no]').onclick = () => m.remove();
    m.querySelector('[data-yes]').onclick = () => {
      const k = OW / FW, c = document.createElement('canvas'); c.width = OW; c.height = OH; const x = c.getContext('2d');
      const w = iw * kc * z, h = ih * kc * z;
      if (w < FW - 1 || h < FH - 1) {                    // si la imagen no llena el marco, el fondo es la misma imagen difuminada
        const kb = Math.max(OW / iw, OH / ih); x.fillStyle = '#e8dcf5'; x.fillRect(0, 0, OW, OH);
        try { x.filter = 'blur(18px)'; x.drawImage(img, (OW - iw * kb) / 2, (OH - ih * kb) / 2, iw * kb, ih * kb); x.filter = 'none'; } catch (e) { /* sin filtro: queda el color liso */ }
      }
      x.drawImage(img, ox * k, oy * k, w * k, h * k); m.remove(); done(c.toDataURL('image/jpeg', o.q || .85));
    };
    document.body.appendChild(m); paint();
  };
  img.onerror = () => toast(t('No se pudo leer esa imagen.')); img.src = src;
}

/* --- Música del capítulo (el lector decide si la reproduce) --- */
function musicEmbed(url) {
  let u; try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be' || h.endsWith('youtube.com')) {
    const id = h === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || (u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/) || [])[1];
    return id && /^[\w-]{6,15}$/.test(id) ? { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1`, h: 124 } : null;
  }
  if (h === 'open.spotify.com') { const m = u.pathname.match(/\/(track|album|playlist|episode)\/(\w+)/); return m ? { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, h: 80 } : null; }
  return /\.(mp3|ogg|wav|m4a)$/i.test(u.pathname) ? { src: u.href, audio: true } : null;
}
let MUSIC = null;
/** Con "Recordar mi elección": si la última vez elegiste reproducir, la canción de cada capítulo se abre sola (el navegador puede pedir un toque antes) */
function autoMusic(a, b, c) {
  if (cfg('music') !== 'remember' || cfg('musicLast') !== 'play' || a !== 'story' || !c || c === 'fin') return;
  const s = findStory(b), ch = s && s.chapters.find(x => x.idx === +c - 1);
  if (!ch || !ch.music || !musicEmbed(ch.music) || (MUSIC && MUSIC.url === ch.music && MUSIC.sid === b)) return;
  playMusic(ch.music, b, c);
}
function closeMusic() { const d = $('#music-dock'); if (d) d.remove(); MUSIC = null; }
function playMusic(url, sid, ch) {                    // solo se abre cuando la persona lectora lo pide
  const m = musicEmbed(url); if (!m) return toast(t('No se pudo abrir esa canción.'));
  closeMusic(); MUSIC = { url, sid, ch: String(ch || '') };
  const d = document.createElement('div'); d.id = 'music-dock'; d.className = 'music-dock';
  d.innerHTML = `<div class="music-top"><span>🎵 ${t('Música del capítulo')}</span><button class="icon-btn" data-act="music-close" aria-label="${esc(t('Cerrar música'))}">✕</button></div>${m.audio ? `<audio controls autoplay src="${esc(m.src)}"></audio>` : `<iframe src="${esc(m.src)}" height="${m.h}" allow="autoplay; encrypted-media" title="${esc(t('Reproductor de música'))}"></iframe>`}`;
  document.body.appendChild(d);
}

/* --- Historia (varios capítulos) --- */
const readList = id => { const p = S.progress[id]; return Array.isArray(p) ? p : p ? [0] : []; };
function storyView(id, num) {
  const s = findStory(id);
  if (!s) return `<main class="page">${empty(t('Esta historia se ha perdido'), t('Puede que se haya eliminado o que aún esté en revisión.'), '<a class="button" href="#/">' + t('Volver a descubrir') + '</a>')}</main>`;
  const mine = S.stories.some(x => x.id === s.id);
  if (s.mature && !mine && isMinor(getUsers()[S.user])) return `<main class="page story-layout"><a class="button ghost" href="#/">${t('‹ Volver')}</a>
  <div class="empty" style="margin-top:16px">${mascot()}<h3>${t('Contenido +18')}</h3><p>${t('Esta historia es solo para personas mayores de 18 años, así que no está disponible para tu cuenta.')}</p></div></main>`;
  if (s.mature && !mine && !isAdult(getUsers()[S.user])) return `<main class="page story-layout"><a class="button ghost" href="#/">${t('‹ Volver')}</a>
  <div class="empty" style="margin-top:16px">${mascot()}<h3>${t('Contenido +18')}</h3><p>${t('Esta historia está marcada como +18. Para leerla declara que eres mayor de edad. Por ahora es solo una declaración; la verificación real llegará con el servidor.')}</p><button class="button" data-act="adult">${t('Soy mayor de 18 años')}</button></div></main>`;
  if (s.mature && !mine && !cfg('showMature')) return `<main class="page story-layout"><a class="button ghost" href="#/">${t('‹ Volver')}</a>
  <div class="empty" style="margin-top:16px">${mascot()}<h3>${t('Contenido +18 oculto')}</h3><p>${t('Tienes desactivado «Mostrar contenido +18». Puedes volver a activarlo en Ajustes.')}</p><button class="button" data-act="settings">${t('Ir a Ajustes')}</button></div></main>`;
  return num === 'fin' ? bookEnd(s) : num ? chapterRead(s, +num - 1) : storyDetail(s, mine);
}
const staffBar = (s, mine) => {
  const td = takedown().includes(s.id); if (!(isStaff() && !mine) && !(td && mine)) return '';
  return `<div class="panel staff-bar"><b>${td ? t('🚩 Retirada de Descubrir por moderación') : t('🛡 Herramientas de moderación')}</b>${isStaff() && !mine ? `<div class="row-btns">${td ? `<button class="button secondary sm" data-act="td-off" data-id="${esc(s.id)}">${t('Restaurar en Descubrir')}</button>` : `<button class="button danger sm" data-act="td-on" data-id="${esc(s.id)}">${t('Retirar de Descubrir')}</button>`}${canAct(s.owner) ? `<button class="button ghost sm" data-act="adm-strike" data-id="${esc(s.owner)}">${t('⚠️ Dar strike')}</button>` : ''}<a class="button ghost sm" href="#/user/${encodeURIComponent(s.owner)}">${t('👤 Perfil')}</a><a class="button ghost sm" href="#/moderation/reports">${t('🚩 Reportes')}</a></div>` : ''}</div>`;
};
/* Pantalla 1: portada, título, autoría, likes y sinopsis (sin el texto) */
function storyDetail(s, mine) {
  const read = readList(s.id), fav = S.favs.includes(s.id), n = likes(s.id).length, first = s.chapters[0];
  const lp = (S.pos || {})[s.id], at0 = lp && s.chapters.find(c => c.idx === lp.idx), at = at0 && !read.includes(at0.idx) ? at0 : null;   // si ya lo leíste, sigue con el primero sin leer
  const next = at || s.chapters.find(c => !read.includes(c.idx)) || first, all = !at && s.chapters.every(c => read.includes(c.idx));
  return `<main class="page story-layout"><a class="button ghost" href="#/">${t('‹ Todas las historias')}</a>
  <section class="detail">${sagaNav(s)}${sagaCovers(s)}
  <span class="eyebrow">${esc(genreName(s.genre))} · ${esc(s.fandom)}</span><h1>${esc(s.title)}</h1>
  <div class="detail-by">${t('por')} ${s.owner ? `<a href="#/user/${encodeURIComponent(s.owner)}">${esc(s.author)}</a>` : esc(userName())}</div>${s.publishedAt ? `<div class="detail-date">📅 ${t('Publicado el {d}', { d: fmtDate(s.publishedAt) })}</div>` : ''}
  <div class="detail-likes"><span class="hrt-i">${HEART}</span> ${tn(n, '{n} like', '{n} likes')}</div>${bookState(s)}
  <p class="detail-syn">${esc(s.synopsis)}</p>
  ${s.mature ? `<div class="adult-box"><span class="adult-badge">+18</span><div><b>${t('Contenido para adultos')}</b><small>${t('Esta historia es solo para mayores de 18 años.')}</small></div></div>` : ''}
  <div class="tags" style="justify-content:center">${tagChips(s.tags)}</div>
  ${warnsOf(s).length ? `<div class="warn-box"><b>${t('Avisos de contenido')}</b><div class="warn-list">${warnsOf(s).map(k => `<span class="warn-pill ${avoidWarns().includes(k) ? 'hit' : ''}">${esc(t(WARNS[k]))}</span>`).join('')}</div></div>` : ''}
  ${staffBar(s, mine)}
  ${mine && statusNote(ownOf(s)) ? `<p class="notice">${esc(statusNote(ownOf(s)))}</p>` : ''}
  <a class="button" data-replace data-dir="next" ${s.useReaderCharacter ? `data-readas="${esc(s.id)}"` : ''} style="width:100%;max-width:420px" href="#/story/${esc(s.id)}/${next.idx + 1}">${!read.length && !at ? t('Empezar a leer') : all ? t('Leer otra vez') : t('Continuar: cap. {n}', { n: next.idx + 1 })}</a>
  <div class="row-btns"><button class="button secondary like-btn ${likes(s.id).includes(S.user) ? 'on' : ''}" data-act="like" data-id="${esc(s.id)}" aria-pressed="${likes(s.id).includes(S.user)}">${HEART}<span>${likes(s.id).includes(S.user) ? t('Te gusta') : t('Me gusta')}</span></button><button class="button secondary" data-act="fav" data-id="${esc(s.id)}">${fav ? '♥ ' + t('En favoritos') : '♡ ' + t('Favorito')}</button><button class="button secondary" data-act="lib-toggle" data-id="${esc(s.id)}">${S.lib.includes(s.id) ? '✓ ' + t('En tu biblioteca') : '📚 ' + t('Guardar en biblioteca')}</button>${mine ? `<a class="button ghost" href="#/write/${esc(s.id)}">${t('Editar')}</a>` : `<button class="button ghost" data-act="report-story" data-id="${esc(s.id)}">${t('Reportar')}</button>${imgrOk(s.cover) ? `<button class="button ghost" data-act="report-img" data-id="${esc(s.id)}">${t('Reportar portada')}</button>` : ''}`}</div>${imgrPanel(s)}
  <details class="ch-index"><summary>${t('Capítulos ({n})', { n: s.chapters.length })}</summary>${s.chapters.map(c => `<a data-replace ${s.useReaderCharacter ? `data-readas="${esc(s.id)}"` : ''} href="#/story/${esc(s.id)}/${c.idx + 1}"><b>${read.includes(c.idx) ? '✓' : c.idx + 1}</b><span>${esc(c.title || t('Capítulo {n}', { n: c.idx + 1 }))}${mine && c.status !== 'approved' ? ` (${t(CH_STATUS[c.status]).toLowerCase()})` : ''}</span></a>`).join('')}</details>
  </section></main>`;
}
/* Estado del libro + barra de progreso (solo si ya empezaste o lo guardaste) */
function bookState(s) {
  const p = bookProgress(s), ph = s.phase || 'ongoing', inLib = S.lib.includes(s.id), show = readList(s.id).length > 0 || inLib;
  return `<div class="book-state"><span class="pill ph-${ph}">${t(PHASE[ph])}</span></div>${show ? `<div class="pbar big"><i data-key="b-${esc(s.id)}" data-w="${p.pct}" style="width:${p.pct}%"></i></div><div class="story-meta" style="text-align:center"><b class="plabel ${p.finished ? 'done' : p.caught ? 'caught' : ''}">${t(p.label)}</b> · ${t('{done}/{total} cap.', { done: p.done, total: p.total })}</div>${p.caught && !p.finished ? `<p class="notice">${esc(moreNotice(s, inLib))}</p>` : ''}` : ''}`;
}
/* Pantalla final: al día / terminado, opciones de biblioteca y salto al siguiente libro de la saga */
/** Partes de la saga que esta persona puede ver (públicas, o todas si son suyas) */
function sagaVisible(s) {
  const mine = S.stories.some(x => x.id === s.id);
  return sagaParts(s).filter(p => p.id === s.id || publicPrefix(p.chapters).length || (mine && p.owner === S.user));
}
/* Carrusel de portadas de la saga: cada portada se coloca según su distancia (rel) al centro, así se puede animar de forma continua */
const SAGA_D = 190;                                     // separación entre portadas (px)
const sagaPose = rel => { const a = Math.min(Math.abs(rel), 1), far = Math.min(Math.abs(rel), 2); return { x: rel * SAGA_D, sc: 1 - 0.45 * a, op: Math.max(0, 1 - 0.45 * far), z: Math.round(100 - Math.abs(rel) * 10) }; };
const sagaRubber = (p, n) => p < 0 ? p * 0.35 : p > n - 1 ? (n - 1) + (p - (n - 1)) * 0.35 : p;   // un poco de resistencia en los extremos
function sagaLayout(tr, pos, animate) {                 // pos = parte "en el centro" (puede ser decimal mientras arrastras)
  tr.dataset.pos = pos;
  tr.querySelectorAll('.sc').forEach(el => {
    const q = sagaPose(+el.dataset.k - pos), st = el.style;
    st.transition = animate ? 'transform .32s cubic-bezier(.2,.8,.2,1), opacity .32s ease' : 'none';
    st.transform = `translateX(${q.x}px) scale(${q.sc})`; st.opacity = q.op; st.zIndex = q.z;
  });
}
function sagaGoto(tr, k) {                              // la portada elegida crece y se desliza al centro; luego se abre esa parte
  if (!tr) return; const ids = tr.dataset.ids.split(','), cur = +tr.dataset.i;
  if (k === cur || k < 0 || k >= ids.length || tr.dataset.busy) return;
  tr.dataset.busy = '1'; const fast = reduceMotion(); sagaLayout(tr, k, !fast);
  setTimeout(() => { NAVDIR = 'swipe'; goReplace('/story/' + ids[k]); }, fast ? 0 : 300);
}
/** Portada de la ficha: si es parte de una saga, se muestra el carrusel (si no, la portada sola) */
function sagaCovers(s) {
  const parts = sagaVisible(s), i = parts.findIndex(p => p.id === s.id);
  if (parts.length < 2 || i < 0) return s.cover ? `<img class="detail-cover" src="${esc(s.cover)}" alt="${esc(t('Portada de {title}', { title: s.title }))}">` : `<div class="detail-cover ph">${esc(s.title)}</div>`;
  const pose = k => { const q = sagaPose(k - i); return `transform:translateX(${q.x}px) scale(${q.sc});opacity:${q.op};z-index:${q.z}`; };
  return `<div class="saga-view" data-saga data-ids="${parts.map(p => esc(p.id)).join(',')}" data-i="${i}" data-pos="${i}">${parts.map((p, k) => `<a class="sc" data-k="${k}" href="#/story/${esc(p.id)}" aria-label="${esc(p.title)}" ${k === i ? 'aria-current="true"' : ''} style="${pose(k)}">${coverHTML(p, k)}</a>`).join('')}</div><p class="swipe-hint">${t('Desliza o toca una portada para cambiar de parte')}</p>`;
}
/* Pantalla final: celebración + tarjeta del libro siguiente (se arma con los datos reales de la secuela) */
function bookEnd(s) {
  const p = bookProgress(s), inLib = S.lib.includes(s.id), inCol = S.cols.includes(s.id), id = esc(s.id), ph = s.phase || 'ongoing';
  const parts = sagaParts(s).filter(x => x.id === s.id || publicPrefix(x.chapters).length), i = parts.findIndex(x => x.id === s.id), nxt = parts[i + 1];
  const pillCls = { 'Terminado': 'ph-finished', 'Al día': 'st-approved', 'En emisión': 'ph-ongoing', 'En pausa': 'ph-paused' };
  const pills = [p.label, PHASE[ph]].filter((x, k, a) => a.indexOf(x) === k);                 // sin etiquetas repetidas ("Terminado Terminado")
  const head = p.finished ? t('🎉 ¡Felicidades, terminaste esta historia!') : p.caught ? t('✨ ¡Estás al día!') : t('Capítulo completado');
  const notice = p.caught && !p.finished ? `<p class="notice">${esc(moreNotice(s, inLib))}</p>${inLib ? '' : `<button class="button secondary" data-act="lib-toggle" data-id="${id}">📚 ${t('Guardar en biblioteca')}</button>`}` : !p.caught ? `<p class="helper">${t('Todavía te quedan capítulos por leer.')}</p><a class="button" data-replace href="#/story/${id}">${t('Continuar leyendo')}</a>` : '';
  const colBtn = inCol ? `<span class="end-note">⭐ ${t('Ya está en tus colecciones')}</span>` : `<button class="button ${nxt ? 'ghost sm' : 'secondary'}" data-act="col-add" data-id="${id}">⭐ ${t('Guardar en colecciones')}</button>`;
  let main;
  if (nxt) {
    const first = publicPrefix(nxt.chapters)[0];
    main = `<article class="seq-card"><div class="seq-cover">${coverHTML(nxt, 1)}</div><div class="seq-info"><span class="eyebrow">${i + 1 < ORD.length ? t('A continuación: {ord} libro', { ord: t(ORD[i + 1]) }) : t('Parte {n}', { n: i + 2 })}</span><h2>${esc(nxt.title)}</h2>
      <a class="button seq-go" data-replace data-dir="next" ${nxt.useReaderCharacter ? `data-readas="${esc(nxt.id)}"` : ''} href="#/story/${esc(nxt.id)}/${first.idx + 1}">📖 ${t('Comenzar a leer {title}', { title: esc(nxt.title) })}</a></div></article>
      <div class="end-sub">${colBtn}<a class="end-link" data-replace href="#/story/${id}">${t('‹ Volver a la portada')}</a></div>`;
  } else {
    main = `<div class="end-panel">${colBtn}${inLib ? `<button class="button ghost" data-act="lib-del" data-id="${id}">🗑️ ${t('Borrar de la biblioteca')}</button>` : ''}<a class="end-link" href="#/">${t('‹ Volver al inicio')}</a></div>`;
  }
  return `<div class="rf"><header class="rf-top"><a class="button ghost sm" data-replace href="#/story/${id}">✕ ${t('Cerrar')}</a><div class="rf-title">${esc(s.title)}</div><span style="width:44px"></span></header>
  <div class="rf-body end-card"><h1 class="rf-h end-h">${head}</h1><div class="end-cover">${coverHTML(s, 0)}${p.finished || p.caught ? `<span class="end-badge ${p.finished ? 'done' : ''}">${p.finished ? t('Terminado') : t('Estás al día')}</span>` : ''}</div><p class="story-meta">${esc(s.title)}</p>
  <div class="pbar big"><i data-key="b-${esc(s.id)}" data-w="${p.pct}" style="width:${p.pct}%"></i></div>
  <p class="end-pills">${pills.map(x => `<span class="pill ${pillCls[x] || ''}">${t(x)}</span>`).join(' ')}</p>${notice}${main}${(() => { const r = p.caught ? similarBooks(s) : []; return r.length ? `<section class="end-recs"><h3>${t('Si te gustó esta historia')}</h3><p class="helper">${t('Libros con etiquetas parecidas')}</p><div class="story-grid">${r.map(storyCard).join('')}</div></section>` : ''; })()}</div></div>`;
}
/* Pantalla 2: lectura a pantalla completa (sin barra de la app); la salida guarda el progreso */
function chapterRead(s, N) {
  const read = readList(s.id), mine = S.stories.some(x => x.id === s.id);
  let pos = s.chapters.findIndex(c => c.idx === N); if (pos < 0) pos = 0;
  const ch = s.chapters[pos], before = s.chapters[pos - 1], after = s.chapters[pos + 1];
  if (!ch) return `<main class="page">${empty(t('Aún no hay capítulos'), t('Esta historia todavía no tiene capítulos publicados.'), `<a class="button" href="#/story/${esc(s.id)}">${t('Volver a la historia')}</a>`)}</main>`;
  const nc = comments(s.id, ch.idx).length, exit = `data-act="exit-book" data-id="${esc(s.id)}" data-n="${ch.idx}"`;
  return `<div class="rf"><div class="rf-bar"><i id="rf-bar-i"></i></div>
  <header class="rf-top"><button class="button ghost sm" ${exit} aria-label="${esc(t('Guardar progreso y salir del libro'))}">✕ ${t('Salir')}</button><div class="rf-title"><b>${t('Cap. {n}', { n: ch.idx + 1 })}</b> · ${esc(ch.title)}<small class="rf-left" id="rf-left" data-tot="${readMin(ch.text)}"></small></div><button class="icon-btn" data-act="comments" aria-label="${esc(t('Comentarios'))}">💬</button></header>
  <article class="rf-body">${chHero(ch)}${chHead(ch.idx + 1, ch.title)}${s.useReaderCharacter && S.chars.length > 1 ? `<label class="helper" style="display:flex;align-items:center;gap:8px;margin-bottom:14px">${t('Leyendo como')} <select id="char-sel" class="select" style="max-width:200px">${S.chars.map((x, k) => `<option value="${x.id}" ${x.id === S.activeId ? 'selected' : ''}>${esc(x.name || t('Personaje {n}', { n: k + 1 }))}</option>`).join('')}</select></label>` : ''}${ch.music && musicEmbed(ch.music) ? `<button class="button secondary sm ch-music" data-act="music" data-url="${esc(ch.music)}">🎵 ${t('Escuchar la canción de este capítulo')}</button>` : ''}${readerText(ch.text, s.useReaderCharacter, { sid: s.id, ci: ch.idx })}</article>
  <footer class="rf-end"><div class="ch-end">${sepHTML('scene-sep')}<b class="ch-fin">${after ? t('Fin del capítulo') : t('Fin del último capítulo disponible')}</b><small class="ch-min">${t('Lectura de ~{n} min', { n: readMin(ch.text) })}</small>
  <button class="read-btn ${read.includes(ch.idx) ? 'done' : ''}" data-act="read" data-id="${esc(s.id)}" data-n="${ch.idx}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7.5"/></svg>${read.includes(ch.idx) ? t('Leído') : t('Marcar como leído')}</button>
  <div class="nav2">${before ? `<a class="nav-card prev" data-replace data-dir="prev" href="#/story/${esc(s.id)}/${before.idx + 1}"><small>${t('Anterior')}</small><b>${esc(before.title || t('Capítulo {n}', { n: before.idx + 1 }))}</b></a>` : ''}${after ? `<a class="nav-card next" data-replace data-dir="next" href="#/story/${esc(s.id)}/${after.idx + 1}"><small>${t('Siguiente')}</small><b>${esc(after.title || t('Capítulo {n}', { n: after.idx + 1 }))}</b></a>` : ''}</div></div>
  <label class="helper" style="display:flex;align-items:center;gap:8px;margin-top:16px">${t('Ir a')} <select id="ch-sel" class="select" aria-label="${esc(t('Elegir capítulo'))}">${s.chapters.map(c => `<option value="${c.idx + 1}" ${c === ch ? 'selected' : ''}>${read.includes(c.idx) ? '✓ ' : ''}${esc(c.title || t('Capítulo {n}', { n: c.idx + 1 }))}${mine && c.status !== 'approved' ? ` (${t(CH_STATUS[c.status]).toLowerCase()})` : ''}</option>`).join('')}</select></label>
  <button class="button secondary" style="width:100%;margin-top:14px" data-act="comments">💬 ${SHOWC ? t('Ocultar comentarios') : t('Comentarios ({n})', { n: nc })}</button>${SHOWC ? `<div id="comments">${commentsHTML(s, ch.idx)}</div>` : ''}
  <button class="button ghost" style="width:100%;margin-top:18px" ${exit}>${t('Guardar progreso y salir del libro')}</button></footer>${VISIT && VISIT.sid === s.id && VISIT.pos && VISIT.pos.idx > ch.idx ? `<button class="button resume-fab" data-act="resume-read" data-id="${esc(s.id)}">${t('Continuar mi progreso')} · ${t('Cap. {n}', { n: VISIT.pos.idx + 1 })} ›</button>` : ''}</div>`;
}

/* --- Moderación por capítulo (solo la cuenta dueña) --- */
function setChapterStatus(id, owner, cid, status, reason = '') {
  sbChapterStatus(id, cid, status, reason);
  const k = `auri.u.${owner}.stories`; let title = ''; const before = (allStories().find(x => x.id === id) ? publicPrefix(allStories().find(x => x.id === id).chapters).length : 0);
  const list = LS.get(k, []).map(s => {
    if (s.id !== id) return s;
    const n = norm(s);
    n.chapters = n.chapters.map(c => {
      if (c.id !== cid) return c;
      title = c.title;
      if (status === 'approved') { const { live, reason: _r, ...rest } = c; return { ...rest, status }; }   // la versión nueva reemplaza a la anterior
      return { ...c, status, reason };
    });
    if (status === 'approved' && !n.publishedAt && n.chapters.filter(pubChapter).length === 1) n.publishedAt = today();     // fecha en que moderación aceptó el libro
    n.updatedAt = today(); return n;
  });
  LS.set(k, list); if (status === 'approved' || status === 'rejected') logAction(status === 'approved' ? 'chapter-approve' : 'chapter-reject', owner, (title || '') + (reason ? ': ' + String(reason).slice(0, 80) : ''));
  if (owner === S.user) S.stories = list.map(norm);
  notify(owner, status === 'approved' ? 'approved' : 'rejected', id, reason.slice(0, 200), title);
  if (status === 'approved') announceChapters(id, before);
}
const OPEN = new Set();   // libros desplegados (se conservan al re-dibujar)
function commBar() {                                    // quien ve todo elige comunidad; quien tiene una sola ve su etiqueta
  const sc = staffScope(S.user); if (!sc.length) return '';
  if (sc.length === 1) return `<p class="comm-bar"><span class="pill">${t('Comunidad: {c}', { c: esc(COMMS[sc[0]]) })}</span></p>`;
  return `<div class="filter-row comm-bar" role="radiogroup" aria-label="${esc(t('Comunidad'))}">${[['all', 'Todas'], ['es', 'Español'], ['en', 'English']].map(([k, n]) => `<button type="button" class="chip ${MODC === k ? 'active' : ''}" data-act="mod-comm" data-id="${k}">${t(n)}</button>`).join('')}</div>`;
}
const aiNote = a => { const rs = (a && a.reasons) || []; return `<div class="ai-note"><b>${t('La IA marcó este capítulo por:')}</b> ${rs.map(r => esc(r.label) + ' (' + Math.round((r.score || 0) * 100) + '%)').join(', ') || esc(t('revisión'))}${a.mature ? ' · ' + t('Libro +18') : ' · ' + t('Libro sin marca +18')}${a.excerpt ? `<details><summary>${t('Fragmento que preocupó')}</summary><p>«${esc(a.excerpt)}…»</p></details>` : ''}<span class="helper">${t('Es una ayuda automática y puede equivocarse: decide tú.')}</span></div>`; };
/* ---------- Revisión de libros: ficha, pantalla del libro y pantalla del capítulo ---------- */
function afterReview(id) { const bk = allStories().find(x => x.id === id), left = bk && bk.chapters.some(c => c.status === 'pending'); NAVDIR = 'prev'; if (left) go('/moderation/book/' + encodeURIComponent(id)); else { releaseClaim(id); go('/moderation'); } }
const CLAIMS = {};                                         // id del libro → { by (clave de usuario), at }: quién lo está revisando ahora
const CLAIM_MS = 10 * 60 * 1000;
const claimOf = id => { const c = CLAIMS[id]; return c && c.by !== S.user && Date.now() - c.at < CLAIM_MS ? c : null; };
const canApproveCh = (bk, i) => !!(bk.chapters[i] && (bk.chapters[i].live || bk.chapters.slice(0, i).every(x => pubChapter(x))));   // una edición de un capítulo ya publicado se aprueba sin importar los anteriores
const aiState = c => !c.ai ? 'none' : c.ai.verdict === 'flagged' ? 'flag' : 'ok';
function modBookCard(s) {
  const np = s.chapters.filter(c => c.status === 'pending').length, fl = s.chapters.filter(c => c.status === 'pending' && aiState(c) === 'flag').length, first = !publicPrefix(s.chapters).length, cl = claimOf(s.id), href = '#/moderation/book/' + encodeURIComponent(s.id);
  return `<div class="mod-card ${fl ? 'has-flag' : ''}"><a class="mod-card-main" href="${href}" data-dir="next">${s.cover ? `<img class="book-thumb" src="${esc(s.cover)}" alt="">` : '<span class="book-thumb">📖</span>'}
    <span class="mod-card-txt"><strong class="serif">${esc(s.title)}</strong><small>${t('por {a}', { a: esc(s.author) })}${s.mature ? ' · +18' : ''}</small><small>${t('{n} en revisión', { n: np })}${first ? ' · ' + t('Historia nueva') : ''}</small>${cl ? `<span class="pill claim">👀 ${t('{n} lo está revisando', { n: esc(cl.name || uName(cl.by)) })}</span>` : ''}</span></a>
    <a class="mod-ai ${fl ? 'flag' : ''}" href="${href}" data-dir="next" aria-label="${esc(t('Ver qué detectó la IA'))}"><span>🤖</span><small>${fl ? t('Marcado') : t('IA')}</small></a></div>`;
}
function modBookView(id) {
  if (!isStaff()) return `<main class="page">${empty('Sin acceso', 'Solo el equipo de moderación puede entrar aquí.', '<a class="button" href="#/">' + t('Volver') + '</a>')}</main>`;
  const s = allStories().find(x => x.id === id), back = `<div class="set-head"><a class="icon-btn" href="#/moderation" data-dir="prev" aria-label="${esc(t('Volver'))}">‹</a><h2>${t('Revisar libro')}</h2></div>`;
  if (!s || !inScope(commOf(s.owner))) return `<main class="page story-layout">${back}${empty('Nada por revisar', 'Este libro ya no tiene capítulos en revisión.', '<a class="button" href="#/moderation">' + t('Volver') + '</a>')}</main>`;
  const first = !publicPrefix(s.chapters).length, cl = claimOf(s.id);
  const rows = s.chapters.map((c, i) => {
    const pend = c.status === 'pending', st = pend ? aiState(c) : '', inner = `<b>${t('Cap. {n}', { n: i + 1 })}</b><span class="mod-row-t">${esc(c.title)}</span><span class="pill st-${c.status}">${t(CH_STATUS[c.status])}</span>`
      + (pend ? `<span class="pill ai-pill ${st === 'flag' ? '' : st === 'ok' ? 'ai-ok' : 'ai-none'}">${st === 'flag' ? t('🤖 Marcado por la IA') : st === 'ok' ? t('🤖 IA: sin problemas') : t('🤖 IA: sin revisar')}</span>` : '')
      + (pend && c.live ? `<small class="helper">${t('versión editada')}</small>` : '') + (pend && st === 'flag' ? `<small class="mod-row-why">${(c.ai.reasons || []).map(r => esc(t(r.label))).join(', ')}</small>` : '');
    return pend ? `<a class="mod-row ${st === 'flag' ? 'flag' : ''}" href="#/moderation/book/${encodeURIComponent(s.id)}/${c.id}" data-dir="next">${inner}<i aria-hidden="true">›</i></a>` : `<div class="mod-row off">${inner}</div>`;
  }).join('');
  return `<main class="page story-layout">${back}
  <section class="panel mod-book-head">${s.cover ? `<img class="book-thumb big" src="${esc(s.cover)}" alt="">` : '<span class="book-thumb big">📖</span>'}<div><h1 class="serif" style="margin:0 0 4px;font-size:22px">${esc(s.title)}</h1>
    <p class="story-meta">${t('por {a}', { a: esc(s.author) })}${s.mature ? ' · +18' : ''} · <a href="#/user/${encodeURIComponent(s.owner)}" data-dir="next" style="text-decoration:underline">${t('ver perfil')}</a></p><p class="story-meta">${esc(genreName(s.genre))} · ${esc(s.fandom)}</p>
    ${first ? `<span class="pill">${t('Historia nueva')}</span>` : ''}${cl ? ` <span class="pill claim">👀 ${t('{n} lo está revisando', { n: esc(cl.name || uName(cl.by)) })}</span>` : ''}</div></section>
  ${first && s.synopsis ? `<p class="mod-syn">${esc(s.synopsis)}</p>` : ''}
  ${modBookImgs(s)}
  <h3 style="margin:18px 0 8px">${t('Capítulos')}</h3><p class="helper" style="margin:0 0 10px">${t('Los marcados en amarillo llamaron la atención de la IA. Toca un capítulo en revisión para leerlo.')}</p><div class="mod-rows">${rows}</div></main>`;
}
function modChapterView(id, cid) {
  if (!isStaff()) return `<main class="page">${empty('Sin acceso', 'Solo el equipo de moderación puede entrar aquí.', '<a class="button" href="#/">' + t('Volver') + '</a>')}</main>`;
  const s = allStories().find(x => x.id === id), i = s ? s.chapters.findIndex(c => String(c.id) === String(cid)) : -1, c = s && s.chapters[i], bk = '#/moderation/book/' + encodeURIComponent(id);
  if (!s || !c || !inScope(commOf(s.owner)) || c.status !== 'pending') return `<main class="page story-layout"><div class="set-head"><a class="icon-btn" href="${bk}" data-dir="prev" aria-label="${esc(t('Volver'))}">‹</a><h2>${t('Revisar capítulo')}</h2></div>${empty('Nada por revisar', 'Este capítulo ya fue revisado.', `<a class="button" href="#/moderation">${t('Volver')}</a>`)}</main>`;
  const ok = canApproveCh(s, i), st = aiState(c);
  return `<main class="page story-layout"><div class="set-head"><a class="icon-btn" href="${bk}" data-dir="prev" aria-label="${esc(t('Volver'))}">‹</a><h2>${t('Cap. {n}', { n: i + 1 })} · ${esc(s.title)}</h2></div>
  <p class="story-meta">${t('por {a}', { a: esc(s.author) })}${c.live ? ' · ' + t('versión editada') : ''}</p>
  ${st === 'flag' ? aiNote(c.ai) : `<div class="ai-note ${st === 'ok' ? 'ok' : ''}"><b>${st === 'ok' ? t('La IA no encontró problemas en este capítulo.') : t('La IA todavía no revisó este capítulo (o la revisión falló). Revísalo tú.')}</b></div>`}
  <article class="panel mod-read">${chHero(c, 'mod-cover')}<h2 class="serif" style="margin:0 0 10px">${esc(c.title)}</h2><div class="mod-text">${fmtText(esc(String(c.text || '').replace(/^::sep$/gm, '* * *').replace(/^::[crj] /gm, '')))}</div>${c.music ? `<p class="helper" style="margin-top:10px">🎵 ${t('Canción')}: ${musicEmbed(c.music) ? `<a href="${esc(c.music)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">${esc(c.music)}</a>` : esc(c.music) + ' (' + t('enlace no válido') + ')'}</p>` : ''}</article>
  <div class="panel mod-decide"><textarea id="rej-${esc(s.id)}-${c.id}" class="textarea" style="min-height:70px" placeholder="${esc(t('Motivo del rechazo (obligatorio para rechazar)'))}"></textarea>
  <div class="mod-actions"><button class="button" data-act="approve" data-id="${esc(s.id)}" data-owner="${esc(s.owner)}" data-cid="${c.id}" ${ok ? '' : 'disabled'}>${t('✓ Aprobar')}</button><button class="button danger" data-act="reject" data-id="${esc(s.id)}" data-owner="${esc(s.owner)}" data-cid="${c.id}">${t('✕ Rechazar')}</button></div>
  ${ok ? '' : `<p class="helper" style="margin-top:8px">${t('Aprueba antes el capítulo {n} para poder aprobar este.', { n: i })}</p>`}</div></main>`;
}
/** Para el equipo: los libros en revisión de una persona, al entrar a su perfil */
function modUserBooks(e) {
  if (!isStaff() || e === S.user) return '';
  const l = pendingBooks().filter(s => s.owner === e && inScope(commOf(s.owner))); if (!l.length) return '';
  return `<section class="mod-user"><h3>🛡 ${t('En revisión')} (${l.length})</h3><div class="mod-cards">${l.map(modBookCard).join('')}</div></section>`;
}
async function claimBook(id) {
  const ses = sbSes(), su = sUuid(id); if (!cloud() || !ses || !su || !isStaff()) return;
  CLAIMS[id] = { by: S.user, at: Date.now() };
  await sbApi('/rest/v1/review_claims', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: { story_id: su, user_id: ses.uid, at: new Date().toISOString() } });
}
async function releaseClaim(id) {
  const ses = sbSes(), su = sUuid(id); if (CLAIMS[id] && CLAIMS[id].by === S.user) delete CLAIMS[id]; if (!cloud() || !ses || !su) return;
  await sbApi('/rest/v1/review_claims?story_id=eq.' + su + '&user_id=eq.' + ses.uid, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
/* ---------- La isla de Auri (reemplaza la barra de arriba) ----------
   Una cabecita de gato flotante: se arrastra a un borde, se extiende al tocarla (como la Dynamic Island) y se cierra al tocar fuera.
   Los números no se ven hasta abrirla; si llega algo, solo se mueve un poquito. Se esconde al leer o escribir un capítulo. */
const ISLE_W = 54, ISLE_H = 47, ISLE_K = 'auri.isle';
let ISLE = null, ISLE_ST = { open: false, drag: null, sleep: false, taps: 0, u: '', trail: [], dz: 0, seenAt: 0 };
const ISLE_SP = (cx, cy) => { let d = ''; for (let i = 0; i <= 30; i++) { const a = i * .45, r = .3 + a * .3; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2); } return `<path class="sp" d="${d}"/>`; };
const ISLE_HEAD = `<svg viewBox="0 0 64 56" aria-hidden="true"><defs>
  <radialGradient id="ih-hi" cx=".38" cy=".2" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".55" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="ih-sh" x1="0" y1=".35" x2="0" y2="1"><stop offset="0" stop-color="#1b0b3d" stop-opacity="0"/><stop offset="1" stop-color="#1b0b3d" stop-opacity=".38"/></linearGradient></defs>
  <path class="ih-ear" d="M9 33C8 22 9 12 12.5 7.5 15 4.5 18.5 5.5 21 8c4.5 4 8.500 8.500 11 12.500Z"/><path class="ih-ear" d="M55 33C56 22 55 12 51.500 7.500 49 4.500 45.500 5.500 43 8c-4.500 4-8.500 8.500-11 12.500Z"/>
  <path d="M13 28C12.500 21 13.500 14 15.500 11.500 17 10 19 11 20.500 12.500 23 15 25.500 18 27 20.500Z" fill="#fff" opacity=".22"/><path d="M51 28C51.500 21 50.500 14 48.500 11.500 47 10 45 11 43.500 12.500 41 15 38.500 18 37 20.500Z" fill="#fff" opacity=".22"/>
  <ellipse class="ih-face" cx="32" cy="35" rx="26" ry="18"/><ellipse cx="32" cy="35" rx="26" ry="18" fill="url(#ih-sh)"/><ellipse cx="32" cy="35" rx="26" ry="18" fill="url(#ih-hi)"/>
  <g class="ih-eyes"><g class="eL"><ellipse cx="23" cy="34" rx="3.4" ry="4.6" fill="#1a1226"/><circle cx="24.1" cy="32.4" r="1.1" fill="#fff"/></g><g class="eR"><ellipse cx="41" cy="34" rx="3.4" ry="4.6" fill="#1a1226"/><circle cx="42.1" cy="32.4" r="1.1" fill="#fff"/></g></g>
  <g class="ih-arc"><path class="arcL" d="M18.600 35.200Q23 38.800 27.400 35.200"/><path class="arcR" d="M36.600 35.200Q41 38.800 45.400 35.200"/></g>
  <g class="ih-spir"><circle cx="23" cy="34" r="5.800" fill="#fff"/><circle cx="41" cy="34" r="5.800" fill="#fff"/>${ISLE_SP(23, 34)}${ISLE_SP(41, 34)}</g></svg>`;
const ISLE_OPS = [
  { k: 'msg', ic: () => ICON.mail, l: 'Mensajes', n: () => dmUnread(), who: 'user' },
  { k: 'noti', ic: () => ICON.bell, l: 'Notificaciones', n: () => unread(), who: 'user' },
  { k: 'find', ic: () => ICON.search, l: 'Buscar', n: () => 0 },
  { k: 'set', ic: () => ICON.gear, l: 'Ajustes', n: () => 0 },
  { k: 'mod', ic: () => IC('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'), l: 'Moderación', n: () => modCounts().total, who: 'staff' },
];
const isleOps = () => ISLE_OPS.filter(o => !o.who || (o.who === 'user' && !isGuest()) || (o.who === 'staff' && !isGuest() && isStaff()));
const isleSaved = () => { const v = LS.get(ISLE_K, null); return v && (v.side === 'l' || v.side === 'r') ? v : { side: 'r', y: 6 }; };
const isleHidden = () => {
  const p = location.hash.slice(1) || '/', [, a, b, c] = p.split('/');
  return !S.user || ['welcome', 'start', 'login', 'register', 'signup'].includes(a) || (S.user && activeBan(S.user)) || (a === 'story' && /^\d+$|^fin$/.test(c || '')) || (a === 'write' && c === 'ch') || (a === 'messages' && !!b) || !!document.querySelector('.modal');
};
function isleBuild() {
  if (ISLE) return ISLE;
  const el = document.createElement('div'); el.className = 'isle'; el.id = 'isle';
  el.innerHTML = `<button type="button" class="isle-head" aria-label="${esc(t('Menú de Auri'))}" aria-expanded="false" aria-haspopup="true">${ISLE_HEAD}</button><span class="isle-z" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span><div class="isle-body" role="menu" aria-hidden="true"></div>`;
  document.body.appendChild(el); ISLE = el;
  const head = el.querySelector('.isle-head');
  head.addEventListener('pointerdown', ev => { if (ISLE_ST.open) { ev.preventDefault(); isleToggle(false); return; } ISLE_ST.drag = { x: ev.clientX, y: ev.clientY, l: el.offsetLeft, t: el.offsetTop, moved: false, id: ev.pointerId }; try { head.setPointerCapture(ev.pointerId); } catch (e) { /* */ } });
  head.addEventListener('pointermove', ev => { const d = ISLE_ST.drag; if (!d || d.id !== ev.pointerId) return; const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 7) { d.moved = true; el.classList.add('drag'); } if (!d.moved) return;
    isleTrail(ev.clientX, ev.clientY); el.style.left = Math.max(4, Math.min(innerWidth - ISLE_W - 4, d.l + dx)) + 'px'; el.style.top = Math.max(isleTop(), Math.min(isleBottom(), d.t + dy)) + 'px'; });
  const up = ev => { const d = ISLE_ST.drag; if (!d || d.id !== ev.pointerId) return; ISLE_ST.drag = null; el.classList.remove('drag');
    if (d.moved) { const cx = el.offsetLeft + ISLE_W / 2; LS.set(ISLE_K, { side: cx < innerWidth / 2 ? 'l' : 'r', y: el.offsetTop }); ISLE_ST.trail = []; isleLayout(); } else isleTap(); };
  head.addEventListener('pointerup', up); head.addEventListener('pointercancel', ev => { const d = ISLE_ST.drag; if (d) { ISLE_ST.drag = null; el.classList.remove('drag'); isleLayout(); } });
  head.addEventListener('click', ev => { if (ev.detail === 0) isleTap(); });          // teclado
  document.addEventListener('pointerdown', ev => { if (ISLE_ST.open && !el.contains(ev.target)) isleToggle(false); }, true);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ISLE_ST.open) { isleToggle(false); head.focus(); } });
  el.querySelector('.isle-body').addEventListener('click', ev => { const b = ev.target.closest('[data-isle]'); if (!b) return; isleToggle(false); isleGo(b.dataset.isle); });
  addEventListener('resize', () => isleLayout());
  return el;
}

/** Mareo: si la arrastras muy rápido o en círculos, los ojos se vuelven espirales un ratito */
function isleTrail(x, y) {
  const t = performance.now(), tr = ISLE_ST.trail; tr.push({ x, y, t }); while (tr.length && t - tr[0].t > 1600) tr.shift(); if (ISLE_ST.dz > t || tr.length < 8) return;
  let len = 0, fast = 0; for (let i = 1; i < tr.length; i++) { const dd = Math.hypot(tr[i].x - tr[i - 1].x, tr[i].y - tr[i - 1].y); len += dd; if (t - tr[i].t < 500) fast += dd; }
  const cx = tr.reduce((a, p) => a + p.x, 0) / tr.length, cy = tr.reduce((a, p) => a + p.y, 0) / tr.length; let ang = 0, pa = null;
  for (const p of tr) { const a = Math.atan2(p.y - cy, p.x - cx); if (pa !== null) { let da = a - pa; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; ang += da; } pa = a; }
  if (fast > 1300 || (Math.abs(ang) > Math.PI * 2.4 && len > 220)) isleDizzy();
}
function isleDizzy() {
  if (!ISLE) return; ISLE.classList.add('dizzy'); ISLE_ST.trail = []; ISLE_ST.dz = performance.now() + 4200;
  clearTimeout(ISLE_ST.dzT); ISLE_ST.dzT = setTimeout(() => ISLE.classList.remove('dizzy'), 2400);
}
/** Dormida: tras 3 días sin entrar. 1.er toque abre un ojo y lo cierra; 2.º toque despierta y abre el menú */
function isleSleepInit() {
  if (!S.user || ISLE_ST.u === S.user) return; ISLE_ST.u = S.user; const k = uk('seen'), v = LS.get(k, null), now = Date.now();
  const sleep = !!(v && v.sleep) || !!(v && v.t && now - v.t >= 3 * 864e5); ISLE_ST.sleep = sleep; ISLE_ST.taps = 0; ISLE_ST.seenAt = now; LS.set(k, { t: now, sleep }); ISLE.classList.toggle('sleep', sleep);
}
function isleSeen() { if (!S.user || Date.now() - ISLE_ST.seenAt < 60000) return; ISLE_ST.seenAt = Date.now(); LS.set(uk('seen'), { t: ISLE_ST.seenAt, sleep: ISLE_ST.sleep }); }
function isleTap() {
  if (!ISLE_ST.sleep) return isleToggle(!ISLE_ST.open);
  ISLE_ST.taps++;
  if (ISLE_ST.taps === 1) { ISLE.classList.add('peek'); clearTimeout(ISLE_ST.pkT); ISLE_ST.pkT = setTimeout(() => ISLE.classList.remove('peek'), 1500); return; }
  clearTimeout(ISLE_ST.pkT); ISLE_ST.sleep = false; ISLE_ST.taps = 0; ISLE.classList.remove('sleep', 'peek'); ISLE.classList.add('wake'); LS.set(uk('seen'), { t: Date.now(), sleep: false });
  setTimeout(() => ISLE.classList.remove('wake'), 800); setTimeout(() => { if (!ISLE_ST.sleep) isleToggle(true); }, 520);
}
/** Para probar (solo Owner): fuerza la animación sin esperar 3 días */
function isleTest(what) {
  if (!ISLE) { isleSync(); } if (!ISLE) return; if (ISLE_ST.open) isleToggle(false);
  if (what === 'dizzy') { isleDizzy(); return; }
  ISLE_ST.sleep = true; ISLE_ST.taps = 0; ISLE.classList.remove('peek', 'wake', 'dizzy'); ISLE.classList.add('sleep');
}
const isleTop = () => 4;
const isleBottom = () => innerHeight - 140;
function isleGo(k) {
  if (k === 'msg') go('/messages'); else if (k === 'noti') go('/notifications'); else if (k === 'set') go('/settings'); else if (k === 'mod') go('/moderation');
  else if (k === 'find') { go('/'); setTimeout(() => { SEARCH_OPEN = true; syncSearch(); focusSearch(); const b = $('[data-act=search-toggle]'); if (b) b.setAttribute('aria-expanded', 'true'); }, 60); }
}
function isleFill() {
  const body = ISLE.querySelector('.isle-body');
  const ops = isleOps(); body.classList.toggle('five', ops.length > 4);
  body.innerHTML = ops.map(o => { const n = o.n(); return `<button type="button" class="isle-op" role="menuitem" data-isle="${o.k}"><span class="isle-ic">${o.ic()}</span><span class="isle-l">${esc(t(o.l))}</span>${n ? `<b class="isle-n">${n > 99 ? '99+' : n}</b>` : '<b class="isle-n" style="visibility:hidden">0</b>'}</button>`; }).join('');
}
/** En pantallas anchas la isla se pega al borde del contenido (no al borde lejano de la ventana) */
function isleEdges() {
  if (innerWidth < 900) return { l: 8, r: innerWidth - ISLE_W - 8 };
  const w = Math.min(1100, innerWidth - 32), l0 = (innerWidth - w) / 2;
  return { l: Math.max(8, Math.round(l0 - ISLE_W - 14)), r: Math.min(innerWidth - ISLE_W - 8, Math.round(l0 + w + 14)) };
}
function isleLayout() {
  if (!ISLE) return; const s = isleSaved(), W = Math.min(ISLE.querySelector('.isle-body').classList.contains('five') ? (innerWidth >= 900 ? 420 : 360) : (innerWidth >= 900 ? 380 : 330), innerWidth - 20), st = ISLE_ST;
  const y = Math.max(isleTop(), Math.min(isleBottom(), s.y)), E = isleEdges(), x = s.side === 'l' ? E.l : E.r;
  ISLE.classList.toggle('left', s.side === 'l');
  if (!st.open) { ISLE.style.cssText = `left:${x}px;top:${y}px;width:${ISLE_W}px;height:${ISLE_H}px`; return; }
  const H = ISLE_H + ISLE.querySelector('.isle-body').scrollHeight + 6, left = Math.max(10, Math.min(innerWidth - W - 10, x + ISLE_W / 2 - W / 2)), top = y + H > innerHeight - 80 ? Math.max(isleTop(), y + ISLE_H - H) : y;
  ISLE.style.cssText = `left:${left}px;top:${top}px;width:${W}px;height:${H}px`;
}
function isleToggle(open) {
  if (!ISLE) return; ISLE_ST.open = open; if (open) { isleFill(); }
  ISLE.classList.toggle('open', open); const head = ISLE.querySelector('.isle-head'); head.setAttribute('aria-expanded', open); ISLE.querySelector('.isle-body').setAttribute('aria-hidden', !open);
  isleLayout();
}
/** Se llama después de cada dibujado: muestra u oculta la isla y refresca el aviso */
function isleSync() {
  const hide = isleHidden(); if (hide && !ISLE) return; const el = isleBuild();
  if (ISLE_ST.open) isleToggle(false);
  isleSleepInit(); isleSeen(); el.classList.toggle('off', hide); el.inert = hide; if (hide) return;
  el.classList.toggle('ping', (unread() + dmUnread()) > 0); isleLayout();
}
document.addEventListener('input', e => { if (e.target && e.target.id === 'w-title') { const bt = document.getElementById('nb-bt'); if (bt) bt.textContent = e.target.value; } });
/* ---------- Imágenes marcadas por la IA ----------
   La función "moderate-image" revisa las imágenes subidas. Si marca una, queda oculta para todos (relleno en su lugar).
   La autoría puede pedir revisión humana ("es un error"); el equipo la aprueba o rechaza en Moderación › Imágenes. */
const IMGK = 'auri.imghid', IMGC = 'auri.imgchk';
let IMG_HID = new Set(LS.get(IMGK, [])), IMG_MINE = [], IMG_Q = [], IMG_BUSY = false, IMG_SW = 0, IMG_QL = 0;
const imgOn = () => !!(cloud() && sbSes() && S.user && !isGuest());
const IMG_KIND = { avatar: 'Foto de perfil', banner: 'Portada del perfil', cover: 'Portada de libro', chapter: 'Portada de capítulo' };
/** Cambia en la pantalla las imágenes ocultas por su relleno (se llama después de dibujar) */
function imgGuard(root) {
  if (!IMG_HID.size) return; root = root || document;
  root.querySelectorAll('img').forEach(im => {
    if (im.closest('[data-noguard]') || !IMG_HID.has(im.getAttribute('src'))) return;
    if (im.closest('.avatar')) { im.replaceWith(document.createTextNode(im.dataset.i || '?')); return; }
    if (im.classList.contains('cover-img')) { const sp = document.createElement('span'); sp.className = 'cover-title'; sp.textContent = im.dataset.t || ''; im.replaceWith(sp); return; }
    im.remove();
  });
  root.querySelectorAll('[style*="url("]').forEach(el => {
    if (el.closest('[data-noguard]')) return; const st = el.getAttribute('style') || '';
    for (const u of IMG_HID) if (st.includes(u)) { el.style.backgroundImage = 'none'; break; }
  });
}
async function imgSyncHidden() {
  const r = await sbApi('/rest/v1/rpc/img_hidden', { method: 'POST', body: {} }); if (!r.ok || !Array.isArray(r.data)) return false;
  const a = [...r.data].sort().join('|'), b = [...IMG_HID].sort().join('|'); if (a === b) return false;
  IMG_HID = new Set(r.data); LS.set(IMGK, r.data); return true;
}
function imgOwnUrls() {
  const ses = sbSes(), pre = IMG_PUB() + (ses && ses.uid) + '/', u = getUsers()[S.user] || {}, l = [u.avatar, u.banner];
  allStories().filter(s => s.owner === S.user).forEach(s => { l.push(s.cover); (s.chapters || []).forEach(c => l.push(c.cover)); });
  return [...new Set(l.filter(x => typeof x === 'string' && x.startsWith(pre)))];
}
/** Manda a revisar las imágenes propias que aún no se revisaron */
async function imgSweep() {
  if (IMG_BUSY || !imgOn()) return; const done = LS.get(IMGC, {}), need = imgOwnUrls().filter(x => !done[x]); if (!need.length) return;
  IMG_BUSY = true; let bad = false;
  try {
    for (let i = 0; i < need.length; i += 8) {
      const r = await sbApi('/functions/v1/moderate-image', { method: 'POST', body: { urls: need.slice(i, i + 8) } });
      if (!r.ok || !r.data || !r.data.results) break; if (r.data.off) break;
      for (const [u, v] of Object.entries(r.data.results)) { if (v === 'unlinked' || v === 'error') continue; done[u] = 1; if (v !== 'ok') bad = true; }
    }
    LS.set(IMGC, done);
  } catch (e) { /* se reintenta luego */ }
  IMG_BUSY = false;
  if (bad) { await imgSyncHidden(); await imgLoadMine(); toast(t('Una de tus imágenes fue marcada. Revisa el aviso en tu perfil.')); softRender(true); }
}
const imgSweepSoon = () => { clearTimeout(IMG_SW); IMG_SW = setTimeout(imgSweep, 6000); };
async function imgLoadMine() { if (!imgOn()) return; const r = await sbApi('/rest/v1/rpc/img_mine', { method: 'POST', body: {} }); if (r.ok && Array.isArray(r.data)) IMG_MINE = r.data; }
const imgOpen = () => IMG_MINE.filter(r => r.status === 'flagged' || r.status === 'appealed' || r.status === 'rejected');
async function imgLoadQueue(force) {
  if (!imgOn() || !isStaff()) { IMG_Q = []; return; } if (!force && Date.now() - IMG_QL < 30000) return; IMG_QL = Date.now();
  const r = await sbApi('/rest/v1/rpc/img_queue', { method: 'POST', body: {} }); if (!r.ok || !Array.isArray(r.data)) return;
  if (JSON.stringify(r.data) !== JSON.stringify(IMG_Q)) { IMG_Q = r.data; softRender(); }
}
const imgPending = () => IMG_Q.filter(r => r.status === 'appealed' || (r.status === 'reported' && !r.handled_at) || (r.severity === 'hard' && !r.handled_at)).length;
const imgReasons = r => ((r.reasons && r.reasons.reasons) || []).map(x => esc(t(x.label))).join(', ');
const imgPrev = r => `<span class="img-prev" data-noguard><img src="${esc(r.url)}" alt="" loading="lazy"></span>`;
/** Ficha de una imagen para el equipo */
function imgStaffCard(r) {
  const done = !!r.handled_at, st = r.status === 'reported' ? t('Reportada por {n} cuentas', { n: r.n_reports || IMGR_MIN }) : r.status === 'approved' ? t('Aprobada') : r.status === 'rejected' ? (done ? t('Rechazada') : t('Rechazada por la IA (muy grave)')) : t('Apelada');
  const own = r.owner === (sbSes() && sbSes().uid) && !isOwner();
  return `<article class="panel img-card">${imgPrev(r)}<div class="img-info"><b>${esc(r.owner_name || '')}</b><span class="story-meta">${t(IMG_KIND[r.kind] || 'Imagen')} · ${st}</span>
  ${r.status === 'reported' ? `<small class="helper">${t('Reportada por la comunidad.')}</small>` : ''}${imgReasons(r) ? `<small class="helper">${t('La IA marcó:')} ${imgReasons(r)}</small>` : ''}${r.note ? `<p class="img-note">“${esc(r.note)}”</p>` : ''}${done && r.reason ? `<small class="helper">${t('Motivo:')} ${esc(r.reason)}</small>` : ''}
  ${own ? `<small class="helper">${t('Es tu imagen: la revisa otra persona del equipo.')}</small>` : `<div class="mod-actions"><button class="button" data-act="img-ok" data-id="${encodeURIComponent(r.url)}">${t('✓ Aprobar')}</button><button class="button danger" data-act="img-no" data-id="${encodeURIComponent(r.url)}">${t('✕ Rechazar')}</button></div>`}</div></article>`;
}
function imagesView(tabs) {
  imgLoadQueue(true); const open = IMG_Q.filter(r => !r.handled_at), done = IMG_Q.filter(r => r.handled_at);
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('Imágenes')}</span><h2 style="margin-top:8px">${t('Imágenes por revisar')} (${open.length})</h2><p>${t('La IA ocultó estas imágenes. Si la autoría dice que fue un error, decide tú: aprobar la muestra para todos o rechazarla con un motivo.')}</p></div></div>
  ${open.length ? open.map(imgStaffCard).join('') : empty('Nada por revisar', 'Cuando alguien marque una imagen como error, aparecerá aquí.')}
  ${done.length ? `<h3 style="margin:22px 0 8px">${t('Atendidas (últimos 14 días)')}</h3>${done.map(imgStaffCard).join('')}` : ''}</main>`;
}
/** Dentro de la revisión de un libro: sus imágenes apeladas */
function modBookImgs(s) {
  const l = IMG_Q.filter(r => !r.handled_at && r.story_id && sBack(r.story_id) === s.id); if (!l.length) return '';
  return `<h3 style="margin:18px 0 8px">${t('Imágenes apeladas de este libro')} (${l.length})</h3>${l.map(imgStaffCard).join('')}`;
}
function imgDecide(url, ok) {
  const go1 = async reason => {
    const r = await sbApi('/rest/v1/rpc/img_decide', { method: 'POST', body: { p_url: url, p_ok: ok, p_reason: reason || '' } });
    if (!r.ok) return modErr(r);
    toast(ok ? t('Imagen aprobada') : t('Imagen rechazada')); IMG_QL = 0; await Promise.all([imgSyncHidden(), imgLoadQueue(true)]); KEEP = true; render(); return '';
  };
  if (ok) return go1('');
  formModal(t('Rechazar imagen'), `<p class="helper">${t('La persona verá este motivo.')}</p><textarea class="textarea" data-reason maxlength="300" placeholder="${esc(t('Escribe el motivo del rechazo…'))}"></textarea>`, 'Rechazar', m => go1(m.querySelector('[data-reason]').value), true);
}
/** Pantalla de la autoría: sus imágenes marcadas */
function imagesMineView() {
  imgLoadMine().then(() => { if (/^#\/images/.test(location.hash) && JSON.stringify(imgOpen()) !== IMG_SHOWN) softRender(); });
  const l = imgOpen(); IMG_SHOWN = JSON.stringify(l);
  const row = r => {
    const hard = r.severity === 'hard', st = r.status === 'appealed' ? t('En revisión por una persona del equipo') : r.status === 'rejected' ? (hard && !r.handled_at ? t('Rechazada por la IA') : t('Rechazada por el equipo')) : t('Oculta por la IA');
    return `<article class="panel img-card">${imgPrev(r)}<div class="img-info"><span class="story-meta">${t(IMG_KIND[r.kind] || 'Imagen')}</span><b class="img-st">${st}</b>
    ${imgReasons(r) ? `<small class="helper">${t('Motivo:')} ${imgReasons(r)}</small>` : ''}${r.reason ? `<small class="helper">${t('Motivo del equipo:')} ${esc(r.reason)}</small>` : ''}
    ${r.status === 'flagged' && !hard ? `<button class="button" data-act="img-appeal" data-id="${encodeURIComponent(r.url)}">${t('Es un error, que la revise una persona')}</button>` : ''}
    ${r.status === 'flagged' && hard ? `<small class="helper">${t('Esta imagen no se puede apelar. Puedes subir otra.')}</small>` : ''}</div></article>`;
  };
  return `<main class="page story-layout"><div class="set-head"><a class="icon-btn" href="#/profile" data-dir="prev" aria-label="${esc(t('Volver'))}">‹</a><h2>${t('Mis imágenes')}</h2></div>
  <p class="helper" style="margin-bottom:12px">${t('Estas imágenes no se muestran a nadie hasta que se revisen. Tus libros y capítulos siguen su camino normal, solo sin la imagen.')}</p>
  ${l.length ? l.map(row).join('') : empty('Todo en orden', 'No tienes imágenes marcadas.')}</main>`;
}
let IMG_SHOWN = '';
function imgAppeal(url) {
  formModal(t('Pedir revisión'), `<p class="helper">${t('Una persona del equipo verá la imagen y decidirá. Solo puedes pedirlo una vez por imagen.')}</p><textarea class="textarea" data-note maxlength="300" placeholder="${esc(t('Cuéntanos qué es (opcional)…'))}"></textarea>`, 'Enviar',
    async m => { const r = await sbApi('/rest/v1/rpc/img_appeal', { method: 'POST', body: { p_url: url, p_note: m.querySelector('[data-note]').value } }); if (!r.ok) return modErr(r); toast(t('Enviado. Te avisaremos cuando se revise.')); await imgLoadMine(); await imgSyncHidden(); KEEP = true; render(); return ''; });
}
setInterval(() => { if (document.visibilityState === 'visible' && imgOn()) { imgSweep(); imgSyncHidden().then(c => c && softRender(true)); if (isStaff()) imgLoadQueue(); } }, 60000);
setTimeout(() => { if (imgOn()) { imgSyncHidden().then(c => c && softRender(true)); imgLoadMine(); imgSweep(); if (isStaff()) imgLoadQueue(true); } }, 3500);

/* ---------- Reportar imágenes (portada de libro, foto y portada de perfil) ----------
   Con 3 reportes de cuentas distintas llega a Moderación › Imágenes. Con 1 o 2, el equipo ve la cantidad y los motivos al entrar al libro. */
const IMGR_MIN = 3, IMGR_REASONS = ['Contenido sexual', 'Violencia o gore', 'Odio o acoso', 'Imagen de otra persona o robada', 'Otro'];
let IMGR = {};                                            // reportes por libro o cuenta, para el equipo
const imgrOk = u => typeof u === 'string' && !!SB_URL && u.startsWith(IMG_PUB());          // solo se pueden reportar imágenes de la nube
function openImgReport(o) {
  if (isGuest()) return toast(t('Crea una cuenta para reportar.'));
  if (!imgOn() || !imgrOk(o.url)) return toast(t('Esta imagen no se puede reportar.'));
  formModal(t('Reportar imagen'), `<p class="helper">${t('Elige el motivo. Si varias personas la reportan, una persona del equipo la revisa.')}</p><div class="imgr-list">${IMGR_REASONS.map(x => `<label class="imgr-opt"><input type="checkbox" data-r value="${esc(x)}"><span>${esc(t(x))}</span></label>`).join('')}</div><textarea class="textarea" data-note maxlength="300" placeholder="${esc(t('Cuéntanos más (opcional)…'))}"></textarea>`, 'Enviar reporte',
    async m => {
      const reasons = [...m.querySelectorAll('[data-r]:checked')].map(x => x.value); if (!reasons.length) return t('Elige al menos un motivo.');
      const r = await sbApi('/rest/v1/rpc/img_user_report', { method: 'POST', body: { p_url: o.url, p_kind: o.kind || 'other', p_story: o.sid ? sUuid(o.sid) || '' : '', p_reasons: reasons, p_note: m.querySelector('[data-note]').value } });
      if (!r.ok) return modErr(r); toast(t('Gracias, recibimos tu reporte.')); IMGR = {}; IMG_QL = 0; return '';
    }, true);
}
/** Para el equipo: reportes de las imágenes de un libro (o de una cuenta) */
async function imgrLoad(key, sid, owner) {
  if (!imgOn() || !isStaff() || IMGR[key] !== undefined) return; IMGR[key] = [];
  const r = await sbApi('/rest/v1/rpc/img_reports_of', { method: 'POST', body: { p_story: sid ? sUuid(sid) || '' : '', p_owner: owner || null } });
  if (r.ok && Array.isArray(r.data) && r.data.length) { IMGR[key] = r.data; softRender(); }
}
function imgrPanel(s) {
  if (!isStaff() || !imgOn()) return ''; imgrLoad('s:' + s.id, s.id); const l = IMGR['s:' + s.id] || []; if (!l.length) return '';
  return `<section class="panel imgr-panel"><h3>${t('Reportes de imágenes')}</h3>${l.map((x, i) => `<div class="imgr-row"><span class="img-prev" data-noguard><img src="${esc(x.url)}" alt="" loading="lazy"></span><div><b>${t(IMG_KIND[x.kind] || 'Imagen')}</b><small class="helper">${tn(x.n, '{n} reporte', '{n} reportes')}${x.n >= IMGR_MIN ? ' · ' + t('ya está en la cola de Imágenes') : ' · ' + t('faltan {n} para llegar a la cola', { n: IMGR_MIN - x.n })}</small><button type="button" class="link-btn" data-act="imgr-view" data-id="${esc(s.id)}" data-i="${i}">${t('Ver motivos')}</button></div></div>`).join('')}</section>`;
}
function imgrProfile(e) {                                    // equipo: reportes de la foto y la portada de esa cuenta
  const u = getUsers()[e] || {}; if (!isStaff() || !imgOn() || !u.uid) return ''; imgrLoad('u:' + e, '', u.uid); const l = IMGR['u:' + e] || []; if (!l.length) return '';
  return `<section class="panel imgr-panel"><h3>${t('Reportes de imágenes')}</h3>${l.map((x, i) => `<div class="imgr-row"><span class="img-prev" data-noguard><img src="${esc(x.url)}" alt="" loading="lazy"></span><div><b>${t(IMG_KIND[x.kind] || 'Imagen')}</b><small class="helper">${tn(x.n, '{n} reporte', '{n} reportes')}${x.n >= IMGR_MIN ? ' · ' + t('ya está en la cola de Imágenes') : ' · ' + t('faltan {n} para llegar a la cola', { n: IMGR_MIN - x.n })}</small><button type="button" class="link-btn" data-act="imgr-view" data-id="u:${esc(e)}" data-i="${i}">${t('Ver motivos')}</button></div></div>`).join('')}</section>`;
}
function imgrView(key, i) {
  const x = (IMGR[/^u:/.test(key) ? key : 's:' + key] || [])[i]; if (!x) return;
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><h2>${tn(x.n, '{n} reporte', '{n} reportes')}</h2>${(x.items || []).map(it => `<div class="imgr-item"><b>${esc(it.by || '')}</b> <small class="helper">${esc(fmtDate(String(it.at || '').slice(0, 10)) || '')}</small><div>${(it.reasons || []).map(r => `<span class="tag">${esc(t(r))}</span>`).join(' ')}</div>${it.note ? `<p class="img-note">“${esc(it.note)}”</p>` : ''}</div>`).join('')}</div>`;
  m.addEventListener('click', ev => { if (ev.target === m || ev.target.closest('[data-no]')) m.remove(); });
  document.body.appendChild(m);
}
function modView(sub) {
  if (!isStaff()) return `<main class="page">${empty('Sin acceso', 'Solo el equipo de moderación puede entrar aquí.', '<a class="button" href="#/">' + t('Volver') + '</a>')}</main>`;
  const shuf = cfg('modShuffle') !== false, hs = x => { let h = 2166136261; for (const ch of String(x)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };      // orden aleatorio propio de cada persona del equipo (estable al redibujar)
  const books = pendingBooks().filter(s => inScope(commOf(s.owner))).reverse().map(b => [b, hs(S.user + '|' + b.id)]).sort((a, b) => shuf ? a[1] - b[1] : 0).map(x => x[0]).sort((x, y) => (claimOf(x.id) ? 1 : 0) - (claimOf(y.id) ? 1 : 0)), nr = openReports(), na = openAppeals(), nacc = accRows().filter(a => a.open).length, npo = pendingPosts().length, nb = openBugs(), tabs = commBar() + `<div class="tabs" role="tablist"><a class="tab ${['reports', 'appeals', 'accounts', 'log', 'posts', 'gifts', 'bugs', 'images'].includes(sub) ? '' : 'active'}" href="#/moderation">${t('📚 Libros')} ${redN(books.length)}</a><a class="tab ${sub === 'reports' ? 'active' : ''}" href="#/moderation/reports">${t('🚩 Reportes')} ${redN(nr)}</a><a class="tab ${sub === 'accounts' ? 'active' : ''}" href="#/moderation/accounts">${t('👥 Cuentas')} ${redN(nacc)}</a><a class="tab ${sub === 'images' ? 'active' : ''}" href="#/moderation/images">${t('🖼 Imágenes')} ${redN(imgPending())}</a>${canBan() ? `<a class="tab ${sub === 'posts' ? 'active' : ''}" href="#/moderation/posts">${t('📣 Publicaciones')} ${redN(npo)}</a>` : ''}${canBan() ? `<a class="tab ${sub === 'appeals' ? 'active' : ''}" href="#/moderation/appeals">${t('📨 Apelaciones')} ${redN(na)}</a>` : ''}${isOwner() ? `<a class="tab ${sub === 'bugs' ? 'active' : ''}" href="#/moderation/bugs">${t('🐞 Errores')} ${redN(nb)}</a><a class="tab ${sub === 'gifts' ? 'active' : ''}" href="#/moderation/gifts">${t('🎁 Regalos')}</a><a class="tab ${sub === 'log' ? 'active' : ''}" href="#/moderation/log">${t('📋 Registro')}</a>` : ''}</div>`;
  if (sub === 'images') return imagesView(tabs);
  if (sub === 'reports') return reportsView(tabs);
  if (sub === 'appeals' && canBan()) return appealsView(tabs);
  if (sub === 'accounts') return accountsView(tabs);
  if (sub === 'posts' && canBan()) return postsView(tabs);
  if (sub === 'bugs' && isOwner()) return bugsView(tabs);
  if (sub === 'log' && isOwner()) return logView(tabs);
  if (sub === 'gifts' && isOwner()) return giftsView(tabs);
  return `<main class="page story-layout">${tabs}<div class="section-head mod-head" style="margin-top:0"><div><span class="eyebrow">${t('🛡 Moderación')}</span><h2 style="margin-top:8px">${t('Libros por revisar')} (${books.length})</h2><p>${t('Una ficha por libro. Toca uno para ver sus capítulos. Los nuevos se aprueban en orden: 1, 2, 3…')}</p>${books.length > 1 ? `<button type="button" class="mod-sorter" data-act="mod-order">${shuf ? t('🎲 Orden aleatorio para ti · cambiar a más recientes') : t('🕒 Más recientes primero · cambiar a orden aleatorio')}</button>` : ''}</div></div>
  ${books.length ? '' : `<p class="notice" style="margin-bottom:14px">${t('No hay libros en revisión en este navegador. Por ahora cada navegador o dispositivo guarda sus propios datos: un libro enviado desde otro teléfono, navegador o editor no llega hasta aquí. Para que lleguen entre dispositivos hace falta el servidor.')}</p>`}
  ${books.length ? `<div class="mod-cards">${books.map(modBookCard).join('')}</div>` : empty('Nada por revisar', 'Cuando alguien envíe un capítulo, su libro aparecerá aquí.')}${reportsPanel()}</main>`;
}

/* --- Diálogos genéricos --- */
function dialog(title, text, yes, no, onYes, danger) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box mini-box" role="alertdialog" aria-modal="true"><h2>${esc(t(title))}</h2><p class="helper">${esc(t(text))}</p><div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">${esc(t(no))}</button><button class="button ${danger ? 'danger' : ''}" data-yes style="flex:1">${esc(t(yes))}</button></div></div>`;
  m.querySelector('[data-no]').onclick = () => m.remove(); m.querySelector('[data-yes]').onclick = () => { m.remove(); onYes(); };
  document.body.appendChild(m);
}
/** Doble confirmación: el botón solo se activa al escribir la palabra pedida */
function typeConfirm(title, text, word, yes, onYes) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box mini-box" role="alertdialog" aria-modal="true"><h2>${esc(t(title))}</h2><p class="helper">${esc(t(text, { w: word }))}</p><input class="field" data-word autocomplete="off" placeholder="${esc(word)}" style="margin-top:12px"><div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">${t('Cancelar')}</button><button class="button danger" data-yes style="flex:1">${esc(t(yes))}</button></div></div>`;
  const inp = m.querySelector('[data-word]'), btn = m.querySelector('[data-yes]'); btn.disabled = true;
  inp.oninput = () => { btn.disabled = inp.value.trim().toUpperCase() !== word; };
  btn.onclick = () => { if (btn.disabled) return; m.remove(); onYes(); };
  m.querySelector('[data-no]').onclick = () => m.remove();
  document.body.appendChild(m);
}
const PRIVACY = `<ol><li><b>Dónde se guardan tus datos.</b> Tu cuenta, historias, biblioteca, personajes y ajustes se guardan en este dispositivo y en los servidores de Auri (Supabase), para que puedas entrar desde otros dispositivos y para que otras personas vean lo que publicas.</li>
<li><b>Qué guardamos.</b> Correo, nombre de usuario, biografía, fotos que subas, tus historias y lo que haces en la app (favoritos, progreso, comentarios, likes, seguidores y mensajes). Las imágenes que subes se guardan en el almacenamiento de Auri y se pueden abrir con su enlace.</li>
<li><b>Anuncios y seguimiento.</b> Auri no muestra anuncios ni te rastrea.</li>
<li><b>Tus derechos.</b> Puedes exportar tus datos, borrar los de este dispositivo o eliminar tu cuenta desde Ajustes, cuando quieras.</li>
<li><b>Otras funciones con IA.</b> Para funciones de IA distintas de la moderación (como el asistente para escribir) te avisaremos antes de enviar tus textos a un servicio externo y te pediremos permiso.</li>
<li><b>Revisión automática con IA.</b> Los capítulos que envías a revisión y las imágenes que subes (foto de perfil, banner y portadas) se envían a un servicio externo de moderación (OpenAI) solo para detectar contenido no permitido. Si una imagen se marca por error, puedes pedir que la revise una persona del equipo. No se usan para entrenar modelos ni para publicidad.</li>
<li><b>Menores.</b> El contenido +18 es solo para personas adultas; por ahora se basa en una declaración.</li></ol>`;
function showPrivacy() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${t('Política de privacidad')}</h2><div class="terms">${trLegal(PRIVACY)}</div><button class="button" data-act="close-modal" style="width:100%;margin-top:14px">${t('Entendido')}</button></div>`;
  document.body.appendChild(m);
}
/* --- Reportes de errores de la app: cualquier cuenta los envía; solo la Owner los ve (Moderación › Errores) --- */
const BUG_KINDS = { error: 'Algo no funciona', visual: 'Algo se ve mal', sugerencia: 'Sugerencia', otro: 'Otro' };
const BUG_ST = { open: 'Nuevo', seen: 'Visto', working: 'En proceso', resolved: 'Resuelto' };
const BUG_DONE = 'Tu reporte de error fue resuelto. ¡Gracias por avisarnos!';
const bugsAll = () => G.get('bugs', []);
const openBugs = () => isOwner() ? bugsAll().filter(b => b.status === 'open').length : 0;
const bugMeta = () => `v${APP_VERSION} · ${innerWidth}x${innerHeight} · ${String(navigator.userAgent || '').replace(/\s+/g, ' ')}`.slice(0, 390);
function cropFree(src, cb) {                       // recorte libre: se arrastra sobre la imagen para marcar la zona
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, Math.min(340, innerWidth - 56) / img.width), cw = Math.max(1, Math.round(img.width * k)), ch = Math.max(1, Math.round(img.height * k));
    const m = document.createElement('div'); m.className = 'modal sheet';
    m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${t('Recorta la parte importante')}</h2><p class="helper">${t('Arrastra sobre la imagen para marcar la zona que quieres mostrar.')}</p><canvas data-cv width="${cw}" height="${ch}" style="width:${cw}px;height:${ch}px;max-width:100%;touch-action:none;border-radius:12px;display:block;margin:12px auto"></canvas><div class="rp-acts" style="justify-content:center"><button class="button" data-ok>${t('Usar recorte')}</button><button class="button secondary" data-all>${t('Usar completa')}</button></div></div>`;
    const cv = m.querySelector('[data-cv]'), g = cv.getContext('2d'); let r = null, st = null;
    const draw = () => { g.drawImage(img, 0, 0, cw, ch); if (r) { g.fillStyle = 'rgba(20,10,35,.55)'; g.fillRect(0, 0, cw, ch); g.drawImage(img, r.x / k, r.y / k, r.w / k, r.h / k, r.x, r.y, r.w, r.h); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(r.x, r.y, r.w, r.h); } };
    const pt = ev => { const b = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(cw, (ev.clientX - b.left) * cw / b.width)), y: Math.max(0, Math.min(ch, (ev.clientY - b.top) * ch / b.height)) }; };
    cv.onpointerdown = ev => { st = pt(ev); r = null; cv.setPointerCapture(ev.pointerId); };
    cv.onpointermove = ev => { if (!st) return; const p = pt(ev); r = { x: Math.min(st.x, p.x), y: Math.min(st.y, p.y), w: Math.abs(p.x - st.x), h: Math.abs(p.y - st.y) }; draw(); };
    cv.onpointerup = () => { st = null; if (r && (r.w < 12 || r.h < 12)) { r = null; draw(); } };
    const done = full => { const o = document.createElement('canvas'), q = (!full && r) ? { x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k } : { x: 0, y: 0, w: img.width, h: img.height }, z = Math.min(1, 1200 / Math.max(q.w, q.h)); o.width = Math.max(1, Math.round(q.w * z)); o.height = Math.max(1, Math.round(q.h * z)); o.getContext('2d').drawImage(img, q.x, q.y, q.w, q.h, 0, 0, o.width, o.height); m.remove(); cb(o.toDataURL('image/jpeg', .78)); };
    m.querySelector('[data-ok]').onclick = () => done(false); m.querySelector('[data-all]').onclick = () => done(true); m.onclick = ev => { if (ev.target === m) m.remove(); };
    draw(); document.body.appendChild(m);
  };
  img.src = src;
}
async function sendBug(o) {
  const meta = bugMeta();
  if (modCloud()) {
    const imgs = await sbImgConv(o.imgs);
    const r = await sbApi('/rest/v1/bug_reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { kind: o.kind, text: o.text, imgs, screen: o.screen, meta } });
    if (!r.ok) return r.status === 403 || r.status === 401 ? t('Llegaste al límite de reportes de hoy. Inténtalo mañana.') : modErr(r);
    if (isOwner()) await sbBugs(); return '';
  }
  G.set('bugs', [{ id: 'b' + Date.now(), by: S.user, kind: o.kind, text: o.text, imgs: o.imgs, screen: o.screen, meta, status: 'open', note: '', date: new Date().toISOString() }, ...bugsAll()]); return '';
}
function openReport() {
  if (isGuest()) return toast(t('Inicia sesión para reportar un error.'));
  const screen = String(location.hash || '#/').slice(0, 190), imgs = []; let kind = 'error';
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(t('Reportar un error'))}"><button class="icon-btn close-x" data-x aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Reportar un error')}</h2><p class="helper">${t('Cuéntanos qué pasó. Puedes adjuntar capturas y recortar la parte donde ves el error. Solo lo verá la dueña de Auri.')}</p>
  <div class="filter-row" data-kinds style="margin-top:10px">${Object.keys(BUG_KINDS).map(k => `<button type="button" class="chip ${k === kind ? 'active' : ''}" data-k="${k}">${t(BUG_KINDS[k])}</button>`).join('')}</div>
  <textarea class="textarea" data-text maxlength="1500" placeholder="${esc(t('Describe qué hacías y qué salió mal…'))}" style="margin-top:8px"></textarea><div class="ap-imgs" data-imgs></div>
  <label class="button secondary sm" style="cursor:pointer;margin-top:8px">${t('Adjuntar capturas')}<input type="file" accept="image/*" multiple data-file hidden></label><p class="helper" style="margin:6px 0 0">${t('Hasta 4 imágenes.')}</p><p class="error" data-err></p><button class="button" data-send style="width:100%;margin-top:6px">${t('Enviar')}</button></div>`;
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = ev => { if (ev.target === m) m.remove(); };
  const paintI = () => { m.querySelector('[data-imgs]').innerHTML = imgs.map((d, k) => `<span class="ap-th"><img src="${esc(d)}" alt="${esc(t('Captura {n}', { n: k + 1 }))}"><button type="button" data-rm="${k}" aria-label="${esc(t('Quitar imagen'))}">✕</button><button type="button" class="ap-crop" data-crop="${k}" aria-label="${esc(t('Recortar'))}">✂</button></span>`).join(''); };
  m.querySelector('[data-file]').onchange = ev => { [...ev.target.files].slice(0, 4 - imgs.length).forEach(f => fitPhoto(f, 1400, 1400, d => { if (imgs.length < 4) { imgs.push(d); paintI(); } }, .78)); ev.target.value = ''; };
  m.addEventListener('click', ev => {
    const r = ev.target.closest('[data-rm]'), c = ev.target.closest('[data-crop]'), kb = ev.target.closest('[data-k]');
    if (r) { imgs.splice(+r.dataset.rm, 1); paintI(); }
    if (c) { const i = +c.dataset.crop; cropFree(imgs[i], d => { imgs[i] = d; paintI(); }); }
    if (kb) { kind = kb.dataset.k; m.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('active', x === kb)); }
  });
  m.querySelector('[data-send]').onclick = async ev => {
    const text = m.querySelector('[data-text]').value.trim(), err = m.querySelector('[data-err]'); err.textContent = '';
    if (!text) { err.textContent = t('Escribe qué pasó.'); return; }
    const b = ev.currentTarget; b.disabled = true; b.textContent = t('Enviando…');
    const e = await sendBug({ kind, text, imgs, screen });
    if (e) { err.textContent = e; b.disabled = false; b.textContent = t('Enviar'); return; }
    m.remove(); toast(t('Gracias, recibimos tu reporte ✓'));
  };
  document.body.appendChild(m);
}
async function sbBugs() {                           // la Owner trae todos los reportes de errores
  if (!modCloud() || !isOwner()) return false;
  const r = await sbApi('/rest/v1/bug_reports?select=*&order=created_at.desc&limit=500'); if (!r.ok || !Array.isArray(r.data)) return false;
  const ids = await sbKnow(r.data.map(x => x.by).filter(isUuid));
  const L = r.data.map(x => ({ id: x.id, by: ids.key(x.by) || '', kind: x.kind, text: x.text, imgs: x.imgs || [], screen: x.screen || '', meta: x.meta || '', status: x.status, note: x.note || '', date: x.created_at }));
  if (JSON.stringify(L) === JSON.stringify(bugsAll())) return false; G.set('bugs', L); return true;
}
async function bugSet(id, st, note) {
  if (modCloud() && isUuid(id)) { const r = await sbApi('/rest/v1/bug_reports?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { status: st, note: note || '' } }); if (!r.ok) return modErr(r); await sbBugs(); return ''; }
  const L = bugsAll().map(b => b.id === id ? { ...b, status: st, note: note || b.note || '' } : b); G.set('bugs', L);
  const b = L.find(x => x.id === id); if (st === 'resolved' && b && b.by && b.by !== S.user) pushNotif(b.by, { type: 'sys', extra: BUG_DONE }); return '';
}
let BUGF = 'open';
function bugCard(b) {
  const th = (b.imgs || []).filter(safeImg).map((d, k) => `<button type="button" class="ap-th" data-act="bug-img" data-id="${esc(b.id)}" data-n="${k}"><img src="${esc(d)}" alt="${esc(t('Captura {n}', { n: k + 1 }))}"></button>`).join('');
  const fd = new Date(b.date).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const btn = (st, label) => b.status === st ? '' : `<button type="button" class="button ${st === 'resolved' ? '' : 'secondary'} sm" data-act="bug-set" data-id="${esc(b.id)}" data-st="${st}">${t(label)}</button>`;
  return `<article class="panel bug-card" style="margin-bottom:12px"><div class="bug-top"><span class="pill">${t(BUG_KINDS[b.kind] || 'Otro')}</span><span class="pill bug-${b.status}">${t(BUG_ST[b.status] || 'Nuevo')}</span><time class="helper">${esc(fd)}</time></div>
  <p class="bug-text">${esc(b.text)}</p>${th ? `<div class="ap-imgs">${th}</div>` : ''}<p class="helper" style="margin:8px 0 0">${esc(uName(b.by))} · ${esc(b.screen)}</p>
  <details style="margin-top:4px"><summary class="helper">${t('Datos técnicos')}</summary><p class="helper" style="overflow-wrap:anywhere">${esc(b.meta)}</p></details>
  <textarea class="textarea" data-note rows="2" maxlength="600" placeholder="${esc(t('Nota (opcional)'))}" style="margin-top:8px">${esc(b.note || '')}</textarea>
  <div class="rp-acts" style="margin-top:8px">${btn('seen', 'Marcar visto')}${btn('working', 'En proceso')}${btn('resolved', 'Resuelto')}<button type="button" class="icon-btn" data-act="bug-del" data-id="${esc(b.id)}" aria-label="${esc(t('Eliminar reporte'))}">${TRASH}</button></div></article>`;
}
function bugsView(tabs) {
  const all = bugsAll(), cnt = f => all.filter(b => f === 'open' ? b.status === 'open' : f === 'work' ? (b.status === 'seen' || b.status === 'working') : b.status === 'resolved').length;
  const l = all.filter(b => BUGF === 'open' ? b.status === 'open' : BUGF === 'work' ? (b.status === 'seen' || b.status === 'working') : b.status === 'resolved');
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('🐞 Errores')}</span><h2 style="margin-top:8px">${t('Reportes de errores')}</h2><p>${t('Lo que las personas encuentran en la app. Al marcar uno como resuelto, quien lo envió recibe un aviso.')}</p></div></div>
  <div class="filter-row">${[['open', 'Nuevos'], ['work', 'En proceso'], ['done', 'Resueltos']].map(([k, n]) => `<button class="chip ${BUGF === k ? 'active' : ''}" data-act="bug-filter" data-id="${k}">${t(n)} (${cnt(k)})</button>`).join('')}</div>
  ${l.length ? l.map(bugCard).join('') : empty('Nada por aquí', 'Cuando alguien reporte un error, aparecerá en esta lista.')}</main>`;
}
const REASONS_USER = ['Acoso, odio o amenazas', 'Pide datos personales o fotos', 'Contenido sexual con menores', 'Sospecha de edad falsa', 'Suplantación de identidad', 'Spam o publicidad', 'Otro motivo'];
const REASONS = ['Contenido sexual con menores', 'Contenido sexual explícito', 'Acoso, odio o amenazas', 'Violencia extrema', 'Plagio o copia', 'Spam o publicidad', 'Datos personales de alguien', 'Mal etiquetado (+18 o spoilers)', 'Otro motivo'];
const reportsAll = () => G.get('reports', []);
const openReports = () => reportsAll().filter(r => (r.status || 'open') === 'open' && inScope(commOf(accOf(r) || r.by))).length;
function openReportFor(type, o) {
  const RS = type === 'user' ? REASONS_USER : REASONS, imgs = [];
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(t('Reportar'))}"><button class="icon-btn close-x" data-x aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Reportar {l}', { l: esc(o.label) })}</h2><p class="helper">${t('Marca lo que incumple las normas y, si quieres, cuéntanos más. Lo revisará el equipo de moderación.')}</p>
  <div class="rp-reasons">${RS.map((r, i) => `<label class="check"><input type="checkbox" value="${i}"><span>${esc(t(r))}</span></label>`).join('')}</div>
  <textarea class="textarea" data-text maxlength="600" placeholder="${esc(t('Explica qué pasó (opcional si marcaste un motivo)…'))}" style="margin-top:8px"></textarea><div class="ap-imgs" data-imgs></div><label class="button secondary sm" style="cursor:pointer;margin-top:8px">${t('Adjuntar pruebas (fotos o capturas)')}<input type="file" accept="image/*" multiple data-file hidden></label><p class="helper" style="margin:6px 0 0">${t('Hasta 4 imágenes. Solo las verá el equipo de moderación.')}</p><p class="error" data-err></p><button class="button" data-send style="width:100%;margin-top:6px">${t('Enviar reporte')}</button></div>`;
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = ev => { if (ev.target === m) m.remove(); };
  const paintI = () => { m.querySelector('[data-imgs]').innerHTML = imgs.map((d, k) => `<span class="ap-th"><img src="${esc(d)}" alt="${esc(t('Prueba {n}', { n: k + 1 }))}"><button type="button" data-rm="${k}" aria-label="${esc(t('Quitar imagen'))}">✕</button></span>`).join(''); };
  m.querySelector('[data-file]').onchange = ev => { [...ev.target.files].slice(0, 4 - imgs.length).forEach(f => fitPhoto(f, 1000, 1000, d => { if (imgs.length < 4) { imgs.push(d); paintI(); } }, .7)); ev.target.value = ''; };
  m.addEventListener('click', ev => { const r = ev.target.closest('[data-rm]'); if (r) { imgs.splice(+r.dataset.rm, 1); paintI(); } });
  m.querySelector('[data-send]').onclick = () => {
    const reasons = [...m.querySelectorAll('input:checked')].map(i => RS[+i.value]), text = m.querySelector('[data-text]').value.trim();
    if (!reasons.length && !text) { m.querySelector('[data-err]').textContent = t('Marca un motivo o escribe qué pasó.'); return; }
    if (reportsAll().some(r => r.by === S.user && r.type === type && r.sid === o.sid && String(r.cid || '') === String(o.cid || '') && r.target === o.target && (r.status || 'open') === 'open')) { m.remove(); return toast('Ya reportaste esto: el equipo lo está revisando.'); }
    if (modCloud()) { const bt = m.querySelector('[data-send]'); bt.disabled = true; modReport({ type, imgs, sid: o.sid || '', cid: o.cid || '', ci: o.ci, target: o.target || '', owner: o.owner || '', title: o.title || '', excerpt: String(o.excerpt || '').slice(0, 200), reasons, text, label: o.label || '' }).then(e => { if (e) { bt.disabled = false; m.querySelector('[data-err]').textContent = e; return; } m.remove(); toast(t('Gracias, recibimos tu reporte ✓')); }); return; }
    if (!G.set('reports', [{ id: Date.now(), by: S.user, type, imgs, sid: o.sid || '', cid: o.cid || '', ci: o.ci, target: o.target || '', owner: o.owner || '', title: o.title || '', excerpt: String(o.excerpt || '').slice(0, 200), reasons, text, date: today(), status: 'open' }, ...reportsAll()])) { m.querySelector('[data-err]').textContent = t('No se pudo guardar el reporte (las imágenes pesan demasiado). Prueba con menos imágenes.'); return; }
    m.remove(); toast(t('Gracias, recibimos tu reporte ✓'));
  };
  document.body.appendChild(m);
}
const accOf = r => r.type === 'user' ? r.target : r.owner;                       // la cuenta a la que se refiere el reporte
const reportsAbout = e => reportsAll().filter(r => r.type !== 'problem' && r.type !== 'reclass' && accOf(r) === e);
const repImgs = r => (r.imgs || []).length ? `<div class="ap-imgs">${r.imgs.map((d, k) => `<button type="button" class="ap-th" data-act="rp-img" data-id="${r.id}" data-i="${k}" aria-label="${esc(t('Ver prueba {n}', { n: k + 1 }))}"><img src="${esc(d)}" alt="${esc(t('Prueba {n}', { n: k + 1 }))}"></button>`).join('')}</div>` : '';
const rStatus = r => t(({ open: 'Abierto', resolved: 'Resuelto', dismissed: 'Descartado' })[r.status || 'open']);
function showImg(d) { const m = document.createElement('div'); m.className = 'modal sheet'; m.innerHTML = `<div class="modal-box ap-view"><img src="${esc(d)}" alt="${esc(t('Prueba'))}"><button class="button ghost" data-no>${t('Cerrar')}</button></div>`; m.onclick = ev => { if (ev.target === m || ev.target.closest('[data-no]')) m.remove(); }; document.body.appendChild(m); }
function repHistory(e) {                                 // solo Moderación, Administración y Owner: cuántas veces fue reportada la cuenta y por qué
  if (!isStaff() || e === S.user) return ''; const l = reportsAbout(e), open = l.filter(r => (r.status || 'open') === 'open').length, by = new Set(l.map(r => r.by)).size;
  return `<section class="panel rph" aria-label="${esc(t('Reportes recibidos'))}"><div><strong>${t('Reportes recibidos')}</strong><div class="helper">${t('{n} en total', { n: l.length })} · ${tn(open, '{n} abierto', '{n} abiertos')} · ${tn(by, '{n} persona distinta', '{n} personas distintas')}</div></div>
  ${l.length ? l.map(r => `<details class="rph-item"><summary><span class="pill">${t(RTYPE[r.type])}</span><span class="helper">${esc(fmtDate(r.date) || r.date)} · ${rStatus(r)}</span></summary><div class="rph-body">
    ${(r.reasons || []).length ? `<div class="tags rp-why">${r.reasons.map(x => `<span class="tag">${esc(t(x))}</span>`).join('')}</div>` : ''}
    ${r.title || r.excerpt ? `<p class="helper">${esc(r.title || '')}${r.excerpt ? ' “' + esc(r.excerpt) + '”' : ''}</p>` : ''}${r.text ? `<p class="rp-text">${esc(r.text)}</p>` : ''}${repImgs(r)}
    <p class="helper">${t('Reportó {n}', { n: esc(uName(r.by)) })}${r.handledBy ? ` · ${t('atendido por {n} el {d}', { n: esc(uName(r.handledBy)), d: esc(fmtDate(r.handledDate) || r.handledDate || '') })}` : ''}</p></div></details>`).join('') : '<p class="helper" style="margin:8px 0 0">' + t('Esta cuenta no tiene reportes.') + '</p>'}
  ${l.length ? `<button type="button" class="link-btn" data-act="acc-reports" data-id="${esc(e)}">${t('Abrir en Reportes')}</button>` : ''}</section>`;
}
let RACC = null;
function accRows() {
  const m = {}; reportsAll().filter(r => r.type !== 'problem' && r.type !== 'reclass').forEach(r => { const e = accOf(r); if (!e || !getUsers()[e]) return;
    const a = m[e] = m[e] || { e, n: 0, open: 0, last: '', by: new Set(), why: {} }; a.n++; if ((r.status || 'open') === 'open') a.open++; if ((r.date || '') > a.last) a.last = r.date || ''; a.by.add(r.by); (r.reasons || []).forEach(x => { a.why[x] = (a.why[x] || 0) + 1; }); });
  return Object.values(m).filter(a => inScope(commOf(a.e))).sort((x, y) => y.open - x.open || y.n - x.n || (y.last > x.last ? 1 : -1));
}
function accountsView(tabs) {
  const l = accRows();
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('Cuentas reportadas')}</span><h2 style="margin-top:8px">${tn(l.length, '{n} cuenta', '{n} cuentas')}</h2><p>${t('Ordenadas por reportes abiertos. Abre una para ver las razones y decidir.')}</p></div></div>
  ${l.length ? l.map(a => { const top = Object.entries(a.why).sort((x, y) => y[1] - x[1]).slice(0, 4), ban = activeBan(a.e), sk = strikesOf(a.e).length, rl = t(ROLE_LABEL[roleOf(a.e)]);
    return `<article class="panel rp acc"><div class="acc-head">${userAvatar(a.e)}<div class="acc-id"><b>${esc(uName(a.e))}</b><span class="helper">${rl ? esc(rl) + ' · ' : ''}${tn(sk, '{n} strike', '{n} strikes')}${ban ? ' · ' + t('suspendida') : ''}</span></div><span class="pill acc-n">${tn(a.n, '{n} reporte', '{n} reportes')}</span></div>
    <p class="helper" style="margin:8px 0 0">${tn(a.open, '{n} abierto', '{n} abiertos')} · ${tn(a.by.size, '{n} persona distinta', '{n} personas distintas')} · ${t('último: {d}', { d: esc(fmtDate(a.last) || a.last) })}</p>
    ${top.length ? `<div class="tags rp-why">${top.map(([x, c]) => `<span class="tag">${esc(t(x))}${c > 1 ? ' ×' + c : ''}</span>`).join('')}</div>` : ''}
    <div class="rp-acts"><a class="button ghost sm" href="#/user/${encodeURIComponent(a.e)}" data-dir="next">${t('Ver perfil')}</a><button type="button" class="button secondary sm" data-act="acc-reports" data-id="${esc(a.e)}">${t('Ver reportes')}</button></div></article>`; }).join('')
    : empty('Ninguna cuenta reportada', 'Cuando alguien reporte un perfil, una obra o un comentario, la cuenta aparecerá aquí con sus razones.')}</main>`;
}
let LOGF = 'all', LOGW = 'all';
const LOGT = { strike: ['Strike', 'strikes'], 'strike-annul': ['Strike anulado', 'strikes'], ban: ['Suspensión o bloqueo', 'susp'], unban: ['Suspensión levantada', 'susp'], 'appeal-release': ['Apelación aceptada', 'susp'], 'appeal-reject': ['Apelación rechazada', 'susp'],
  'report-resolved': ['Reporte resuelto', 'rep'], 'report-dismissed': ['Reporte descartado', 'rep'], 'report-open': ['Reporte reabierto', 'rep'], takedown: ['Obra retirada de Descubrir', 'cont'], restore: ['Obra restaurada', 'cont'], unmature: ['Quitó la marca +18', 'cont'], mark18: ['Marcó como +18', 'cont'],
  'news-post': ['Publicó un anuncio', 'pub'], 'news-edit': ['Editó un anuncio', 'pub'], 'news-del': ['Eliminó un anuncio', 'pub'], 'banner-add': ['Añadió una tarjeta al banner', 'pub'], 'banner-edit': ['Editó una tarjeta del banner', 'pub'], 'banner-del': ['Quitó una tarjeta del banner', 'pub'], 'post-approve': ['Aprobó una publicación', 'pub'], 'post-reject': ['Rechazó una publicación', 'pub'],
  'del-comment': ['Comentario eliminado', 'cont'], 'chapter-approve': ['Capítulo aprobado', 'cont'], 'chapter-reject': ['Capítulo rechazado', 'cont'],
  'scope-set': ['Cambió las comunidades que modera', 'roles'], 'gift-send': ['Regaló un marco', 'gifts'], 'bow-gift': ['Regaló un lazo', 'gifts'], 'bow-take': ['Retiró un lazo', 'gifts'], 'gift-claim': ['Reclamó su marco', 'gifts'], 'gift-expire': ['Regalo vencido (cupo devuelto)', 'gifts'], 'gift-revoke': ['Regalo retirado (cupo devuelto)', 'gifts'] };
const logInfo = t => LOGT[t] || (/^(invite|accept|test-role)/.test(t) ? ['Cambio de rol', 'roles'] : [t, 'otro']);
function logView(tabs) {
  const F = [['all', 'Todo'], ['strikes', 'Strikes'], ['susp', 'Suspensiones'], ['rep', 'Reportes'], ['cont', 'Contenido'], ['pub', 'Publicaciones'], ['gifts', 'Regalos'], ['roles', 'Roles']], all = G.get('modlog', []).filter(x => modSel() === 'all' || !getUsers()[x.target] || commOf(x.target) === modSel()), who = [...new Set(all.map(x => x.by).filter(Boolean))], l = all.filter(x => (LOGF === 'all' || logInfo(x.type)[1] === LOGF) && (LOGW === 'all' || x.by === LOGW));
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('Registro')}</span><h2 style="margin-top:8px">${t('Acciones del equipo')} (${l.length})</h2><p>${t('Solo la Owner ve esta pantalla. Cada acción muestra quién la hizo, aunque haya ocultado su nombre al publicar. Se conservan las últimas 1000.')}</p></div></div>
  <div class="filter-row">${F.map(([k, n]) => `<button class="chip ${LOGF === k ? 'active' : ''}" data-act="log-filter" data-id="${k}">${t(n)}</button>`).join('')}</div>
  <div class="filter-row" style="overflow-x:auto;flex-wrap:nowrap"><button class="chip ${LOGW === 'all' ? 'active' : ''}" data-act="log-who" data-id="all">${t('Todas las personas')}</button>${who.map(e => `<button class="chip ${LOGW === e ? 'active' : ''}" data-act="log-who" data-id="${esc(e)}" style="flex:none">${e === 'sistema' ? t('Sistema') : esc(uName(e))}${ROLE_LABEL[roleOf(e)] ? ' · ' + esc(t(ROLE_LABEL[roleOf(e)])) : ''}</button>`).join('')}</div>
  ${l.length ? `<div class="log-list">${l.map(x => { const tu = getUsers()[x.target], d = new Date(x.date);
    return `<div class="log-row"><div class="log-top"><b>${esc(t(logInfo(x.type)[0]))}</b><time class="helper">${esc(d.toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time></div><div class="helper">${t('Por')} <b>${x.by === 'sistema' ? t('Sistema (automático)') : esc(uName(x.by))}</b>${ROLE_LABEL[roleOf(x.by)] ? ' (' + esc(t(ROLE_LABEL[roleOf(x.by)])) + ')' : ''}${tu ? ` · ${t('sobre')} <a href="#/user/${encodeURIComponent(x.target)}" data-dir="next">${esc(tu.name)}</a>` : ''}</div>${x.extra ? `<div class="log-extra">${esc(t(String(x.extra)))}</div>` : ''}</div>`; }).join('')}</div>`
    : empty('Sin acciones registradas', 'Aquí aparecerán los strikes, suspensiones, reportes atendidos y revisiones de capítulos.')}</main>`;
}
let RFILT = 'open';
const RTYPE = { story: '📖 Obra', comment: '💬 Comentario', pcomment: '💬 Comentario de párrafo', user: '👤 Perfil', problem: '🛠 Problema', reclass: '🏷 Clasificación' };
function rpSet(id, st) {
  if (!isStaff()) return; const l = reportsAll(), i = l.findIndex(r => String(r.id) === String(id)); if (i < 0) return;
  if (isUuid(id) && modCloud()) { modDo('resolve_report', { rid: String(id), st }).then(e => { if (e) toast(e); softRender(true); }); return; }
  l[i] = st === 'open' ? { ...l[i], status: 'open', handledBy: '', handledDate: '' } : { ...l[i], status: st, handledBy: S.user, handledDate: today() };
  G.set('reports', l); logAction('report-' + st, l[i].owner || l[i].target || '', String(id)); KEEP = true; render();
}
function reportCard(r) {
  const ty = r.type || 'problem', open = (r.status || 'open') === 'open', owner = r.owner || '', s = r.sid ? findStory(r.sid) : null, td = r.sid && takedown().includes(r.sid);
  const ctx = ty === 'story' ? `<div class="rp-ctx"><b>${esc(r.title || (s && s.title) || t('Obra'))}</b>${s ? ` · ${t('por {a}', { a: esc(s.author || '') })}${s.mature ? ' · +18' : ''}<div class="tags">${s.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ' · ' + t('ya no está disponible')}${td ? '<div class="helper">' + t('🚩 Retirada de Descubrir') + '</div>' : ''}</div>`
    : ty === 'reclass' ? `<div class="rp-ctx"><b>${esc(r.title || (s && s.title) || t('Obra'))}</b> · ${t('por {a}', { a: esc(uName(owner)) })}<div class="helper">${t('La autoría pide quitar la marca +18 de una obra publicada.')} ${s ? (s.mature ? t('Ahora está marcada +18.') : t('Ya no está marcada +18.')) : t('La obra ya no está disponible.')}</div></div>`
    : ty === 'comment' || ty === 'pcomment' ? `<div class="rp-ctx">${t('{n} escribió: “{x}”', { n: '<b>' + esc(uName(owner)) + '</b>', x: esc(r.excerpt || '') })}${ty === 'comment' && r.sid && !comments(r.sid).some(c => String(c.id) === String(r.cid)) ? '<div class="helper">' + t('Ese comentario ya no existe.') + '</div>' : ''}</div>`
    : ty === 'user' ? `<div class="rp-ctx"><b>${esc(uName(r.target))}</b></div>` : '';
  const link = (ty === 'story' || ty === 'reclass') && s ? `<a class="button secondary sm" href="#/story/${esc(r.sid)}" data-dir="next">${t('📖 Ir a la obra')}</a>` : ty === 'comment' && s ? `<button class="button secondary sm" data-act="rp-comments" data-id="${esc(r.sid)}" data-cid="${esc(r.cid == null ? '' : r.cid)}">${t('📖 Ir al comentario')}</button>` : ty === 'pcomment' && s ? `<a class="button secondary sm" href="#/story/${esc(r.sid)}/${(+r.ci || 0) + 1}" data-dir="next">${t('📖 Ir al párrafo')}</a>` : '';
  const who = ty === 'user' ? r.target : owner;
  return `<article class="panel rp ${open ? '' : 'done'}"><div class="rp-head"><span class="pill">${t(RTYPE[ty])}</span><span class="helper">${esc(fmtDate(r.date) || r.date)} · ${t('reporta {n}', { n: esc(uName(r.by)) })}</span></div>${ctx}
  ${(r.reasons || []).length ? `<div class="tags rp-why">${r.reasons.map(x => `<span class="tag">${esc(t(x))}</span>`).join('')}</div>` : ''}${r.text ? `<p class="rp-text">${esc(r.text)}</p>` : ''}${repImgs(r)}
  <div class="rp-acts">${link}${who && getUsers()[who] ? `<a class="button ghost sm" href="#/user/${encodeURIComponent(who)}" data-dir="next">${t('👤 Perfil')}</a>` : ''}
  ${open ? `${ty === 'reclass' ? `<button class="button sm" data-act="rc-ok" data-id="${r.id}">${t('Aprobar: quitar +18')}</button><button class="button secondary sm" data-act="rc-no" data-id="${r.id}">${t('Mantener +18')}</button>` : ''}${ty === 'story' && s ? `<button class="button secondary sm" data-act="rc-set" data-id="${esc(r.sid)}" data-v="${s.mature ? 0 : 1}">${s.mature ? t('Quitar +18') : t('Marcar como +18')}</button>` : ''}${ty === 'story' && s ? (td ? `<button class="button secondary sm" data-act="td-off" data-id="${esc(r.sid)}">${t('Restaurar')}</button>` : `<button class="button danger sm" data-act="td-on" data-id="${esc(r.sid)}">${t('Retirar de Descubrir')}</button>`) : ''}${ty === 'comment' && r.sid && comments(r.sid).some(c => String(c.id) === String(r.cid)) ? `<button class="button danger sm" data-act="rp-delcomment" data-id="${esc(r.sid)}" data-cid="${esc(r.cid)}">${t('Eliminar comentario')}</button>` : ''}${who && canAct(who) ? `<button class="button ghost sm" data-act="adm-strike" data-id="${esc(who)}">${t('⚠️ Strike')}</button><button class="button ghost sm" data-act="adm-ban" data-id="${esc(who)}">${t('🚫 Suspender')}</button>` : ''}
  <button class="button sm" data-act="rp-done" data-id="${r.id}">${t('✓ Resuelto')}</button><button class="button ghost sm" data-act="rp-dismiss" data-id="${r.id}">${t('Descartar')}</button>`
    : `<span class="helper">${t(r.status === 'dismissed' ? 'Descartado por {n} · {d}' : 'Resuelto por {n} · {d}', { n: esc(uName(r.handledBy)), d: esc(fmtDate(r.handledDate) || r.handledDate || '') })}</span><button class="button ghost sm" data-act="rp-reopen" data-id="${r.id}">${t('Reabrir')}</button>`}
  ${ty === 'problem' && open ? `<button class="icon-btn" data-act="report-del" data-id="${r.id}" aria-label="${esc(t('Eliminar reporte'))}">${TRASH}</button>` : ''}</div></article>`;
}
function reportsView(tabs) {
  const all = reportsAll().filter(r => inScope(commOf(accOf(r) || r.by))).filter(r => !RACC || accOf(r) === RACC), l = all.filter(r => ((r.status || 'open') === 'open') === (RFILT === 'open'));
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('🚩 Reportes')}</span><h2 style="margin-top:8px">${RFILT === 'open' ? t('Por revisar') : t('Ya atendidos')} (${l.length})</h2><p>${t('Abre la obra, analiza el caso y toma medidas. Todo queda en el registro.')}</p></div></div>
  <div class="filter-row">${RACC ? `<button class="chip active" data-act="acc-clear">${t('Cuenta: {n}', { n: esc(uName(RACC)) })} ✕</button>` : ''}<button class="chip ${RFILT === 'open' ? 'active' : ''}" data-act="rp-filter" data-id="open">${t('Abiertos')} (${openReports()})</button><button class="chip ${RFILT === 'done' ? 'active' : ''}" data-act="rp-filter" data-id="done">${t('Atendidos')}</button></div>
  ${l.length ? l.map(reportCard).join('') : empty(RFILT === 'open' ? 'Sin reportes pendientes' : 'Nada atendido todavía', RFILT === 'open' ? 'Cuando alguien reporte una obra, un comentario o un perfil, aparecerá aquí.' : 'Los reportes resueltos o descartados se guardan aquí.')}</main>`;
}
const reportsPanel = () => { const l = G.get('reports', []).filter(r => inScope(commOf(accOf(r) || r.by))); return l.length ? `<section class="panel" style="margin-top:20px"><h2>📨 ${t('Reportes')} (${l.length})</h2>${l.map(r => `<div class="comment"><div style="flex:1;min-width:0"><strong>${esc(uName(r.by))}</strong> <span class="helper">${esc(fmtDate(r.date) || r.date)}</span><div style="overflow-wrap:anywhere">${esc(r.text)}</div></div><button class="icon-btn" data-act="report-del" data-id="${r.id}" aria-label="${esc(t('Eliminar reporte'))}">${TRASH}</button></div>`).join('')}</section>` : ''; };

/* --- Datos: exportar / importar / borrar --- */
function buildExport() {
  const u = getUsers()[S.user] || {};
  return { app: 'auri', v: 1, exportedAt: new Date().toISOString(), profile: { name: u.name || '', bio: u.bio || '', avatar: u.avatar || '', banner: u.banner || '', interests: u.interests || [] },
    data: Object.fromEntries(['stories', 'favs', 'progress', 'pos', 'lib', 'cols', 'chars', 'cfg'].map(k => [k, LS.get(uk(k), null)])) };   // sin contraseña ni datos de otras personas
}
function exportFile() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(buildExport(), null, 1)], { type: 'application/json' })); a.download = `auri-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); toast('Archivo preparado ✓');
}
function exportCopy() {
  const nv = typeof navigator !== 'undefined' ? navigator : null;
  if (nv && nv.clipboard && nv.clipboard.writeText) nv.clipboard.writeText(JSON.stringify(buildExport())).then(() => toast('Datos copiados ✓'), () => toast('No se pudo copiar; usa «Exportar»'));
  else toast('Tu navegador no permite copiar; usa «Exportar»');
}
function importFromFile(f) {
  if (!f) return; const r = new FileReader();
  r.onload = () => importData(String(r.result)); r.onerror = () => toast('No se pudo leer el archivo.'); r.readAsText(f);
}
function importData(txt) {
  let d; try { d = JSON.parse(txt); } catch { return toast('Ese archivo no es válido.'); }
  if (!d || d.app !== 'auri' || !d.data || typeof d.data !== 'object') return toast('Ese archivo no parece una copia de Auri.');
  dialog('¿Importar estos datos?', 'Se REEMPLAZARÁN tus historias, biblioteca, personajes y ajustes actuales por los del archivo. Las historias nuevas llegan como borradores y vuelven a pasar por moderación.', 'Importar', 'Cancelar', () => applyImport(d), true);
}
function applyImport(d) {
  const x = d.data, arr = v => Array.isArray(v) ? v : [], obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const stored = freshStories(), admin = isAdmin(), others = new Set(allStories().filter(s => s.owner !== S.user).map(s => s.id));
  let skipped = 0;
  const stories = arr(x.stories).filter(s => s && typeof s.id === 'string' && typeof s.title === 'string').filter(s => (others.has(s.id) ? (skipped++, false) : true)).map(s => {
    const n = norm(s), prev = stored.find(p => p.id === n.id); if (admin) return n;
    return { ...n, chapters: n.chapters.map(c => {                       // nadie se "aprueba" solo importando un archivo
      const p = prev && prev.chapters.find(q => q.id === c.id);
      if (p && p.title === c.title && p.text === c.text && (p.cover || '') === (c.cover || '')) return { ...c, status: p.status, live: p.live, reason: p.reason };   // sin cambios: conserva su estado real
      const { live, reason, ...rest } = c; return { ...rest, status: 'draft' };
    }) };
  });
  LS.set(uk('stories'), stories); LS.set(uk('favs'), arr(x.favs)); LS.set(uk('progress'), obj(x.progress)); LS.set(uk('pos'), obj(x.pos)); LS.set(uk('lib'), arr(x.lib)); LS.set(uk('cols'), arr(x.cols));
  if (x.chars) LS.set(uk('chars'), x.chars); if (x.cfg) LS.set(uk('cfg'), obj(x.cfg));
  const users = getUsers(), p = d.profile || {}, img = v => safeImg(v);
  if (users[S.user]) { users[S.user] = { ...users[S.user], bio: String(p.bio || '').slice(0, 500), ...(img(p.avatar) ? { avatar: p.avatar } : {}), ...(img(p.banner) ? { banner: p.banner } : {}), ...(Array.isArray(p.interests) && p.interests.some(i => INTEREST_NAMES.includes(i)) ? { interests: p.interests.filter(i => INTEREST_NAMES.includes(i)) } : {}) }; G.set('users', users); }
  arr(x.lib).forEach(id => subscribe(id));
  loadUser(); toast(skipped ? t('Datos importados ({n} historia(s) omitidas: ya existen en otra cuenta)', { n: skipped }) : 'Datos importados ✓'); render();
}
function wipeDevice() {
  const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('auri.')) ks.push(k); }
  ks.forEach(k => localStorage.removeItem(k));
  S.user = null; S.theme = 'auto'; LS.set('auri.themeSet', false); W = null; applyTheme(); closeMusic(); toast('Datos de este dispositivo borrados'); go('/login');
}

/* --- Cuenta: cambiar correo / eliminar --- */
function renameUser(old, nu) {                           // el correo es la identidad de la cuenta: se mueve TODO lo que depende de él
  const users = getUsers(); users[nu] = users[old]; delete users[old]; G.set('users', users);
  const pre = `auri.u.${old}.`, move = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) move.push(k); }
  move.forEach(k => { localStorage.setItem(`auri.u.${nu}.` + k.slice(pre.length), localStorage.getItem(k)); localStorage.removeItem(k); });
  const re = e => e === old ? nu : e, fo = follows(), nf = {}; for (const k in fo) nf[re(k)] = fo[k].map(re); G.set('follows', nf);
  const lk = G.get('likes', {}); for (const id in lk) lk[id] = lk[id].map(re); G.set('likes', lk);
  const cm = G.get('comments', {}); for (const id in cm) cm[id] = cm[id].map(c => ({ ...c, by: re(c.by) })); G.set('comments', cm);
  const sb = subs(); for (const id in sb) sb[id] = sb[id].map(re); G.set('subs', sb);
  const nk = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('auri.notifs.')) nk.push(k); }
  nk.forEach(k => { const l = LS.get(k, []).map(n => ({ ...n, from: re(n.from) })); localStorage.setItem(k === 'auri.notifs.' + old ? 'auri.notifs.' + nu : k, JSON.stringify(l)); if (k === 'auri.notifs.' + old) localStorage.removeItem(k); });
  S.user = nu; LS.set('auri.session', nu); loadUser();
}
async function saveAccountCloud() {
  const users = getUsers(), u = users[S.user]; if (!u) return;
  const name = $('#ac-name').value.trim(), email = $('#ac-email').value.trim().toLowerCase(), pass = $('#ac-pass').value;
  if (!name) return toast('Escribe un nombre de usuario.');
  if (nameKey(name) !== nameKey(u.name) && await nameTaken(name, S.user)) return toast(t('Ese nombre de usuario ya está en uso.'));
  if (email !== S.user) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Ingresa un correo válido.');
    if (!pass) return toast('Escribe tu contraseña actual para cambiar el correo.');
    const chk = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: S.user, password: pass } });
    if (chk.net) return toast(t('No hay conexión con el servidor. Inténtalo de nuevo.'));
    if (!chk.ok) return toast('Escribe tu contraseña actual para cambiar el correo.');
    const r = await sbApi('/auth/v1/user', { method: 'PUT', body: { email } });
    if (!r.ok) return toast(t('No se pudo cambiar el correo. Inténtalo de nuevo.'));
    toast(t('Te enviamos un enlace al correo nuevo para confirmar el cambio.'));
  } else toast('Cuenta actualizada ✓');
  u.name = name; G.set('users', users); render();
}
async function saveAccount() {
  if (cloud() && sbSes() && !isGuest()) return saveAccountCloud();
  const users = getUsers(), u = users[S.user]; if (!u) return;
  const name = $('#ac-name').value.trim(), email = $('#ac-email').value.trim().toLowerCase(), pass = $('#ac-pass').value;
  if (!name) return toast('Escribe un nombre de usuario.');
  if (nameKey(name) !== nameKey(u.name) && await nameTaken(name, S.user)) return toast(t('Ese nombre de usuario ya está en uso.'));
  if (email !== S.user) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Ingresa un correo válido.');
    if (users[email]) return toast(t('Ese correo ya tiene una cuenta.'));
    if (S.user === OWNER_EMAIL) return toast('La cuenta Owner no puede cambiar de correo.');
    if (email === OWNER_EMAIL) return toast('Ese correo está reservado.');
    if (!pass || u.hash !== await sha(u.salt + pass)) return toast('Escribe tu contraseña actual para cambiar el correo.');
  }
  u.name = name; G.set('users', users);
  if (email !== S.user) renameUser(S.user, email);
  toast('Cuenta actualizada ✓'); render();
}
async function deleteAccount() {
  if (cloud() && sbSes()) { const r = await sbApi('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} }); if (!r.ok) return toast(t('No se pudo eliminar la cuenta. Inténtalo de nuevo.')); localStorage.removeItem('auri.sb'); }
  const me = S.user, users = getUsers(); delete users[me]; G.set('users', users);
  const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(`auri.u.${me}.`)) ks.push(k); }
  ks.forEach(k => localStorage.removeItem(k)); localStorage.removeItem('auri.notifs.' + me);
  const fo = follows(); delete fo[me]; for (const k in fo) fo[k] = fo[k].filter(e => e !== me); G.set('follows', fo);
  const lk = G.get('likes', {}); for (const id in lk) lk[id] = lk[id].filter(e => e !== me); G.set('likes', lk);
  const cm = G.get('comments', {}); for (const id in cm) cm[id] = cm[id].filter(c => c.by !== me); G.set('comments', cm);
  const sb = subs(); for (const id in sb) sb[id] = sb[id].filter(e => e !== me); G.set('subs', sb);
  const nk = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('auri.notifs.')) nk.push(k); }
  nk.forEach(k => localStorage.setItem(k, JSON.stringify(LS.get(k, []).filter(n => n.from !== me))));
  S.user = null; localStorage.removeItem('auri.session'); W = null; closeMusic(); toast('Tu cuenta fue eliminada'); go('/start');
}

/* --- Pantalla de Ajustes --- */
const seg = (k, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" class="seg-b ${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-act="cfg" data-k="${k}" data-v="${v}">${t(l)}</button>`).join('')}</div>`;
const sw = (k, on, label, help, locked) => `<div class="toggle-line"><div><strong>${t(label)}</strong>${help ? `<div class="helper">${t(help)}</div>` : ''}</div><button type="button" role="switch" class="switch" aria-checked="${on}" data-act="cfg-toggle" data-k="${k}" ${locked ? 'disabled' : ''} aria-label="${esc(t(label))}"></button></div>`;
/** Ajustes: una lista de botones (menú) y cada sección en su propia pantalla */
const CHEV = '<svg class="set-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function settingsView(secId) {
  const u = getUsers()[S.user] || {}, n = cfg('notif'), act = S.chars.find(c => c.id === S.activeId);
  const nOn = ['chapter', 'like', 'comment', 'follow'].filter(k => n[k]).length;
  const SECS = {
    apariencia: { ico: '🎨', c: '#8c5fc1', t: t('Apariencia'), sub: `${t('Tema')} ${t(({ light: 'claro', dark: 'oscuro', auto: 'automático' })[S.theme] || 'automático')} · ${uiLang() === 'en' ? 'English' : 'Español'}`, body: () => `<section class="panel set-sec"><div class="set-row"><span>${t('Tema')}</span>${seg('theme', [['light', '☀ ' + t('Claro')], ['dark', '🌙 ' + t('Oscuro')], ['auto', t('Automático')]], S.theme)}</div><div class="set-row"><span>${t('Tema de color')}</span><button type="button" class="button secondary sm" data-act="theme-colors"><i class="th-dot ${accentOf(S.user)}"></i>${t(accentOf(S.user) ? THEMES[accentOf(S.user)].n : 'Violeta')} · ${t('Cambiar')}</button></div>
      <div class="set-row"><span>${t('Tu comunidad')}</span><b>${esc(COMMS[commOf(S.user)])}</b></div>
      <div class="set-row"><span>${t('Ver también la otra comunidad')}</span>${seg('otherComm', [['no', t('No')], ['yes', t('Sí')]], cfg('otherComm'))}</div>
      <div class="set-row"><span>${t('Idioma')}</span><select class="select set-lang" aria-label="${esc(t('Idioma'))}"><option value="auto" ${uiSetting() === 'auto' ? 'selected' : ''}>${t('Automático')}</option><option value="es" ${uiSetting() === 'es' ? 'selected' : ''}>${t('Español')}</option><option value="en" ${uiSetting() === 'en' ? 'selected' : ''}>${t('English')}</option></select></div></section>` },
    lectura: { ico: '📖', c: '#3e8fd0', t: 'Lectura', sub: `${t('Letra ' + ({ sm: 'pequeña', md: 'normal', lg: 'grande' })[cfg('fontSize')])} · ${t((FONTS.find(f => f[0] === cfg('font')) || FONTS[0])[1])}`, body: () => `<section class="panel set-sec"><div class="set-row"><span>${t('Tamaño de letra')}</span>${seg('fontSize', [['sm', 'Pequeña'], ['md', 'Normal'], ['lg', 'Grande']], cfg('fontSize'))}</div>
      <div class="set-col"><span>${t('Tipografía')}</span><div class="font-grid">${(FONTS.forEach(f => loadFont(f[0])), FONTS).map(f => `<button type="button" class="font-opt ${cfg('font') === f[0] ? 'on' : ''}" data-act="cfg" data-k="font" data-v="${f[0]}" style="font-family:${READ.font[f[0]]}" aria-pressed="${cfg('font') === f[0]}"><b>Aa</b><span>${esc(t(f[1]))}</span></button>`).join('')}</div></div>
      <div class="set-col"><span>${t('Fondo de lectura')}</span><div class="rbg-grid">${[['auto', 'Del tema'], ['cream', 'Crema'], ['sepia', 'Sepia'], ['night', 'Noche'], ['paper', 'Papel']].map(b => `<button type="button" class="rbg-opt ${cfg('rbg') === b[0] ? 'on' : ''}" data-act="cfg" data-k="rbg" data-v="${b[0]}" data-rbg="${b[0]}" aria-pressed="${cfg('rbg') === b[0]}"><span class="rbg-sw"></span>${t(b[1])}</button>`).join('')}</div></div>
      <div class="set-col"><span>${t('Separador de escena')}</span><div class="sep-prev">${sepHTML('scene-sep')}</div><div class="sep-grid">${Object.entries(SEPS).map(([k, v]) => `<button type="button" class="sep-opt ${sepKey() === k ? 'on' : ''} ${sepOK(k) ? '' : 'lock'}" ${sepOK(k) ? `data-act="cfg" data-k="sepStyle" data-v="${k}"` : 'data-act="sep-lock"'} aria-pressed="${sepKey() === k}">${sepHTML('sep-mini', k)}<span>${t(v[0])}</span><em>${t(v[1] === 'free' ? 'Gratis' : v[1] === 'shop' ? 'Tienda' : 'Pase')}</em></button>`).join('')}</div></div>
      ${sw('dropcap', cfg('dropcap'), 'Letra capital', 'La primera letra de cada capítulo se ve grande y decorada.')}
      <div class="set-row"><span>${t('Márgenes del texto')}</span>${seg('margin', [['sm', 'Pequeños'], ['md', 'Normales'], ['lg', 'Amplios']], cfg('margin'))}</div>
      <div class="set-row"><span>${t('Alineación del texto')}</span>${seg('align', [['left', 'Izquierda'], ['justify', 'Justificado']], cfg('align'))}</div>
      <div class="set-row"><span>${t('Interlineado')}</span>${seg('lh', [['compact', 'Compacto'], ['normal', 'Normal'], ['relaxed', 'Amplio']], cfg('lh'))}</div>
      <div class="set-row"><span>${t('Comentarios en párrafos')}</span>${seg('pcom', [['tap', 'Al tocar'], ['dots', 'Con contador'], ['off', 'Desactivados']], cfg('pcom'))}</div>
      <p class="helper" style="margin:0 0 6px">${t('«Al tocar» deja la lectura limpia: toca un párrafo y aparece «Comentar». «Con contador» muestra un número discreto en los párrafos que tienen comentarios.')}</p>
      <div class="set-row"><span>${t('Spoilers en comentarios')}</span>${seg('spoilers', [['hide', 'Difuminar'], ['show', 'Mostrar']], cfg('spoilers'))}</div>
      <div class="read-prev"><p class="reader-text">${t('Así se verá tu lectura. La luna asomó entre las nubes y el bosque guardó silencio.')}</p></div>
      <div class="set-row"><span>${t('Música de los capítulos')}</span>${seg('music', [['ask', 'Preguntar siempre'], ['remember', 'Recordar mi elección']], cfg('music'))}</div>
      <p class="helper" style="margin:0 0 6px">${t('«Recordar» abre sola la canción del capítulo si la última vez elegiste reproducirla (el navegador puede pedirte un toque antes).')}</p>
      ${sw('skipReadAs', cfg('skipReadAs'), 'Saltar «Leer como…»', t('Usa siempre tu personaje activo{x}. Si no tienes uno activo, se te preguntará.', { x: act ? ` (${esc(act.name)})` : '' }))}</section>` },
    contenido: { ico: '🔞', c: '#e0457b', t: 'Ajustes de contenido', sub: isMinor(u) ? t('No disponible') : cfg('showMature') ? t('Visible') : t('Oculto'), body: () => `<section class="panel set-sec">${sw('showMature', cfg('showMature'), 'Mostrar contenido +18', isMinor(u) ? 'No está disponible para cuentas menores de 18 años.' : 'Si lo apagas, las historias para adultos se ocultan en Inicio, búsquedas y bibliotecas. Tus propias obras siempre se ven.', isMinor(u))}
      <div class="avoid-box"><h3>${t('Etiquetas que quiero evitar')}</h3><p class="helper">${t('No te mostraremos libros con estas etiquetas en Inicio, búsquedas ni recomendaciones. Tus propias obras siempre se ven.')}</p>
      <div class="avoid-chips">${avoidList().map(x => `<span class="tag avoid-chip">#${esc(x)}<button type="button" data-act="avoid-del" data-id="${esc(x)}" aria-label="${esc(t('Quitar'))}">✕</button></span>`).join('') || `<span class="helper">${t('Aún no evitas ninguna etiqueta.')}</span>`}</div>
      <div class="avoid-add"><input id="avoid-in" class="input" maxlength="30" placeholder="${esc(t('#etiqueta'))}" autocomplete="off"><button type="button" class="button secondary sm" data-act="avoid-add">${t('Agregar')}</button></div></div>
      <div class="avoid-box"><h3>${t('Avisos de contenido que quiero evitar')}</h3><p class="helper">${t('Las autorías marcan los avisos de sus libros. Los que elijas aquí dejan de mostrarse en Inicio, búsquedas y recomendaciones.')}</p>
      <div class="warn-chips">${Object.keys(WARNS).map(k => `<button type="button" class="chip ${avoidWarns().includes(k) ? 'active' : ''}" data-act="avoid-warn" data-id="${k}" aria-pressed="${avoidWarns().includes(k)}">${t(WARNS[k])}</button>`).join('')}</div></div>
      <div class="avoid-box">${sw('hideDone', cfg('hideDone'), 'Ocultar libros que ya terminé', 'No te recomendamos libros que ya terminaste de leer.')}</div></section>` },
    intereses: { ico: '🏷️', c: '#e09a2b', t: 'Tus intereses', sub: tn((u.interests || []).length, '{n} tema', '{n} temas'), body: () => `<section class="panel set-sec"><p class="helper" style="margin:0 0 4px">${t('Los temas que te gustan (mínimo uno).')}</p>${interestChips(u.interests || [], 'int-set')}</section>` },
    bloqueos: { ico: '🚫', c: '#6b7280', t: 'Bloqueadas y silenciadas', sub: t('{a} bloqueadas · {b} silenciadas', { a: bl(S.user, 'blocked').length, b: bl(S.user, 'muted').length }), body: () => {
      const row = (e, act, lab) => `<div class="cr-row"><span class="cr-rt">${userAvatar(e)} <b>${esc(uName(e))}</b></span><span class="cr-rb"><button class="button secondary sm" data-act="${act}" data-id="${esc(e)}">${t(lab)}</button></span></div>`, b = bl(S.user, 'blocked'), m = bl(S.user, 'muted');
      return `<section class="panel set-sec"><h3>${t('Bloqueadas')}</h3><p class="helper">${t('No ves sus comentarios ni sus obras y no hay avisos entre ustedes.')}</p>${b.length ? b.map(e => row(e, 'unblock', 'Desbloquear')).join('') : '<p class="helper">' + t('No has bloqueado a nadie.') + '</p>'}</section>
      <section class="panel set-sec"><h3>${t('Silenciadas')}</h3><p class="helper">${t('No ves sus comentarios ni recibes sus avisos, pero siguen pudiendo ver tu perfil.')}</p>${m.length ? m.map(e => row(e, 'unmute', 'Dejar de silenciar')).join('') : '<p class="helper">' + t('No has silenciado a nadie.') + '</p>'}</section>`; } },
    notificaciones: { ico: '🔔', c: '#d9534f', t: 'Notificaciones', sub: t('{n} de 4 activadas', { n: nOn }), body: () => `<section class="panel set-sec">${sw('notif.chapter', n.chapter, 'Capítulos nuevos de mi biblioteca')}${sw('notif.like', n.like, 'Likes en mis obras')}${sw('notif.comment', n.comment, 'Comentarios en mis obras')}${sw('notif.follow', n.follow, 'Nuevos seguidores')}${strikesOf(S.user).length || cfg('hideStrikeBtn') ? sw('hideStrikeBtn', cfg('hideStrikeBtn'), 'Ocultar el botón de aviso de strikes', 'El botón amarillo ⚠️ de tu perfil.') : ''}${sw('notif.mod', true, 'Avisos de moderación', 'Aprobado o rechazado, strikes e invitaciones: siempre activos.', true)}</section>` },
    datos: { ico: '💾', c: '#2f9e7a', t: 'Tus datos', sub: t('Exportar, importar, borrar'), body: () => `<section class="panel set-sec"><p class="helper" style="margin:0 0 10px">${t('Hoy tus datos viven en este navegador. Haz una copia para llevarlos a otro dispositivo o editor.')}</p>
      <div class="set-btns"><button class="button secondary" data-act="export-file">${t('⬇ Exportar mis datos (archivo)')}</button><button class="button secondary" data-act="export-copy">${t('📋 Copiar mis datos')}</button>
      <label class="button secondary" style="cursor:pointer">${t('⬆ Importar desde archivo')}<input id="import-file" type="file" accept="application/json,.json" hidden></label>
      <button class="button danger" data-act="wipe-device">${t('🗑 Borrar datos de este dispositivo')}</button></div></section>` },
    cuenta: { ico: '👤', c: '#5b6ee1', t: 'Cuenta', sub: isGuest() ? t('Invitado · crear cuenta o iniciar sesión') : S.user, body: () => isGuest() ? guestCard() : `<section class="panel set-sec">${sw('showOnline', cfg('showOnline') !== false, 'Mostrar conexión', 'Un punto verde junto a tu nombre cuando estás conectada o conectado.')}${sw('hideLists', !!u.hideLists, 'Ocultar mis listas', 'Nadie más ve quién te sigue ni a quién sigues. Los números siguen visibles.')}<div class="form-grid" style="grid-template-columns:1fr"><div class="form-group"><label for="ac-name">${t('Nombre de usuario')}</label><input id="ac-name" class="field" maxlength="30" value="${esc(u.name || '')}"></div>
      <div class="form-group"><label for="ac-email">${t('Correo')}</label><input id="ac-email" type="email" class="field" value="${esc(S.user)}"></div>
      <div class="form-group"><label for="ac-pass">${t('Contraseña actual')}</label><input id="ac-pass" type="password" class="field" autocomplete="current-password" placeholder="${esc(t('Solo para cambiar el correo'))}"></div></div>
      <button class="button" style="margin-top:12px;width:100%" data-act="acct-save">${t('Guardar cambios de cuenta')}</button></section>
      <section class="panel set-sec danger-zone"><h2>${t('⚠️ Zona de peligro')}</h2><p class="helper" style="margin:8px 0 12px">${t('Eliminar tu cuenta borra tus historias (publicadas, en revisión y borradores), biblioteca, personajes, comentarios, likes y seguidores. No se puede deshacer.')}</p><button class="button danger" data-act="acct-delete">${t('Eliminar cuenta')}</button></section>` },
    acerca: { ico: 'ℹ️', c: '#7a869a', t: 'Acerca de', sub: t('Versión {v}', { v: APP_VERSION }), body: () => `<section class="panel set-sec"><div class="set-btns"><button class="button secondary" data-act="terms">${t('Términos y condiciones')}</button><button class="button secondary" data-act="privacy">${t('Política de privacidad')}</button><button class="button secondary" data-act="report">${t('Reportar un error')}</button></div>${sw('hideBugFab', !!cfg('hideBugFab'), 'Ocultar el botón flotante de errores', 'Sigue disponible aquí, en Acerca de.')}<p class="helper" style="margin:14px 0 0;text-align:center">${t('Auri · versión {v}', { v: APP_VERSION })}</p></section>` }
  };
  const SECSUB = { apariencia: 'Tema, color e idioma', lectura: 'Letra, fuente y música', contenido: '+18, etiquetas y avisos', intereses: 'Temas que te gustan', bloqueos: 'Personas que bloqueaste o silenciaste', notificaciones: 'Qué avisos recibes', datos: 'Exportar, importar y borrar', cuenta: 'Usuario, correo y sesión', acerca: 'Términos, privacidad y versión' };
  if (secId && SECS[secId]) {                                    // pantalla de una sección
    const x = SECS[secId];
    return `<main class="page story-layout settings"><div class="set-head"><button class="icon-btn" data-act="set-back" aria-label="${esc(t('Volver a Ajustes'))}">‹</button><h2><span class="set-ico" style="--c:${x.c}">${x.ico}</span><span class="set-tt">${t(x.t)}${SECSUB[secId] ? `<small>${t(SECSUB[secId])}</small>` : ''}</span></h2></div>${x.body()}</main>`;
  }
  const item = id => { const x = SECS[id]; return `<a class="set-item" href="#/settings/${id}" data-dir="next"><span class="set-ico" style="--c:${x.c}">${x.ico}</span><span class="set-txt"><b>${t(x.t)}</b><small>${esc(x.sub)}</small></span>${CHEV}</a>`; };
  const group = (g, ids) => `<h3 class="set-group">${t(g)}</h3><div class="set-list">${ids.map(item).join('')}</div>`;
  const role = t(ROLE_LABEL[roleOf(S.user)]);
  return `<main class="page story-layout settings"><div class="set-head"><button class="icon-btn" data-act="settings-back" aria-label="${esc(t('Volver'))}">‹</button><h2>${t('Ajustes')}</h2></div>
  <a class="set-me" style="${isGuest() ? 'display:none' : ''}" href="#/profile" data-dir="next">${userAvatar(S.user, 'big')}<span class="set-txt"><b>${esc(u.name || t('Mi cuenta'))}</b><small>${esc(S.user)}</small>${role ? `<em class="role-tag ${roleOf(S.user).toLowerCase()}">🛡 ${role}</em>` : ''}</span>${CHEV}</a>
  ${isGuest() ? group('Cuenta', ['cuenta']) + group('Preferencias', ['apariencia', 'lectura']) + group('Ayuda', ['acerca']) : group('Cuenta', ['cuenta', 'intereses', 'bloqueos']) + group('Preferencias', ['apariencia', 'lectura', 'contenido', 'notificaciones']) + group('Datos y ayuda', ['datos', 'acerca'])}
  <button class="button danger set-logout" data-act="logout">${isGuest() ? t('Salir del modo invitado') : t('Cerrar sesión')}</button></main>`;
}

/* --- Biblioteca --- */
/* --- Libros: estados, progreso inteligente, biblioteca con suscripción y sagas --- */
const PHASE = { ongoing: 'En emisión', paused: 'En pausa', finished: 'Terminado' };
const ORD = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
/** Progreso del lector sobre los capítulos PÚBLICOS. Al leer el último publicado: 100% ("Al día", o "Terminado" si el libro está terminado) */
function bookProgress(s) {
  const read = readList(s.id), chs = s.chapters, total = chs.length, last = chs[total - 1], done = chs.filter(c => read.includes(c.idx)).length;
  const caught = !!last && read.includes(last.idx), finished = caught && s.phase === 'finished';
  return { total, done, left: total - done, caught, finished, pct: caught ? 100 : total ? Math.round(done / total * 100) : 0, label: finished ? 'Terminado' : caught ? 'Al día' : done ? 'Leyendo' : 'Sin empezar' };
}
const moreNotice = (s, inLib) => `${s.phase === 'paused' ? t('Esta historia está en pausa.') + ' ' : ''}${inLib ? t('Próximamente habrá más capítulos, te avisaremos cuando el autor publique.') : t('Próximamente habrá más capítulos. Guarda el libro en tu biblioteca y te avisaremos cuando el autor publique.')}`;
/* Suscripción automática: guardar en la biblioteca = recibir avisos; quitarlo = cancelar el aviso */
const subs = () => G.get('subs', {});
function subscribe(id) { const m = subs(); m[id] = [...new Set([...(m[id] || []), S.user])]; G.set('subs', m); }
function unsubscribe(id) { const m = subs(); m[id] = (m[id] || []).filter(e => e !== S.user); if (!m[id].length) delete m[id]; G.set('subs', m); }
function libAdd(id) { if (!S.lib.includes(id)) { S.lib = [...S.lib, id]; LS.set(uk('lib'), S.lib); } subscribe(id); }
function libRemove(id) { S.lib = S.lib.filter(x => x !== id); LS.set(uk('lib'), S.lib); unsubscribe(id); }
function colAdd(id) { if (!S.cols.includes(id)) { S.cols = [...S.cols, id]; LS.set(uk('cols'), S.cols); } libRemove(id); }   // terminado: sale de la biblioteca (y de los avisos)
function colDel(id) { S.cols = S.cols.filter(x => x !== id); LS.set(uk('cols'), S.cols); }
/** Avisa a quien tiene el libro en su biblioteca cuando se publica un capítulo nuevo (libros no terminados) */
function announceChapters(id, before) {
  const s = allStories().find(x => x.id === id); if (!s) return;
  const pub = publicPrefix(s.chapters), added = pub.length - before;
  if (added <= 0 || before === 0 || s.phase === 'finished') return;
  (subs()[id] || []).filter(e => e !== s.owner).forEach(e => notify(e, 'chapter', id, String(pub[before].idx + 1), added > 1 ? `${added} capítulos nuevos` : pub[before].title, s.owner));
}
/* Sagas: cada libro puede apuntar a UN libro anterior de la misma autoría (cadena lineal, sin ciclos) */
function sagaCandidates(w) {
  const mine = S.stories, taken = new Set(mine.filter(x => x.prev && x.id !== w.id).map(x => x.prev)), desc = new Set();
  let front = [w.id];
  while (front.length) { const nx = mine.filter(x => front.includes(x.prev) && !desc.has(x.id)).map(x => x.id); nx.forEach(i => desc.add(i)); front = nx; }
  return mine.filter(x => x.id !== w.id && !desc.has(x.id) && (!taken.has(x.id) || x.id === w.prev));
}
function fixSaga() { if (W && W.prev && !sagaCandidates(W).some(x => x.id === W.prev)) W.prev = ''; }   // con 0 libros (o enlace inválido) nunca queda vinculado
function sagaParts(s) {
  const all = allStories().filter(x => x.owner === s.owner); let root = s, g = 0;
  while (root.prev && g++ < 50) { const p = all.find(x => x.id === root.prev); if (!p) break; root = p; }
  const parts = [root]; let cur = root;
  while (g++ < 120) { const nx = all.find(x => x.prev === cur.id); if (!nx || parts.includes(nx)) break; parts.push(nx); cur = nx; }
  return parts;
}
function sagaNav(s) {
  const mine = S.stories.some(x => x.id === s.id), parts = sagaParts(s).filter(p => p.id === s.id || publicPrefix(p.chapters).length || (mine && p.owner === S.user)), i = parts.findIndex(p => p.id === s.id);
  if (parts.length < 2 || i < 0) return '';
  const arrow = (p, txt, cls) => p ? `<a class="saga-arrow ${cls}" data-replace data-dir="${cls === 'l' ? 'prev' : 'next'}" data-goto="${parts.indexOf(p)}" href="#/story/${esc(p.id)}" title="${esc(p.title)}">${txt}</a>` : `<span class="saga-arrow off ${cls}">·</span>`;
  return `<nav class="saga-nav" aria-label="${esc(t('Partes de la saga'))}">${arrow(parts[i - 1], '◀ ' + t('Parte {n}', { n: i }), 'l')}<span class="saga-now">${t('Saga · Parte {n} de {m}', { n: i + 1, m: parts.length })}</span>${arrow(parts[i + 1], t('Parte {n}', { n: i + 2 }) + ' ▶', 'r')}</nav>`;
}
function sagaBox() {                              // solo existe si la persona ya tiene al menos otro libro
  if (!S.stories.some(x => x.id !== W.id)) return '';
  const c = sagaCandidates(W);
  return `<div class="form-group full"><details class="saga-box" ${W.prev ? 'open' : ''}><summary>🔗 ${t('Agrupar libro / Vincular como secuela')}</summary>${c.length
    ? `<label for="w-prev" class="helper" style="display:block;margin:10px 0 6px">${t('¿De cuál de tus libros es secuela este libro?')}</label><select id="w-prev" class="select"><option value="">${t('No agrupar')}</option>${c.map(x => `<option value="${esc(x.id)}" ${W.prev === x.id ? 'selected' : ''}>${esc(x.title || t('Sin título'))}</option>`).join('')}</select><span class="helper">${t('Los lectores podrán pasar de una parte a la otra.')}</span>`
    : `<p class="helper" style="margin-top:10px">${t('No hay libros disponibles: cada libro solo puede tener una secuela.')}</p>`}</details></div>`;
}
function libRow(s, i) {                           // fila de la biblioteca / colecciones con barra de progreso
  const p = bookProgress(s), ph = s.phase || 'ongoing', id = esc(s.id);
  const acts = TAB === 'col' ? `<button class="button ghost sm" data-act="col-del" data-id="${id}">${t('Quitar de colecciones')}</button>`
    : p.finished ? `<button class="button secondary sm" data-act="lib-del" data-id="${id}">${t('🗑️ Borrar de la biblioteca')}</button><button class="button sm" data-act="col-add" data-id="${id}">${t('⭐ Guardar en colecciones')}</button>`
    : `<button class="icon-btn" data-act="lib-del" data-id="${id}" aria-label="${esc(t('Quitar de la biblioteca'))}" title="${esc(t('Quitar de la biblioteca'))}">🗑</button>`;
  return `<article class="row-card">${coverHTML(s, i)}<div class="row-info"><a href="#/story/${id}"><strong class="serif">${esc(s.title)}</strong></a>
    <div class="story-meta">${esc(s.author || '')} · <span class="pill ph-${ph}">${t(PHASE[ph])}</span></div><div class="pbar"><i data-key="b-${esc(s.id)}" data-w="${p.pct}" style="width:${p.pct}%"></i></div>${bmOf(s.id) ? `<a class="pill bm-pill" href="#/story/${id}/${bmOf(s.id).idx + 1}">${t('Seguir en cap. {n}', { n: bmOf(s.id).idx + 1 })}</a>` : ''}
    <div class="story-meta"><b class="plabel ${p.finished ? 'done' : p.caught ? 'caught' : ''}">${t(p.label)}</b>${!p.caught && p.done ? ` · ${t('{n} por leer', { n: p.left })}` : ''} · ${t('{d}/{n} cap.', { d: p.done, n: p.total })}</div>
    ${p.caught && !p.finished && TAB === 'lib' ? `<p class="notice">${esc(moreNotice(s, true))}</p>` : ''}
    <div class="card-footer" style="justify-content:flex-start;flex-wrap:wrap"><a class="button secondary sm" href="#/story/${id}">${t('Abrir')}</a>${acts}</div></div></article>`;
}
let TAB = 'lib';
function libraryView() {
  const drafts = S.stories.filter(s => s.chapters.some(c => c.status !== 'approved')), pubIds = publishedStories().map(s => s.id), all = publishedStories().concat(drafts.filter(d => !pubIds.includes(d.id)).map(d => ({ ...d, owner: S.user, author: userName() }))).filter(matureOK);
  const lists = { lib: all.filter(s => S.lib.includes(s.id)), col: all.filter(s => S.cols.includes(s.id)), fav: all.filter(s => S.favs.includes(s.id)), read: all.filter(s => S.progress[s.id]), draft: drafts };
  const l = lists[TAB], tabs = [['lib', 'Mi biblioteca'], ['col', 'Colecciones'], ['fav', 'Favoritos'], ['read', 'Progreso de lectura'], ['draft', 'Borradores y revisión']];
  const ids = { lib: S.lib, col: S.cols, fav: S.favs, read: Object.keys(S.progress || {}) }, minor = isMinor(getUsers()[S.user]);
  const lockedL = ids[TAB] ? publishedStories().filter(x => x.mature && !matureOK(x) && ids[TAB].includes(x.id)) : [];
  const lockCard = x => `<article class="row-card locked"><div class="lock-cv">+18</div><div class="row-info"><strong class="serif">${t('Obra no disponible')}</strong><p class="helper" style="margin:2px 0 8px">${minor ? t('Esta obra cambió de clasificación y ya no está disponible.') : t('Obra +18 oculta por la configuración de contenido.')}</p><button type="button" class="button ghost sm" data-act="lock-remove" data-id="${esc(x.id)}">${t('Quitar de aquí')}</button></div></article>`;
  const body = !l.length && !lockedL.length ? empty(TAB === 'draft' ? 'Aún no tienes borradores' : 'Este estante está vacío', 'Cuando guardes historias aparecerán aquí.', `<a class="button secondary" href="${TAB === 'draft' ? '#/write' : '#/'}">${TAB === 'draft' ? t('Escribir una historia') : t('Buscar una historia')}</a>`)
    : `<div class="story-grid">${l.map((s, i) => TAB === 'draft' ? `<article class="row-card">${coverHTML(s, i)}<div class="row-info"><a href="#/write/${esc(s.id)}/chapters"><strong class="serif">${esc(s.title || t('Sin título'))}</strong></a>
      <div class="story-meta">${t(STATUS[storyState(s)])} · ${t('{n} cap.', { n: s.chapters.length })} · ${t('actualizado el {d}', { d: esc(s.updatedAt) })} </div>${statusNote(s) ? `<p class="notice">${esc(statusNote(s))}</p>` : ''}
      <div class="card-footer" style="justify-content:flex-start"><a class="button secondary sm" href="#/write/${esc(s.id)}/chapters">${t('Seguir escribiendo')}</a>${storyState(s) !== 'published' ? `<button class="icon-btn" data-act="delete" data-id="${esc(s.id)}" aria-label="${esc(t('Eliminar'))}">🗑</button>` : ''}</div></div></article>` : TAB === 'lib' || TAB === 'col' ? libRow(s, i) : storyCard(s, i)).join('')}${lockedL.map(lockCard).join('')}</div>`;
  return `<main class="page"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('Tus estantes')}</span><h2 style="margin-top:8px">${t('Un lugar para lo que te gusta')}</h2></div><a class="button" href="#/write">${t('Empezar a escribir')}</a></div>
  <div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button class="tab ${TAB === k ? 'active' : ''}" data-act="tab" data-id="${k}">${t(n)}</button>`).join('')}</div>${body}</main>`;
}

/* --- Comentarios --- */
let EDITC = null;   // id del comentario que se está editando
function updateComments(sid, fn) { const all = G.get('comments', {}); all[sid] = fn(all[sid] || []); G.set('comments', all); }
let REPLYTO = null, REPLYPRE = ''; const REPOPEN = new Set();        // hilo donde estás respondiendo · hilos con las respuestas abiertas
const ICO_REPLY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12c0 4.4-4 8-9 8-1.2 0-2.3-.2-3.3-.5L3 21l1.6-4.3C3.6 15.5 3 13.8 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></svg>';
const ICO_SEND = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const authLike = (x, s) => (x.lk || []).includes(s.owner) && x.by !== s.owner ? `<span class="c-authlike">${HEART}${t('Le gustó a la autoría')}</span>` : '';
let MENUC = null;                                      // comentario con el menú «⋯» abierto
function cmRow(x, s, sub, extra = '') {
  const mine = x.by === S.user, lk = x.lk || [], liked = lk.includes(S.user), top = sub ? x.parent : x.id, role = t(ROLE_LABEL[roleOf(x.by)]);
  const menu = MENUC === x.id ? `<div class="c-menu" role="menu">${mine ? `<button type="button" role="menuitem" data-act="c-edit" data-cid="${x.id}">${t('Editar')}</button>` : `<button type="button" role="menuitem" data-act="report-comment" data-id="${esc(s.id)}" data-cid="${x.id}">${t('Reportar')}</button>`}${mine || isAdmin() ? `<button type="button" role="menuitem" class="danger-link" data-act="c-del" data-id="${esc(s.id)}" data-cid="${x.id}">${t('Eliminar')}</button>` : ''}</div>` : '';
  return `<div class="comment ${sub ? 'reply' : ''} ${x.by === s.owner ? 'by-own' : ''}" id="cm-${x.id}">${framedAvatar(x.by, sub ? 's30' : 's38')}<div class="c-main">
    <div class="c-bubble"><div class="c-meta"><a href="#/user/${encodeURIComponent(x.by)}"><strong>${esc(uName(x.by))}</strong></a>${x.by === s.owner ? `<span class="c-badge own">${t('Autoría')}</span>` : ''}${role ? `<span class="c-badge staff">${esc(role)}</span>` : ''}${relSpan(x)}${x.edited ? `<span class="c-ed">· ${t('editado')}</span>` : ''}
      <span class="c-more-wrap"><button type="button" class="c-more" data-act="c-more" data-cid="${x.id}" aria-label="${esc(t('Más opciones'))}" aria-expanded="${MENUC === x.id}">⋯</button>${menu}</span></div>
    ${EDITC === x.id ? `<textarea id="c-edit-text" class="textarea" style="min-height:70px;margin-top:6px" maxlength="300">${esc(x.text)}</textarea><div class="c-actions"><button class="button sm" data-act="c-save" data-id="${esc(s.id)}" data-cid="${x.id}">${t('Guardar')}</button><button class="button ghost sm" data-act="c-cancel">${t('Cancelar')}</button></div>` : `<div class="c-text">${esc(x.text)}</div>`}</div>
    ${EDITC === x.id ? '' : `<div class="c-actions"><button type="button" class="c-heart ${liked ? 'on' : ''}" data-act="c-like" data-id="${esc(s.id)}" data-cid="${x.id}" aria-pressed="${liked}" aria-label="${esc(liked ? t('Quitar me gusta') : t('Me gusta'))}">${HEART}<span class="c-n">${lk.length || ''}</span></button><button type="button" class="c-act" data-act="c-reply" data-top="${top}" data-pre="${sub ? esc('@' + uName(x.by) + ' ') : ''}">${ICO_REPLY}${t('Responder')}</button>${authLike(x, s)}</div>`}${extra}</div></div>`;
}
function commentsHTML(s, ci = 0) {
  const all = comments(s.id, ci).filter(c => !hidesFrom(c.by)), tops = all.filter(c => !c.parent);
  return `<section class="panel" style="margin-top:20px"><h2>${t('Comentarios ({n})', { n: all.length })}</h2>
  ${isGuest() ? guestCompose('comentar') : ''}<form data-form="comment" data-id="${esc(s.id)}" data-ch="${ci}" class="c-compose" ${isGuest() ? 'style="display:none"' : ''}>${framedAvatar(S.user)}<div class="c-pill"><input id="c-text" maxlength="300" placeholder="${esc(t('Escribe un comentario…'))}" aria-label="${esc(t('Escribe un comentario'))}" autocomplete="off"><button class="c-send" type="submit" aria-label="${esc(t('Enviar comentario'))}">${ICO_SEND}</button></div></form>
  ${tops.length ? tops.map(x => {
    const reps = all.filter(r => r.parent === x.id), open = REPOPEN.has(x.id);
    const rf = REPLYTO === x.id ? `<form data-form="reply" data-id="${esc(s.id)}" data-cid="${x.id}" class="c-replyform">${framedAvatar(S.user, 's30')}<div class="c-pill"><input id="c-reply-text" maxlength="300" value="${esc(REPLYPRE)}" placeholder="${esc(t('Escribe una respuesta…'))}" aria-label="${esc(t('Tu respuesta'))}" autocomplete="off"><button class="c-send" type="submit" aria-label="${esc(t('Enviar respuesta'))}">${ICO_SEND}</button></div><button type="button" class="c-act" data-act="c-reply-cancel">${t('Cancelar')}</button></form>` : '';
    const tg = reps.length ? `<button type="button" class="c-rtoggle" data-act="c-replies" data-cid="${x.id}" aria-expanded="${open}"><i class="c-line"></i>${open ? t('Ocultar respuestas') : t('Ver las respuestas ({n})', { n: reps.length })}</button>` : '';
    return cmRow(x, s, false, `${tg}${open ? `<div class="c-replies">${reps.map(r => cmRow(r, s, true)).join('')}</div>` : ''}${rf}`);
  }).join('') : `<p class="helper">${t('Sé la primera persona en comentar.')}</p>`}</section>`;
}

/* --- Mi perfil / perfil de otra persona --- */
const likesReceived = e => publishedStories().filter(s => s.owner === e).reduce((a, s) => a + likes(s.id).length, 0);
/** Perfil: portada con desvanecimiento hacia abajo, foto circular con aro, cifras que se pueden tocar y la pestaña de libros publicados */
let PFEDIT = false, EPD = null;                          // EPD: lo escrito en Editar perfil (no se pierde al cambiar una foto)
document.addEventListener('input', ev => { if (ev.target && (ev.target.id === 'pf-name' || ev.target.id === 'pf-bio')) EPD = { name: ($('#pf-name') || {}).value || '', bio: ($('#pf-bio') || {}).value || '' }; const c = $('#pf-cnt'); if (c) c.textContent = EPD.bio.length + '/500'; });
function profileHero(e, own, acts = '') {
  const u = getUsers()[e] || {}, pubs = publishedStories().filter(s => s.owner === e), has = safeImg(u.banner), role = ROLE_LABEL[roleOf(e)], sk = own ? strikesOf(e) : [];
  const lk = !own && (getUsers()[e] || {}).hideLists, stat = (n, l, act, kind) => act && !(lk && act === 'pf-list') ? `<button type="button" class="pfs" data-act="${act}" data-id="${esc(e)}" data-kind="${kind || ''}"><b>${n}</b><small>${l}</small></button>` : `<span class="pfs"><b>${n}</b><small>${l}</small></span>`;
  return `<section class="pf-hero"><div class="pf-banner" ${has ? `style="background-image:url('${esc(u.banner)}')"` : ''}>
    ${sk.length && !cfg('hideStrikeBtn') ? `<button type="button" class="pf-warn" data-act="strike-info" aria-label="${esc(t('Aviso de strikes'))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/></svg></button>` : ''}
    <div class="pf-fade"></div></div>
  <div class="pf-id"><div class="pf-av">${frWrap(e, 'xl', avatarHTML(u.avatar, u.name, 'xl'))}${stProfBubble(e)}</div>
    <div class="pf-info"><h1 class="pf-name serif ${nmCls(e)}">${esc(u.name || t('Mi perfil'))}${onlineDot(e)}</h1>${role || mbtiOf(e) ? `<div class="pf-tags">${role ? `<span class="role-tag ${roleOf(e).toLowerCase()}">🛡 ${t(role)}</span>` : ''}${mbtiBadge(e)}</div>` : ''}
</div>
    ${acts ? `<div class="pf-acts">${acts}</div>` : ''}</div>
  <div class="pf-stats-row">${stat(followers(e).length, t('Seguidores'), 'pf-list', 'followers')}${stat(following(e).length, t('Seguidos'), 'pf-list', 'following')}${stat(pubs.length, t('Libros publicados'), 'pf-works')}${stat(likesReceived(e), t('Likes'))}</div>
  ${bioBlock(e, u, own)}
  <div class="pf-tab" id="pf-works"><span>${ICON.books} ${t('Libros publicados')}</span></div></section>`;
}
/** Lista de seguidores o de seguidos (al tocar la cifra) */
function openUserList(e, kind) {
  if (e !== S.user && (getUsers()[e] || {}).hideLists) return toast(t('Esta persona mantiene privadas sus listas.'));
  const us = getUsers(), list = (kind === 'following' ? following(e) : followers(e)).filter(x => us[x] && us[x].name && x !== GUEST && !iBlock(x));
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><h2>${kind === 'following' ? t('Seguidos') : t('Seguidores')} · ${list.length}</h2>
    ${list.length ? `<div class="user-list">${list.map(x => `<a class="user-card panel" href="#/user/${encodeURIComponent(x)}" data-dir="next">${frWrap(x, 'sm', avatarHTML(us[x].avatar, us[x].name, 'sm'))}<div class="uc-txt"><b>${esc(us[x].name)}</b>${ROLE_LABEL[roleOf(x)] ? `<span class="role-tag ${roleOf(x).toLowerCase()}">🛡 ${t(ROLE_LABEL[roleOf(x)])}</span>` : ''}</div></a>`).join('')}</div>` : `<p class="helper">${t('Aún no hay nadie aquí.')}</p>`}</div>`;
  m.addEventListener('click', ev => { if (ev.target === m || ev.target.closest('[data-no]') || ev.target.closest('a')) m.remove(); });
  document.body.appendChild(m);
}
/** Aviso discreto de strikes (botón amarillo en la esquina de tu perfil) */
const AI_LBL = { sexual: 'contenido sexual o sugerente', 'sexual/minors': 'posible contenido sexual con menores', violence: 'violencia', 'violence/graphic': 'violencia gráfica', 'self-harm': 'autolesión', 'self-harm/intent': 'intención de autolesión', 'self-harm/instructions': 'instrucciones de autolesión', hate: 'odio', 'hate/threatening': 'odio con amenazas', harassment: 'acoso', 'harassment/threatening': 'acoso con amenazas', 'illicit': 'actividad ilegal', 'illicit/violent': 'actividad ilegal violenta' };
function openAiInfo(sid, cid) {
  const s = S.stories.find(v => v.id === sid), c = s && s.chapters.find(x => String(x.id) === String(cid)); if (!c) return;
  const a = c.ai, rs = (a && a.reasons) || [];
  if (!a || a.verdict !== 'flagged') {
    const top = ((a && a.top) || []).map(x => `<li>${esc(t(AI_LBL[x.cat] || x.cat))} <b>(${Math.round(x.score * 100)}%)</b></li>`).join('');
    const m0 = formModal('🤖 Qué detectó la IA', a ? `<p>${t('La IA no encontró problemas en este capítulo.')}</p>${top ? `<p class="helper">${t('Puntajes más altos:')}</p><ul class="ai-list">${top}</ul>` : ''}` : `<p>${t('La IA todavía no revisó este capítulo (o la revisión falló). Revísalo tú.')}</p>`, 'Entendido', () => {});
    const n0 = m0.querySelector('[data-no]'); if (n0) n0.style.display = 'none'; return;
  }
  const m = formModal('🤖 Qué detectó la IA', `<p>${rs.length ? t('Marcó este capítulo por:') : t('Pidió una revisión humana.')}</p>${rs.length ? `<ul class="ai-list">${rs.map(r => `<li>${esc(t(r.label))} <b>(${Math.round((r.score || 0) * 100)}%)</b></li>`).join('')}</ul>` : ''}<p class="helper">${a.mature ? t('Libro +18') : t('Libro sin marca +18')}</p>${a.excerpt ? `<details><summary>${t('Fragmento que preocupó')}</summary><p>«${esc(a.excerpt)}…»</p></details>` : ''}<p class="helper">${t('Es una ayuda automática y puede equivocarse: decide tú.')}</p>`, 'Entendido', () => {});
  const no = m.querySelector('[data-no]'); if (no) no.style.display = 'none';
}
function openStrikeInfo() {
  const sk = strikesOf(S.user); if (!sk.length) return; const last = sk[sk.length - 1];
  const m = formModal('Aviso de strikes', `<p>${tn(sk.length, 'Tienes {n} strike', 'Tienes {n} strikes')}</p><p class="helper">${t('Último motivo: {x}', { x: esc(last.reason) })}</p>
    <button type="button" class="button ghost sm" data-hide-strike style="margin-top:8px">${t('Ocultar este botón')}</button><p class="helper">${t('Puedes volver a mostrarlo en Ajustes › Notificaciones.')}</p>`, 'Ver detalle', () => { go('/strike/' + last.id); });
  m.querySelector('[data-hide-strike]').onclick = () => { setCfg('hideStrikeBtn', true); m.remove(); KEEP = true; render(); toast(t('Botón oculto.')); };
}
const worksGrid = list => list.length ? `<div class="story-grid">${list.map(storyCard).join('')}</div>` : empty('Aún no hay obras publicadas', 'Cuando se publique una historia aparecerá aquí.', '<a class="button secondary" href="#/write">' + t('Escribir una historia') + '</a>');
/** Pendientes del equipo: libros por revisar, reportes, cuentas, publicaciones y apelaciones (cada tipo según lo que esa persona puede ver) */
function modCounts() {
  if (!isStaff()) return { books: 0, reports: 0, accounts: 0, posts: 0, appeals: 0, total: 0 };
  const c = { books: pendingBooks().filter(s => inScope(commOf(s.owner))).length, reports: openReports(), accounts: accRows().filter(a => a.open).length, posts: canBan() ? pendingPosts().length : 0, appeals: canBan() ? openAppeals() : 0, bugs: openBugs() };
  return { ...c, total: c.books + c.reports + c.accounts + c.posts + c.appeals + c.bugs };
}
const redN = n => n > 0 ? `<b class="nbadge" aria-label="${esc(t('{n} por revisar', { n }))}">${n > 99 ? '99+' : n}</b>` : '';
const profileExtras = () => isStaff() ? `<section class="panel" style="margin-top:22px"><div class="toggle-line" style="border:0;margin:0;padding:0"><div><strong>${t('🛡 Moderación')}</strong> ${redN(modCounts().total)}<div class="helper">${t('Capítulos por revisar')}${pendingBooks().length ? ' (' + tn(pendingBooks().length, '{n} libro', '{n} libros') + ')' : ''}. ${t('Reportes abiertos: {n}.', { n: openReports() })}</div></div><a class="button secondary" href="#/moderation${openReports() && !pendingBooks().length ? '/reports' : ''}">${t('Abrir')}</a></div></section>` : '';
function readersOf(sid, owner) {
  const us = LS.get('auri.users', {}), out = [];
  for (const e in us) { if (e === owner) continue; const p = LS.get('auri.u.' + e + '.progress', {})[sid], r = Array.isArray(p) ? p : p ? [0] : [];
    out.push({ e, r, lib: LS.get('auri.u.' + e + '.lib', []).includes(sid), fav: LS.get('auri.u.' + e + '.favs', []).includes(sid) }); }
  return out;
}
function statsView() {
  const back = '<a class="button ghost sm" href="#/profile" data-dir="prev">' + t('‹ Mi perfil') + '</a>';
  const books = S.stories.map(s => ({ s, ps: publicPrefix(s.chapters) })).filter(x => x.ps.length).map(({ s, ps }) => {
    const R = readersOf(s.id, S.user), rd = R.filter(x => x.r.length), n = ps.length, per = ps.map((_, i) => rd.filter(x => x.r.includes(i)).length);
    let worst = -1, drop = 0; for (let i = 1; i < n; i++) if (per[i - 1] - per[i] > drop) { drop = per[i - 1] - per[i]; worst = i; }
    return { s, n, rd, per, fin: rd.filter(x => x.r.includes(n - 1)).length, libs: R.filter(x => x.lib).length, favs: R.filter(x => x.fav).length, lk: likes(s.id).length, cm: comments(s.id).length, worst, drop, ps };
  });
  if (!books.length) return `<main class="page story-layout">${back}${empty('Aún no hay estadísticas', 'Cuando tengas una obra aprobada, aquí verás quién la lee, hasta dónde llegan y qué les gusta.', '<a class="button" href="#/write">' + t('Escribir una historia') + '</a>')}</main>`;
  const uniq = new Set(); books.forEach(b => b.rd.forEach(x => uniq.add(x.e)));
  const sum = k => books.reduce((a, b) => a + b[k], 0), card = (n, l) => `<div class="st-card"><b>${n}</b><span>${l}</span></div>`;
  return `<main class="page story-layout">${back}<div class="section-head"><div><span class="eyebrow">${t('📊 Estadísticas')}</span><h2 style="margin-top:8px">${t('Tus lectores')}</h2><p>${t('Qué pasa con tus obras publicadas.')}</p></div></div>
  <div class="st-cards">${card(uniq.size, t('lectores'))}${card(sum('lk'), t('likes'))}${card(sum('cm'), t('comentarios'))}${card(sum('libs'), t('en bibliotecas'))}</div>
  ${books.map(b => { const mx = Math.max(1, ...b.per); return `<section class="panel st-book"><h3 class="serif">${esc(b.s.title)}</h3>
    <div class="st-mini"><span>👀 ${tn(b.rd.length, '{n} lector', '{n} lectores')}</span><span>🏁 ${t('{n} terminaron', { n: b.fin })}</span><span>📚 ${t('{n} en biblioteca', { n: b.libs })}</span><span>♥ ${t('{n} favoritos', { n: b.favs })}</span><span class="hrt-i">${HEART} ${b.lk}</span><span>💬 ${b.cm}</span></div>
    <h4>${t('Lectores por capítulo')}</h4>${b.ps.map((c, i) => `<div class="st-row"><span class="st-l">${t('Cap. {n}', { n: i + 1 })}</span><span class="st-bar"><i style="width:${Math.round(b.per[i] / mx * 100)}%"></i></span><span class="st-n">${b.per[i]}</span></div>`).join('')}
    ${b.worst > 0 && b.drop > 0 ? `<p class="helper">${tn(b.drop, 'La mayor caída es entre el capítulo {a} y el {b}: {n} lector menos. Quizá valga la pena revisar ese tramo.', 'La mayor caída es entre el capítulo {a} y el {b}: {n} lectores menos. Quizá valga la pena revisar ese tramo.', { a: b.worst, b: b.worst + 1 })}</p>` : ''}</section>`; }).join('')}
  <p class="notice">${t('Por ahora se cuentan solo las cuentas de este dispositivo. Con el servidor se sumarán todas las lecturas.')}</p></main>`;
}
const readMin = txt => Math.max(1, Math.ceil(String(txt || '').replace(/::\w+ ?/g, '').trim().split(/\s+/).filter(Boolean).length / 200));
function rfLeft() {                                      // «quedan N min» en la cabecera del lector, según lo que llevas leído
  const e = $('#rf-left'); if (!e) return; const tot = +e.dataset.tot || 1, left = Math.ceil(tot * (1 - scrollPct()));
  e.textContent = left <= 0 || scrollPct() > 0.97 ? t('Fin del capítulo') : t('{n} min restantes', { n: left });
}
function bioFit() {                                      // biografía larga: 3 líneas con «… Ver más» al final del texto; abierta: todo + «Ver menos»
  document.querySelectorAll('.pf-bio[data-full]').forEach(p => {
    const full = p.dataset.full, open = p.closest('.pf-bio-box').classList.contains('open');
    const put = (txt, label) => { p.textContent = txt; if (label) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pf-bio-more'; b.dataset.act = 'bio-more'; b.textContent = t(label); p.appendChild(b); } };
    if (open) return put(full + ' ', 'Ver menos');
    const lh = parseFloat(getComputedStyle(p).lineHeight) || 22, max = lh * 3 + 3;
    put(full, ''); if (p.scrollHeight <= max) return;
    let lo = 0, hi = full.length;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); put(full.slice(0, mid).replace(/[.,;:\s]+$/, '') + '… ', 'Ver más'); if (p.scrollHeight <= max) lo = mid; else hi = mid - 1; }
    put(full.slice(0, lo).replace(/[.,;:\s]+$/, '') + '… ', 'Ver más');
  });
}
window.addEventListener('resize', () => bioFit());
const bioBlock = (e, u, own) => {                         // biografía: bloque suave bajo las cifras, con "Ver más" si es larga
  const b = String(u.bio || '').trim();
  if (!b) return own ? `<a class="pf-bio-add" href="#/profile/edit" data-dir="next">${t('Añadir una biografía')}</a>` : '';
  const long = b.length > 150 || (b.match(/\n/g) || []).length >= 3;
  return `<section class="pf-bio-box" aria-label="${esc(t('Biografía'))}"><p class="pf-bio" ${long ? `data-full="${esc(b)}"` : ''}>${long ? '' : esc(b)}</p></section>`;
};
function profileView() {
  const u = getUsers()[S.user] || {}, works = S.stories.filter(s => storyState(s) !== 'draft').map(s => ({ ...s, owner: S.user, author: u.name }));
  const acts = `<a class="button secondary sm" href="#/profile/edit" data-dir="next">✏️ ${t('Editar perfil')}</a>`, edit = '';
  return `<main class="page pf-page">${profileHero(S.user, true, acts)}${edit}
  <div class="pf-tools"><a class="button ghost sm" href="#/stats" data-dir="next">${t('📊 Estadísticas')}</a><a class="button sm" href="#/write">${t('＋ Nueva')}</a></div>${worksGrid(works)}
  ${charsSection()}${profileExtras()}</main>`;
}
/** Pantalla "Editar perfil" (estilo redes sociales): portada y foto arriba, y debajo los datos en filas */
const EPI = {
  cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6h6.6l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.6"/><path d="M5 20c.6-3.7 3.4-5.6 7-5.6s6.4 1.9 7 5.6"/></svg>',
  feather: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 4.5c-6.5-.4-11 3.2-12 9.5L5 19l1.2.4 1.8-3.6c5.6.2 10.2-3.4 11.5-11.3z"/><path d="M8.2 15.4 14 9.6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.3 10.1 12.8 4.5 10.9 10.1 9z"/><path d="M19 3.5v3M17.5 5h3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 5 6v5.6c0 4.2 2.9 7.2 7 8.9 4.1-1.7 7-4.7 7-8.9V6z"/><path d="m9.2 12.2 2 2 3.6-4"/></svg>',
  frame: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.4"/></svg>',
  leaves: '<svg viewBox="0 0 120 200" aria-hidden="true"><path d="M60 196C58 150 62 100 78 30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><g fill="currentColor"><path d="M62 150c-16-2-26-12-28-26 15 0 27 8 28 26z"/><path d="M63 118c14-4 23-15 24-29-14 3-24 13-24 29z"/><path d="M67 86c-15-3-24-14-26-28 14 1 26 11 26 28z"/><path d="M71 58c12-5 19-15 19-28-12 4-20 13-19 28z"/><path d="M76 34c-8-8-9-18-5-28 8 8 9 18 5 28z"/></g></svg>'
};
const shapeIco = k => k ? `<svg viewBox="0 0 1 1" aria-hidden="true"><path d="${SHAPE_D[k]}" fill="currentColor" opacity=".85"/></svg>` : '<svg viewBox="0 0 1 1" aria-hidden="true"><circle cx=".5" cy=".5" r=".44" fill="currentColor" opacity=".85"/></svg>';
/** Pantalla "Editar perfil": portada y foto arriba, tarjetas con los datos, personalización y privacidad */
function editProfileView() {
  const u = getUsers()[S.user] || {}, has = safeImg(u.banner), n = ownedFrames(S.user), locked = frameLocked(S.user), k = frameKey(S.user), owner = roleOf(S.user) === 'OWNER';
  const frameLine = locked ? t('Tu insignia es fija') : k ? t(FR_NAME[k]) : n.length ? t('Sin insignia') : t('Aún no tienes insignias');
  const lk = owner ? lookOf(S.user) : null, bio = EPD ? EPD.bio : (u.bio || '');
  const look = owner ? `<h3 class="ep-h">${EPI.spark}<span>${t('Forma de la foto')}</span></h3><p class="ep-help">${t('Solo tú las tienes por ahora. Elige cómo se ve tu foto de perfil.')}</p>
    <div class="ep-shapes" role="group" aria-label="${esc(t('Forma'))}">${Object.keys(SHAPES).map(x => `<button type="button" class="ep-shape ${(lk.shape || '') === x ? 'on' : ''}" data-act="ep-shape" data-id="${x}" aria-pressed="${(lk.shape || '') === x}" aria-label="${esc(t(SHAPES[x]))}" title="${esc(t(SHAPES[x]))}">${shapeIco(x)}<small>${esc(t(SHAPES[x]))}</small></button>`).join('')}</div>
    <h3 class="ep-h"><i class="ep-dot"></i><span>${t('Borde de color')}</span></h3>
    <div class="ep-halos" role="group" aria-label="${esc(t('Borde de color'))}">${[['', 'Sin borde'], ...Object.entries(HALOS).map(([x, v]) => [x, v[1]])].map(([x, nm]) => `<button type="button" class="ep-halo ${(lk.halo || '') === x ? 'on' : ''}" data-act="ep-halo" data-id="${x}" aria-pressed="${(lk.halo || '') === x}" aria-label="${esc(t(nm))}" title="${esc(t(nm))}"><i class="${x ? '' : 'none'}" style="${x ? 'background:' + HALOS[x][0] : ''}"></i></button>`).join('')}</div>` : '';
  return `<main class="page story-layout ep-page ep2"><div class="ep-top"><a class="icon-btn" href="#/profile" data-dir="prev" aria-label="${esc(t('Volver'))}">‹</a><h2>${t('Editar perfil')}</h2><button type="submit" form="ep-form" class="button sm ep-save">${t('Guardar')}</button></div>
  ${imgOpen().length ? `<a class="img-alert" href="#/images" data-dir="next"><b>${t('Una de tus imágenes fue ocultada')}</b><span>${t('Ver qué pasó y pedir revisión')}</span><i aria-hidden="true">›</i></a>` : ''}
  <section class="ep-media"><div class="ep-banner" ${has ? `style="background-image:url('${esc(u.banner)}')"` : ''}>${has ? '' : `<span class="ep-leaf l">${EPI.leaves}</span><span class="ep-leaf r">${EPI.leaves}</span>`}<div class="ep-bn-chips">${has ? `<button type="button" class="ep-chip" data-act="bn-adjust">${t('Ajustar portada')}</button><button type="button" class="ep-chip" data-act="bn-clear">${t('Quitar portada')}</button>` : ''}</div><label class="ep-cam" style="cursor:pointer" aria-label="${esc(t('Cambiar portada'))}">${EPI.cam}<input id="bn-file" type="file" accept="image/*" hidden></label></div>
    <div class="ep-av">${frWrap(S.user, 'xl', avatarHTML(u.avatar, u.name, 'xl'))}<label class="ep-cam sm" style="cursor:pointer" aria-label="${esc(t('Cambiar foto'))}">${EPI.cam}<input id="av-file" type="file" accept="image/*" hidden></label></div>
    <div class="ep-av-acts"><label class="ep-chip" style="cursor:pointer">${u.avatar ? t('Cambiar foto de perfil') : t('Añadir foto de perfil')}<input id="av-file2" type="file" accept="image/*" hidden></label>${u.avatar ? `<button type="button" class="ep-chip" data-act="av-adjust">${t('Ajustar')}</button><button type="button" class="ep-chip" data-act="av-clear">${t('Quitar')}</button>` : ''}</div></section>
  <form id="ep-form" data-form="myprofile" class="ep-form">
    <div class="ep-card"><label for="pf-name"><span class="ep-ico">${EPI.user}</span>${t('Usuario')}</label><input id="pf-name" class="ep-input" maxlength="30" value="${esc(EPD ? EPD.name : u.name)}"></div>
    <div class="ep-card"><label for="pf-bio"><span class="ep-ico">${EPI.feather}</span>${t('Biografía')}<small id="pf-cnt">${bio.length}/500</small></label><textarea id="pf-bio" class="ep-input" maxlength="500" rows="5" placeholder="${esc(t('Cuéntales algo sobre ti…'))}">${esc(bio)}</textarea></div>
    ${look}
    <button type="button" class="ep-row" data-act="mbti"><span><b>MBTI</b><small>${mbtiOf(S.user) ? `${mbtiOf(S.user)} · ${t(mbtiGroup(mbtiOf(S.user))[1])}` : t('Elige tu tipo de personalidad')}</small></span><i aria-hidden="true">›</i></button>
    <h3 class="ep-h">${EPI.frame}<span>${t('Insignias y adornos')}</span></h3>
    <button type="button" class="ep-row" data-act="frames"><span><b>${t('Marcos')}</b><small>${frameLine}</small></span><i aria-hidden="true">›</i></button>
    <h3 class="ep-h">${EPI.shield}<span>${t('Privacidad')}</span></h3>
    <div class="ep-card ep-sw">${sw('showOnline', cfg('showOnline') !== false, 'Mostrar conexión', 'Un punto verde junto a tu nombre cuando estás conectada o conectado.')}${sw('hideLists', !!u.hideLists, 'Ocultar mis listas', 'Nadie más ve quién te sigue ni a quién sigues. Los números siguen visibles.')}</div>
${isOwner() ? `<h3 class="ep-h">${EPI.spark}<span>${t('Pruebas de Auri')}</span></h3><button type="button" class="ep-row" data-act="isle-test" data-id="sleep"><span><b>${t('Reproducir: Auri dormido')}</b><small>${t('Solo para ti. No espera los 3 días.')}</small></span><i aria-hidden="true">›</i></button><button type="button" class="ep-row" data-act="isle-test" data-id="dizzy"><span><b>${t('Reproducir: Auri mareado')}</b><small>${t('Ojos de espiral.')}</small></span><i aria-hidden="true">›</i></button>` : ''}
    <div class="ep-actions"><button type="submit" class="button ep-save-b">${t('Guardar')}</button><a class="button secondary" href="#/profile" data-dir="prev">${t('Cancelar')}</a></div>
  </form></main>`;
}
/** Insignias y adornos: abajo (A de Auri, Top 50) y arriba (corona de Owner o cosméticos). Moderación y administración tienen la A fija */
function openFrames() {
  const me = S.user, n = ownedFrames(me), locked = frameLocked(me), cur = frameKey(me), u = getUsers()[me] || {}, owner = roleOf(me) === 'OWNER', curTop = topKey(me);
  const av = (bot, top) => `<span class="fr sm">${avatarHTML(u.avatar, u.name, 'sm')}${ornHTMLk(bot, top)}</span>`;
  const row = (key, label) => `<button type="button" class="fr-opt ${cur === key ? 'on' : ''}" data-fr="${key}">${av(key, '')}<b>${esc(label)}</b>${cur === key ? '<i>✓</i>' : ''}</button>`;
  const rowT = (val, label) => `<button type="button" class="fr-opt ${curTop === val ? 'on' : ''}" data-cos="${val}">${av('', val)}<b>${esc(label)}</b>${curTop === val ? '<i>✓</i>' : ''}</button>`;
  const bot = locked ? `<div class="fr-opt on" style="cursor:default">${av(cur, '')}<b>${esc(t(FR_NAME[cur] || 'Insignia de moderación'))}</b><i>🔒</i></div><p class="helper">${t('La insignia del equipo es fija: no se puede cambiar ni quitar.')}</p>`
    : n.length ? `<div class="fr-list">${n.map(k => row(k, t(FR_NAME[k]))).join('')}${row('', t('Sin insignia'))}</div>` : `<p class="helper">${t('Aún no tienes insignias.')}</p>`;
  const mine = bowsOf(me);
  const top = owner || mine.length ? `<div class="fr-list">${owner ? rowT('crown', t('Corona de Owner')) : ''}${rowT('', t('Sin adorno'))}</div><p class="helper" style="margin:12px 0 6px">${owner ? t('Lazos (para regalar a otras cuentas desde su perfil)') : t('Tus lazos')}</p><div class="cos-sw">${mine.map(k => `<button type="button" class="cos-b ${curTop === 'bow:' + k ? 'on' : ''}" data-cos="bow:${k}" aria-label="${esc(t(BOWS[k][3]))}" title="${esc(t(BOWS[k][3]))}">${svgTop('bow:' + k)}</button>`).join('')}</div>`
    : `<p class="helper">${t('Pronto habrá adornos para ponerte aquí, en la tienda.')}</p>`;
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Insignias y adornos')}</h2><h3 class="fr-h">${t('Abajo')}</h3>${bot}<h3 class="fr-h">${t('Arriba')}</h3>${top}</div>`;
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-fr]'), c = ev.target.closest('[data-cos]');
    if (b && !locked) { const us = getUsers(); us[me].frameSel = b.dataset.fr; G.set('users', us); sbPushFrame(); m.remove(); KEEP = true; render(); return; }
    if (c && (owner || c.dataset.cos === '' || bowsOf(me).includes(String(c.dataset.cos).split(':')[1] || ''))) { const us = getUsers(); us[me].cosTop = c.dataset.cos; G.set('users', us); sbPushCos(); m.remove(); KEEP = true; render(); return; }
    if (ev.target === m || ev.target.closest('[data-no]')) m.remove();
  });
  document.body.appendChild(m);
}

const THEMES = {
  violeta: { n: 'Violeta', L: { bg: '#faf6ff', card: '#fff', hero: 'linear-gradient(112deg,#fff,#e4d1fb)', pr: '#9e72d9', btn: 'linear-gradient(115deg,#9e72d9,#7147ac)', tx: '#3d2b50', mu: '#756b7d', ch: '#eee3fa' }, D: { bg: '#1c1830', card: '#262038', hero: 'linear-gradient(112deg,#241d36,#3a2a5c)', pr: '#b88df0', btn: 'linear-gradient(115deg,#9e72d9,#7147ac)', tx: '#eadcf8', mu: '#b3a7c0', ch: '#3a2f55' } },
  rosa: { n: 'Rosa', L: { bg: '#fff5f9', card: '#fff', hero: 'linear-gradient(112deg,#fff,#fbd0e1)', pr: '#ee86ae', btn: 'linear-gradient(115deg,#ee86ae,#d4578a)', tx: '#5a2a42', mu: '#7d6a74', ch: '#fbe4ee' }, D: { bg: '#1f161b', card: '#2a1d24', hero: 'linear-gradient(112deg,#2b1822,#52293f)', pr: '#f08fb5', btn: 'linear-gradient(115deg,#ee86ae,#d4578a)', tx: '#fadce9', mu: '#c7a9b7', ch: '#4a2c3b' } },
  azul: { n: 'Azul', L: { bg: '#f4f9ff', card: '#fff', hero: 'linear-gradient(112deg,#fff,#cfe3fc)', pr: '#6aaaf0', btn: 'linear-gradient(115deg,#6aaaf0,#3b78c9)', tx: '#1f3a5c', mu: '#66758a', ch: '#e1eefc' }, D: { bg: '#131a26', card: '#1b2536', hero: 'linear-gradient(112deg,#16223a,#243f6a)', pr: '#6fb0f5', btn: 'linear-gradient(115deg,#6aaaf0,#3b78c9)', tx: '#dcebfb', mu: '#a9b9cc', ch: '#2a3d58' } },
  naranja: { n: 'Naranja', L: { bg: '#fff8f1', card: '#fff', hero: 'linear-gradient(112deg,#fff,#fcd9b8)', pr: '#f59a55', btn: 'linear-gradient(115deg,#f59a55,#df6f26)', tx: '#5a321a', mu: '#85705f', ch: '#fde8d3' }, D: { bg: '#1c1510', card: '#281d16', hero: 'linear-gradient(112deg,#2b1c14,#5a331a)', pr: '#f6a05e', btn: 'linear-gradient(115deg,#f59a55,#df6f26)', tx: '#fde3cf', mu: '#cbb09a', ch: '#4a3022' } }
};
function themeMock(c, label) {
  return `<div class="tm-phone" style="background:${c.bg};color:${c.tx}"><div class="tm-top"><i style="background:${c.card}"></i><i style="background:${c.card}"></i><i class="tm-av" style="background:${c.btn}"></i></div>
  <div class="tm-hero" style="background:${c.hero}"><b>${esc(t('Encuentra tu próxima emoción'))}</b><span class="tm-btn" style="background:${c.btn}">${esc(t('Leer'))}</span></div>
  <div class="tm-chips"><span style="background:${c.ch};color:${c.tx}">${esc(t('Libros'))}</span><span style="background:${c.card};color:${c.mu}">${esc(t('Usuarios'))}</span></div>
  <div class="tm-books"><i style="background:${c.card}"></i><i style="background:${c.card}"></i><i style="background:${c.card}"></i></div>
  <div class="tm-nav" style="background:${c.card}"><i style="background:${c.pr}"></i><i style="background:${c.mu}"></i><i class="tm-plus" style="background:${c.btn}"></i><i style="background:${c.mu}"></i><i style="background:${c.mu}"></i></div><em>${esc(label)}</em></div>`;
}
function openThemes() {
  let pick = accentOf(S.user) || 'violeta';
  const m = document.createElement('div'); m.className = 'modal sheet';
  const body = () => `<button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Tema de color')}</h2><p class="helper">${t('Así se ve en modo claro y en modo oscuro. Quien visite tu perfil lo verá con tu color.')}</p>
  <div class="tm-demo">${themeMock(THEMES[pick].L, t('Claro'))}${themeMock(THEMES[pick].D, t('Oscuro'))}</div>
  <div class="tm-pick">${Object.entries(THEMES).map(([k, v]) => `<button type="button" class="tm-opt ${pick === k ? 'on' : ''}" data-pick="${k}" aria-pressed="${pick === k}"><span class="tm-circ" style="background:linear-gradient(90deg,${v.L.pr} 50%,${v.D.bg} 50%)"></span><b>${t(v.n)}</b></button>`).join('')}</div>
  <button type="button" class="button" data-apply style="width:100%;margin-top:14px">${t('Aplicar')}</button>`;
  const paint = () => { m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">${body()}</div>`; };
  paint();
  m.addEventListener('click', ev => {
    const p = ev.target.closest('[data-pick]');
    if (p) { pick = p.dataset.pick; paint(); return; }
    if (ev.target.closest('[data-apply]')) { setCfg('accent', pick === 'violeta' ? '' : pick); const us = getUsers(); if (us[S.user]) { us[S.user].accent = pick === 'violeta' ? '' : pick; G.set('users', us); } sbPushAccent(); m.remove(); applyAccent(); KEEP = true; render(); toast('Tema cambiado'); return; }
    if (ev.target === m || ev.target.closest('[data-no]')) m.remove();
  });
  document.body.appendChild(m);
}
const MBTI_G = [['an', 'Analistas', '#9b7bd0', ['INTJ', 'INTP', 'ENTJ', 'ENTP']], ['di', 'Diplomáticos', '#4fae82', ['INFJ', 'INFP', 'ENFJ', 'ENFP']], ['ce', 'Centinelas', '#5b93d6', ['ISTJ', 'ISFJ', 'ESTJ', 'ESFJ']], ['ex', 'Exploradores', '#e0b042', ['ISTP', 'ISFP', 'ESTP', 'ESFP']]];
const mbtiOf = e => { const m = String(((getUsers()[e] || {}).mbti) || '').toUpperCase(); return MBTI_G.some(g => g[3].includes(m)) ? m : ''; };
const mbtiGroup = m => MBTI_G.find(g => g[3].includes(m));
const mbtiBadge = e => { const m = mbtiOf(e); if (!m) return ''; const u = getUsers()[e] || {}, g = mbtiGroup(m); return `<span class="mbti-chip" style="--mb:${u.mbtiTheme ? 'hsl(var(--primary))' : g[2]}" title="${esc(t(g[1]))}">${m}</span>`; };
async function sbPushMbti() {
  const s = sbSes(); if (!cloud() || !s || PRES_OFF) return; const u = LS.get('auri.users', {})[String(s.email).toLowerCase()]; if (!u) return;
  await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { mbti: u.mbti || '', mbti_theme: !!u.mbtiTheme } });
}
function openMbti() {
  const me = S.user, m = document.createElement('div'); m.className = 'modal sheet';
  const paint = () => {
    const u = getUsers()[me] || {}, cur = mbtiOf(me);
    m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Tu MBTI')}</h2><p class="helper" style="margin:0 0 12px">${t('Se verá en tu perfil.')}</p>
    ${MBTI_G.map(g => `<div class="mb-row"><span class="mb-g" style="color:${g[2]}">${t(g[1])}</span><div class="mb-grid">${g[3].map(x => `<button type="button" class="mb-opt ${cur === x ? 'on' : ''}" style="--mb:${g[2]}" data-mb="${x}" aria-pressed="${cur === x}">${x}</button>`).join('')}</div></div>`).join('')}
    <div class="toggle-line" style="margin-top:14px"><div><strong>${t('Usar el color de mi tema')}</strong><div class="helper">${t('Tu MBTI se ve con el color de tu tema en lugar del suyo.')}</div></div><button type="button" role="switch" class="switch" aria-checked="${!!u.mbtiTheme}" data-mbt aria-label="${esc(t('Usar el color de mi tema'))}"></button></div>
    ${cur ? `<button type="button" class="button ghost" data-mb="" style="width:100%;margin-top:10px">${t('Quitar mi MBTI')}</button>` : ''}</div>`;
  };
  paint();
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-mb]'), tg = ev.target.closest('[data-mbt]');
    if (b) { const us = getUsers(); if (!us[me]) return; us[me].mbti = b.dataset.mb; G.set('users', us); sbPushMbti(); m.remove(); KEEP = true; render(); return; }
    if (tg) { const us = getUsers(); if (!us[me]) return; us[me].mbtiTheme = !us[me].mbtiTheme; G.set('users', us); sbPushMbti(); paint(); return; }
    if (ev.target === m || ev.target.closest('[data-no]')) m.remove();
  });
  document.body.appendChild(m);
}
async function sbPushAccent() {
  const s = sbSes(); if (!cloud() || !s || PRES_OFF) return; const u = LS.get('auri.users', {})[String(s.email).toLowerCase()]; if (!u) return;
  await sbApi('/rest/v1/profiles?id=eq.' + s.uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { accent: u.accent || '' } });
}
function avoidAdd() {
  const i = $('#avoid-in'); if (!i) return; const k = tagKey(i.value.replace(/^#+/, '')); if (!k) return;
  const l = avoidList(); if (!l.includes(k)) setCfg('avoidTags', [...l, k]); KEEP = true; render(); setTimeout(() => { const j = $('#avoid-in'); if (j) j.focus(); }, 50);
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'avoid-in') { e.preventDefault(); avoidAdd(); } });
function openLook() {
  if (roleOf(S.user) !== 'OWNER') return;
  const u = getUsers()[S.user] || {}, cur = SHAPES[u.shape] && u.shape ? u.shape : '', hc = HALOS[u.halo] ? u.halo : '';
  const av = (shape, halo) => `<span class="fr big"${shape ? ` data-shape="${shape}"` : ''}${halo ? ` data-halo="${halo}" style="--hc:${HALOS[halo][0]}"` : ''}>${avatarHTML(u.avatar, u.name, 'xl')}</span>`;
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="icon-btn close-x" data-no aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Forma y borde de la foto')}</h2><p class="helper">${t('Solo tú las tienes por ahora. Cada forma tiene una animación suave.')}</p>
  <h3 class="fr-h">${t('Forma')}</h3><div class="shp-grid">${Object.keys(SHAPES).map(k => `<button type="button" class="shp-opt ${cur === k ? 'on' : ''}" data-shape="${k}">${av(k, hc)}<span>${t(SHAPES[k])}</span></button>`).join('')}</div>
  <h3 class="fr-h">${t('Borde de color')}</h3><div class="cos-sw">${[['', 'Sin borde'], ...Object.entries(HALOS).map(([k, v]) => [k, v[1]])].map(([k, n]) => `<button type="button" class="cos-b hal-b ${hc === k ? 'on' : ''}" data-halo="${k}" aria-label="${esc(t(n))}" title="${esc(t(n))}"><i style="${k ? 'background:' + HALOS[k][0] : ''}" class="${k ? '' : 'none'}"></i></button>`).join('')}</div></div>`;
  m.addEventListener('click', ev => {
    const a = ev.target.closest('button[data-shape]'), h = ev.target.closest('button[data-halo]');
    if (a || h) { const us = getUsers(); if (a) us[S.user].shape = a.dataset.shape; if (h) us[S.user].halo = h.dataset.halo; G.set('users', us); sbPushLook(); m.remove(); KEEP = true; render(); openLook(); return; }
    if (ev.target === m || ev.target.closest('[data-no]')) m.remove();
  });
  document.body.appendChild(m);
}
function userView(e) {
  const u = getUsers()[e]; sbPres(e);
  if (!u) return `<main class="page">${empty('Perfil no encontrado', 'Esta persona no existe en este dispositivo.', '<a class="button" href="#/">' + t('Volver') + '</a>')}</main>`;
  const works = publishedStories().filter(s => s.owner === e && matureOK(s)), fl = following(S.user).includes(e);
  const acts = `<button class="button ${fl ? 'secondary' : ''}" data-act="follow" data-id="${esc(e)}">${fl ? t('Siguiendo ✓') : t('＋ Seguir')}</button>
  ${dmWhy(S.user, e) === '' ? `<a class="button secondary" href="#/messages/${encodeURIComponent(e)}" data-dir="next">${t('Mensaje')}</a>` : `<button type="button" class="button ghost" data-act="dm-why" data-id="${esc(e)}">${t('Mensaje')}</button>`}
  <div class="pf-more"><button class="button ghost sm" data-act="${iMute(e) ? 'unmute' : 'mute'}" data-id="${esc(e)}">${iMute(e) ? t('🔔 Dejar de silenciar') : t('🔇 Silenciar')}</button><button class="button ghost sm" data-act="${iBlock(e) ? 'unblock' : 'block'}" data-id="${esc(e)}">${iBlock(e) ? t('✅ Desbloquear') : t('🚫 Bloquear')}</button><button class="button ghost sm" data-act="report-user" data-id="${esc(e)}">${t('Reportar')}</button>${imgrOk((getUsers()[e] || {}).avatar) ? `<button class="button ghost sm" data-act="report-pimg" data-id="${esc(e)}" data-k="avatar">${t('Reportar foto')}</button>` : ''}${imgrOk((getUsers()[e] || {}).banner) ? `<button class="button ghost sm" data-act="report-pimg" data-id="${esc(e)}" data-k="banner">${t('Reportar portada del perfil')}</button>` : ''}</div>${imgrProfile(e)}`;
  return `<main class="page pf-page">${profileHero(e, false, acts)}${modUserBooks(e)}${repHistory(e)}${admMenu(e)}${worksGrid(works)}</main>`;
}

/* --- Strikes, suspensión y menú de administración --- */
function strikeView(id) {
  const all = strikesOf(S.user), i = all.findIndex(s => s.id === id), s = all[i];
  if (!s) return `<main class="page">${empty('Strike no encontrado', 'Este aviso ya no está disponible.', '<a class="button" href="#/">' + t('Volver') + '</a>')}</main>`;
  return `<main class="page story-layout"><div class="panel strike-card"><div class="end-emoji">⚠️</div><h2 class="serif" style="text-align:center;margin:0 0 4px">${t('Has recibido un strike')}</h2><p class="helper" style="text-align:center">${esc(fmtDate(s.date))}</p>
  <h3>${t('Motivo indicado por la administración')}</h3><blockquote class="strike-reason">${esc(s.reason)}</blockquote>
  <div class="strike-count"><b>${all.length}</b><span>${tn(all.length, 'strike acumulado', 'strikes acumulados')}</span></div>
  ${all.length > 1 ? `<h3>${t('Historial')}</h3>${all.map((x, k) => `<p class="helper"><b>${k + 1}.</b> ${esc(fmtDate(x.date))} — ${esc(x.reason)}</p>`).join('')}` : ''}
  <p class="helper">${t('Si crees que es un error, puedes escribirle a la administración de Auri Studios.')}</p><a class="button" href="#/">${t('Entendido')}</a></div></main>`;
}
function openAppealForm() {
  const imgs = [];
  const m = formModal('Apelar la decisión', `<p class="helper">${t('Explica qué ocurrió y por qué fue un malentendido. Se pueden adjuntar hasta 4 imágenes como prueba. Administración revisará el caso.')}</p><textarea class="textarea" data-text maxlength="1000" placeholder="${esc(t('Escribe tu explicación…'))}"></textarea><div class="ap-imgs" data-imgs></div>
    <label class="button secondary sm" style="cursor:pointer;margin-top:8px">${t('Adjuntar imágenes')}<input type="file" accept="image/*" multiple data-file hidden></label>`, 'Enviar apelación',
    async mm => { const e = await submitAppeal(mm.querySelector('[data-text]').value, imgs); if (!e) { toast('Apelación enviada'); KEEP = true; render(); } return e; });
  const paint = () => { m.querySelector('[data-imgs]').innerHTML = imgs.map((d, k) => `<span class="ap-th"><img src="${esc(d)}" alt="Prueba ${k + 1}"><button type="button" data-rm="${k}" aria-label="${esc(t('Quitar imagen'))}">✕</button></span>`).join(''); };
  m.querySelector('[data-file]').onchange = ev => { [...ev.target.files].slice(0, 4 - imgs.length).forEach(f => fitPhoto(f, 1000, 1000, d => { if (imgs.length < 4) { imgs.push(d); paint(); } }, .7)); ev.target.value = ''; };
  m.addEventListener('click', ev => { const r = ev.target.closest('[data-rm]'); if (r) { imgs.splice(+r.dataset.rm, 1); paint(); } });
}
function bannedView() {
  const b = activeBan(S.user), ap = myAppeal(b), perm = !b.until;
  const box = ap ? (ap.status === 'open' ? `<p class="notice" style="margin-top:14px">${t('Apelación enviada el {d}. Administración la está revisando.', { d: esc(fmtDate(ap.date) || ap.date) })}</p>` : `<p class="notice" style="margin-top:14px">${t('Apelación rechazada')}${ap.note ? ': ' + esc(ap.note) : '.'}</p>`)
    : `<button class="button" data-act="ap-open" style="margin-top:14px;width:100%">${t('Apelar esta decisión')}</button>`;
  return `<main class="qz-wrap"><div class="qz-card" style="justify-content:center;text-align:center"><div class="end-emoji">🚫</div><h1>${perm ? t('Cuenta bloqueada') : t('Cuenta suspendida')}</h1>
  <p class="helper">${perm ? t('Tu cuenta está bloqueada de forma permanente.') : t('Tu cuenta está suspendida hasta el {d}.', { d: esc(fmtDate(b.until)) })}</p><blockquote class="strike-reason">${esc(b.reason)}</blockquote>${box}
  <button class="button ghost" data-act="logout" style="margin-top:12px">${t('Cerrar sesión')}</button></div></main>`;
}
let AFILT = 'open';
function appealCard(a) {
  const open = a.status === 'open', ex = getUsers()[a.user];
  return `<article class="panel rp ${open ? '' : 'done'}"><div class="rp-head"><span class="pill">${t('Apelación')}</span><span class="helper">${esc(fmtDate(a.date) || a.date)} · ${esc(uName(a.user))}</span></div>
  <div class="rp-ctx"><b>${esc(uName(a.user))}</b><div class="helper">${t('Decisión')}: ${esc(a.ban.reason)}<br>${t('Aplicada por {n}', { n: esc(uName(a.ban.by)) })} · ${a.ban.until ? t('hasta el {d}', { d: esc(fmtDate(a.ban.until)) }) : t('permanente')}</div></div>
  <p class="rp-text">${esc(a.text)}</p>${(a.imgs || []).length ? `<div class="ap-imgs">${a.imgs.map((d, k) => `<button type="button" class="ap-th" data-act="ap-img" data-id="${a.id}" data-i="${k}" aria-label="${esc(t('Ver prueba {n}', { n: k + 1 }))}"><img src="${esc(d)}" alt="${esc(t('Prueba {n}', { n: k + 1 }))}"></button>`).join('')}</div>` : ''}
  <div class="rp-acts">${ex ? `<a class="button ghost sm" href="#/user/${encodeURIComponent(a.user)}" data-dir="next">${t('Perfil')}</a>` : ''}
  ${open ? `<button class="button sm" data-act="ap-release" data-id="${a.id}">${t('Liberar cuenta')}</button><button class="button danger sm" data-act="ap-reject" data-id="${a.id}">${t('Rechazar apelación')}</button>`
    : `<span class="helper">${t(a.status === 'released' ? 'Cuenta liberada por {n} · {d}' : 'Apelación rechazada por {n} · {d}', { n: esc(uName(a.handledBy)), d: esc(fmtDate(a.handledDate) || a.handledDate || '') })}${a.note && a.status === 'rejected' ? ' · ' + esc(a.note) : ''}</span>`}</div></article>`;
}
function appealsView(tabs) {
  const all = appealsAll().filter(a => inScope(commOf(a.user))), l = all.filter(a => (a.status === 'open') === (AFILT === 'open'));
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('Apelaciones')}</span><h2 style="margin-top:8px">${AFILT === 'open' ? t('Por revisar') : t('Ya atendidas')} (${l.length})</h2><p>${t('Lee la explicación y las pruebas. Puedes liberar la cuenta o rechazar la apelación con un motivo.')}</p></div></div>
  <div class="filter-row"><button class="chip ${AFILT === 'open' ? 'active' : ''}" data-act="ap-filter" data-id="open">${t('Abiertas')} (${openAppeals()})</button><button class="chip ${AFILT === 'done' ? 'active' : ''}" data-act="ap-filter" data-id="done">${t('Atendidas')}</button></div>
  ${l.length ? l.map(appealCard).join('') : empty(AFILT === 'open' ? 'Sin apelaciones pendientes' : 'Nada atendido todavía', 'Cuando una cuenta suspendida apele, aparecerá aquí.')}</main>`;
}
/** Ventana con formulario: onYes(modal) devuelve un texto de error (se muestra dentro) o '' para cerrar */
function formModal(title, body, yes, onYes, danger) {
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${esc(t(title))}</h2>${body}<p class="error-line" data-err role="alert"></p><div style="display:flex;gap:10px;margin-top:14px"><button class="button ghost" data-no style="flex:1">${t('Cancelar')}</button><button class="button ${danger ? 'danger' : ''}" data-yes style="flex:1">${esc(t(yes))}</button></div></div>`;
  m.querySelector('[data-no]').onclick = () => m.remove();
  m.querySelector('[data-yes]').onclick = () => { const r = onYes(m), yb = m.querySelector('[data-yes]');
    if (isP(r)) { yb.disabled = true; r.then(e => { if (e) { yb.disabled = false; m.querySelector('[data-err]').textContent = t(e); return; } m.remove(); }); return; }
    if (r) { m.querySelector('[data-err]').textContent = t(r); return; } m.remove(); };
  document.body.appendChild(m); return m;
}
function openStrikeForm(tg) {
  if (!canAct(tg)) return;
  formModal(t('Dar strike a {n}', { n: uName(tg) }), `<p class="helper">${t('La persona recibirá una notificación y verá este motivo.')}</p><textarea class="textarea" data-reason maxlength="500" placeholder="${esc(t('Escribe el motivo del strike…'))}"></textarea>`, 'Dar strike',
    async m => { const e = await giveStrike(tg, m.querySelector('[data-reason]').value); if (!e) { toast('Strike enviado'); KEEP = true; render(); } return e; }, true);
}
function openBanForm(tg) {
  if (!canAct(tg) || !canBan()) return;
  const opts = [[1, t('1 día')], [3, t('3 días')], [7, t('7 días')], [15, t('15 días')], [30, t('30 días')], [90, t('90 días')], ['custom', t('Otro tiempo…')], [0, t('Permanente (bloqueo)')]];
  const m = formModal(t('Suspender o bloquear a {n}', { n: uName(tg) }), `<div class="form-group"><label>${t('Duración')}</label><select class="select" data-days>${opts.map(([v, l]) => `<option value="${v}" ${v === 7 ? 'selected' : ''}>${l}</option>`).join('')}</select><input class="field" data-custom type="number" min="1" max="3650" placeholder="${esc(t('Número de días'))}" style="display:none;margin-top:8px"></div>
    <div class="form-group" style="margin-top:10px"><label>${t('Motivo (la persona lo verá)')}</label><textarea class="textarea" data-reason maxlength="500" placeholder="${esc(t('Escribe el motivo de la suspensión o el bloqueo…'))}"></textarea></div><p class="helper">${t('La persona podrá apelar: escribir su versión y enviar imágenes como prueba. Las apelaciones llegan a Administración.')}</p>`, 'Aplicar',
    async mm => { const sel = mm.querySelector('[data-days]'), d = sel.value === 'custom' ? Math.floor(+mm.querySelector('[data-custom]').value) : +sel.value;
      if (sel.value === 'custom' && !(d >= 1 && d <= 3650)) return t('Escribe un número de días entre 1 y 3650.');
      const e = await applyBan(tg, d, mm.querySelector('[data-reason]').value); if (!e) { toast(d > 0 ? 'Cuenta suspendida' : 'Cuenta bloqueada'); KEEP = true; render(); } return e; }, true);
  m.querySelector('[data-days]').onchange = ev => { m.querySelector('[data-custom]').style.display = ev.target.value === 'custom' ? '' : 'none'; };
}
const TERMS_MOD = ['Usaré las herramientas de moderación solo para proteger a la comunidad, nunca por motivos personales.', 'Trataré con respeto y de forma imparcial a todas las personas, sin favoritismos.', 'Mantendré la confidencialidad de la información a la que acceda por mi rol.',
  'Los strikes y suspensiones que aplique quedan registrados y pueden ser revisados por la Owner.', 'Entiendo que la Owner puede retirar mi rol en cualquier momento.'];
const TERMS_ADM = ['Usaré mis permisos de administración con responsabilidad y solo para proteger a la comunidad.', 'Publicaré anuncios claros, veraces y respetuosos en nombre de Auri Studios.', 'Revisaré los capítulos de forma imparcial y explicaré el motivo cuando rechace uno.',
  'Puedo descender a personas moderadoras, pero no ascender a nadie: eso corresponde a la Owner.', 'Mantendré la confidencialidad de la información a la que acceda por mi rol.', 'Entiendo que la Owner puede retirar mi rol en cualquier momento.'];
function openAcceptMod(nid) {
  const inv = myInvite(nid); if (!inv) return toast('Esta invitación ya no está disponible.');
  const adm = inv.role === 'ADMIN', list = adm ? TERMS_ADM : TERMS_MOD;
  const m = formModal(adm ? 'Términos de Administración' : 'Términos de Moderación', `<ul class="terms">${list.map(x => `<li>${esc(t(x))}</li>`).join('')}</ul><label class="check-line"><input type="checkbox" data-ok> <span>${adm ? t('Acepto los Términos de Administración de Auri Studios') : t('Confirmo que soy mayor de edad (18+ años) y acepto los Términos de Moderación de Auri Studios')}</span></label>`, 'Confirmar',
    async mm => { if (!mm.querySelector('[data-ok]').checked) return t('Debes marcar la casilla para continuar.'); const e = await acceptInvite(nid); if (!e) { KEEP = true; render(); showModOverlay(); } return e; });
  const b = m.querySelector('[data-yes]'), c = m.querySelector('[data-ok]'); b.disabled = true; c.onchange = () => { b.disabled = !c.checked; };
}
let MODOV = null;
/** Pantalla de felicitación: el marco es obligatorio (sin cerrar ni cancelar) y no se puede quitar después */
function showModOverlay() {
  const role = roleOf(S.user), adm = role === 'ADMIN'; if (MODOV || (role !== 'MODERATOR' && !adm) || (getUsers()[S.user] || {}).frameWorn) return;
  const o = MODOV = document.createElement('div'); o.className = 'mod-ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="mod-ov-box"><div class="end-emoji">🎉</div><h1>${t('¡Felicidades!')}</h1><p>${adm ? t('Ya eres parte de la administración de {a}', { a: '<b>Auri Studios</b>' }) : t('Ya eres moderador en {a}', { a: '<b>Auri Studios</b>' })}</p><div class="mod-ov-av"><span class="fr xl">${userAvatar(S.user, 'xl')}<span class="orn orn-bot bA off">${svgBot(adm ? 'adm' : 'mod')}</span></span></div><p class="helper">${t('Este marco es parte de tu rol: es obligatorio y no se puede quitar.')}</p><button class="button" data-wear>${t('Ponerme el marco')}</button></div>`;
  const btn = o.querySelector('[data-wear]'), img = o.querySelector('.orn');
  btn.onclick = () => {
    btn.disabled = true; img.classList.remove('off'); o.classList.add('worn'); btn.textContent = t('¡Listo!');
    const us = getUsers(); if (us[S.user]) { us[S.user].frameWorn = true; G.set('users', us); }
    setTimeout(() => { o.classList.add('bye'); setTimeout(() => { o.remove(); MODOV = null; KEEP = true; render(); }, 380); }, 1300);
  };
  document.body.appendChild(o);
}
/** Menú de Administración (solo se dibuja si quien mira tiene permiso sobre esa cuenta) */
function admMenu(tg) {
  if (!canAct(tg)) return '';
  const st = strikesOf(tg).length, ban = activeBan(tg), r = roleOf(tg), up = isOwner();
  const canDown = (up && (r === 'MODERATOR' || r === 'ADMIN')) || (isAdm() && r === 'MODERATOR');
  const tst = isOwner() && (getUsers()[tg] || {}).test ? `<div class="adm-test"><b>${t('🧪 Cuenta de prueba')}</b>${r !== 'MODERATOR' ? '<button class="adm-item" data-act="test-role" data-id="' + esc(tg) + '" data-role="MODERATOR">' + t('🛡 Poner como moderadora (directo)') + '</button>' : ''}${r !== 'ADMIN' ? '<button class="adm-item" data-act="test-role" data-id="' + esc(tg) + '" data-role="ADMIN">' + t('⭐ Poner como administración (directo)') + '</button>' : ''}${r !== 'USER' ? '<button class="adm-item" data-act="test-role" data-id="' + esc(tg) + '" data-role="USER">' + t('👤 Volver a usuaria normal') + '</button>' : ''}<small class="helper">${t('Para verla como esa persona: cierra sesión y entra con {e} / {p}.', { e: esc(TEST_EMAIL), p: esc(TEST_PASS) })}</small></div>` : '';
  return `<section class="panel adm" aria-label="${esc(t('Administración'))}"><div class="toggle-line" style="border:0;margin:0;padding:0"><div><strong>${t('🛡 Administración')}</strong><div class="helper">${tn(st, '{n} strike', '{n} strikes')} · ${ban ? t('suspendida') : t('cuenta activa')}${r === 'MODERATOR' ? ' · ' + t('moderación') : r === 'ADMIN' ? ' · ' + t('administración') : ''}</div></div><button class="button secondary sm" data-act="adm-toggle" aria-expanded="false">${t('Opciones ▾')}</button></div>
  <div class="adm-list" hidden><button class="adm-item" data-act="adm-strike" data-id="${esc(tg)}">${t('⚠️ Dar strike')}</button>
  ${!canBan() ? '' : ban ? `<button class="adm-item" data-act="adm-unban" data-id="${esc(tg)}">${t('✅ Levantar suspensión')}</button>` : `<button class="adm-item danger" data-act="adm-ban" data-id="${esc(tg)}">${t('🚫 Suspender o bloquear cuenta')}</button>`}
  ${canBan() && strikesOf(tg).length ? `<div class="adm-strikes"><b>${t('Strikes activos')}</b>${strikesOf(tg).map(x => `<div class="adm-strike"><span>${esc(fmtDate(x.date))} · ${esc(x.reason)}</span><button type="button" class="link-btn" data-act="adm-unstrike" data-id="${esc(tg)}" data-sid="${esc(x.id)}">${t('Anular')}</button></div>`).join('')}</div>` : ''}
  ${up && (r === 'MODERATOR' || r === 'ADMIN') ? `<button class="adm-item" data-act="adm-scope" data-id="${esc(tg)}">🌐 ${t('Comunidades que modera: {c}', { c: staffScope(tg).map(c => COMMS[c]).join(' / ') })}</button>` : ''}
  ${up && r === 'USER' ? `<button class="adm-item" data-act="bow-gift" data-id="${esc(tg)}">🎀 ${t('Regalar lazos')}</button>` : ''}
  ${up ? `<button class="adm-item" data-act="gift-profile" data-id="${esc(tg)}">🎁 ${t('Regalar marco Top 50 (quedan {n})', { n: giftLeft() })}</button>` : ''}
  ${up && r === 'USER' ? `<button class="adm-item" data-act="adm-mod" data-id="${esc(tg)}">${t('🛡 Hacer moderador')}</button>` : ''}
  ${up && r === 'MODERATOR' ? `<button class="adm-item" data-act="adm-admin" data-id="${esc(tg)}">${t('⭐ Ascender a administración')}</button>` : ''}
  ${tst}${canDown ? `<button class="adm-item" data-act="adm-revoke" data-id="${esc(tg)}">${r === 'ADMIN' ? t('↩️ Quitar administración (vuelve a moderación)') : t('↩️ Quitar moderación')}</button>` : ''}</div></section>`;
}

/* --- Noticias (solo la cuenta dueña publica) --- */
function openBookPicker() {
  const m = document.createElement('div'); m.className = 'modal sheet'; let tab = 'home', q = '';
  m.innerHTML = `<div class="modal-box bp-box" role="dialog" aria-modal="true" aria-label="${esc(t('Recomendar un libro'))}"><button class="icon-btn close-x" data-x aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Recomendar un libro')}</h2><p class="helper">${t('Toca un libro y aparece en el banner de Inicio.')}${isMod() ? ' ' + t('Pasará primero por la aprobación de Administración y Owner.') : ''}</p><label class="check" style="margin:4px 0 8px"><input type="checkbox" data-anon> <span>${t('Ocultar mi nombre (se muestra solo mi rol)')}</span></label>
  <div class="bp-tabs"><button type="button" class="chip active" data-t="home">${t('🏠 Inicio')}</button><button type="button" class="chip" data-t="favs">${t('♥ Mis favoritos')}</button><button type="button" class="chip" data-t="lib">${t('📚 Mi biblioteca')}</button></div>
  <input class="field bp-q" type="search" placeholder="${esc(t('Buscar por título o autoría…'))}" aria-label="${esc(t('Buscar libro'))}"><div class="bp-list"></div></div>`;
  const list = m.querySelector('.bp-list');
  const src = () => { const all = publishedStories().filter(matureOK); return (tab === 'favs' ? all.filter(x => S.favs.includes(x.id)) : tab === 'lib' ? all.filter(x => S.lib.includes(x.id)) : all).filter(x => !q || `${x.title} ${x.author}`.toLowerCase().includes(q)); };
  const paint = () => { const on = new Set(crAll().filter(b => b.kind === 'book').map(b => b.storyId)), l = src();
    list.innerHTML = l.length ? l.map((x, i) => `<button type="button" class="bp-item" data-id="${esc(x.id)}"><span class="bp-cv">${coverHTML(x, i)}</span><span class="bp-t"><b>${esc(x.title)}</b><small>${t('por {a}', { a: esc(x.author || '') })}</small></span>${on.has(x.id) ? '<span class="pill">' + t('En el banner ✓') + '</span>' : '<span class="bp-add">＋</span>'}</button>`).join('')
      : `<p class="helper" style="text-align:center;margin:18px 0">${tab === 'favs' ? t('Aún no tienes libros favoritos.') : tab === 'lib' ? t('Tu biblioteca está vacía.') : t('No hay libros publicados.')}</p>`; };
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = ev => { if (ev.target === m) m.remove(); };
  m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('active', x === b)); paint(); });
  m.querySelector('.bp-q').oninput = ev => { q = ev.target.value.trim().toLowerCase(); paint(); };
  list.onclick = ev => { const it = ev.target.closest('.bp-item'); if (!it || !canNews()) return; const sid = it.dataset.id, L = crAll();
    if (L.some(b => b.kind === 'book' && b.storyId === sid)) return toast('Ese libro ya está en el banner.');
    if (L.length >= 6) return toast(t('Máximo 6 tarjetas manuales: elimina alguna.'));
    G.set('banners', [...L, { id: Date.now(), kind: 'book', by: S.user, date: today(), storyId: sid, title: '', text: '', btn: 'Leer ahora', ...postMeta((m.querySelector('[data-anon]') || {}).checked, 'cr-comm') }]); logAction('banner-add', S.user, ((findStory(sid) || {}).title || '') + (isMod() ? ' (en revisión)' : '')); if (isMod()) notifyApprovers('Nueva recomendación de libro por aprobar'); m.remove(); toast(isMod() ? 'Enviado a revisión: lo verá Administración u Owner' : 'Añadido al banner ✓'); KEEP = true; render(); };
  paint(); document.body.appendChild(m);
}
function commPick(id) {                                // dónde se ve la publicación (si el equipo cubre una sola comunidad, va fija)
  const sc = staffScope(S.user); if (sc.length < 2) return `<input type="hidden" id="${id}" value="${esc(sc[0] || 'es')}">`;
  return `<div class="form-group"><label for="${id}">${t('Comunidad')}</label><select id="${id}" class="select"><option value="all">${t('Ambas comunidades')}</option><option value="es">${t('Español')}</option><option value="en">${t('English')}</option></select></div>`;
}
function crPanel() {
  const L = crAll(), pubs = publishedStories(), nw = news();
  return `<section class="panel" style="margin-bottom:20px"><h2>${t('🎠 Banner de Inicio')}</h2><p class="helper" style="margin:4px 0 12px">${t('Las noticias salen solas en el carrusel. Aquí añades tarjetas manuales (aparecen primero).')}${isOwner() ? '' : ' ' + t('Solo puedes editar y eliminar las tuyas.')}${isMod() ? ' ' + t('Lo que envíes pasa primero por la aprobación de Administración y Owner.') : ''}</p>
  ${L.length ? L.map((b, i) => { const mine = ownsPost(b); return `<div class="cr-row"><span class="cr-rt">${b.kind === 'book' ? '📚' : b.kind === 'poll' ? '📊' : '🎉'} <b>${esc(b.title || (findStory(b.storyId) || {}).title || t('Libro eliminado'))}</b><small class="helper">· ${esc(byline(b))}</small>${b.status === 'pending' ? ' <span class="pill">' + t('En revisión') + '</span>' : b.status === 'rejected' ? ` <span class="pill">${t('Rechazada')}${b.reason ? ': ' + esc(b.reason) : ''}</span>` : ''}</span><span class="cr-rb">${mine ? `${isMod() ? '' : `<button class="icon-btn sm" data-act="cr-up" data-id="${b.id}" ${i ? '' : 'disabled'} aria-label="${esc(t('Subir'))}">↑</button><button class="icon-btn sm" data-act="cr-down" data-id="${b.id}" ${i < L.length - 1 ? '' : 'disabled'} aria-label="${esc(t('Bajar'))}">↓</button>`}${canEditPost(b) && b.kind !== 'poll' ? `<button class="link-btn" data-act="cr-edit" data-id="${b.id}">${t('Editar')}</button>` : ''}<button class="link-btn danger-link" data-act="cr-del" data-id="${b.id}">${t('Eliminar')}</button>` : '<small class="helper">' + t('de otra persona') + '</small>'}</span></div>`; }).join('') : '<p class="helper">' + t('Aún no hay tarjetas manuales.') + '</p>'}
 ${commPick('cr-comm')}
 <button type="button" class="button secondary" data-act="cr-pick-open" style="margin:8px 0">${t('＋ Recomendar un libro')}</button>
  <details class="cr-add" hidden><summary>${t('＋ Recomendar un libro')}</summary><form data-form="cr-book" class="form-grid" style="grid-template-columns:1fr;margin-top:10px">
    <div class="form-group"><label for="cb-story">${t('Libro')}</label><select id="cb-story" class="select">${pubs.length ? pubs.map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('') : '<option value="">' + t('No hay libros publicados') + '</option>'}</select></div>
    <div class="form-group"><label for="cb-title">${t('Título (opcional)')}</label><input id="cb-title" class="field" maxlength="70" placeholder="${esc(t('Si lo dejas vacío usa el del libro (el título del libro siempre se muestra)'))}"></div>
    <div class="form-group"><label for="cb-text">${t('Texto (opcional)')}</label><textarea id="cb-text" class="textarea" maxlength="160" placeholder="${esc(t('Por qué lo recomiendas… (si lo dejas vacío usa la sinopsis)'))}"></textarea></div>
    <div class="form-group"><label for="cb-btn">${t('Texto del botón')}</label><input id="cb-btn" class="field" maxlength="24" value="${esc(t('Leer ahora'))}"></div><label class="check"><input type="checkbox" id="cb-anon"> <span>${t('Ocultar mi nombre (se muestra solo mi rol)')}</span></label><button class="button" type="submit">${t('Añadir al banner')}</button></form></details>
  <details class="cr-add"><summary>${t('＋ Crear una encuesta')}</summary><form data-form="cr-poll" class="form-grid" style="grid-template-columns:1fr;margin-top:10px">
    <div class="form-group"><label for="cp-q">${t('Pregunta')}</label><input id="cp-q" class="field" maxlength="120" placeholder="${esc(t('Ej: ¿Qué género quieres ver en el próximo evento?'))}"></div>
    ${[0, 1, 2, 3, 4, 5].map(i => `<div class="form-group"><label for="cp-o${i}">${t('Opción {n}', { n: i + 1 })}${i > 1 ? ' ' + t('(opcional)') : ''}</label><input id="cp-o${i}" class="field cp-o" maxlength="60"></div>`).join('')}
    <div class="form-group"><label for="cp-end">${t('Fecha de cierre (opcional)')}</label><input id="cp-end" class="field" type="date" min="${today()}"><span class="helper">${t('Al cerrar, todas las personas pueden ver los resultados.')}</span></div>
    <label class="check"><input type="checkbox" id="cp-anon"> <span>${t('Ocultar mi nombre (se muestra solo mi rol)')}</span></label><button class="button" type="submit">${t('Publicar encuesta en el banner')}</button></form></details>
  <details class="cr-add"><summary>${t('＋ Anunciar un evento')}</summary><form data-form="cr-event" class="form-grid" style="grid-template-columns:1fr;margin-top:10px">
    <div class="form-group"><label for="ce-title">${t('Título')}</label><input id="ce-title" class="field" maxlength="70" placeholder="${esc(t('Ej: Evento Fundador'))}"></div>
    <div class="form-group"><label for="ce-text">${t('Descripción corta (la tarjeta del banner)')}</label><textarea id="ce-text" class="textarea" maxlength="160"></textarea></div>
    <div class="form-group"><label>${t('Imagen (opcional, cualquier tamaño)')}</label><div id="ce-prev" class="ce-prev"></div><label class="button secondary sm" style="cursor:pointer;width:fit-content">🖼 ${t('Elegir imagen')}<input id="ce-file" type="file" accept="image/*" hidden></label></div>
    <div class="form-group"><label for="ce-post">${t('Publicación completa (se abre al tocar el botón)')}</label><textarea id="ce-post" class="textarea" maxlength="4000" placeholder="${esc(t('Escribe el post completo. Si lo dejas vacío usa la descripción corta. Puedes editarlo después en Noticias.'))}"></textarea></div>
    <div class="form-group"><label for="ce-btn">${t('Texto del botón')}</label><input id="ce-btn" class="field" maxlength="24" value="${esc(t('Ver más'))}"></div>
    <label class="check"><input type="checkbox" id="ce-anon"> <span>${t('Ocultar mi nombre (se muestra solo mi rol)')}</span></label><div class="form-group"><label for="ce-news">${t('El botón lleva a…')}</label><select id="ce-news" class="select"><option value="">${t('Una publicación nueva (la creo con estos datos)')}</option>${nw.map(n => `<option value="${n.id}">${t('Noticia existente: {t}', { t: esc(clip(n.title, 40)) })}</option>`).join('')}</select></div><button class="button" type="submit">${t('Añadir al banner')}</button></form></details></section>`;
}
/* Compositor de noticias (Owner): cada párrafo puede llevar una imagen de cualquier tamaño */
function subsPanel() {                                 // Moderación: sus envíos que aún no están publicados
  const l = news().filter(n => !pubOK(n) && ownsPost(n)); if (!l.length) return '';
  return `<section class="panel" style="margin-bottom:20px"><h2>${t('Mis envíos en revisión')}</h2>${l.map(n => `<div class="cr-row"><span class="cr-rt"><b>${esc(n.title)}</b> ${n.status === 'pending' ? '<span class="pill">' + t('En revisión') + '</span>' : `<span class="pill">${t('Rechazada')}${n.reason ? ': ' + esc(n.reason) : ''}</span>`}</span><span class="cr-rb"><button class="link-btn" data-act="news-edit" data-id="${n.id}">${t('Editar y reenviar')}</button><button class="link-btn danger-link" data-act="news-del" data-id="${n.id}">${t('Eliminar')}</button></span></div>`).join('')}</section>`;
}
function pendingPosts() {
  const cards = crAll().filter(b => b.status === 'pending' && inScope(postComm(b))), linked = new Set(cards.map(b => String(b.newsId || '')).filter(Boolean));
  return [...cards.map(o => ({ kind: 'card', o })), ...news().filter(n => n.status === 'pending' && inScope(postComm(n)) && !linked.has(String(n.id))).map(o => ({ kind: 'news', o }))].sort((a, b) => b.o.id - a.o.id);
}
function resolvePost(kind, id, ok, reason) {
  if (!canBan()) return t('Solo Administración y Owner pueden aprobar publicaciones.');
  const key = kind === 'card' ? 'banners' : 'news', L = G.get(key, []), i = L.findIndex(x => String(x.id) === String(id)); if (i < 0) return t('Esa publicación ya no existe.');
  reason = String(reason || '').trim(); if (!ok && reason.length < 3) return t('Escribe el motivo del rechazo.');
  const o = L[i], patch = ok ? { status: 'published', date: today(), reason: '', handledBy: S.user, handledDate: today() } : { status: 'rejected', reason: reason.slice(0, 300), handledBy: S.user, handledDate: today() };
  L[i] = { ...o, ...patch }; G.set(key, L);
  if (kind === 'card' && o.newsId) { const N = news(), j = N.findIndex(x => String(x.id) === String(o.newsId) && x.status === 'pending'); if (j >= 0) { N[j] = { ...N[j], ...patch }; G.set('news', N); } }
  const ttl = o.title || (findStory(o.storyId) || {}).title || t('tu publicación');
  pushNotif(o.by, { type: 'sys', extra: ok ? 'Tu publicación «{ttl}» fue aprobada y ya se ve en Auri.' : 'Tu publicación «{ttl}» fue rechazada: {r}', xv: { ttl, r: reason.slice(0, 120) }, href: '#/news' });
  logAction(ok ? 'post-approve' : 'post-reject', o.by || OWNER_EMAIL, ttl.slice(0, 60) + (ok ? '' : ': ' + reason.slice(0, 80)) + (o.anon ? ' · nombre oculto' : '')); return '';
}
function postsView(tabs) {
  const l = pendingPosts();
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('Publicaciones')}</span><h2 style="margin-top:8px">${t('Por aprobar')} (${l.length})</h2><p>${t('Anuncios, eventos y recomendaciones enviados por Moderación. Al aprobarlos se publican con la fecha de hoy.')}</p></div></div>
  ${l.length ? l.map(({ kind, o }) => { const st = o.kind === 'book' ? findStory(o.storyId) : null, label = kind === 'news' ? t(o.type || 'Anuncio') : o.kind === 'book' ? t('Recomendación de libro') : o.kind === 'poll' ? t('Encuesta en el banner') : t('Evento en el banner'), ttl = o.title || (st && st.title) || t('Sin título'), txt = o.text || (st && st.synopsis) || (o.kind === 'poll' ? (o.options || []).join(' · ') : ''),
      href = kind === 'news' ? '#/news/' + o.id : o.kind === 'book' && st ? '#/story/' + esc(st.id) : o.newsId ? '#/news/' + o.newsId : '';
    return `<article class="panel rp"><div class="rp-head"><span class="pill">${esc(label)}</span><span class="helper">${esc(fmtDate(o.date) || o.date || '')}</span></div><div class="rp-ctx"><b>${esc(ttl)}</b><div class="helper">${t('Por {n}', { n: esc(byline(o)) })}</div></div><p class="rp-text">${esc(clip(txt, 220))}</p>
    <div class="rp-acts">${href ? `<a class="button ghost sm" href="${href}" data-dir="next">${t('Ver')}</a>` : ''}<button class="button sm" data-act="post-approve" data-k="${kind}" data-id="${o.id}">${t('Aprobar')}</button><button class="button danger sm" data-act="post-reject" data-k="${kind}" data-id="${o.id}">${t('Rechazar')}</button></div></article>`; }).join('')
    : empty('Nada por aprobar', 'Cuando alguien de Moderación envíe un anuncio, un evento o una recomendación, aparecerá aquí.')}</main>`;
}
const ownsPost = o => !!o && canNews() && (isOwner() || (o.by || OWNER_EMAIL) === S.user);   // Owner: todo; Administración: solo lo suyo (lo antiguo sin firma es de la Owner)
const canEditPost = o => ownsPost(o) && (!isMod() || !pubOK(o));      // Moderación no cambia lo ya publicado (lo borra y lo envía de nuevo)
let NBEDIT = '';                                       // id de la noticia ya publicada que se está editando
let NB = [{ t: '', img: '' }], NBM = { type: 'Actualización', title: '' }, CEIMG = '', NBID = '';   // NBID = borrador de noticia que se está editando
const ndAll = () => G.get('newsdrafts', []);
const nbHasContent = () => !!(NBM.title.trim() || NB.some(b => b.t.trim() || b.img));
/** Guarda la noticia en curso como borrador (solo la Owner). silent = sin aviso (guardado automático al salir de la pantalla) */
function nbDraftSave(silent) {
  if (!canNews() || NBEDIT) return false; nbCollect();
  if (!nbHasContent()) { if (!silent) toast('Escribe algo para guardar el borrador.'); return false; }
  const id = NBID || 'd' + Date.now(), d = { id, type: NBM.type, title: NBM.title.trim(), blocks: NB.map(b => ({ t: b.t, img: b.img })), updated: new Date().toISOString() };
  if (!G.set('newsdrafts', [d, ...ndAll().filter(x => x.id !== id)].slice(0, 20))) return false;
  NBID = id; if (!silent) toast('Borrador guardado ✓'); return true;
}
let NBFRESH = false;                                   // true = el formulario se acaba de vaciar a propósito (no volver a guardarlo como borrador)
function nbReset() { NB = [{ t: '', img: '' }]; NBM = { type: 'Actualización', title: '' }; NBID = ''; NBEDIT = ''; NBFRESH = true; }
const ndPanel = () => { const L = ndAll(); return L.length ? `<section class="panel" style="margin-bottom:20px"><h2>📝 ${t('Borradores')} (${L.length})</h2><p class="helper" style="margin:4px 0 10px">${t('Lo que no terminas de escribir se guarda aquí. Solo tú lo ves.')}</p>
  ${L.map(d => `<div class="cr-row"><span class="cr-rt">📝 <b>${esc(d.title || t('Sin título'))}</b> <small class="helper">${esc(fmtDate(d.updated))}${d.id === NBID ? ' · ' + t('editando') : ''}</small></span><span class="cr-rb"><button class="button secondary sm" data-act="nd-open" data-id="${esc(d.id)}">${t('Continuar')}</button><button class="button danger sm" data-act="nd-del" data-id="${esc(d.id)}">${t('Eliminar')}</button></span></div>`).join('')}</section>` : ''; };
function nbCollect() { document.querySelectorAll('.nb-t').forEach(x => { const i = +x.dataset.i; if (NB[i]) NB[i].t = x.value; }); const ty = $('#n-type'), ti = $('#n-title'); if (ty) NBM.type = ty.value; if (ti) NBM.title = ti.value; }
const nbRow = (b, i) => `<div class="nb-row"><div class="nb-head"><b>${t('Párrafo {n}', { n: i + 1 })}</b>${NB.length > 1 ? `<button type="button" class="link-btn danger-link" data-act="nb-del" data-i="${i}">${t('Quitar')}</button>` : ''}</div>
  <textarea class="textarea nb-t" data-i="${i}" maxlength="3000" placeholder="${esc(i ? t('Escribe el siguiente párrafo…') : t('Escribe el mensaje…'))}" aria-label="${esc(t('Párrafo {n}', { n: i + 1 }))}">${esc(b.t)}</textarea>
  ${safeImg(b.img) ? `<div class="nb-prev"><img src="${esc(b.img)}" alt=""><button type="button" class="button ghost sm" data-act="nb-img-clear" data-i="${i}">${t('Quitar imagen')}</button></div>`
    : `<label class="button secondary sm nb-pick">🖼 ${t('Añadir imagen')}<input type="file" accept="image/*" class="nb-file" data-i="${i}" hidden></label>`}</div>`;
const newsBody = n => newsBlocks(n).map(b => `${b.t ? `<p>${esc(b.t)}</p>` : ''}${safeImg(b.img) ? `<figure class="news-fig"><img src="${esc(b.img)}" alt="" loading="lazy"></figure>` : ''}`).join('');
function newsView(nid) {
  if (nid) {                                           // publicación completa (al tocar «Leer noticia» en el banner)
    let n = news().find(x => String(x.id) === String(decodeURIComponent(nid))); if (n && !pubOK(n) && !(canBan() || ownsPost(n))) n = null;
    return `<main class="page story-layout"><a class="button ghost sm" href="#/news" data-dir="prev">${t('‹ Todas las noticias')}</a>${n ? `<article class="panel news-item news-full" style="margin-top:14px"><span class="tag">${esc(t(n.type))}</span> <span class="helper">${esc(fmtDate(n.date) || n.date)}${n.edited ? ' · ' + t('editado') : ''}</span><h2 class="serif" style="margin:10px 0 14px">${esc(n.title)}</h2>${newsBody(n)}<div class="news-by">${n.anon && !isOwner() ? '' : userAvatar(n.by || OWNER_EMAIL)}<span>${t('Publicado por')} <b>${esc(byline(n))}</b>${!pubOK(n) ? ` · ${n.status === 'pending' ? t('en revisión') : t('rechazada')}` : ''}</span></div></article>` : empty('Noticia no encontrada', 'Puede que se haya eliminado.', '<a class="button" href="#/news">' + t('Ver noticias') + '</a>')}</main>`;
  }
  const list = newsPub(), pub = canNews();
  return `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('📣 Noticias de Auri')}</span><h2 style="margin-top:8px">${t('Novedades y eventos')}</h2></div></div>
  ${pub ? crPanel() : ''}
  ${pub ? ndPanel() : ''}
  ${isMod() ? subsPanel() : ''}
  ${pub ? `<form class="panel" data-form="news" style="margin-bottom:20px"><h2>${NBEDIT ? t('✏️ Editar anuncio publicado') : t('Publicar anuncio')}</h2><div class="form-grid" style="grid-template-columns:1fr">
  ${commPick('n-comm')}
  <div class="form-group"><label for="n-type">${t('Tipo')}</label><select id="n-type" class="select">${['Actualización', 'Evento', 'Aviso'].map(o => `<option value="${o}" ${NBM.type === o ? 'selected' : ''}>${t(o)}</option>`).join('')}</select></div>
  <div class="form-group"><label for="n-title">${t('Título')}</label><input id="n-title" class="field" maxlength="80" value="${esc(NBM.title)}"></div>
  <div id="nb-list">${NB.map(nbRow).join('')}</div>
  <button type="button" class="button ghost sm" data-act="nb-add" style="width:fit-content">${t('＋ Añadir párrafo')}</button>${NBEDIT ? '' : `<label class="check"><input type="checkbox" id="n-anon"> <span>${t('Ocultar mi nombre (se muestra solo mi rol)')}</span></label>`}${isMod() ? '<p class="helper">' + t('Lo que publiques pasa primero por la aprobación de Administración y Owner.') + '</p>' : ''}</div><div class="nb-btns">${NBEDIT ? '<button type="button" class="button ghost" data-act="news-edit-cancel">' + t('Cancelar') + '</button><button class="button" type="submit">' + t('Guardar cambios') + '</button>' : '<button type="button" class="button ghost" data-act="nd-save">' + t('💾 Guardar borrador') + '</button><button class="button" type="submit">' + t('Publicar') + '</button>'}</div></form>` : ''}
  ${list.length ? list.map(n => { const cv = newsCover(n); return `<article id="news-${n.id}" class="panel news-item news-card ${cv ? 'has-img' : ''}"><div class="news-cardtxt"><span class="tag">${esc(t(n.type))}</span> <span class="helper">${esc(fmtDate(n.date) || n.date)}${n.edited ? ' · ' + t('editado') : ''}</span><div class="helper">${t('Por {n}', { n: esc(byline(n)) })}</div><h3>${esc(n.title)}</h3><p>${esc(clip(n.text, 150))}</p>
    <div class="news-acts"><a class="button secondary sm" href="#/news/${n.id}" data-dir="next">${t('Leer publicación')}</a>${ownsPost(n) ? `${canEditPost(n) ? `<button class="button secondary sm" data-act="news-edit" data-id="${n.id}">${t('Editar')}</button>` : ''}<button class="button danger sm" data-act="news-del" data-id="${n.id}">${t('Eliminar')}</button>` : ''}</div></div>${cv ? `<img class="news-thumb" src="${esc(cv)}" alt="" loading="lazy">` : ''}</article>`; }).join('') : empty('Aún no hay noticias', pub ? 'Publica tu primer anuncio arriba.' : 'Aquí aparecerán las actualizaciones y eventos de Auri.')}</main>`;
}

/** Avisos antiguos (sin capítulo guardado): se busca el comentario por quien lo escribió y su texto */
const oldCmChap = n => { if (!['reply', 'comment'].includes(n.type) || !n.storyId || !n.extra) return ''; const c = comments(n.storyId).filter(x => x.by === n.from && String(x.text || '').slice(0, 80) === String(n.extra)).pop(); return c ? `${(c.ch | 0) + 1}:${c.id}` : ''; };
const notifHref = n0 => { const n = !n0.chap && ['reply', 'comment'].includes(n0.type) ? { ...n0, chap: oldCmChap(n0) } : n0; return notifHref0(n); };
const notifHref0 = n => n.type === 'chapter' ? '#/story/' + n.storyId + '/' + n.extra : n.type === 'follow' ? '#/user/' + encodeURIComponent(n.from) : n.type === 'review' ? '#/moderation' : n.type === 'rejected' ? '#/write/' + n.storyId + '/chapters' : ['reply', 'comment', 'clike'].includes(n.type) && /^\d+:\d*$/.test(n.chap || '') ? '#/story/' + n.storyId + '/' + n.chap.split(':')[0] + (n.chap.split(':')[1] ? '/c-' + n.chap.split(':')[1] : '') : '#/story/' + n.storyId;
/* --- Notificaciones --- */
const notifWhat = n => { const ti = esc((findStory(n.storyId) || {}).title || t('una obra eliminada')), x = esc(n.type === 'comment' ? (String(n.extra).startsWith('en un párrafo: ') ? t('en un párrafo: ') + String(n.extra).slice(15) : t(n.extra)) : n.extra), c = esc(n.chap), V = { ti, x, c };
  const chap = /^\d+ cap/.test(n.chap) ? t('{n} capítulos nuevos', { n: parseInt(n.chap, 10) }) : t('el capítulo «{c}»', V);
  return { follow: t('empezó a seguirte'), like: t('le dio like a tu obra «{ti}»', V), comment: t('comentó en «{ti}»: “{x}”', V), review: n.chap ? t('envió «{c}» de «{x}» a revisión', V) : t('envió «{x}» a revisión', V),
    chapter: t('publicó {chap} en «{ti}»', { ti, chap }),
    reply: t('respondió tu comentario en «{ti}»: “{x}”', V), clike: t('le dio like a tu comentario en «{ti}»', V),
    approved: n.chap ? t('aprobó el capítulo «{c}» de «{ti}»: ya se ve en la app 🎉', V) : t('aprobó tu obra «{ti}»: ya se ve en la app 🎉', V),
    rejected: n.chap ? t('rechazó el capítulo «{c}» de «{ti}». Motivo: {x}', V) : t('rechazó tu obra «{ti}». Motivo: {x}', V) }[n.type] || ''; };
const SYS_T = ['strike', 'modinvite', 'sys'];
function sysNotif(n) {
  const d = `<div class="helper">${esc(fmtDate(n.date))}</div>`, cls = `notif sys ${n.read ? '' : 'new'}`;
  if (n.type === 'strike') return `<a class="${cls}" href="#/strike/${esc(n.extra)}"><span class="sys-ic">⚠️</span><div><strong>${t('¡Has recibido un strike!')}</strong> ${t('Toca para ver más información')}${d}</div></a>`;
  if (n.type === 'modinvite') return `<div class="${cls}"><span class="sys-ic">🛡</span><div>${n.role === 'ADMIN' ? '<strong>' + t('¡Felicidades!') + '</strong> ' + t('La Owner te ha invitado a formar parte de la administración de Auri Studios') : '<strong>' + t('¡Inspirador!') + '</strong> ' + t('La Owner te ha invitado a formar parte del equipo de moderación de Auri Studios')}${d}
    ${n.done ? `<div class="helper"><b>${n.done === 'accepted' ? t('✓ Aceptaste la invitación') : t('Rechazaste la invitación')}</b></div>` : `<div class="inv-btns"><button class="button sm" data-act="inv-accept" data-nid="${esc(n.id)}">${tx('Aceptar', 'inv')}</button><button class="button ghost sm" data-act="inv-decline" data-nid="${esc(n.id)}">${tx('Rechazar', 'inv')}</button></div>`}</div></div>`;
  return n.href ? `<a class="${cls}" href="${esc(n.href)}"><span class="sys-ic">🛡</span><div>${esc(t(n.extra, n.xv))}${d}</div></a>` : `<div class="${cls}"><span class="sys-ic">🛡</span><div>${esc(t(n.extra, n.xv))}${d}</div></div>`;
}
/** Aviso de capítulo nuevo: portada pequeña del libro (en vez de la foto de quien publica), para que el aviso no crezca */
function notifCover(n) { const st = findStory(n.storyId), cv = st && st.cover && (safeImg(st.cover) || /^https?:\/\//i.test(st.cover)) ? st.cover : '';
  return `<span class="notif-cv">${cv ? `<img src="${esc(cv)}" alt="" loading="lazy">` : `<i>${esc(((st && st.title) || '📖').trim().charAt(0).toUpperCase() || '📖')}</i>`}</span>`; }
const notifItem = n => SYS_T.includes(n.type) ? sysNotif(n) : `<a class="notif ${n.read ? '' : 'new'}" href="${esc(notifHref(n))}">${n.type === 'chapter' ? notifCover(n) : framedAvatar(n.from)}<div><strong>${esc(['approved', 'rejected'].includes(n.type) ? t('Moderación') : uName(n.from))}</strong> ${notifWhat(n)}<div class="helper">${esc(fmtDate(n.date))}</div></div></a>`;
/** Ventanita superpuesta (no cambia de pantalla) con botón X; al abrirla se marcan como leídas */
function notifPop() {
  const k = 'auri.notifs.' + S.user, list = LS.get(k, []);
  const html = `<div class="pop-back" data-act="notif-toggle"></div><section class="pop" role="dialog" aria-label="${esc(t('Notificaciones'))}"><header class="pop-head"><strong>${t('🔔 Notificaciones')}</strong><button class="icon-btn" data-act="notif-toggle" aria-label="${esc(t('Cerrar notificaciones'))}">✕</button></header>
  <div class="pop-body">${list.length ? list.map(notifItem).join('') : '<p class="helper pop-empty">' + t('Todavía no tienes notificaciones. Te avisaremos cuando alguien te siga, le dé like o comente tus obras, y cuando haya capítulos nuevos.') + '</p>'}</div></section>`;
  LS.set(k, list.map(n => ({ ...n, read: true })));
  return html;
}
function notifView() {                                   // (pantalla completa, solo si se abre la dirección #/notifications)
  const list = LS.get('auri.notifs.' + S.user, []);
  const html = `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">${t('🔔 Notificaciones')}</span><h2 style="margin-top:8px">${t('Lo que pasa con tus obras')}</h2></div></div>
  ${list.length ? list.map(notifItem).join('') : empty('Sin notificaciones', 'Te avisaremos cuando alguien te siga, le dé like o comente una de tus obras.')}</main>`;
  LS.set('auri.notifs.' + S.user, list.map(n => ({ ...n, read: true })));
  return html;
}

/* --- Mis Personajes: reemplazan [TN] en las historias que lo permiten --- */
function charsSection() {
  const act = S.chars.find(c => c.id === S.activeId);
  return `<section class="chars-sec"><div class="section-head"><div><h2>${t('Mis Personajes')}</h2><p>${t('Su nombre reemplaza a [TN] en las historias que lo permiten.')}</p></div></div>
  ${act ? `<p class="reading-as">${t('Leyendo como')} <b>${esc(act.name)}</b></p>` : ''}
  <div class="char-grid"><button type="button" class="char-tile add" data-act="char-add" aria-label="${esc(t('Crear personaje'))}"><span class="plus">＋</span><span>${t('Crear personaje')}</span></button>${S.chars.map(c => {
    const on = c.id === S.activeId;
    return `<div class="char-tile ${on ? 'active' : ''}"><button type="button" class="char-pick" data-act="char-sel" data-cid="${c.id}" aria-pressed="${on}"><span class="ct-img">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : `<b>${esc([...c.name][0].toUpperCase())}</b>`}</span><strong>${esc(c.name)}</strong>${on ? `<em>${t('Leyendo como {n}', { n: esc(c.name) })}</em>` : '<em>' + t('Toca para usar') + '</em>'}</button>
      <div class="tile-acts"><button type="button" class="icon-btn" data-act="char-edit" data-cid="${c.id}" aria-label="${esc(t('Editar {n}', { n: c.name }))}">✎</button><button type="button" class="icon-btn" data-act="char-del" data-cid="${c.id}" aria-label="${esc(t('Eliminar {n}', { n: c.name }))}">${TRASH}</button></div></div>`;
  }).join('')}</div></section>`;
}
/** Hoja inferior para crear / editar un personaje: nombre + foto opcional. after(id) se llama al guardar un personaje NUEVO */
function openCharForm(id, after) {
  const cur = id ? S.chars.find(c => c.id === id) : null; let photo = cur ? cur.photo || '' : '';
  if (!cur && S.chars.length >= MAX_CHARS) return toast(t('Puedes guardar hasta {n} personajes.', { n: MAX_CHARS }));
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box char-form" role="dialog" aria-modal="true" aria-label="${cur ? t('Editar personaje') : t('Crear personaje')}"><button class="icon-btn close-x" data-x aria-label="${esc(t('Cerrar'))}">✕</button><h2>${cur ? t('Editar personaje') : t('Nuevo personaje')}</h2>
  <div class="cf-photo"><span class="cf-prev" data-prev>${photo ? `<img src="${esc(photo)}" alt="">` : '🐱'}</span><div class="cover-fields"><label class="button secondary sm" style="cursor:pointer">${t('📷 Subir foto (opcional)')}<input type="file" accept="image/*" hidden data-file></label><button type="button" class="button ghost sm" data-nophoto ${photo ? '' : 'hidden'}>${t('Quitar foto')}</button></div></div>
  <div class="form-group"><label>${t('Nombre del personaje')}</label><input class="field" data-name maxlength="30" placeholder="${esc(t('Ej: Aiko'))}" value="${esc(cur ? cur.name : '')}"></div>
  <div class="cf-two"><div class="form-group"><label>${t('Color de cabello')}</label><input class="field" data-hair maxlength="40" placeholder="${esc(t('Ej: castaño oscuro'))}" value="${esc(cur ? cur.hair || '' : '')}"></div><div class="form-group"><label>${t('Color de ojos')}</label><input class="field" data-eyes maxlength="40" placeholder="${esc(t('Ej: verdes'))}" value="${esc(cur ? cur.eyes || '' : '')}"></div></div>
  <p class="helper">${t('En las historias que lo permiten, T/P (cabello) y T/O (ojos) se reemplazan con estos datos.')}</p>
  <p class="error" data-err></p><div class="cf-btns"><button class="button ghost" data-cancel>${t('Cancelar')}</button><button class="button" data-save>${t('Guardar')}</button></div></div>`;
  const q = sel => m.querySelector(sel), close = () => m.remove(), setPrev = () => { q('[data-prev]').innerHTML = photo ? `<img src="${esc(photo)}" alt="">` : '🐱'; q('[data-nophoto]').hidden = !photo; };
  q('[data-x]').onclick = close; q('[data-cancel]').onclick = close; m.onclick = ev => { if (ev.target === m) close(); };
  q('[data-file]').onchange = () => fitPhoto(q('[data-file]').files[0], 600, 800, d => { photo = d; setPrev(); });
  q('[data-nophoto]').onclick = () => { photo = ''; setPrev(); };
  q('[data-save]').onclick = () => {
    const name = q('[data-name]').value.trim(), hair = q('[data-hair]').value.trim(), eyes = q('[data-eyes]').value.trim(); if (!name) { q('[data-err]').textContent = t('Escribe un nombre para tu personaje.'); return; }
    if (cur) { S.chars = S.chars.map(c => c.id === cur.id ? { ...c, name, photo, hair, eyes } : c); if (cur.id === S.activeId) setActive(cur.id); saveChars(); close(); toast('Personaje actualizado'); return render(); }
    let nid; do { nid = chapId(); } while (S.chars.some(c => c.id === nid));
    S.chars = [...S.chars, { id: nid, ...emptyChar(), name, photo, hair, eyes }];
    if (S.chars.length === 1) setActive(nid); else saveChars();                 // el primero queda en uso automáticamente
    close(); toast('Personaje creado ✨'); if (after) after(nid); else { KEEP = true; render(); }
  };
  document.body.appendChild(m);
}
/** "Leer como…": antes de empezar una historia con reemplazo de [TN], se elige el personaje */
function readAs(path) {
  const go2 = () => { NAVDIR = 'next'; goReplace(path); };
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box readas" role="dialog" aria-modal="true" aria-label="${esc(t('Leer como'))}"><button class="icon-btn close-x" data-x aria-label="${esc(t('Cerrar'))}">✕</button><h2>${t('Leer como…')}</h2>
  <p class="helper">${t('Elige con qué personaje quieres leer: su nombre reemplazará a [TN] en la historia.')}</p>
  <div class="ra-car" role="listbox" aria-label="${esc(t('Personajes'))}">${S.chars.length ? S.chars.map(c => {
    const on = c.id === S.activeId;
    return `<button type="button" class="ra-card ${on ? 'active' : ''}" data-pick="${c.id}" role="option" aria-selected="${on}"><span class="ra-img">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : `<b>${esc([...c.name][0].toUpperCase())}</b>`}</span><strong class="ra-name">${esc(c.name)}</strong>${on ? `<i class="ra-badge">${t('Último usado')}</i>` : ''}</button>`; }).join('') : `<p class="helper">${t('Todavía no tienes personajes.')}</p>`}</div>
  ${S.chars.length > 2 ? `<p class="helper ra-hint">${t('Desliza para ver más →')}</p>` : ''}
  <button type="button" class="button secondary" data-new>＋ ${t('Crear personaje')}</button><button type="button" class="button ghost" data-skip>${t('Leer sin personaje')}</button></div>`;
  m.onclick = ev => {
    const t = ev.target, pick = t.closest && t.closest('[data-pick]');
    if (pick) { setActive(+pick.dataset.pick); m.remove(); go2(); }
    else if (t.closest && t.closest('[data-new]')) { m.remove(); openCharForm(null, id => { setActive(id); go2(); }); }
    else if (t.closest && t.closest('[data-skip]')) { m.remove(); go2(); }
    else if (t === m || (t.closest && t.closest('[data-x]'))) m.remove();
  };
  document.body.appendChild(m);
  const on = m.querySelector('.ra-card.active'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* Separador de lectura: mantén presionada una palabra y queda guardada (una por libro). Al volver, el libro se abre en esa palabra. */
const bmOf = sid => { const p = (S.pos || {})[sid]; return p && p.mk ? p.mk : null; };
function bmWordAt(x, y) {                               // palabra bajo el dedo: { p, pi, w, node, a, b }
  let node, off; if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) { node = c.offsetNode; off = c.offset; } } else if (document.caretRangeFromPoint) { const c = document.caretRangeFromPoint(x, y); if (c) { node = c.startContainer; off = c.startOffset; } }
  if (!node || node.nodeType !== 3) return null; const p = node.parentElement && node.parentElement.closest('.rf .reader-text p[data-bi]'); if (!p) return null;
  const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('.pc-n') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }); let n, pos = 0, at = -1;
  let txt = ''; while ((n = tw.nextNode())) { if (n === node) at = pos + off; pos += n.nodeValue.length; txt += n.nodeValue; }
  if (at < 0) return null; let w = -1, m, re = /\S+/g, wi = 0;
  while ((m = re.exec(txt))) { if (at >= m.index && at <= m.index + m[0].length) { w = wi; break; } wi++; }
  return w < 0 ? null : { p, pi: +p.dataset.bi, w };
}
function bmApply(scroll) {                              // dibuja la cinta y subraya la palabra guardada (si está en este capítulo)
  document.querySelectorAll('.bm-word').forEach(e => { const par = e.parentNode; while (e.firstChild) par.insertBefore(e.firstChild, e); e.remove(); par.normalize(); });
  document.querySelectorAll('.bm-p').forEach(e => e.classList.remove('bm-p', 'bm-para')); document.querySelectorAll('.bm-sepx').forEach(e => e.remove());
  const m = location.hash.match(/^#\/story\/([^/]+)\/(\d+)/); if (!m) return false; const mk = bmOf(m[1]); if (!mk || mk.idx !== +m[2] - 1) return false;
  const p = document.querySelector('.rf .reader-text p[data-bi="' + mk.pi + '"]'); if (!p) return false; p.classList.add('bm-p');
  if (mk.w < 0) { p.classList.add('bm-para'); p.insertAdjacentHTML('afterend', sepHTML('scene-sep bm-sepx').replace('</div>', `<small class="bm-cap">${t('Te quedaste aquí')}</small></div>`)); if (scroll) p.scrollIntoView({ block: 'center', behavior: 'auto' }); return true; }
  const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('.pc-n') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }); let n, pos = 0, wi = 0, target = null;
  while ((n = tw.nextNode()) && !target) { const re = /\S+/g; let q; while ((q = re.exec(n.nodeValue))) { if (wi === mk.w) { target = { n, a: q.index, b: q.index + q[0].length }; break; } wi++; } }
  if (target) { try { const rg = document.createRange(); rg.setStart(target.n, target.a); rg.setEnd(target.n, target.b); const sp = document.createElement('span'); sp.className = 'bm-word'; rg.surroundContents(sp); } catch (e) { /* queda marcado el párrafo */ } }
  if (scroll) (p.querySelector('.bm-word') || p).scrollIntoView({ block: 'center', behavior: 'auto' });
  return true;
}
function bmMenu(sid, idx, hit, x, y) {                 // al mantener presionado: ¿marcar la palabra o el párrafo?
  document.querySelectorAll('.bm-menu').forEach(e => e.remove());
  const mk = bmOf(sid), same = w => mk && mk.idx === idx && mk.pi === hit.pi && mk.w === w;
  const m = document.createElement('div'); m.className = 'bm-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<button type="button" data-w="${hit.w}">${same(hit.w) ? t('Quitar de la palabra') : t('Marcar palabra')}</button><button type="button" data-w="-1">${same(-1) ? t('Quitar del párrafo') : t('Marcar párrafo')}</button>`;
  document.body.appendChild(m); const bw = m.offsetWidth; m.style.left = Math.max(10, Math.min(innerWidth - bw - 10, x - bw / 2)) + 'px'; m.style.top = Math.max(70, y - 78) + 'px';
  const close = () => { m.remove(); document.removeEventListener('pointerdown', away, true); }, away = e => { if (!m.contains(e.target)) close(); };
  m.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); BMHOLD = Date.now(); close(); bmSet(sid, idx, { pi: hit.pi, w: +b.dataset.w }); });
  setTimeout(() => document.addEventListener('pointerdown', away, true), 50); setTimeout(close, 7000);
}
function bmSet(sid, idx, hit) {
  const old = (S.pos || {})[sid] || { idx, pct: 0 }, cur = old.mk;
  if (cur && cur.idx === idx && cur.pi === hit.pi && cur.w === hit.w) { const { mk, ...rest } = old; S.pos = { ...S.pos, [sid]: rest }; LS.set(uk('pos'), S.pos); bmApply(); return toast('Separador quitado'); }
  S.pos = { ...S.pos, [sid]: { ...old, mk: { idx, pi: hit.pi, w: hit.w } } }; LS.set(uk('pos'), S.pos); bmApply(); if (navigator.vibrate) navigator.vibrate(12); toast('Separador puesto aquí');
}
let BMT = null;
document.addEventListener('pointerdown', e => {
  const p = e.target.closest && e.target.closest('.rf .reader-text p[data-bi]'); if (!p || e.target.closest('[data-act]')) return;
  const m = location.hash.match(/^#\/story\/([^/]+)\/(\d+)/); if (!m) return; const x = e.clientX, y = e.clientY; clearTimeout(BMT);
  BMT = setTimeout(() => { BMT = null; const hit = bmWordAt(x, y); if (!hit) return; const sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges(); BMHOLD = Date.now(); if (navigator.vibrate) navigator.vibrate(10); bmMenu(m[1], +m[2] - 1, hit, x, y); }, 520);
}, { passive: true });
let BMHOLD = 0;
['pointerup', 'pointercancel', 'scroll', 'touchmove'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(BMT); BMT = null; }, { passive: true, capture: true }));
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.rf .reader-text')) e.preventDefault(); });
/* 6. ROUTER ------------------------------------------------------- */
const go = p => { location.hash = '#' + p; if (location.hash === '#' + p) render(); };
const goReplace = p => { if (location.replace) location.replace('#' + p); else location.hash = '#' + p; };   // no apila historial: "atrás" sale del libro
/* Progreso de lectura: capítulo + posición de scroll por historia */
const scrollPct = () => { const de = document.documentElement, max = Math.max(1, (de.scrollHeight || 0) - (window.innerHeight || 0)); return Math.min(1, Math.max(0, (window.scrollY || 0) / max)); };
let VISIT = null, HLC = '';                            // VISIT: vienes de un aviso a un comentario de un capítulo anterior: el progreso no retrocede
function savePos(sid, idx, pct) { if (VISIT && VISIT.sid === sid && VISIT.pos && idx < VISIT.pos.idx) return; const old = (S.pos || {})[sid]; S.pos = { ...S.pos, [sid]: { idx, pct, ...(old && old.mk ? { mk: old.mk } : {}) } }; LS.set(uk('pos'), S.pos); }
const saveReadPos = (sid, idx) => savePos(sid, idx, scrollPct());
function restoreReadPos(sid, idx) {
  const p = (S.pos || {})[sid];
  if (p && p.mk && p.mk.idx === idx) { setTimeout(() => { const w = bmApply(true); if (!w) { const de = document.documentElement; if (p.idx === idx && p.pct > 0.02) window.scrollTo(0, p.pct * Math.max(1, (de.scrollHeight || 0) - (window.innerHeight || 0))); } }, 60); return; }
  if (p && p.idx === idx && p.pct > 0.02) setTimeout(() => { const de = document.documentElement; window.scrollTo(0, p.pct * Math.max(1, (de.scrollHeight || 0) - (window.innerHeight || 0))); }, 40);
}
function autoGrow() {                                  // el cuadro crece con el texto; se conserva el scroll para que la pantalla no salte
  const t = $('#w-ch-text'); if (!t || !t.style || !t.scrollHeight) return;
  const y = window.scrollY || 0; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px';
  if ((window.scrollY || 0) !== y) window.scrollTo(0, y);
}
/** Altura (px, desde el borde de arriba del cuadro) a la que está el borde de abajo de la línea del cursor: se mide con una copia invisible del texto */
function caretBottom(ta) {
  const cs = getComputedStyle(ta), m = document.createElement('div');
  ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'wordSpacing', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'tabSize'].forEach(k => { m.style[k] = cs[k]; });
  m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.left = '-9999px'; m.style.top = '0'; m.style.whiteSpace = 'pre-wrap'; m.style.overflowWrap = 'break-word'; m.style.width = ta.getBoundingClientRect().width + 'px';
  m.textContent = ta.value.slice(0, ta.selectionStart || 0); const sp = document.createElement('span'); sp.textContent = '​'; m.appendChild(sp); document.body.appendChild(m);
  const y = sp.offsetTop + sp.offsetHeight; m.remove(); return y;
}
/** La pantalla sigue al cursor: si queda tapado por el teclado (o pegado arriba), se desliza lo justo para verlo con un poco de aire */
let FOLLOWQ = 0;
function followCaret() {
  cancelAnimationFrame(FOLLOWQ);
  FOLLOWQ = requestAnimationFrame(() => {
    const ta = $('#w-ch-text'); if (!ta || document.activeElement !== ta) return;
    const vv = window.visualViewport, vt = vv ? vv.offsetTop : 0, vh = vv ? vv.height : window.innerHeight;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 32, y = ta.getBoundingClientRect().top + caretBottom(ta);
    const bottom = vt + vh - lh * 1.5, top = vt + 64 + lh;
    if (y > bottom) window.scrollBy(0, y - bottom); else if (y < top) window.scrollBy(0, y - top);
  });
}
let TYPEOFF = 0;
function setTyping(on) {
  const w = document.querySelector('.wf'); if (!w) return; clearTimeout(TYPEOFF);
  if (on) { w.classList.add('typing'); kbVar(); } else TYPEOFF = setTimeout(() => { w.classList.remove('typing'); w.style.removeProperty('--kb'); }, 280);
}
function kbVar() {
  const w = document.querySelector('.wf'), vv = window.visualViewport; if (!w) return;
  w.style.setProperty('--kb', (vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0) + 'px');
}
document.addEventListener('focusin', e => { if (e.target.id === 'w-ch-text') { setTyping(true); setTimeout(followCaret, 120); setTimeout(followCaret, 420); setTimeout(followCaret, 800); } });
document.addEventListener('focusout', e => { if (e.target.id === 'w-ch-text') setTyping(false); });
document.addEventListener('selectionchange', () => { if (document.activeElement && document.activeElement.id === 'w-ch-text') followCaret(); });
if (window.visualViewport) { const f = () => { if (document.activeElement && document.activeElement.id === 'w-ch-text') { kbVar(); followCaret(); } }; window.visualViewport.addEventListener('resize', f); window.visualViewport.addEventListener('scroll', f); }
/* --- Transiciones suaves entre pantallas (CSS + un poco de JS) --- */
let NAVDIR = '';                                       // 'next' | 'prev' | '' → desliza hacia la derecha, hacia la izquierda o solo desvanece
const BARS = {};                                       // último % mostrado de cada barra, para que se llenen con animación
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function ghostOut(app) {                               // la pantalla anterior se desvanece encima mientras entra la nueva
  const old = app.firstElementChild; if (!old || !old.cloneNode || reduceMotion()) return;
  const g = old.cloneNode(true); g.querySelectorAll('[id]').forEach(e => e.removeAttribute('id')); g.removeAttribute('id');
  g.setAttribute('inert', ''); g.setAttribute('aria-hidden', 'true'); g.classList.add('view-ghost'); g.style.top = (-(window.scrollY || 0)) + 'px';
  document.body.appendChild(g); setTimeout(() => g.remove(), 260);
}
const LOADER = (cls = '') => `<span class="auri-loader ${cls}" role="status" aria-label="Cargando"><svg viewBox="0 0 64 56" aria-hidden="true"><path class="ear l" d="M9 32 L12 4 L31 17Z"/><path class="ear r" d="M55 32 L52 4 L33 17Z"/><ellipse class="face" cx="32" cy="35" rx="26" ry="18"/><ellipse class="eye" cx="23" cy="34" rx="3.2" ry="4"/><ellipse class="eye" cx="41" cy="34" rx="3.2" ry="4"/></svg></span>`;
function stagger(app) {                                // entrada escalonada de tarjetas y menús al cambiar de pantalla
  if (reduceMotion() || !app.querySelectorAll) return;
  app.querySelectorAll('.story-card,.news-item,.panel,.set-item,.cr-row,.notif,.char-tile,.carousel').forEach((e, i) => e.style.setProperty('--i', Math.min(i, 8)));
  app.classList.add('stg'); setTimeout(() => app.classList.remove('stg'), 650);
}
function tabFx() { const a = $('#app'); if (!a || reduceMotion()) return; a.classList.add('tab-swap'); setTimeout(() => a.classList.remove('tab-swap'), 320); }
function enterView(app, dir) {
  if (reduceMotion() || !app.classList) return;
  stagger(app);
  app.classList.remove('v-fade', 'v-next', 'v-prev'); void app.offsetWidth;
  app.classList.add(dir === 'next' ? 'v-next' : dir === 'prev' ? 'v-prev' : 'v-fade');
}
function animateBars() {                               // las barras de progreso se llenan desde el valor anterior
  document.querySelectorAll('.pbar i[data-w]').forEach(el => {
    const k = el.dataset.key, to = +el.dataset.w, from = BARS[k] ?? 0; BARS[k] = to;
    if (from === to || reduceMotion()) return;
    el.style.width = from + '%'; void el.offsetWidth; el.style.width = to + '%';
  });
}
let ASKING = false;                                    // hay un cuadro "guardar en biblioteca" abierto (evita que se apilen)
function libPrompt(title, onYes, onNo) {               // cuadrito pequeño superpuesto: Aceptar / Cancelar
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box mini-box" role="dialog" aria-modal="true" aria-label="${esc(t('Guardar en tu biblioteca'))}"><h2>📚 ${t('¿Guardar en tu biblioteca?')}</h2>
  <p class="helper">«${esc(title)}»<br>${t('Así recibirás un aviso cuando haya capítulos nuevos.')}</p>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">${t('Cancelar')}</button><button class="button" data-yes style="flex:1">${t('Aceptar')}</button></div></div>`;
  m.querySelector('[data-no]').onclick = () => { m.remove(); ASKING = false; onNo(); };
  m.querySelector('[data-yes]').onclick = () => { m.remove(); ASKING = false; onYes(); };
  document.body.appendChild(m);
}
/** Pregunta si guardar el libro cuando alguien sale de leerlo. Solo para libros públicos que aún no están en su biblioteca ni en colecciones
 *  (también en obras propias). Devuelve true si mostró el cuadro. */
function askSaveLib(id, onYes, onNo) {
  if (!S.user || ASKING || S.lib.includes(id) || S.cols.includes(id)) return false;
  const sv = publishedStories().find(x => x.id === id); if (!sv) return false;
  ASKING = true;
  libPrompt(sv.title, () => { libAdd(id); toast(t('Guardado en tu biblioteca. Te avisaremos cuando haya capítulos nuevos.')); if (onYes) onYes(); }, () => { if (onNo) onNo(); });
  return true;
}
function fadeInfo() {                                  // tras deslizar entre partes: la portada ya está en su sitio, solo cambia el texto
  document.querySelectorAll('.detail > *:not(.saga-view)').forEach(el => { el.classList.remove('v-fade'); void el.offsetWidth; el.classList.add('v-fade'); });
}
function syncSearch() { const b = $('.search-bar'); if (b && b.classList) b.classList.toggle('open', SEARCH_OPEN); }
function focusSearch() { const i = $('#sq'); if (i && i.focus) setTimeout(() => i.focus(), 80); }
function clearSearch() {
  if (!Q) return; Q = ''; const i = $('#sq'); if (i) i.value = '';
  const l = $('#list'); if (l && (location.hash.slice(1) || '/') === '/') l.innerHTML = discoverList();
}
let SETDEEP = false;                                   // true = entraste a una sección de Ajustes desde el menú (el "atrás" vuelve a él, sin bucles)
let SHOWC = false, LASTP = '', ASV = null, KEEP = false;   // true = no volver arriba al re-dibujar (likes, comentarios…)
function render() {
  uiReset(); applyAccent();
  giftSweep();                                                   // vence regalos sin reclamar (24 h) y devuelve el cupo
  if (S.user && canNews() && $('#nb-list')) { if (NBFRESH) NBFRESH = false; else nbDraftSave(true); }       // si te vas de Noticias sin terminar, lo escrito queda como borrador
  if (W && S.user && ($('#w-ch-text') || $('#w-title'))) autosave();      // guarda lo que estabas escribiendo antes de cambiar de pantalla
  if (S.user) S.stories = freshStories();                       // siempre lo último guardado (p. ej. estados que cambió moderación)
  const path = location.hash.slice(1) || '/', [, a, b, c, d] = path.split('/'), app = $('#app');
  const nav = path !== LASTP, dir = nav ? NAVDIR : '', from = LASTP;
  if (nav && a === 'story' && d && /^c-\d+$/.test(d)) { HLC = d.slice(2); { const c0 = comments(b).find(x => String(x.id) === HLC); if (c0) REPOPEN.add(c0.parent != null && c0.parent !== '' ? c0.parent : c0.id); } if (!VISIT || VISIT.sid !== b) VISIT = { sid: b, pos: (S.pos || {})[b] ? { ...S.pos[b] } : null }; }
  else if (nav && (a !== 'story' || (VISIT && VISIT.sid !== b))) VISIT = null;
  if (nav && from && from.startsWith('/moderation/book/') && !(a === 'moderation' && b === 'book' && c === from.split('/')[3])) releaseClaim(decodeURIComponent(from.split('/')[3] || ''));
  if (nav && a === 'moderation' && b === 'book' && c) claimBook(decodeURIComponent(c));
  if (a === 'moderation' && b === 'bugs' && isOwner()) { BUG_LAST = Date.now(); sbBugs().then(ch => ch && softRender()); }
  if (nav) { PFEDIT = false; EPD = null; SHOWC = !!HLC; LASTP = path; NAVDIR = ''; NOTIF_OPEN = false; SETDEEP = a === 'settings' && !!b && from === '/settings'; }
  if (!S.user && !['login', 'register', 'signup', 'welcome', 'start'].includes(a)) return go(LS.get('auri.intro', false) ? '/start' : '/welcome');
  if (S.user && (a === 'welcome' || a === 'start' || (!isGuest() && (a === 'login' || a === 'register' || a === 'signup')))) return go('/');
  if (a === 'signup' && !QZ) return go('/register');
  if (S.user && activeBan(S.user)) { app.innerHTML = bannedView(); return; }                   // cuenta suspendida: solo ve el aviso
  if (a === 'user' && decodeURIComponent(b || '') === S.user) return go('/profile');
  if (a === 'character') return go('/profile');                    // los personajes ahora viven en Mi Perfil
  if (nav && dir !== 'swipe') ghostOut(app);
  if (a === 'welcome') app.innerHTML = welcomeView();
  else if (a === 'start') app.innerHTML = startView();
  else if (a === 'login' || a === 'register') app.innerHTML = authView(a);
  else if (isGuest() && ['write', 'stats', 'moderation', 'strike', 'messages', 'gift'].includes(a)) app.innerHTML = shell(a === 'write' ? '/write' : '', guestWall(a === 'write' ? 'escribir historias' : a === 'stats' ? 'ver estadísticas' : a === 'messages' ? 'enviar mensajes' : 'entrar aquí'));
  else if (a === 'signup') app.innerHTML = signupView();
  else if (a === 'write') { const v = writeRoute(b, c, d); app.innerHTML = c === 'ch' && W ? v : shell('/write', v); }   // escribir un capítulo = pantalla completa
  else if (a === 'story') { const v = storyView(b, c); app.innerHTML = c ? v : shell('', v); }   // leer un capítulo = pantalla completa
  else if (a === 'explore') app.innerHTML = shell('', exploreView(decodeURIComponent(b || '')));
  else if (a === 'library') app.innerHTML = shell('/library', libraryView());
  else if (a === 'profile' && b === 'edit' && !isGuest()) app.innerHTML = shell('/profile', editProfileView());
  else if (a === 'profile') app.innerHTML = shell('/profile', isGuest() ? guestProfile() : profileView());
  else if (a === 'user') app.innerHTML = shell('', userView(decodeURIComponent(b || '')));
  else if (a === 'strike') app.innerHTML = shell('', strikeView(b));
  else if (a === 'moderation' && b === 'book' && c && d) app.innerHTML = shell('/moderation', modChapterView(decodeURIComponent(c), decodeURIComponent(d)));
  else if (a === 'moderation' && b === 'book' && c) app.innerHTML = shell('/moderation', modBookView(decodeURIComponent(c)));
  else if (a === 'moderation') app.innerHTML = shell('/moderation', modView(b));
  else if (a === 'images') app.innerHTML = shell('', imagesMineView());
  else if (a === 'gift') app.innerHTML = shell('', giftView());
  else if (a === 'stats') app.innerHTML = shell('', statsView());
  else if (a === 'messages') app.innerHTML = b ? dmView(b) : shell('', dmView(''));
  else if (a === 'news') app.innerHTML = shell('/news', newsView(b));
  else if (a === 'settings') app.innerHTML = shell('', settingsView(b));
  else if (a === 'notifications') app.innerHTML = shell('', notifView());
  else app.innerHTML = shell('/', discoverView());
  if (a !== 'write') { W = null; WPREVIEW = false; }
  if (a !== 'story') EDITC = null;
  if (a !== 'story') closeMusic();
  else if (MUSIC && (b !== MUSIC.sid || String(c || '') !== MUSIC.ch)) {   // la música es de cada capítulo: al pasar a otro se detiene (si el siguiente usa el mismo enlace, sigue sonando)
    const st = findStory(b), nx = st && c && c !== 'fin' ? st.chapters.find(x => x.idx === +c - 1) : null;
    if (nx && b === MUSIC.sid && nx.music && nx.music === MUSIC.url) MUSIC.ch = String(c); else closeMusic(); }
  if (HLC) { const hid = HLC; HLC = ''; const cm0 = comments(b).find(x => String(x.id) === hid); if (cm0) { setTimeout(() => { const el = document.getElementById('cm-' + hid); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('cm-hl'); setTimeout(() => el.classList.remove('cm-hl'), 3200); } }, 120); } else toast(t('Ese comentario ya no está.')); }
  else if (!KEEP) { window.scrollTo(0, 0); if (a === 'story' && c) restoreReadPos(b, +c - 1); }
  imgGuard(app); isleSync(); bmApply(false); bioFit(); rfLeft(); KEEP = false; autoGrow(); if (nav) { if (dir === 'swipe') fadeInfo(); else enterView(app, dir); } animateBars(); carInit(); dmAfter();
  if (nav) autoMusic(a, b, c);
  if (nav && a === 'story' && c && c !== 'fin') pcHintOnce();
  if (S.user) { showModOverlay(); showGiftOverlay(); }                                      // moderador/a sin marco puesto: el aviso reaparece hasta que se lo ponga
  if (nav) { const m = from.match(/^\/story\/([^/]+)\/\d+$/); if (m && !(path + '/').startsWith('/story/' + m[1] + '/')) askSaveLib(decodeURIComponent(m[1])); }   // saliste de un capítulo por otro camino (p. ej. "atrás")
}
window.addEventListener('hashchange', render);

/* --- Comentarios por párrafo: toque, hoja y spoilers --- */
let PCS = null;
function pcClear() { document.querySelectorAll('.pc-on').forEach(x => { x.classList.remove('pc-on'); const b = x.querySelector('.pc-pill'); if (b) b.remove(); }); }
function pcTap(p) {                                      // tocar un párrafo: se resalta suave y aparece «Comentar» (sin cambiar el diseño)
  if (cfg('pcom') === 'off') return;
  const sel = window.getSelection && window.getSelection(); if (sel && String(sel).trim()) return;   // si estás seleccionando texto, no molesta
  const had = p.classList.contains('pc-on'); pcClear(); if (had) return;
  const m = (location.hash || '').match(/^#\/story\/([^/]+)\/(\d+)/); if (!m) return;
  const sid = decodeURIComponent(m[1]), ci = +m[2] - 1, pi = +p.dataset.pi, n = pcList(sid, ci, pi).length;
  p.classList.add('pc-on');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pc-pill'; b.dataset.act = 'pc-open'; b.dataset.pi = pi;
  b.textContent = n ? '💬 ' + tn(n, '{n} comentario', '{n} comentarios') : '💬 ' + t('Comentar'); p.appendChild(b);
}
function pcHintOnce() { if (cfg('pcom') !== 'off' && !cfg('pcHint')) { setCfg('pcHint', true); toast(t('Tip: toca un párrafo para comentarlo 💬')); } }
let PCREPLY = null, PCREPPRE = ''; const PCREPOPEN = new Set();       // comentarios de párrafo: hilo en el que respondes · hilos abiertos
function pcItem(c, s, sub = false, extra = '') {
  const hide = c.spoiler && cfg('spoilers') === 'hide' && c.by !== S.user, mine = c.by === S.user, can = mine || s.owner === S.user || isStaff();
  const lk = c.lk || [], liked = lk.includes(S.user), top = sub ? c.parent : c.id, role = t(ROLE_LABEL[roleOf(c.by)]), cid = esc(String(c.id));
  const items = `${!mine ? `<button type="button" role="menuitem" data-act="report-pc" data-cid="${cid}">${t('Reportar')}</button>` : ''}${can ? `<button type="button" role="menuitem" class="danger-link" data-act="pc-del" data-cid="${cid}">${t('Eliminar')}</button>` : ''}`;
  const menu = MENUC === c.id && items ? `<div class="c-menu" role="menu">${items}</div>` : '';
  return `<div class="comment ${sub ? 'reply' : ''} ${c.by === s.owner ? 'by-own' : ''}">${framedAvatar(c.by, sub ? 's30' : 's38')}<div class="c-main"><div class="c-bubble"><div class="c-meta"><b class="c-name ${nmCls(c.by)}">${esc(uName(c.by))}</b>${c.by === s.owner ? `<span class="c-badge own">${t('Autoría')}</span>` : ''}${role ? `<span class="c-badge staff">${esc(role)}</span>` : ''}${c.spoiler ? `<span class="pc-tag">⚠ ${t('Spoiler')}</span>` : ''}${relSpan(c)}
    ${items ? `<span class="c-more-wrap"><button type="button" class="c-more" data-act="pc-more" data-cid="${cid}" aria-label="${esc(t('Más opciones'))}" aria-expanded="${MENUC === c.id}">⋯</button>${menu}</span>` : ''}</div>
    <div class="c-text pc-text ${hide ? 'spoil' : ''}" ${hide ? `data-act="pc-reveal" role="button" aria-label="${esc(t('Spoiler oculto: toca para ver'))}"` : ''}>${esc(c.text)}</div>${hide ? `<button type="button" class="link-btn pc-hint" data-act="pc-reveal-btn">👁 ${t('Revelar spoiler')}</button>` : ''}</div>
    <div class="c-actions"><button type="button" class="c-heart ${liked ? 'on' : ''}" data-act="pc-like" data-cid="${cid}" aria-pressed="${liked}" aria-label="${esc(liked ? t('Quitar me gusta') : t('Me gusta'))}">${HEART}<span class="c-n">${lk.length || ''}</span></button><button type="button" class="c-act" data-act="pc-reply" data-top="${esc(String(top))}" data-pre="${sub ? esc('@' + uName(c.by) + ' ') : ''}">${ICO_REPLY}${t('Responder')}</button>${authLike(c, s)}</div>${extra}</div></div>`;
}
function paintPcList() {
  const box = $('#pc-list'); if (!box || !PCS) return; const s = findStory(PCS.sid); if (!s) return;
  const l = pcList(PCS.sid, PCS.ci, PCS.pi).filter(c => !hidesFrom(c.by)), tops = l.filter(c => !c.parent);
  box.innerHTML = tops.length ? tops.map(x => {
    const reps = l.filter(r => r.parent === x.id), open = PCREPOPEN.has(x.id);
    const tg = reps.length ? `<button type="button" class="c-rtoggle" data-act="pc-replies" data-cid="${esc(String(x.id))}" aria-expanded="${open}"><i class="c-line"></i>${open ? t('Ocultar respuestas') : t('Ver las respuestas ({n})', { n: reps.length })}</button>` : '';
    const rf = PCREPLY === x.id ? `<form data-form="pcreply" data-top="${esc(String(x.id))}" class="c-replyform">${framedAvatar(S.user, 's30')}<div class="c-pill"><input id="pc-reply-text" maxlength="${PC_MAX}" value="${esc(PCREPPRE)}" placeholder="${esc(t('Escribe una respuesta…'))}" aria-label="${esc(t('Tu respuesta'))}" autocomplete="off"><button class="c-send" type="submit" aria-label="${esc(t('Enviar respuesta'))}">${ICO_SEND}</button></div><button type="button" class="c-act" data-act="pc-reply-cancel">${t('Cancelar')}</button></form>` : '';
    return pcItem(x, s, false, `${tg}${open ? `<div class="c-replies">${reps.map(r => pcItem(r, s, true)).join('')}</div>` : ''}${rf}`);
  }).join('') : `<p class="helper" style="text-align:center;margin:10px 0">${t('Aún no hay comentarios en este párrafo. ¡Sé la primera persona!')}</p>`;
  const pcn = $('#pc-count'); if (pcn) pcn.textContent = l.length ? `(${l.length})` : '';
}
function openParaSheet(pi) {
  const m0 = (location.hash || '').match(/^#\/story\/([^/]+)\/(\d+)/); if (!m0) return;
  const sid = decodeURIComponent(m0[1]), ci = +m0[2] - 1, raw = pcPara(sid, ci, pi); if (raw === undefined) return;
  PCS = { sid, ci, pi, q: pQ(raw) }; const old = $('#pc-sheet'); if (old) old.remove();
  const ex = raw.replace(/\s+/g, ' ').trim(), m = document.createElement('div'); m.className = 'modal sheet'; m.id = 'pc-sheet';
  m.innerHTML = `<div class="modal-box pc-box" role="dialog" aria-modal="true" aria-label="${esc(t('Comentarios del párrafo'))}"><div class="pc-head"><strong>💬 ${t('Comentarios del párrafo')} <span id="pc-count"></span></strong><button class="icon-btn" data-act="pc-close" aria-label="${esc(t('Cerrar'))}">✕</button></div>
  <blockquote class="pc-quote">“${esc(ex.length > 150 ? ex.slice(0, 150) + '…' : ex)}”</blockquote><div id="pc-list" class="pc-list"></div>
  ${isGuest() ? guestCompose('comentar') : ''}<div class="pc-compose" ${isGuest() ? 'style="display:none"' : ''}><textarea id="pc-text" class="textarea" maxlength="${PC_MAX}" placeholder="${esc(t('Escribe un comentario…'))}" aria-label="${esc(t('Tu comentario'))}"></textarea>
  <div class="pc-row"><label class="pc-spoil"><input type="checkbox" id="pc-spoil"> ⚠ ${t('Contiene spoiler')}</label><button class="button sm" data-act="pc-send">${t('Publicar')}</button></div></div></div>`;
  m.addEventListener('click', e => { if (e.target === m) { m.remove(); PCS = null; pcClear(); } });
  document.body.appendChild(m); paintPcList();
}
function sendParaComment() {
  if (!PCS) return; const s = findStory(PCS.sid), ta = $('#pc-text'), text = ((ta || {}).value || '').trim().slice(0, PC_MAX), spoiler = !!($('#pc-spoil') || {}).checked;
  if (!s) return; if (!text) return toast(t('Escribe tu comentario.')); if (pcPara(PCS.sid, PCS.ci, PCS.pi) === undefined) return toast(t('Este párrafo ya no existe.'));
  const all = pcAll(), k = pcKey(PCS.sid, PCS.ci, PCS.pi); (all[k] = all[k] || []).push({ id: Date.now() + Math.random().toString(36).slice(2, 5), by: S.user, text, date: today(), spoiler, q: PCS.q });
  G.set('pcom', all); notify(s.owner, 'comment', s.id, spoiler ? '(comentario con spoiler en un párrafo)' : 'en un párrafo: ' + text.slice(0, 70));
  ta.value = ''; const sp = $('#pc-spoil'); if (sp) sp.checked = false; paintPcList(); if (cfg('pcom') === 'dots') { KEEP = true; render(); }
}

/* 7. EVENTOS (delegación) ----------------------------------------- */
document.addEventListener('click', e => {
  const dl = e.target.closest('[data-dir]'); if (dl) { NAVDIR = dl.dataset.dir; setTimeout(() => { NAVDIR = ''; }, 900); }
  const sc = e.target.closest('.sc');                                              // tocar una portada vecina
  if (sc) { e.preventDefault(); sagaGoto(sc.closest('[data-saga]'), +sc.dataset.k); return; }
  const gt = e.target.closest('[data-goto]'), tr = gt && $('[data-saga]');         // flechas ◀ Parte 1 / Parte 3 ▶
  if (gt && tr) { e.preventDefault(); sagaGoto(tr, +gt.dataset.goto); return; }
  const ra = e.target.closest('a[data-readas]');                  // empezar a leer una historia con [TN]: primero "Leer como…"
  if (ra) { e.preventDefault(); const p = ra.getAttribute('href').slice(1); if (cfg('skipReadAs') && S.chars.some(c => c.id === S.activeId)) { NAVDIR = 'next'; goReplace(p); } else readAs(p); return; }
  const rl = e.target.closest('a[data-replace]');
  if (rl) { e.preventDefault(); goReplace(rl.getAttribute('href').slice(1)); return; }
  const pp = e.target.closest('.rf .reader-text p[data-pi]');                     // tocar un párrafo al leer
  if (pp && Date.now() - BMHOLD < 700) return;                                       // el toque que suelta un separador no abre «Comentar»
  if (pp && !e.target.closest('[data-act]')) { pcTap(pp); return; }
  if (!e.target.closest('[data-act]')) pcClear();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id } = el.dataset;
  if (isGuest() && GUEST_ACTS[act]) { e.preventDefault(); return guestGate(GUEST_ACTS[act]); }
  const persist = (k, v) => LS.set(uk(k), v);
  const actions = {
    'dmr-ok': () => dmAnswer(id, 'accept'), 'dmr-no': () => dmAnswer(id, 'reject'),
    'dmr-block': () => dialog(t('¿Bloquear a {n}?', { n: uName(id) }), t('No verás sus comentarios ni sus obras, dejarán de seguirse y no habrá avisos entre ustedes. Puedes desbloquearla en Ajustes.'), t('Bloquear'), t('Cancelar'), () => dmAnswer(id, 'block'), true),
    'dm-book': () => openDmBookPicker(id), 'dm-why': () => toast(dmWhy(S.user, id) || 'Ya pueden escribirse.'),
    'wl-next': () => { WLI = Math.min(WLI + 1, WL_SLIDES.length - 1); KEEP = true; render(); }, 'wl-prev': () => { WLI = Math.max(WLI - 1, 0); KEEP = true; render(); },
    'wl-go': () => { WLI = +el.dataset.i || 0; KEEP = true; render(); }, 'wl-done': () => { LS.set('auri.intro', true); WLI = 0; go('/start'); },
    'wl-replay': () => { WLI = 0; go('/welcome'); }, 'guest-enter': () => startGuest(),
    'guest-cta': () => guestGate('comentar'),
    'exit-book': () => {                               // salir del libro: guarda el progreso y, si no está en tu biblioteca, pregunta
      saveReadPos(id, +el.dataset.n);
      const leave = () => { toast(t('Progreso guardado')); goReplace('/story/' + id); };
      if (!askSaveLib(id, () => goReplace('/story/' + id), leave)) leave();
    },
    'adm-toggle': () => { const l = el.parentNode.parentNode.querySelector('.adm-list'); if (!l) return; l.hidden = !l.hidden; el.setAttribute('aria-expanded', String(!l.hidden)); },
    'adm-strike': () => openStrikeForm(id), 'adm-ban': () => openBanForm(id),
    'adm-unban': async () => { const r = await liftBan(id); if (r) return toast(r); toast(t('Suspensión levantada')); KEEP = true; render(); },
    'test-role': () => { testRole(id, el.dataset.role); toast(t('Rol de prueba actualizado ✓')); KEEP = true; render(); },
    'mod-comm': () => { if (!isStaff()) return; MODC = ['es', 'en'].includes(id) ? id : 'all'; KEEP = true; render(); },
    'adm-scope': () => { if (!isOwner()) return; const us = getUsers(), cur = staffScope(id), nx = cur.length > 1 ? ['es'] : cur[0] === 'es' ? ['en'] : ['es', 'en']; if (!us[id]) return; us[id].scope = nx; G.set('users', us); if (modCloud() && us[id].uid) sbApi('/rest/v1/profiles?id=eq.' + us[id].uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { scope: nx } }); logAction('scope-set', id, 'Modera: ' + nx.map(c => COMMS[c]).join(' y ')); toast(t('Ahora modera: {c}', { c: nx.map(c => COMMS[c]).join(' / ') })); KEEP = true; render(); },
    'gift-send': async () => { const inp = $('#g-to'), r = await giftSend(inp ? inp.value : ''), er = $('[data-err]'); if (r) { if (er) er.textContent = r; return toast(r); } toast(t('Regalo enviado: tiene 24 h para reclamarlo')); KEEP = true; render(); },
    'bow-gift': () => { if (isOwner() && canAct(id)) openBowGift(id); },
    'gift-profile': () => { if (!isOwner() || !canAct(id)) return; dialog(t('¿Regalar el marco Top 50 a {n}?', { n: uName(id) }), t('Tendrá 24 h para reclamarlo. Si no lo hace, el regalo se cancela y el cupo vuelve a ti. Quedan {a} de {b}.', { a: giftLeft(), b: GIFT_TOTAL }), t('Regalar'), t('Cancelar'), async () => { const r = await giftSend(id); toast(r || t('Regalo enviado ✓')); KEEP = true; render(); }); },
    'gift-claim': async () => { const r = await giftClaim(id), er = $('[data-err]'); if (r) { if (er) er.textContent = r; return toast(r); } toast(t('¡Marco reclamado!')); KEEP = true; render(); },
    'gift-cancel': () => { if (!isOwner()) return; const g = giftsAll().find(x => x.id === id); if (!g) return; dialog(g.status === 'claimed' ? t('¿Quitar el marco a {n}?', { n: uName(g.to) }) : t('¿Cancelar el regalo para {n}?', { n: uName(g.to) }), t('El cupo volverá a ti.'), t('Sí, continuar'), t('No'), async () => { await giftCancel(id); KEEP = true; render(); }, true); },
    'adm-mod': () => { if (!isOwner() || !canAct(id)) return; dialog(t('¿Invitar a {n} a la moderación?', { n: uName(id) }), t('Recibirá una invitación y deberá aceptarla y confirmar que es mayor de edad.'), t('Enviar invitación'), t('Cancelar'), async () => { const r = await inviteMod(id); toast(r || t('Invitación enviada ✓')); }); },
    'adm-admin': () => { if (!isOwner() || !canAct(id)) return; dialog(t('¿Ascender a {n} a administración?', { n: uName(id) }), t('Recibirá una invitación que puede aceptar o rechazar. Si acepta, podrá publicar anuncios, revisar capítulos y descender moderadores, pero no ascender a nadie.'), t('Enviar invitación'), t('Cancelar'), async () => { const r = await inviteRole(id, 'ADMIN'); toast(r || t('Invitación enviada ✓')); }); },
    'adm-revoke': () => { const r0 = roleOf(id); dialog(r0 === 'ADMIN' ? t('¿Quitar la administración a {n}?', { n: uName(id) }) : t('¿Quitar la moderación a {n}?', { n: uName(id) }), r0 === 'ADMIN' ? t('Perderá sus permisos de administración y su marco, y seguirá como moderador/a.') : t('Perderá los permisos y el marco de moderación.'), t('Quitar'), t('Cancelar'), async () => { const r = await revokeMod(id); toast(r || t('Rol retirado')); KEEP = true; render(); }, true); },
    'inv-accept': () => openAcceptMod(el.dataset.nid),
    'inv-decline': () => { declineInvite(el.dataset.nid); toast(t('Invitación rechazada')); KEEP = true; render(); },
    'owner-frame': () => { if (!isOwner()) return; const us = getUsers(); us[S.user].frameOn = us[S.user].frameOn === false; G.set('users', us); KEEP = true; render(); },
    'ch-go': () => { autosave(); go(`/write/${W.id}/ch/${el.dataset.cid}`); },
    'ch-list': () => { autosave(); go(`/write/${W.id}/chapters`); },
    'info-go': () => go(`/write/${W.id}`),
    'save-next': saveInfo,
    'info-save': () => { if (saveInfoOnly()) { toast(t('Cambios guardados ✓')); KEEP = true; render(); } },
    comments: () => { SHOWC = !SHOWC; KEEP = true; render(); if (SHOWC) { const c = $('#comments'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    'ch-add': addChapter,
    'ch-trash': () => { const c = W.chapters.find(x => x.id === +el.dataset.cid); if (c) confirmBox(t('¿Seguro que quieres eliminar «{title}»?', { title: c.title || t('capítulo') }), () => deleteChapter(c.id)); },
    'warn-toggle': () => { W.warns = W.warns || []; const on = !W.warns.includes(id); W.warns = on ? [...W.warns, id] : W.warns.filter(x => x !== id); el.classList.toggle('active', on); el.setAttribute('aria-pressed', String(on)); },
    'avoid-warn': () => { const l = avoidWarns(), on = !l.includes(id); setCfg('avoidWarns', on ? [...l, id] : l.filter(x => x !== id)); KEEP = true; render(); },
    'toggle-priv': () => { collect(); W.private = !W.private; el.setAttribute('aria-checked', String(!!W.private)); toast(W.private ? t('Historia privada: solo tú la ves.') : t('La historia vuelve a ser pública cuando envíes sus capítulos a revisión.')); },
    'toggle-18': () => { if (isMinor(getUsers()[S.user])) return; collect(); const st = freshStories().find(x => x.id === W.id);
      if (W.mature && st && st.mature && publicPrefix(st.chapters).length && !isStaff()) { el.setAttribute('aria-checked', 'true'); return dialog(t('Quitar +18 de una obra publicada'), t('Para proteger a las personas menores, quitar la marca +18 de una obra ya publicada necesita aprobación de moderación. Seguirá marcada +18 mientras tanto.'), t('Enviar solicitud'), t('Cancelar'), () => toast(requestUnmature(W.id, W.title))); }
      W.mature = !W.mature; el.setAttribute('aria-checked', W.mature); },
    'rp-img': () => { const r = reportsAll().find(x => String(x.id) === id), d = r && (r.imgs || [])[+el.dataset.i]; if (d) showImg(d); },
    'acc-reports': () => { if (!isStaff()) return; RACC = id; RFILT = 'open'; go('/moderation/reports'); }, 'acc-clear': () => { RACC = null; KEEP = true; render(); }, 'log-filter': () => { LOGF = id; KEEP = true; render(); }, 'log-who': () => { LOGW = id; KEEP = true; render(); },
    'post-approve': () => { const e = resolvePost(el.dataset.k, id, true); if (e) return toast(e); toast(t('Publicación aprobada')); KEEP = true; render(); },
    'post-reject': () => { if (!canBan()) return; const k = el.dataset.k; formModal('Rechazar la publicación', '<p class="helper">' + esc(t('Quien la envió verá este motivo y podrá corregirla y reenviarla.')) + '</p><textarea class="textarea" data-reason maxlength="300" placeholder="' + esc(t('Motivo del rechazo…')) + '"></textarea>', tx('Rechazar', 'mod'),
      m => { const e = resolvePost(k, id, false, m.querySelector('[data-reason]').value); if (!e) { toast(t('Publicación rechazada')); KEEP = true; render(); } return e; }, true); },
    'adm-unstrike': () => { if (!canBan()) return; const sid = el.dataset.sid; formModal('Anular strike', '<p class="helper">' + esc(t('El strike deja de contar y la persona recibe un aviso con este motivo. Queda en el registro.')) + '</p><textarea class="textarea" data-reason maxlength="300" placeholder="' + esc(t('Motivo de la anulación…')) + '"></textarea>', 'Anular strike',
      async m => { const e = await annulStrike(id, sid, m.querySelector('[data-reason]').value); if (!e) { toast(t('Strike anulado')); KEEP = true; render(); } return e; }); },
    'ap-open': () => openAppealForm(), 'ap-filter': () => { AFILT = id; KEEP = true; render(); },
    'ap-img': () => { const a = appealsAll().find(x => String(x.id) === id), d = a && (a.imgs || [])[+el.dataset.i]; if (!d) return; const m = document.createElement('div'); m.className = 'modal sheet'; m.innerHTML = `<div class="modal-box ap-view"><img src="${esc(d)}" alt="${esc(t('Prueba'))}"><button class="button ghost" data-no>${t('Cerrar')}</button></div>`; m.onclick = ev => { if (ev.target === m || ev.target.closest('[data-no]')) m.remove(); }; document.body.appendChild(m); },
    'ap-release': async () => { if (!canBan()) return; const a = appealsAll().find(x => String(x.id) === id); if (!a) return;
      if (isUuid(id) && modCloud()) { const e = await modDo('resolve_appeal', { aid: id, action: 'release', note: '' }); if (e) return toast(e); toast(t('Cuenta liberada')); KEEP = true; return render(); }
      const e = liftBan(a.user); if (e) return toast(e);
      logAction('appeal-release', a.user, id); pushNotif(a.user, { type: 'sys', extra: 'Tu apelación fue aceptada y tu cuenta fue liberada.' }); toast(t('Cuenta liberada')); KEEP = true; render(); },
    'ap-reject': () => { if (!canBan()) return; const a = appealsAll().find(x => String(x.id) === id); if (!a) return;
      formModal(t('Rechazar la apelación de {n}', { n: uName(a.user) }), '<p class="helper">' + esc(t('La persona verá este motivo.')) + '</p><textarea class="textarea" data-note maxlength="400" placeholder="' + esc(t('Explica por qué se mantiene la decisión…')) + '"></textarea>', 'Rechazar apelación', async m => {
        const note = m.querySelector('[data-note]').value.trim(); if (note.length < 3) return 'Escribe el motivo del rechazo.';
        if (isUuid(id) && modCloud()) { const e = await modDo('resolve_appeal', { aid: id, action: 'reject', note: note.slice(0, 400) }); if (!e) { toast(t('Apelación rechazada')); KEEP = true; render(); } return e; }
        G.set('appeals', appealsAll().map(x => String(x.id) === id ? { ...x, status: 'rejected', handledBy: S.user, handledDate: today(), note } : x)); logAction('appeal-reject', a.user, note.slice(0, 100));
        pushNotif(a.user, { type: 'sys', extra: 'Tu apelación fue rechazada: {n}', xv: { n: note } }); toast(t('Apelación rechazada')); KEEP = true; render(); return ''; }, true); },
    'rc-ok': () => { if (!isStaff()) return; const r = reportsAll().find(x => String(x.id) === String(id)); if (!r) return; const st = staffSetMature(r.sid, false); logAction('unmature', r.owner, r.sid);
      if (st) pushNotif(r.owner, { type: 'sys', extra: 'Moderación aprobó quitar la marca +18 de «{n}».', xv: { n: st.title } }); rpSet(id, 'resolved'); },
    'rc-no': () => { if (!isStaff()) return; const r = reportsAll().find(x => String(x.id) === String(id)); if (!r) return;
      pushNotif(r.owner, { type: 'sys', extra: 'Moderación mantuvo la marca +18 en «{n}». Si crees que fue un error, escribe a la administración.', xv: { n: r.title || t('tu obra') } }); rpSet(id, 'dismissed'); },
    'rc-set': () => { if (!isStaff()) return; const v = el.dataset.v === '1', st = staffSetMature(id, v); if (!st) return toast(t('La obra ya no existe.')); logAction(v ? 'mark18' : 'unmature', st.owner, id);
      pushNotif(st.owner, { type: 'sys', extra: v ? 'Moderación marcó «{n}» como +18.' : 'Moderación quitó la marca +18 de «{n}».', xv: { n: st.title } }); toast(v ? t('Marcada como +18') : t('Marca +18 quitada')); KEEP = true; render(); },
    'lock-remove': () => { if (TAB === 'lib') libRemove(id); else if (TAB === 'col') { S.cols = S.cols.filter(x => x !== id); LS.set(uk('cols'), S.cols); } else if (TAB === 'fav') { S.favs = S.favs.filter(x => x !== id); LS.set(uk('favs'), S.favs); } else if (TAB === 'read') { delete S.progress[id]; LS.set(uk('progress'), S.progress); } KEEP = true; render(); },
    terms: showTerms, 'close-modal': () => el.closest('.modal').remove(),
    adult: () => { const u = getUsers(); if (isMinor(u[S.user])) return; u[S.user].adultDeclared = true; G.set('users', u); render(); },
    approve: () => { if (!isStaff()) return; const bk = allStories().find(x => x.id === id), i = bk ? bk.chapters.findIndex(c => c.id === +el.dataset.cid) : -1;
      if (i < 0) return; if (!canApproveCh(bk, i)) return toast(t('Aprueba primero los capítulos anteriores.'));
      setChapterStatus(id, el.dataset.owner, +el.dataset.cid, 'approved'); toast('Capítulo aprobado'); afterReview(id); },
    reject: () => { if (!isStaff()) return; const r = (($('#rej-' + id + '-' + el.dataset.cid) || {}).value || '').trim(); if (!r) return toast('Escribe el motivo del rechazo.'); setChapterStatus(id, el.dataset.owner, +el.dataset.cid, 'rejected', r); toast('Capítulo rechazado'); afterReview(id); },
    'char-sel': () => { setActive(+el.dataset.cid); KEEP = true; render(); },
    'char-add': () => openCharForm(null),
    'char-edit': () => openCharForm(+el.dataset.cid),
    'char-del': () => { const cid = +el.dataset.cid, x = S.chars.find(k => k.id === cid); if (!x) return;
      confirmBox(t('¿Seguro que quieres eliminar a «{n}»?', { n: x.name }), () => { S.chars = S.chars.filter(k => k.id !== cid); setActive(S.activeId === cid ? undefined : S.activeId); KEEP = true; render(); }); },
    'cr-pick-open': () => { if (canNews()) openBookPicker(); },
    'report-story': () => { const s0 = findStory(id); if (s0) openReportFor('story', { sid: id, target: id, owner: s0.owner, title: s0.title, label: '«' + s0.title + '»' }); },
    'report-comment': () => { const c = comments(id).find(x => String(x.id) === el.dataset.cid); if (c) openReportFor('comment', { sid: id, cid: c.id, target: c.by, owner: c.by, excerpt: c.text, label: t('un comentario de {n}', { n: uName(c.by) }) }); },
    'report-pc': () => { const c = PCS && pcList(PCS.sid, PCS.ci, PCS.pi).find(x => String(x.id) === el.dataset.cid); if (c) openReportFor('pcomment', { sid: PCS.sid, ci: PCS.ci, target: c.by, owner: c.by, excerpt: c.text, label: t('un comentario de párrafo de {n}', { n: uName(c.by) }) }); },
    'report-img': () => { const s0 = findStory(id); if (s0) openImgReport({ url: s0.cover, kind: 'cover', sid: s0.id }); },
    'report-pimg': () => { const u0 = getUsers()[id] || {}, k = el.dataset.k === 'banner' ? 'banner' : 'avatar'; openImgReport({ url: u0[k], kind: k }); },
    'imgr-view': () => imgrView(id, +el.dataset.i),
    'st-open': () => stModal(id),
    'st-new': () => stForm(),
    'st-prof': () => go('/user/' + encodeURIComponent(id)),
    'st-chap': () => { stMark('c:' + el.dataset.e, id + ':' + ((findStory(id) || {}).updatedAt || '')); go('/story/' + id); },
    'report-user': () => openReportFor('user', { target: id, owner: id, label: t('a {n}', { n: uName(id) }) }),
    'rp-filter': () => { RFILT = id; KEEP = true; render(); },
    'rp-done': () => rpSet(id, 'resolved'), 'rp-dismiss': () => rpSet(id, 'dismissed'), 'rp-reopen': () => rpSet(id, 'open'),
    'rp-comments': () => { const cm = comments(id).find(x => String(x.id) === String(el.dataset.cid)); go('/story/' + id + '/' + (((cm && cm.ch) | 0) + 1)); setTimeout(() => { SHOWC = true; KEEP = true; render(); }, 60); },
    'rp-delcomment': () => { if (!isStaff()) return; confirmBox(t('¿Eliminar este comentario por incumplir las normas?'), () => { updateComments(id, l => l.filter(c => String(c.id) !== el.dataset.cid && String(c.parent) !== el.dataset.cid)); logAction('del-comment', id, el.dataset.cid); KEEP = true; render(); }); },
    'td-on': () => { if (!isStaff()) return; dialog(t('¿Retirar esta obra de Descubrir?'), t('Nadie más podrá encontrarla ni leerla hasta que se restaure. Se avisará a su autoría.'), t('Retirar'), t('Cancelar'), () => { const s0 = findStory(id); G.set('takedown', [...takedown().filter(x => x !== id), id]); sbTakedown(id, true); logAction('takedown', s0 ? s0.owner : '', id); if (s0 && s0.owner) pushNotif(s0.owner, { type: 'sys', extra: 'Tu obra «{n}» fue retirada de Descubrir por moderación. Si crees que fue un error, escribe a la administración.', xv: { n: s0.title } }); toast(t('Obra retirada de Descubrir')); KEEP = true; render(); }, true); },
    'td-off': () => { if (!isStaff()) return; G.set('takedown', takedown().filter(x => x !== id)); sbTakedown(id, false); const s0 = findStory(id); logAction('restore', s0 ? s0.owner : '', id); if (s0 && s0.owner) pushNotif(s0.owner, { type: 'sys', extra: 'Tu obra «{n}» volvió a estar visible en Descubrir.', xv: { n: s0.title } }); toast(t('Obra restaurada ✓')); KEEP = true; render(); },
    mute: () => { setBM('muted', id, true); toast(t('Silenciada: no verás sus comentarios ni recibirás avisos suyos.')); KEEP = true; render(); },
    unmute: () => { setBM('muted', id, false); toast(t('Dejaste de silenciar a esta persona.')); KEEP = true; render(); },
    block: () => dialog(t('¿Bloquear a {n}?', { n: uName(id) }), t('No verás sus comentarios ni sus obras, dejarán de seguirse y no habrá avisos entre ustedes. Puedes desbloquearla en Ajustes.'), t('Bloquear'), t('Cancelar'), () => { blockUser(id); toast(t('Cuenta bloqueada')); KEEP = true; render(); }, true),
    unblock: () => { setBM('blocked', id, false); toast(t('Desbloqueada ✓')); KEEP = true; render(); },
    'c-more': () => { const c = +el.dataset.cid; MENUC = MENUC === c ? null : c; KEEP = true; render(); },
    'c-like': () => { const cid = +el.dataset.cid; let added = false, target = '', cch = 0; updateComments(id, l => l.map(c => { if (c.id !== cid) return c; const lk = c.lk || []; added = !lk.includes(S.user); target = c.by; cch = c.ch | 0; return { ...c, lk: added ? [...lk, S.user] : lk.filter(x => x !== S.user) }; })); if (added && target) notify(target, 'clike', id, '', `${cch + 1}:${cid}`); KEEP = true; render(); const hb = document.querySelector(`.c-heart[data-cid="${cid}"]`); if (hb && added) { hb.classList.add('pulse'); setTimeout(() => hb.classList.remove('pulse'), 500); } },
    'c-reply': () => { REPLYTO = +el.dataset.top; REPLYPRE = el.dataset.pre || ''; REPOPEN.add(REPLYTO); KEEP = true; render(); const i = $('#c-reply-text'); if (i && i.focus) { i.focus(); if (i.setSelectionRange) i.setSelectionRange(i.value.length, i.value.length); } },
    'c-reply-cancel': () => { REPLYTO = null; REPLYPRE = ''; KEEP = true; render(); },
    'c-replies': () => { const c = +el.dataset.cid; REPOPEN.has(c) ? REPOPEN.delete(c) : REPOPEN.add(c); KEEP = true; render(); },
    'c-edit': () => { MENUC = null; EDITC = +el.dataset.cid; KEEP = true; render(); },
    'c-cancel': () => { EDITC = null; KEEP = true; render(); },
    'c-save': () => { const tx = ($('#c-edit-text').value || '').trim(), cid = +el.dataset.cid; if (!tx) return toast(t('El comentario no puede estar vacío.'));
      updateComments(id, l => l.map(c => c.id === cid && c.by === S.user ? { ...c, text: tx, edited: true } : c)); EDITC = null; KEEP = true; render(); },
    'c-del': () => { const cid = +el.dataset.cid; confirmBox(t('¿Seguro que quieres eliminar este comentario?'), () => { updateComments(id, l => { const cm = l.find(c => c.id === cid); return cm && (cm.by === S.user || isAdmin()) ? l.filter(c => c.id !== cid && c.parent !== cid) : l; }); KEEP = true; render(); }); },
    music: () => { setCfg('musicLast', 'play'); const hp = location.hash.split('/'); playMusic(el.dataset.url, hp[2], hp[3]); }, 'music-close': () => { setCfg('musicLast', 'close'); closeMusic(); },
    'lib-toggle': () => { if (S.lib.includes(id)) { libRemove(id); toast(t('Quitado de tu biblioteca. Ya no recibirás avisos de esta obra.')); } else { libAdd(id); toast(t('Guardado en tu biblioteca. Te avisaremos cuando haya capítulos nuevos.')); } KEEP = true; render(); },
    'lib-del': () => { libRemove(id); toast(t('Quitado de tu biblioteca. Ya no recibirás avisos de esta obra.')); KEEP = true; render(); },
    'col-add': () => { colAdd(id); toast(t('Guardado en tus colecciones ⭐')); KEEP = true; render(); },
    'col-del': () => { colDel(id); toast(t('Quitado de tus colecciones')); KEEP = true; render(); },
    like: () => { const s = findStory(id); if (s) { const was = likes(s.id).includes(S.user); toggleLike(s); KEEP = true; render(); const hb = document.querySelector('.like-btn'); if (hb && !was) { hb.classList.add('pulse'); setTimeout(() => hb.classList.remove('pulse'), 500); } } },
    follow: () => { toggleFollow(id); KEEP = true; render(); },
    'car-go': () => { CARHOLD = Date.now() + 8000; carGo(+el.dataset.i); },
    'nd-save': () => { if (nbDraftSave(false)) { KEEP = true; render(); } },
    'nd-open': () => { if (!canNews()) return; const d = ndAll().find(x => x.id === id); if (!d) return; if (NBID !== d.id) nbDraftSave(true);
      NB = d.blocks && d.blocks.length ? d.blocks.map(b => ({ t: b.t || '', img: b.img || '' })) : [{ t: '', img: '' }]; NBM = { type: d.type || 'Actualización', title: d.title || '' }; NBID = d.id; KEEP = true; render(); const f = $('#n-title'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    'nd-del': () => { if (!canNews()) return; confirmBox(t('¿Seguro que quieres eliminar este borrador?'), () => { G.set('newsdrafts', ndAll().filter(x => x.id !== id)); if (id === NBID) nbReset(); KEEP = true; render(); }); },
    'nb-add': () => { nbCollect(); if (NB.length >= 20) return toast(t('Máximo 20 párrafos por publicación.')); NB.push({ t: '', img: '' }); KEEP = true; render(); },
    'nb-del': () => { nbCollect(); NB.splice(+el.dataset.i, 1); if (!NB.length) NB.push({ t: '', img: '' }); KEEP = true; render(); },
    'nb-img-clear': () => { nbCollect(); const b = NB[+el.dataset.i]; if (b) b.img = ''; KEEP = true; render(); },
    'cr-edit': () => { const b = crAll().find(x => String(x.id) === id); if (!canEditPost(b)) return;
      formModal('Editar tarjeta', `<div class="form-group"><label for="ed-t">${t('Título')}</label><input id="ed-t" class="field" maxlength="70" value="${esc(b.title || '')}"></div><div class="form-group"><label for="ed-x">${t('Texto')}</label><textarea id="ed-x" class="textarea" maxlength="160">${esc(b.text || '')}</textarea></div><div class="form-group"><label for="ed-b">${t('Texto del botón')}</label><input id="ed-b" class="field" maxlength="24" value="${esc(b.btn || '')}"></div>`, 'Guardar',
        m => { const tt = m.querySelector('#ed-t').value.trim(), x = m.querySelector('#ed-x').value.trim(); if (b.kind === 'event' && (!tt || !x)) return 'Escribe título y descripción.';
          const L = crAll(), i = L.findIndex(y => String(y.id) === id); if (i < 0 || !canEditPost(L[i])) return t('Esa tarjeta ya no existe.');
          L[i] = { ...L[i], title: tt.slice(0, 70), text: x.slice(0, 160), btn: m.querySelector('#ed-b').value.trim().slice(0, 24), edited: today(), ...(isMod() ? { status: 'pending', reason: '' } : {}) }; logAction('banner-edit', S.user, tt.slice(0, 60)); if (isMod()) notifyApprovers('Una tarjeta del banner se volvió a enviar para aprobación'); G.set('banners', L); KEEP = true; render(); toast(t('Tarjeta actualizada ✓')); }); },
    'news-edit': () => { const n = news().find(x => String(x.id) === id); if (!canEditPost(n)) return; if (!NBEDIT) nbDraftSave(true);
      NB = newsBlocks(n).map(b => ({ t: b.t || '', img: b.img || '' })); NBM = { type: n.type, title: n.title }; NBID = ''; NBEDIT = String(n.id); KEEP = true; render(); const f = $('#n-title'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    'news-edit-cancel': () => { nbReset(); toast(t('Edición cancelada')); render(); },
    'cr-del': () => { const b = crAll().find(x => String(x.id) === id); if (!ownsPost(b)) return; confirmBox(t('¿Quitar esta tarjeta del banner?'), () => { G.set('banners', crAll().filter(b => String(b.id) !== id)); logAction('banner-del', b.by || OWNER_EMAIL, (b.title || '').slice(0, 60)); KEEP = true; render(); }); },
    'cr-up': () => { const L = crAll(), i = L.findIndex(b => String(b.id) === id); if (i < 0 || !ownsPost(L[i]) || isMod()) return; if (i > 0) { [L[i - 1], L[i]] = [L[i], L[i - 1]]; G.set('banners', L); KEEP = true; render(); } },
    'cr-down': () => { const L = crAll(), i = L.findIndex(b => String(b.id) === id); if (i < 0 || !ownsPost(L[i]) || isMod()) return; if (i < L.length - 1) { [L[i + 1], L[i]] = [L[i], L[i + 1]]; G.set('banners', L); KEEP = true; render(); } },
    'news-del': () => { const n0 = news().find(n => String(n.id) === id); if (ownsPost(n0)) confirmBox(t('¿Eliminar este anuncio?'), () => { G.set('news', news().filter(n => String(n.id) !== id)); logAction('news-del', n0.by || OWNER_EMAIL, (n0.title || '').slice(0, 60)); if (NBEDIT === id) nbReset(); KEEP = true; render(); }); },
    'poll-open': () => pollModal(el.dataset.id),
    'bn-adjust': () => { const u = getUsers()[S.user]; if (u && u.banner) editPhoto(u.banner, 'banner'); }, 'av-adjust': () => { const u = getUsers()[S.user]; if (u && u.avatar) editPhoto(u.avatar, 'avatar'); },
    'bn-clear': () => { const u = getUsers(); u[S.user].banner = ''; G.set('users', u); render(); },
    'chc-clear': () => { collect(); const cid = +$('#w-ch-text').dataset.cid; W.chapters = W.chapters.map(c => { if (c.id !== cid) return c; const { cover, ...rest } = c; return rest; }); persistDraft(); KEEP = true; render(); },
    'av-clear': () => { const u = getUsers(); u[S.user].avatar = ''; G.set('users', u); render(); },
    settings: () => go('/settings'),
    'pc-open': () => openParaSheet(+el.dataset.pi),
    'pc-close': () => { const m = $('#pc-sheet'); if (m) m.remove(); PCS = null; pcClear(); },
    'pc-send': sendParaComment,
    'pc-more': () => { MENUC = MENUC === el.dataset.cid ? null : el.dataset.cid; paintPcList(); },
    'pc-like': () => { if (!PCS) return; const all = pcAll(), k = pcKey(PCS.sid, PCS.ci, PCS.pi), cid = el.dataset.cid; let added = false, target = '';
      all[k] = (all[k] || []).map(c => { if (String(c.id) !== cid) return c; const lk = c.lk || []; added = !lk.includes(S.user); target = c.by; return { ...c, lk: added ? [...lk, S.user] : lk.filter(x => x !== S.user) }; });
      G.set('pcom', all); if (added && target) notify(target, 'clike', PCS.sid, '', `${(+PCS.ci | 0) + 1}:`); paintPcList(); const hb = document.querySelector(`#pc-list .c-heart[data-cid="${cid}"]`); if (hb && added) { hb.classList.add('pulse'); setTimeout(() => hb.classList.remove('pulse'), 500); } },
    'pc-reply': () => { PCREPLY = el.dataset.top; PCREPPRE = el.dataset.pre || ''; PCREPOPEN.add(PCREPLY); paintPcList(); const i = $('#pc-reply-text'); if (i && i.focus) { i.focus(); if (i.setSelectionRange) i.setSelectionRange(i.value.length, i.value.length); } },
    'pc-reply-cancel': () => { PCREPLY = null; PCREPPRE = ''; paintPcList(); },
    'pc-replies': () => { const c = el.dataset.cid; PCREPOPEN.has(c) ? PCREPOPEN.delete(c) : PCREPOPEN.add(c); paintPcList(); },
    'pc-reveal-btn': () => { const t = el.previousElementSibling; if (t) { t.classList.remove('spoil'); t.removeAttribute('data-act'); } el.remove(); },
    'pc-reveal': () => { el.classList.remove('spoil'); const h = el.nextElementSibling; if (h && h.classList.contains('pc-hint')) h.remove(); },
    'pc-del': () => { if (!PCS) return; const s = findStory(PCS.sid), cid = el.dataset.cid; confirmBox(t('¿Seguro que quieres eliminar este comentario?'), () => { const all = pcAll(), k = pcKey(PCS.sid, PCS.ci, PCS.pi); const t0 = (all[k] || []).find(c => c.id === cid); if (t0 && (t0.by === S.user || (s && s.owner === S.user) || isStaff())) all[k] = all[k].filter(c => c.id !== cid && c.parent !== cid); G.set('pcom', all); paintPcList(); if (cfg('pcom') === 'dots') { KEEP = true; render(); } }); },
    'set-back': () => { NAVDIR = 'prev'; const h = window.history; if (SETDEEP && h && h.length > 1) h.back(); else goReplace('/settings'); },   // si vienes del menú: retrocede en el historial (no apila otra copia)
    'settings-back': () => { const h = window.history; if (h && h.length > 1) h.back(); else go('/'); },
    cfg: () => { const k = el.dataset.k, v = el.dataset.v; if (k === 'theme') { S.theme = v; LS.set('auri.themeSet', true); applyTheme(); } else setCfg(k, v); KEEP = true; render(); },
    'cfg-toggle': () => { const k = el.dataset.k;
      if (k === 'hideLists') { const us = getUsers(); if (!us[S.user]) return; us[S.user].hideLists = !us[S.user].hideLists; G.set('users', us); sbPushLists(); el.setAttribute('aria-checked', String(!!us[S.user].hideLists)); return; }
      if (k === 'showOnline') { setCfg(k, !cfg(k)); el.setAttribute('aria-checked', String(cfg(k) !== false)); return; }      // sin redibujar: no se pierde lo que estás escribiendo
      if (k.startsWith('notif.')) { const key = k.slice(6); setCfg('notif', { ...cfg('notif'), [key]: !cfg('notif')[key] }); }
      else if (k === 'showMature') {
        if (isMinor(getUsers()[S.user])) return toast('El contenido +18 no está disponible para tu edad.');
        if (!cfg('showMature') && !isAdult(getUsers()[S.user])) return dialog('¿Eres mayor de 18 años?', 'El contenido +18 es solo para personas adultas. Esto es una declaración; la verificación real llegará con el servidor.', 'Soy mayor de 18', 'Cancelar', () => { const u = getUsers(); u[S.user].adultDeclared = true; G.set('users', u); setCfg('showMature', true); KEEP = true; render(); });
        setCfg('showMature', !cfg('showMature'));
      } else setCfg(k, !cfg(k));
      KEEP = true; render(); },
    'export-file': exportFile, 'export-copy': exportCopy,
    'wipe-device': () => typeConfirm('Borrar datos de este dispositivo', 'Se borra TODO lo guardado de Auri en este navegador: todas las cuentas, historias, bibliotecas y ajustes. No se puede deshacer. Haz una copia antes si la quieres. Escribe {w} para confirmar.', t('BORRAR'), 'Borrar todo', wipeDevice),
    'acct-save': saveAccount,
    'acct-delete': () => { if (isOwner()) return toast('La cuenta Owner no se puede eliminar desde aquí.');
      typeConfirm('Eliminar cuenta', 'Se borrarán tu cuenta, tus historias, biblioteca, personajes, comentarios, likes y seguidores. No se puede deshacer. Escribe {w} para confirmar.', t('ELIMINAR'), 'Eliminar mi cuenta', deleteAccount); },
    privacy: showPrivacy, report: openReport,
    'bug-filter': () => { BUGF = id; KEEP = true; render(); },
    'bug-set': async () => { const card = el.closest('.bug-card'), note = card ? card.querySelector('[data-note]').value.trim() : '', e = await bugSet(id, el.dataset.st, note); if (e) return toast(e); KEEP = true; render(); },
    'bug-del': async () => { if (!confirm(t('¿Eliminar este reporte?'))) return; if (modCloud() && isUuid(id)) { const r = await sbApi('/rest/v1/bug_reports?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); if (!r.ok) return toast(modErr(r)); await sbBugs(); } else G.set('bugs', bugsAll().filter(b => b.id !== id)); KEEP = true; render(); },
    'bug-img': () => { const b = bugsAll().find(x => x.id === id), src = b && (b.imgs || [])[+el.dataset.n]; if (!src || !safeImg(src)) return; const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="modal-box" style="padding:10px;max-width:min(96vw,640px)"><img src="${esc(src)}" alt="" style="width:100%;height:auto;border-radius:12px;display:block"><button class="button secondary" data-x style="width:100%;margin-top:10px">${t('Cerrar')}</button></div>`; m.onclick = ev => { if (ev.target === m || ev.target.closest('[data-x]')) m.remove(); }; document.body.appendChild(m); },
    'report-del': async () => { if (isUuid(id) && modCloud()) { const r = await sbApi('/rest/v1/reports?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); if (!r.ok) return toast(modErr(r)); await sbSyncMod(true); KEEP = true; return render(); }
      G.set('reports', G.get('reports', []).filter(r => String(r.id) !== id)); KEEP = true; render(); },
    'qz-back': () => { const b = $('#qz-birth'); if (b && QZ) QZ.birth = b.value; if (QZ.step > 1) { QZ.step--; render(); } else go('/register'); },
    'qz-next': () => {
      if (QZ.step === 1) {
        const v = ($('#qz-birth') || {}).value || '';
        if (!validBirth(v) || ageOf(v) > 120) return void ($('#qz-err').textContent = t('Escribe una fecha de nacimiento válida.'));
        QZ.birth = v;
        if (ageOf(v) < MIN_AGE) { QZ.blocked = true; PENDING = null; return render(); }          // no se crea ninguna cuenta ni se guarda nada
      } else if (!QZ.gender) return toast(t('Elige una opción para continuar.'));
      QZ.step++; render(); },
    'qz-comm': () => { const b = $('#qz-birth'); if (b && QZ) QZ.birth = b.value; QZ.comm = el.dataset.v === 'en' ? 'en' : 'es'; KEEP = true; render(); },
    'qz-gender': () => { QZ.gender = el.dataset.v; KEEP = true; render(); },
    'qz-int': () => { const v = el.dataset.v; QZ.interests = QZ.interests.includes(v) ? QZ.interests.filter(x => x !== v) : [...QZ.interests, v]; KEEP = true; render(); },
    'qz-18': () => { QZ.mature = !QZ.mature; KEEP = true; render(); },
    'qz-terms': () => { QZ.terms = !!el.checked; KEEP = true; render(); },
    'qz-finish': () => { if (!QZ.interests.length) return toast(t('Elige al menos un tema.')); if (!QZ.terms) return toast(t('Debes aceptar los términos y condiciones.')); createAccount(); },
    'qz-exit': () => { PENDING = null; QZ = null; go('/login'); },
    'int-set': () => { const u = getUsers(), me = u[S.user], v = el.dataset.v, cur = me.interests || [], next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
      if (!next.length) return toast('Deja al menos un tema.'); me.interests = next; G.set('users', u); KEEP = true; render(); },
    'search-toggle': () => { SEARCH_OPEN = !SEARCH_OPEN; syncSearch(); el.setAttribute('aria-expanded', SEARCH_OPEN); if (SEARCH_OPEN) focusSearch(); else clearSearch(); },
    'search-close': () => { SEARCH_OPEN = false; syncSearch(); clearSearch(); },
    'notif-toggle': () => { NOTIF_OPEN = !NOTIF_OPEN; KEEP = true; render(); },
    logout,
    fav: () => { S.favs = S.favs.includes(id) ? S.favs.filter(x => x !== id) : [...S.favs, id]; persist('favs', S.favs); render(); },
    read: () => { const sv = findStory(id); if (sv) BARS['b-' + id] = bookProgress(sv).pct; const n = +el.dataset.n, cur = readList(id).slice(); if (!cur.includes(n)) cur.push(n); S.progress[id] = cur; persist('progress', S.progress);
      const s = findStory(id), nx = s && s.chapters[s.chapters.findIndex(c => c.idx === n) + 1]; if (nx) { savePos(id, nx.idx, 0); NAVDIR = 'next'; goReplace(`/story/${id}/${nx.idx + 1}`); } else { NAVDIR = 'next'; goReplace(`/story/${id}/fin`); } },
    sm: () => { SM = id === 'users' ? 'users' : 'books'; GEN = 'All'; render(); const i = $('#sq'); if (i) i.placeholder = SM === 'users' ? t('Buscar usuarios…') : t('Buscar títulos, etiquetas o fandoms…'); sbSearchUsers(); },
    uf: () => { UF = id; render(); sbSearchUsers(); },
    genre: () => { GEN = id; render(); }, clear: () => { Q = ''; GEN = 'All'; render(); },
    'tag-search': () => { Q = Q.trim().toLowerCase() === '#' + id.toLowerCase() ? '' : '#' + id; GEN = 'All'; const i = $('#sq'); if (i) i.value = Q; if ((location.hash.slice(1) || '/') === '/') { render(); } else go('/'); },
    'tag-add': () => { const i = $('#w-tags'); if (!i) return; const cur = parseTags(i.value); if (!cur.some(t => t.toLowerCase() === id.toLowerCase())) cur.push(id); i.value = tagsText(cur); i.dispatchEvent(new Event('input', { bubbles: true })); }, tab: () => { TAB = id; render(); tabFx(); },
    delete: () => { if (confirm(t('¿Eliminar este borrador? No se puede deshacer.'))) { S.stories = S.stories.filter(s => s.id !== id); persist('stories', S.stories); render(); } },
    'resume-read': () => { const p = VISIT && VISIT.pos; VISIT = null; if (p) { NAVDIR = 'next'; go('/story/' + id + '/' + (p.idx + 1)); } },
    'pf-list': () => openUserList(id, el.dataset.kind), 'pf-works': () => { const w = document.getElementById('pf-works'); if (w && w.scrollIntoView) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'frames': () => openFrames(), 'look': () => openLook(),
    'ep-shape': () => { if (roleOf(S.user) !== 'OWNER') return; const us = getUsers(); us[S.user].shape = id; G.set('users', us); sbPushLook(); KEEP = true; render(); },
    'ep-halo': () => { if (roleOf(S.user) !== 'OWNER') return; const us = getUsers(); us[S.user].halo = id; G.set('users', us); sbPushLook(); KEEP = true; render(); },
    'avoid-add': () => avoidAdd(), 'avoid-del': () => { setCfg('avoidTags', avoidList().filter(x => x !== tagKey(id))); KEEP = true; render(); }, 'theme-colors': () => openThemes(), 'mod-order': () => { setCfg('modShuffle', cfg('modShuffle') === false); KEEP = true; render(); }, 'strike-info': () => openStrikeInfo(), 'ai-info': () => openAiInfo(id, el.dataset.cid), 'pf-edit': () => { PFEDIT = !PFEDIT; KEEP = true; render(); },
    'fmt': () => applyFmt(id),
    'align': () => applyAlign(id),
    'scene-sep': () => insertSep(),
    'mbti': () => openMbti(),
    'w-genre': () => { const sel = $('#w-genre'); if (!sel) return; sel.value = id; if (W) W.genre = id; document.querySelectorAll('.nb-g').forEach(b => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); const bk = $('.nb-book'); if (bk) bk.dataset.g = id; },
    'isle-test': () => { if (isOwner()) isleTest(id); },
    'img-appeal': () => imgAppeal(decodeURIComponent(id)),
    'img-ok': () => imgDecide(decodeURIComponent(id), true),
    'img-no': () => imgDecide(decodeURIComponent(id), false),
    'bio-more': () => { el.closest('.pf-bio-box').classList.toggle('open'); bioFit(); },
    'sep-lock': () => toast('Este diseño estará disponible pronto en la tienda.'),
    'kb-done': () => { const ta = $('#w-ch-text'); if (ta) ta.blur(); },
    'toggle-tn': () => { collect(); W.useReaderCharacter = !W.useReaderCharacter; el.setAttribute('aria-checked', W.useReaderCharacter); },
    preview: () => { collect(); WPREVIEW = true; render(); }, 'back-edit': () => { WPREVIEW = false; render(); },
    'save-draft': () => saveStory(false), publish: () => saveStory(true),
    'cover-adjust': () => { const src = COVSRC || (safeImg(W.cover) || /^https?:\/\//i.test(W.cover || '') ? W.cover : ''); if (!src) return toast(t('Sube una imagen para poder ajustarla.')); coverEditor(src, applyCover); },
    'clear-cover': () => { COVSRC = null; W.cover = ''; $('#cover-url').value = ''; $('#cover-prev').innerHTML = coverPrev(); }
  };
  actions[act] && actions[act]();
});
document.addEventListener('input', e => {
  if (e.target.id === 'w-ch-text') { $('#w-count').textContent = wc(e.target.value); autoGrow(); followCaret(); }
  if (['w-ch-text', 'w-ch-title', 'w-ch-music'].includes(e.target.id)) {            // guardado automático mientras escribes
    const sv = $('#w-saved'); if (sv) sv.textContent = '';
    clearTimeout(ASV); ASV = setTimeout(() => { autosave(); const v = $('#w-saved'); if (v && W) v.textContent = t('Guardado ✓'); }, 1200);
  }
  if (e.target.id === 'w-tags') { const pv = $('#w-tags-prev'); if (pv) pv.innerHTML = parseTags(e.target.value).map(t => `<span class="tag">#${esc(t)}</span>`).join(''); }
  if (e.target.id === 'sq') {                           // la búsqueda de la cabecera filtra Descubrir (si estás en otra pantalla, te lleva allí)
    Q = e.target.value;
    if ((location.hash.slice(1) || '/') === '/') { const l = $('#list'); if (l) l.innerHTML = discoverList(); clearTimeout(SB_UQ); SB_UQ = setTimeout(sbSearchUsers, 350); }
    else { go('/'); setTimeout(() => { const i = $('#sq'); if (i && i.focus) { i.focus(); if (i.setSelectionRange) i.setSelectionRange(Q.length, Q.length); } }, 0); }
  }
  if (e.target.id === 'cover-url') {
    const v = e.target.value.trim(); W.cover = /^https?:\/\//i.test(v) ? v : ''; $('#cover-prev').innerHTML = coverPrev();
    const im = $('#cover-prev img'); if (im) im.onerror = () => { $('#cover-prev').textContent = t('No se pudo cargar la imagen'); };
  }
});
document.addEventListener('change', e => {
  const id = e.target.id, f = e.target.files && e.target.files[0];
  if (e.target.classList && e.target.classList.contains('set-lang')) { LS.set('auri.ui', e.target.value); uiReset(); KEEP = true; render(); return; }
  if (e.target.classList && e.target.classList.contains('nb-file') && canNews()) { const i = +e.target.dataset.i; nbCollect(); newsPhoto(f, d => { if (NB[i]) NB[i].img = d; KEEP = true; render(); }); return; }
  if (id === 'ce-file' && canNews()) { newsPhoto(f, d => { CEIMG = d; const p = $('#ce-prev'); if (p) p.innerHTML = `<img src="${esc(d)}" alt="${esc(t('Vista previa de la imagen del evento'))}">`; }); return; }
  if (id === 'cover-file') { loadCover(f); e.target.value = ''; }
  if (id === 'import-file') importFromFile(f);
  if (id === 'bn-file') { editPhoto(f, 'banner'); e.target.value = ''; }       // portada del perfil
  if (id === 'chc-file') cropPhoto(f, 720, 405, d => {                                                                                    // portada de un capítulo (opcional)
    collect(); const cid = +$('#w-ch-text').dataset.cid; W.chapters = W.chapters.map(c => c.id === cid ? { ...c, cover: d } : c); persistDraft(); KEEP = true; render(); }, .72);
  if (id === 'char-sel') { setActive(+e.target.value); KEEP = true; render(); }
  if (id === 'ch-sel') NAVDIR = +e.target.value > +location.hash.split('/')[3] ? 'next' : 'prev';
  if (id === 'ch-sel') goReplace('/story/' + location.hash.split('/')[2] + '/' + e.target.value);
  if (id === 'av-file' || id === 'av-file2') { editPhoto(f, 'avatar'); e.target.value = ''; }
});
document.addEventListener('error', e => { if (e.target.classList && e.target.classList.contains('cover-img')) e.target.style.display = 'none'; if (e.target.classList && e.target.classList.contains('fr-img')) { e.target.style.display = 'none'; if (e.target.parentNode) e.target.parentNode.classList.add('fr-fallback'); } }, true);
document.addEventListener('click', e => { if (MENUC !== null && !e.target.closest('.c-more-wrap')) { MENUC = null; KEEP = true; if (PCS) paintPcList(); if (!e.target.closest('[data-act]')) render(); } }, true);
let WLX = null;                                        // deslizar a los lados en la presentación de bienvenida
document.addEventListener('touchstart', e => { WLX = e.target.closest('.wl') && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
document.addEventListener('touchend', e => { if (WLX == null || !e.changedTouches[0]) return; const dx = e.changedTouches[0].clientX - WLX; WLX = null;
  if (Math.abs(dx) < 50 || !$('.wl-slide')) return; WLI = Math.max(0, Math.min(WL_SLIDES.length - 1, WLI + (dx < 0 ? 1 : -1))); KEEP = true; render(); }, { passive: true });
document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form, v = id => ($(id) ? $(id).value : '');
  if (isGuest() && ['comment', 'reply', 'pcreply', 'myprofile', 'dm'].includes(kind)) return guestGate(kind === 'dm' ? 'enviar mensajes' : 'comentar');
  if (kind === 'dm') { const to = form.dataset.to, inp = $('#dm-text'), er = $('#dm-err'), tx0 = ((inp || {}).value || '').trim(); if (!tx0) return;
    const m0 = dmMode(S.user, to), r = dmSend(to, { text: tx0.slice(0, m0 === 'new' ? REQ_MAX : 500) }); if (er) er.textContent = r; if (r) return; inp.value = ''; if (m0 === 'new') { toast(t('Solicitud enviada')); KEEP = true; render(); return; } paintDm(to, true); return; }
  if (kind === 'myprofile') {
    const name = $('#pf-name').value.trim(); if (!name) return toast('El usuario no puede estar vacío.');
    if (nameKey(name) !== nameKey((getUsers()[S.user] || {}).name) && await nameTaken(name, S.user)) return toast(t('Ese nombre de usuario ya está en uso.'));
    const u = getUsers(); u[S.user].name = name; u[S.user].bio = $('#pf-bio').value.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 500); G.set('users', u); EPD = null; toast('Perfil guardado'); NAVDIR = 'prev'; return go('/profile');
  }
  if (kind === 'pcreply') {
    if (!PCS) return; const t = (($('#pc-reply-text') || {}).value || '').trim().slice(0, PC_MAX), top = form.dataset.top, s0 = findStory(PCS.sid), all = pcAll(), k = pcKey(PCS.sid, PCS.ci, PCS.pi), parent = (all[k] || []).find(c => String(c.id) === top);
    if (!t || !s0 || !parent) return;
    all[k].push({ id: Date.now() + Math.random().toString(36).slice(2, 5), by: S.user, text: t, date: today(), spoiler: false, q: PCS.q, parent: parent.id }); G.set('pcom', all);
    notify(parent.by, 'reply', s0.id, t.slice(0, 80), `${(+PCS.ci | 0) + 1}:`); PCREPLY = null; PCREPPRE = ''; PCREPOPEN.add(parent.id); paintPcList(); return;
  }
  if (kind === 'reply') {
    const t = (($('#c-reply-text') || {}).value || '').trim(), sid = form.dataset.id, top = +form.dataset.cid, s0 = findStory(sid), parent = comments(sid).find(c => c.id === top); if (!t || !s0 || !parent) return;
    const rid = Date.now(), tg = `${(parent.ch | 0) + 1}:${rid}`;
    updateComments(sid, l => [...l, { id: rid, by: S.user, text: t.slice(0, 300), date: today(), parent: top, ...((parent.ch | 0) > 0 ? { ch: parent.ch | 0 } : {}) }]);
    notify(parent.by, 'reply', sid, t.slice(0, 80), tg); if (s0.owner && s0.owner !== parent.by) notify(s0.owner, 'comment', sid, t.slice(0, 80), tg);
    REPLYTO = null; REPLYPRE = ''; REPOPEN.add(top); KEEP = true; return render();
  }
  if (kind === 'comment') { const t = $('#c-text').value.trim(); if (!t) return; addComment(findStory(form.dataset.id), t, +form.dataset.ch || 0); KEEP = true; return render(); }
  if (kind === 'cr-poll') {
    if (!canNews()) return; const L = crAll(); if (L.length >= 6) return toast(t('Máximo 6 tarjetas manuales: elimina alguna.'));
    const q = v('#cp-q').trim(), opts = [...document.querySelectorAll('.cp-o')].map(x => x.value.trim()).filter(Boolean).slice(0, 6), ends = v('#cp-end');
    if (!q) return toast(t('Escribe la pregunta.')); if (opts.length < 2) return toast(t('Escribe al menos 2 opciones.')); if (new Set(opts.map(x => x.toLowerCase())).size < opts.length) return toast(t('Las opciones no pueden repetirse.'));
    if (ends && ends < today()) return toast(t('La fecha de cierre ya pasó.'));
    G.set('banners', [...L, { id: Date.now(), kind: 'poll', by: S.user, date: today(), title: q.slice(0, 120), text: '', btn: '', options: opts, ends: ends || '', ...postMeta($('#cp-anon') && $('#cp-anon').checked, 'cr-comm') }]);
    logAction('banner-add', S.user, q.slice(0, 60) + (isMod() ? ' (en revisión)' : '')); if (isMod()) notifyApprovers('Nueva tarjeta del banner por aprobar');
    toast(isMod() ? t('Enviado a revisión: lo verá Administración u Owner') : t('Encuesta publicada en el banner')); return render();
  }
  if (kind === 'cr-book' || kind === 'cr-event') {
    if (!canNews()) return; const L = crAll(); if (L.length >= 6) return toast(t('Máximo 6 tarjetas manuales: elimina alguna.'));
    if (kind === 'cr-book') { const sid = v('#cb-story'); if (!sid || !publishedStories().some(x => x.id === sid)) return toast(t('Elige un libro publicado.'));
      G.set('banners', [...L, { id: Date.now(), kind: 'book', storyId: sid, by: S.user, date: today(), title: v('#cb-title').trim().slice(0, 70), text: v('#cb-text').trim().slice(0, 160), btn: v('#cb-btn').trim().slice(0, 24), ...postMeta($('#cb-anon') && $('#cb-anon').checked, 'cr-comm') }]); }
    else { const anonE = !!($('#ce-anon') && $('#ce-anon').checked), tt = v('#ce-title').trim(), m = v('#ce-text').trim(); if (!tt || !m) return toast(t('Escribe título y descripción.'));
      let nid = v('#ce-news');
      if (!nid) {                                      // el evento crea su publicación completa (firmada por la Owner) en Noticias
        const post = v('#ce-post').trim() || m; nid = String(Date.now() + 1);
        if (!G.set('news', [{ id: +nid, type: 'Evento', title: tt.slice(0, 80), text: post, blocks: [{ t: post, img: CEIMG }], by: S.user, date: today(), ...postMeta(anonE, 'cr-comm') }, ...news()])) return; }
      G.set('banners', [...L, { id: Date.now(), kind: 'event', by: S.user, date: today(), title: tt.slice(0, 70), text: m.slice(0, 160), btn: v('#ce-btn').trim().slice(0, 24), newsId: nid, ...postMeta(anonE, 'cr-comm') }]); CEIMG = ''; }
    logAction('banner-add', S.user, (kind === 'cr-event' ? v('#ce-title') : '').slice(0, 60) + (isMod() ? ' (en revisión)' : '')); if (isMod()) notifyApprovers('Nueva tarjeta del banner por aprobar');
    toast(isMod() ? t('Enviado a revisión: lo verá Administración u Owner') : t('Tarjeta añadida al banner')); return render();
  }
  if (kind === 'news') {
    if (!canNews()) return; nbCollect(); const ttl0 = NBM.title.trim(), blocks = NB.map(b => ({ t: b.t.trim(), img: b.img })).filter(b => b.t || b.img);
    if (!ttl0 || !blocks.length) return toast(t('Escribe un título y al menos un párrafo o una imagen.'));
    if (NBEDIT) { const L = news(), i = L.findIndex(x => String(x.id) === NBEDIT); if (i < 0 || !canEditPost(L[i])) { nbReset(); toast(t('Esa noticia ya no existe.')); return render(); }
      L[i] = { ...L[i], type: NBM.type, title: ttl0, text: blocks.map(b => b.t).filter(Boolean).join('\n\n'), blocks, edited: today(), ...(isMod() ? { status: 'pending', reason: '' } : {}) }; if (!G.set('news', L)) return;
      logAction('news-edit', S.user, ttl0.slice(0, 60)); if (isMod()) notifyApprovers('Un anuncio se volvió a enviar para aprobación');
      nbReset(); toast(isMod() ? t('Reenviado a revisión ✓') : t('Cambios guardados ✓')); return render(); }
    if (!G.set('news', [{ id: Date.now(), type: NBM.type, title: ttl0, text: blocks.map(b => b.t).filter(Boolean).join('\n\n'), blocks, by: S.user, date: today(), ...postMeta($('#n-anon') && $('#n-anon').checked, 'n-comm') }, ...news()])) return;
    logAction('news-post', S.user, ttl0.slice(0, 80) + (isMod() ? ' (en revisión)' : '')); if (isMod()) notifyApprovers('Nuevo anuncio por aprobar: {t}', { t: ttl0.slice(0, 50) });
    if (NBID) G.set('newsdrafts', ndAll().filter(x => x.id !== NBID));
    nbReset(); toast(isMod() ? t('Enviado a revisión: lo verá Administración u Owner') : t('Anuncio publicado')); return render();
  }
  const data = { name: v('#a-name'), email: v('#a-email'), pass: v('#a-pass'), pass2: v('#a-pass2') };
  const sb = form.querySelector('button[type=submit]'); if (sb) { sb.classList.add('loading'); sb.dataset.t = sb.textContent; sb.innerHTML = LOADER('sm'); }
  const err = kind === 'register' ? await register(data) : await login(data);
  if (sb && sb.isConnected) { sb.classList.remove('loading'); sb.textContent = sb.dataset.t; }
  if (err) $('#auth-error').textContent = err;
});

document.addEventListener('toggle', e => { const b = e.target.dataset && e.target.dataset.book; if (b) e.target.open ? OPEN.add(b) : OPEN.delete(b); }, true);

/* Arrastrar el carrusel de la saga: las portadas siguen al dedo (o al ratón) y al soltar se acomodan en la parte más cercana */
let SW = null, NOCLICK = false;
document.addEventListener('pointerdown', e => {
  const z = e.target.closest && e.target.closest('[data-saga]');
  if (z && !z.dataset.busy) SW = { z, x: e.clientX, y: e.clientY, p0: +z.dataset.pos, i0: +z.dataset.i, n: z.dataset.ids.split(',').length, on: false, dx: 0, t: Date.now() };
});
document.addEventListener('pointermove', e => {
  if (!SW) return; const dx = e.clientX - SW.x, dy = e.clientY - SW.y;
  if (!SW.on && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) SW.on = true;
  if (SW.on) { SW.dx = dx; sagaLayout(SW.z, sagaRubber(SW.p0 - dx / SAGA_D, SW.n), false); }   // 1:1 con el dedo
});
function endSwipe() {
  if (!SW) return; const { z, dx, on, p0, i0, n, t } = SW; SW = null;
  if (!on) return;
  NOCLICK = true; setTimeout(() => { NOCLICK = false; }, 150);                                  // soltar no cuenta como toque
  const v = dx / Math.max(1, Date.now() - t);
  let k = Math.abs(v) > 0.45 ? i0 + (dx < 0 ? 1 : -1) : Math.round(sagaRubber(p0 - dx / SAGA_D, n));   // un empujón rápido también cambia de parte
  k = Math.max(0, Math.min(n - 1, k));
  if (k === i0) sagaLayout(z, i0, true); else sagaGoto(z, k);
}
document.addEventListener('pointerup', endSwipe); document.addEventListener('pointercancel', endSwipe);
document.addEventListener('click', e => { if (NOCLICK) { e.preventDefault(); e.stopPropagation(); } }, true);

let POSQ;
window.addEventListener('scroll', () => {                         // barra de avance y guardado automático del progreso al leer
  const m = (location.hash || '').match(/^#\/story\/([^/]+)\/(\d+)/); if (!m || !S.user) return;
  const bar = $('#rf-bar-i'); if (bar && bar.style) bar.style.width = (scrollPct() * 100) + '%'; rfLeft();
  clearTimeout(POSQ); POSQ = setTimeout(() => { const n = (location.hash || '').match(/^#\/story\/([^/]+)\/(\d+)/); if (n && n[1] === m[1] && n[2] === m[2]) saveReadPos(decodeURIComponent(m[1]), +m[2] - 1); }, 500);
}, { passive: true });

/* ARRANQUE */
applyTheme(); applyReading();
if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (S.theme === 'auto') applyTheme(); }); }
if (S.user) loadUser();
render();
sbBoot().then(sbRefresh);
seedTest();
setInterval(() => document.querySelectorAll('.rel-t[data-ts]').forEach(t => { const r = relTime(t.dataset.ts); if (r && t.textContent !== r) t.textContent = r; }), 30000);
(function splash() {                                   // pantalla de bienvenida corta con las orejitas de Auri
  if (reduceMotion() || !document.body || !document.createElement) return;
  const d = document.createElement('div'); d.className = 'splash'; d.innerHTML = LOADER() + '<b>Auri Studios</b>'; document.body.appendChild(d);
  setTimeout(() => { d.classList.add('bye'); setTimeout(() => d.remove(), 320); }, 650);
})();
shapeDefs();
document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('.fmt-bar')) e.preventDefault(); });   // no pierde el foco ni la selección del texto
