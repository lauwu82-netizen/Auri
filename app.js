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
const tagChips = (tg, cls = '') => (tg || []).map(t => `<button type="button" class="tag tag-link ${cls}" data-act="tag-search" data-id="${esc(t)}" aria-label="Buscar la etiqueta ${esc(t)}">#${esc(t)}</button>`).join('');
const popTags = (n = 10) => { const c = {}; publishedStories().filter(matureOK).forEach(s => s.tags.forEach(t => { const k = t.toLowerCase(); c[k] = c[k] || { t, n: 0 }; c[k].n++; })); return Object.values(c).sort((a, b) => b.n - a.n).slice(0, n).map(x => x.t); };
const GENRES = { Fantasy: 'Fantasía', Romance: 'Romance', 'Slice of life': 'Costumbrista', 'Sci-fi': 'Ciencia ficción', Mystery: 'Misterio', Other: 'Otro' };
const genreName = g => GENRES[g] || g;
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

/* 2. ALMACENAMIENTO ----------------------------------------------- */
const LS = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('No se pudo guardar: almacenamiento lleno'); return false; } }
};
const S = { user: LS.get('auri.session', null), theme: LS.get('auri.theme', 'light'), stories: [], favs: [], progress: {}, character: {} };
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
}
/* --- Ajustes (se guardan por cuenta) --- */
const APP_VERSION = '0.9 (beta)';
const CFG_DEFAULTS = { fontSize: 'md', font: 'serif', lh: 'normal', music: 'ask', musicLast: '', skipReadAs: false, pcom: 'tap', spoilers: 'hide', showMature: null, lang: 'es', notif: { chapter: true, like: true, comment: true, follow: true } };
const cfg = k => {
  const c = S.cfg || {};
  if (k === 'showMature') { const u = getUsers()[S.user]; if (isMinor(u)) return false; return c.showMature == null ? isAdult(u) : c.showMature; }   // por defecto: visible solo si ya declaraste ser mayor de edad
  if (k === 'notif') return { ...CFG_DEFAULTS.notif, ...(c.notif || {}) };
  return c[k] ?? CFG_DEFAULTS[k];
};
const READ = { size: { sm: '17px', md: '19px', lg: '22px' }, lh: { compact: '1.7', normal: '1.95', relaxed: '2.25' }, font: { serif: 'var(--serif)', sans: 'var(--sans)' } };
function applyReading() {                               // tamaño, interlineado y tipografía del lector, como variables CSS
  const r = document.documentElement.style; if (!r || !r.setProperty) return;
  r.setProperty('--read-size', READ.size[cfg('fontSize')]); r.setProperty('--read-lh', READ.lh[cfg('lh')]); r.setProperty('--read-font', READ.font[cfg('font')]);
  document.documentElement.lang = cfg('lang');
}
function setCfg(k, v) { S.cfg = { ...S.cfg, [k]: v }; LS.set(uk('cfg'), S.cfg); applyReading(); }
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
  return { cover: '', tags: [], mature: false, phase: 'ongoing', prev: '', ...r, chapters };
};
function allStories() {                       // incluye historias de todas las cuentas del dispositivo
  const users = LS.get('auri.users', {}); let all = [];
  for (const email in users) all = all.concat(LS.get(`auri.u.${email}.stories`, []).map(s => ({ ...norm(s), author: users[email].name, owner: email })));
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/** Lo que ve el público: capítulos aprobados (o la última versión aprobada de uno que se está editando) */
const pubChapter = c => c.status === 'approved' ? c : c.live ? { ...c, status: 'approved', title: c.live.title, text: c.live.text, music: c.live.music, cover: c.live.cover } : null;
/** Solo es público el tramo de capítulos aprobados en orden consecutivo (1, 2, 3…) desde el primero */
const publicPrefix = chs => { const out = []; for (let idx = 0; idx < chs.length; idx++) { const p = pubChapter(chs[idx]); if (!p) break; out.push({ ...p, idx }); } return out; };
const takedown = () => G.get('takedown', []);                     // obras retiradas de Descubrir por moderación
const pubAll = () => allStories().map(s => ({ ...s, chapters: publicPrefix(s.chapters) })).filter(s => s.chapters.length);
const publishedStories = () => pubAll().filter(s => !takedown().includes(s.id));
const pendingBooks = () => allStories().filter(s => s.chapters.some(c => c.status === 'pending'));
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
const G = { get: (k, f) => LS.get('auri.' + k, f), set: (k, v) => LS.set('auri.' + k, v) };
const getUsers = () => G.get('users', {});
const uName = e => (getUsers()[e] || {}).name || 'Usuario';
/* ROLES: OWNER (solo este correo, para siempre) · MODERATOR (por invitación de la Owner) · USER (todas las demás cuentas).
   OJO: sin servidor esto es solo una barrera de interfaz; la seguridad real se aplica en el backend con correo verificado. */
const OWNER_EMAIL = 'danielagarcia23082004@gmail.com';
const FRAME_OWNER = 'data:image/webp;base64,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';   // marco del gatito (incrustado, no depende de internet)
const FRAME_ADM = 'https://i.postimg.cc/nhG70zZW/Photoroom-20261011-123528.png';   // marco de Administración (enlace tal cual)
const FRAME_MOD = 'data:image/webp;base64,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';   // marco sencillo de moderación (incrustado)
const roleOf = e => { e = String(e || '').toLowerCase(); if (e === OWNER_EMAIL) return 'OWNER'; const r = (getUsers()[e] || {}).role; return r === 'ADMIN' ? 'ADMIN' : r === 'MODERATOR' ? 'MODERATOR' : 'USER'; };
const isOwner = () => !!S.user && roleOf(S.user) === 'OWNER';
const isMod = () => !!S.user && roleOf(S.user) === 'MODERATOR';
const isAdm = () => !!S.user && roleOf(S.user) === 'ADMIN';                // Administración (se llega solo desde Moderación, por invitación de la Owner)
const isStaff = () => !!S.user && roleOf(S.user) !== 'USER';              // Owner, Administración o Moderación: revisan capítulos
const canNews = () => isOwner() || isAdm();                                // publicar anuncios
const isAdmin = isOwner;                                   // panel general (revisar capítulos, noticias, borrar comentarios): solo la Owner
function fixRoles() {                                      // normaliza: cada cuenta guarda su rol; nadie más puede quedar como OWNER
  const us = getUsers(); let ch = false;
  for (const e in us) { const want = e === OWNER_EMAIL ? 'OWNER' : us[e].role === 'ADMIN' ? 'ADMIN' : us[e].role === 'MODERATOR' ? 'MODERATOR' : 'USER'; if (us[e].role !== want) { us[e].role = want; ch = true; } }
  if (ch) G.set('users', us);
}
const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Administración', MODERATOR: 'Moderación', USER: '' };
/** ¿La persona en sesión puede aplicar acciones de administración sobre esta cuenta? Owner: a todas menos a sí misma. Moderación: solo a USER. */
function canAct(t) {
  t = String(t || '').toLowerCase(); if (!S.user || t === S.user || !getUsers()[t]) return false;
  const me = roleOf(S.user), tr = roleOf(t);
  return me === 'OWNER' ? tr !== 'OWNER' : me === 'ADMIN' ? (tr === 'USER' || tr === 'MODERATOR') : me === 'MODERATOR' ? tr === 'USER' : false;   // strikes y suspensiones
}
const strikesOf = e => (getUsers()[e] || {}).strikes || [];
const activeBan = e => { const b = (getUsers()[e] || {}).ban; if (!b) return null; if (b.until && Date.parse(b.until) <= Date.now()) return null; return b; };
function logAction(type, target, extra) { const l = G.get('modlog', []); l.unshift({ id: Date.now() + Math.random().toString(36).slice(2, 5), type, by: S.user, target, extra: extra || '', date: new Date().toISOString() }); G.set('modlog', l.slice(0, 300)); }
function pushNotif(to, o) { const k = 'notifs.' + to, l = G.get(k, []); l.unshift({ id: Date.now() + Math.random().toString(36).slice(2, 6), from: '', storyId: '', extra: '', chap: '', date: new Date().toISOString(), read: false, ...o }); G.set(k, l.slice(0, 100)); }
/* Acciones con verificación de permisos (devuelven un texto de error o '' si todo salió bien) */
function giveStrike(t, reason) {
  reason = String(reason || '').trim(); if (!canAct(t)) return 'No tienes permiso para esta acción.'; if (reason.length < 3) return 'Escribe el motivo del strike.';
  const us = getUsers(), id = 's' + Date.now().toString(36), arr = [...(us[t].strikes || []), { id, reason: reason.slice(0, 500), by: S.user, date: new Date().toISOString() }];
  us[t].strikes = arr; G.set('users', us); pushNotif(t, { type: 'strike', extra: id }); logAction('strike', t, reason.slice(0, 120)); return '';
}
function applyBan(t, days, reason) {
  reason = String(reason || '').trim(); if (!canAct(t)) return 'No tienes permiso para esta acción.'; if (reason.length < 3) return 'Escribe el motivo de la suspensión.';
  const us = getUsers(), d = +days; us[t].ban = { reason: reason.slice(0, 500), by: S.user, date: new Date().toISOString(), until: d > 0 ? new Date(Date.now() + d * 864e5).toISOString() : null };
  G.set('users', us); logAction('ban', t, (d > 0 ? d + ' día(s): ' : 'permanente: ') + reason.slice(0, 100)); return '';
}
function liftBan(t) { if (!canAct(t)) return 'No tienes permiso para esta acción.'; const us = getUsers(); delete us[t].ban; G.set('users', us); logAction('unban', t); return ''; }
/* --- Cuenta de prueba «RiRi» (simula a otra persona). Para quitarla: Ajustes › Cuenta › Eliminar cuenta, o borra este bloque --- */
const TEST_EMAIL = 'lauwu82@gmail.com', TEST_PASS = 'RiRi12345';
async function seedTest() {
  try { if (localStorage.getItem('auri.testseeded')) return; const us = getUsers(); if (us[TEST_EMAIL]) { localStorage.setItem('auri.testseeded', '1'); return; }
    const salt = 'riri', hash = await sha(salt + TEST_PASS);
    us[TEST_EMAIL] = { name: 'RiRi', salt, hash, birth: '2000-01-01', gender: 'Mujer', interests: [], onboarded: true, termsAccepted: today(), created: today(), role: 'USER', strikes: [], test: true };
    G.set('users', us); localStorage.setItem('auri.testseeded', '1'); } catch (e) {}
}
function testRole(t, role) {                           // solo Owner y solo sobre la cuenta de prueba: cambia el rol al instante (sin invitación) y pone el marco
  if (!isOwner() || !(getUsers()[t] || {}).test) return; const us = getUsers();
  us[t].role = role; us[t].frameWorn = role !== 'USER'; G.set('users', us); logAction('test-role-' + role.toLowerCase(), t);
}
function inviteRole(t, role) {                          // solo la Owner asciende: USER → Moderación, Moderación → Administración
  if (!isOwner()) return 'Solo la Owner puede hacer ascensos.'; if (!canAct(t)) return 'No tienes permiso para esta acción.';
  const u = getUsers()[t], cur = roleOf(t);
  if (role === 'MODERATOR' && cur !== 'USER') return 'Esta persona ya es parte del equipo.';
  if (role === 'ADMIN' && cur !== 'MODERATOR') return 'Solo una persona moderadora puede ascender a administración.';
  if (!isAdult(u)) return 'Solo personas mayores de 18 años pueden ser parte del equipo.';
  if (G.get('notifs.' + t, []).some(n => n.type === 'modinvite' && !n.done)) return 'Ya tiene una invitación pendiente.';
  pushNotif(t, { type: 'modinvite', role, from: S.user }); logAction('invite-' + role.toLowerCase(), t); return '';
}
const inviteMod = t => inviteRole(t, 'MODERATOR');
const myInvite = nid => G.get('notifs.' + S.user, []).find(n => n.id === nid && n.type === 'modinvite' && !n.done);
function answerInvite(nid, res) { const k = 'notifs.' + S.user; G.set(k, G.get(k, []).map(n => n.id === nid ? { ...n, done: res } : n)); }
function acceptInvite(nid) {
  const n = myInvite(nid), u = getUsers()[S.user]; if (!n) return 'Esta invitación ya no está disponible.';
  const want = n.role === 'ADMIN' ? 'ADMIN' : 'MODERATOR', cur = roleOf(S.user);
  if ((want === 'MODERATOR' && cur !== 'USER') || (want === 'ADMIN' && cur !== 'MODERATOR')) return 'Tu cuenta no puede aceptar esta invitación.';
  if (!isAdult(u)) return 'Solo personas mayores de 18 años pueden ser parte del equipo.';
  const us = getUsers(); us[S.user].role = want; us[S.user][want === 'ADMIN' ? 'admSince' : 'modSince'] = new Date().toISOString(); us[S.user].frameWorn = false; G.set('users', us);   // el marco nuevo es obligatorio
  answerInvite(nid, 'accepted'); pushNotif(OWNER_EMAIL, { type: 'sys', extra: `${u.name} aceptó tu invitación y ya es parte de ${want === 'ADMIN' ? 'la administración' : 'la moderación'}.` }); logAction('accept-' + want.toLowerCase(), S.user); return '';
}
function declineInvite(nid) { const n = myInvite(nid); if (!n) return; answerInvite(nid, 'declined'); pushNotif(OWNER_EMAIL, { type: 'sys', extra: `${uName(S.user)} rechazó la invitación a ${n.role === 'ADMIN' ? 'la administración' : 'la moderación'}.` }); }
function revokeMod(t) {                                // "descender": Owner (Administración → Moderación, Moderación → USER) · Administración (Moderación → USER)
  const tr = roleOf(t); if (!S.user || t === S.user) return 'No tienes permiso para esta acción.';
  if (!(isOwner() ? (tr === 'MODERATOR' || tr === 'ADMIN') : isAdm() ? tr === 'MODERATOR' : false)) return 'No tienes permiso para esta acción.';
  const us = getUsers();
  if (tr === 'ADMIN') { us[t].role = 'MODERATOR'; us[t].frameWorn = true; delete us[t].admSince; } else { us[t].role = 'USER'; delete us[t].frameWorn; delete us[t].modSince; }
  G.set('users', us); pushNotif(t, { type: 'sys', extra: tr === 'ADMIN' ? 'Tu rol de administración ha finalizado: sigues en el equipo de moderación.' : 'Tu participación en el equipo de moderación de Auri Studios ha finalizado.' });
  logAction(tr === 'ADMIN' ? 'demote-admin' : 'revoke', t); return '';
}
/* Marcos de perfil: el de Owner solo existe para la Owner; el de moderación es obligatorio y no se puede quitar */
const frameKey = e => { const r = roleOf(e), u = getUsers()[e] || {}; return r === 'OWNER' ? (u.frameOn === false ? '' : 'own') : r === 'ADMIN' && u.frameWorn ? 'adm' : r === 'MODERATOR' && u.frameWorn ? 'mod' : ''; };
const frameOf = e => ({ own: FRAME_OWNER, mod: FRAME_MOD, adm: FRAME_ADM }[frameKey(e)] || '');
/** Avatar con marco: el marco (1078×976) se coloca sobre el hueco medido de cada imagen */
const frWrap = (e, cls, av) => { const k = frameKey(e); return `<span class="fr ${cls} ${k || 'none'}">${av}${k ? frameImg(frameOf(e)) : ''}</span>`; };   // sin marco ocupa el mismo espacio (el perfil no "salta")
const frameImg = (src, extra = '') => `<img class="fr-img ${extra}" src="${esc(src)}" alt="" referrerpolicy="no-referrer" decoding="async">`;
const framedAvatar = (e, cls = '') => frWrap(e, cls, userAvatar(e, cls));
const avatarHTML = (src, name, cls = '') => `<span class="avatar ${cls}">${src ? `<img src="${esc(src)}" alt="">` : esc([...(name || '?')][0].toUpperCase())}</span>`;
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
  if (sec < 60) return 'Hace un momento'; const m = Math.floor(sec / 60); if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `Hace ${h} h`; const d = Math.floor(h / 24); if (d < 30) return `Hace ${d} ${d === 1 ? 'día' : 'días'}`;
  const mo = Math.floor(d / 30); if (mo < 12) return `Hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`; const y = Math.floor(d / 365); return `Hace ${y} ${y === 1 ? 'año' : 'años'}`;
}
const relSpan = c => `<time class="rel-t" data-ts="${esc(String(c.id))}" title="${esc(c.date || '')}">${esc(relTime(c.id) || c.date || '')}</time>`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}` : ''; };
const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const likes = id => G.get('likes', {})[id] || [];
const comments = id => G.get('comments', {})[id] || [];
const news = () => G.get('news', []);
/** Una noticia son bloques: cada párrafo puede llevar su propia imagen (cualquier proporción). Las noticias antiguas (solo texto) se convierten al vuelo */
const newsBlocks = n => Array.isArray(n.blocks) && n.blocks.length ? n.blocks : String(n.text || '').split(/\n\s*\n/).filter(Boolean).map(t => ({ t, img: '' }));
const newsCover = n => { const b = n && newsBlocks(n).find(x => /^data:image\//.test(x.img || '')); return b ? b.img : ''; };
const unread = () => G.get('notifs.' + S.user, []).filter(n => !n.read).length;
function notify(to, type, storyId, extra = '', chap = '', from = S.user) {
  if (!to || (to === S.user && type !== 'chapter')) return;
  if (noPing(to, from)) return;                                  // bloqueada o silenciada: no llegan avisos
  if (['chapter', 'like', 'comment', 'follow'].includes(type) && ((LS.get('auri.u.' + to + '.cfg', {}).notif || {})[type] === false)) return;   // la persona apagó este tipo de aviso (los de moderación no se pueden apagar)
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
function addComment(s, text) {
  const all = G.get('comments', {}); (all[s.id] = all[s.id] || []).push({ id: Date.now(), by: S.user, text, date: today() });
  G.set('comments', all); notify(s.owner, 'comment', s.id, text.slice(0, 80));
}
/** Recorta la foto al centro en cuadrado y la reduce (ahorra localStorage) */
/** Recorta al centro con "cover" (llena w×h sin deformar) y reduce; guarda como JPEG para ahorrar espacio */
/** Recorta al centro con "cover" (llena w×h sin deformar); q = calidad JPEG */
function cropPhoto(file, w, h, cb, q = .85) {
  if (!file || !file.type.startsWith('image/')) return toast('Elige un archivo de imagen.');
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.max(w / img.width, h / img.height), sw = w / k, sh = h / k, c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
      cb(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => toast('No se pudo leer esa imagen.'); img.src = r.result;
  };
  r.readAsDataURL(file);
}
/** Reduce la imagen COMPLETA (sin recortar nada) para que quepa en maxW×maxH; conserva sus proporciones */
/** Imagen de noticias: se conserva COMPLETA y con su proporción (vertical, horizontal o larga); solo se reduce su ancho si es enorme */
function newsPhoto(file, cb) {
  if (!file || !file.type.startsWith('image/')) return toast('Elige un archivo de imagen.');
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / img.width, 5000 / img.height), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', .8));
    };
    img.onerror = () => toast('No se pudo leer esa imagen.'); img.src = r.result;
  };
  r.readAsDataURL(file);
}
function fitPhoto(file, maxW, maxH, cb, q = .85) {
  if (!file || !file.type.startsWith('image/')) return toast('Elige un archivo de imagen.');
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width, maxH / img.height), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => toast('No se pudo leer esa imagen.'); img.src = r.result;
  };
  r.readAsDataURL(file);
}
const squarePhoto = (file, size, cb) => cropPhoto(file, size, size, cb);

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
let PENDING = null, QZ = null;                         // registro en curso: la cuenta SOLO se crea al terminar el cuestionario
async function register({ name, email, pass, pass2 }) {      // paso 0: correo y contraseña
  email = email.trim().toLowerCase(); name = name.trim();
  const users = LS.get('auri.users', {});
  if (!name) return 'Escribe tu nombre de usuario.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Ingresa un correo válido.';
  if (pass.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (pass !== pass2) return 'Las contraseñas no coinciden.';
  if (users[email]) return 'Ese correo ya tiene una cuenta.';
  const salt = Math.random().toString(36).slice(2);
  PENDING = { name, email, salt, hash: await sha(salt + pass) }; QZ = { step: 1, birth: '', gender: '', interests: [], mature: false, blocked: false, terms: false };
  go('/signup'); return '';
}
function createAccount() {                             // último paso: se crea la cuenta con las respuestas
  const { name, email, salt, hash } = PENDING, users = LS.get('auri.users', {});
  if (users[email]) { PENDING = null; QZ = null; go('/register'); return toast('Ese correo ya tiene una cuenta.'); }
  users[email] = { name, salt, hash, birth: QZ.birth, gender: QZ.gender, interests: QZ.interests, onboarded: true, termsAccepted: today(), created: today(), role: email === OWNER_EMAIL ? 'OWNER' : 'USER', strikes: [] };
  LS.set('auri.users', users);
  LS.set('auri.u.' + email + '.cfg', { showMature: ageOf(QZ.birth) >= 18 && QZ.mature });   // la opción +18 del cuestionario enciende "Mostrar contenido +18"
  PENDING = null; QZ = null; startSession(email); toast('¡Listo! Tu cuenta está creada ✨');
}
async function login({ email, pass }) {
  email = email.trim().toLowerCase();
  const u = LS.get('auri.users', {})[email];
  if (!u || u.hash !== await sha(u.salt + pass)) return 'Correo o contraseña incorrectos.';
  startSession(email); return '';
}
function startSession(email) { S.user = email; LS.set('auri.session', email); loadUser(); go('/'); }
function logout() { S.user = null; localStorage.removeItem('auri.session'); go('/login'); }
const userName = () => (LS.get('auri.users', {})[S.user] || {}).name || '';

const interestChips = (sel, act) => `<div class="qz-chips">${INTERESTS.map(([n, e]) => `<button type="button" class="qz-chip ${sel.includes(n) ? 'on' : ''}" data-act="${act}" data-v="${esc(n)}" aria-pressed="${sel.includes(n)}">${e} ${esc(n)}</button>`).join('')}</div>`;
function signupView() {
  const q = QZ, adult = validBirth(q.birth) && ageOf(q.birth) >= 18;
  const top = `<div class="qz-top"><button class="icon-btn" data-act="qz-back" aria-label="Atrás">‹</button><div class="qz-dots" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${q.step}" aria-label="Paso ${q.step} de 3">${[1, 2, 3].map(i => `<i class="qz-dot ${i < q.step ? 'done' : i === q.step ? 'on' : ''}"></i>`).join('')}</div><span style="width:40px"></span></div>`;
  if (q.blocked) return `<main class="qz-wrap"><div class="qz-card" style="justify-content:center;text-align:center"><div class="end-emoji">🌙</div><h1>Todavía no puedes unirte</h1><p class="helper">Auri es para personas de ${MIN_AGE} años o más, así que no podemos crear tu cuenta. ¡Gracias por entender!</p><div class="qz-foot"><button class="button" data-act="qz-exit">Volver al inicio</button></div></div></main>`;
  let body;
  if (q.step === 1) body = `<span class="eyebrow">Paso 1 de 3</span><h1>¿Cuándo es tu cumpleaños? 🎂</h1><p class="helper">Lo usamos para mostrarte contenido adecuado para tu edad. No se muestra en tu perfil.</p>
    <input id="qz-birth" type="date" class="field" style="margin-top:18px" min="1900-01-01" max="${today()}" value="${esc(q.birth)}" aria-label="Fecha de nacimiento"><p class="error" id="qz-err"></p>
    <div class="qz-foot"><button class="button" style="width:100%" data-act="qz-next">Siguiente ›</button></div>`;
  else if (q.step === 2) body = `<span class="eyebrow">Paso 2 de 3</span><h1>¿Cuál es tu género?</h1><p class="helper">Elige la opción con la que te identifiques.</p>
    <div class="qz-opts" role="radiogroup">${GENDERS.map(g => `<button type="button" class="qz-opt ${q.gender === g ? 'on' : ''}" role="radio" aria-checked="${q.gender === g}" data-act="qz-gender" data-v="${g}">${g}</button>`).join('')}</div>
    <div class="qz-foot"><button class="button" style="width:100%" data-act="qz-next" ${q.gender ? '' : 'disabled'}>Siguiente ›</button></div>`;
  else body = `<span class="eyebrow">Paso 3 de 3</span><h1>¿Qué te gusta leer?</h1><p class="helper">Elige todos los temas que quieras. Necesitamos al menos uno.</p>
    ${interestChips(q.interests, 'qz-int')}
    ${adult ? `<p class="helper" style="margin-top:6px">Solo para mayores de edad</p><div class="qz-chips"><button type="button" class="qz-chip mature ${q.mature ? 'on' : ''}" data-act="qz-18" aria-pressed="${q.mature}">🔞 Contenido +18</button></div>` : ''}
    <label class="check qz-terms"><input type="checkbox" data-act="qz-terms" ${q.terms ? 'checked' : ''}><span>Acepto los <button type="button" class="link-btn" data-act="terms">términos y condiciones</button> y la <button type="button" class="link-btn" data-act="privacy">política de privacidad</button> de Auri.</span></label>
    <div class="qz-foot"><p class="qz-count">${q.interests.length ? `${q.interests.length} elegido${q.interests.length === 1 ? '' : 's'}` : 'Elige al menos uno'}${q.terms ? '' : ' · falta aceptar los términos'}</p><button class="button" style="width:100%" data-act="qz-finish" ${q.interests.length && q.terms ? '' : 'disabled'}>Crear mi cuenta ✨</button></div>`;
  return `<main class="qz-wrap">${top}<div class="qz-card">${body}</div></main>`;
}

/* 4. MASCOTA ------------------------------------------------------ */
const mascot = (cls = '') => `<svg class="${cls}" viewBox="0 0 240 230" role="img" aria-label="Auri, la gata alienígena">
<path d="M54 91 36 28q-2-9 7-4l42 32M186 91l18-63q2-9-7-4l-42 32" fill="url(#auri-fur)" stroke="#8062a8" stroke-width="4" stroke-linejoin="round"/>
<path d="M46 116c0-45 33-73 74-73s74 28 74 73v38c0 36-30 58-74 58s-74-22-74-58z" fill="url(#auri-fur)" stroke="#8062a8" stroke-width="4"/>
<path d="M73 47 58 39l8 27M167 47l15-8-8 27" fill="#efb8d7"/>
<path d="M72 135c0-22 19-40 48-40s48 18 48 40v20c0 19-19 32-48 32s-48-13-48-32z" fill="url(#auri-belly)"/>
<ellipse cx="91" cy="111" rx="7" ry="10" fill="#49365b"/><ellipse cx="149" cy="111" rx="7" ry="10" fill="#49365b"/>
<circle cx="93" cy="108" r="2.5" fill="#fff"/><circle cx="151" cy="108" r="2.5" fill="#fff"/>
<path d="M115 124q5-5 10 0-5 7-10 0" fill="#bf729f"/><path d="M120 130q-5 9-12 4M120 130q5 9 12 4" fill="none" stroke="#604770" stroke-width="2.5" stroke-linecap="round"/>
<path d="M77 124H48m31 8H45m118-8h29m-29 8h32" stroke="#8062a8" stroke-width="2" stroke-linecap="round"/>
<path d="M104 38c0-9 7-15 16-15s16 6 16 15" fill="none" stroke="#8062a8" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="19" r="8" fill="#f1bfdc" stroke="#8062a8" stroke-width="3"/>
<path d="M47 180q-29 12-20 32 10 17 32 1" fill="none" stroke="#8062a8" stroke-width="9" stroke-linecap="round"/>
<path d="M88 207v9m64-9v9" stroke="#8062a8" stroke-width="9" stroke-linecap="round"/></svg>`;

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
  user: IC('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')
};
function shell(path, html) {
  const pop = NOTIF_OPEN ? notifPop() : '', n = unread();      // (primero la ventanita: al abrirla marca como leídas y el contador baja)
  const item = (href, label, ic, on) => `<a class="bn-item ${on ? 'active' : ''}" href="${href}" ${on ? 'aria-current="page"' : ''}><span class="bn-ic">${ic}</span><span>${label}</span></a>`;
  return `<div class="shell"><header class="topbar tb2">
    <div class="top-row">
      <button class="icon-btn" data-act="settings" aria-label="Configuración">${ICON.gear}</button>
      <div class="nav-actions"><button class="icon-btn" data-act="search-toggle" aria-label="Buscar" aria-expanded="${SEARCH_OPEN}">${ICON.search}</button>
        <button class="icon-btn bell" data-act="notif-toggle" aria-label="Notificaciones" aria-expanded="${NOTIF_OPEN}">${ICON.bell}${n ? `<b class="badge">${n}</b>` : ''}</button>
        <a href="#/profile" aria-label="Mi perfil">${userAvatar(S.user)}</a></div>
    </div>
    <div class="search-bar ${SEARCH_OPEN ? 'open' : ''}"><input id="sq" class="field" type="search" placeholder="Buscar títulos, etiquetas o fandoms…" aria-label="Buscar" value="${esc(Q)}"><button class="icon-btn" data-act="search-close" aria-label="Cerrar búsqueda">✕</button></div>
  </header>${html}${pop}
  <nav class="bottom-nav" aria-label="Navegación principal">${item('#/', 'Inicio', ICON.home, path === '/')}${item('#/library', 'Biblioteca', ICON.books, path === '/library')}<a class="bn-plus ${path === '/write' ? 'active' : ''}" href="#/write" aria-label="Crear historia">${ICON.plus}</a>${item('#/news', 'Noticias', ICON.news, path === '/news')}${item('#/profile', 'Mi Perfil', ICON.user, path === '/profile')}</nav></div>`;
}
const empty = (title, copy, action = '') => `<div class="empty">${mascot()}<h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;
const badgeText = s => { const st = storyState(s), p = s.chapters.filter(c => c.status === 'pending').length; return st !== 'published' ? STATUS[st] : p ? `${p} cap. en revisión` : ''; };
const coverHTML = (s, i) => `<div class="cover c${(i % 5) + 1}">${s.cover ? `<img class="cover-img" src="${esc(s.cover)}" alt="Portada de ${esc(s.title)}" loading="lazy">` : `<span class="cover-title">${esc(s.title || 'Sin título')}</span>`}</div>`;

/* --- Auth --- */
function authView(mode) {
  const reg = mode === 'register';
  return `<main class="auth-wrap"><div class="brand-big">${mascot()}</div>
  <h1>${reg ? 'Crea tu cuenta' : 'Bienvenida a Auri'}</h1>
  <p class="helper" style="text-align:center;margin-bottom:18px">${reg ? 'Guarda tus historias y tu personaje lector.' : 'Inicia sesión para seguir leyendo y escribiendo.'}</p>
  <form class="panel" data-form="${mode}" novalidate><div class="form-grid" style="grid-template-columns:1fr">
    ${reg ? `<div class="form-group"><label for="a-name">Nombre de usuario</label><input id="a-name" class="field" autocomplete="nickname" maxlength="30" value="${PENDING ? esc(PENDING.name) : ''}"></div>` : ''}
    <div class="form-group"><label for="a-email">Correo</label><input id="a-email" type="email" class="field" autocomplete="email" placeholder="tucorreo@ejemplo.com" value="${reg && PENDING ? esc(PENDING.email) : ''}"></div>
    <div class="form-group"><label for="a-pass">Contraseña</label><input id="a-pass" type="password" class="field" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="Mínimo 8 caracteres"></div>
    ${reg ? `<div class="form-group"><label for="a-pass2">Repite la contraseña</label><input id="a-pass2" type="password" class="field" autocomplete="new-password"></div>
    <p class="helper" style="margin:2px 0 0">Después te haremos 3 preguntas rápidas: tu cumpleaños, tu género y los temas que te gustan.</p>` : ''}
  </div><p class="error" id="auth-error" role="alert"></p>
  <button class="button" style="width:100%" type="submit">${reg ? 'Crear cuenta' : 'Entrar'}</button></form>
  <p class="helper" style="text-align:center;margin-top:16px">${reg ? '¿Ya tienes cuenta? <a class="link-btn" href="#/login">Inicia sesión</a>' : '¿Primera vez? <a class="link-btn" href="#/register">Crea tu cuenta</a>'}</p>
  <p class="notice" style="margin-top:14px">Tu cuenta se guarda solo en este navegador. Auri todavía no envía datos a ningún servidor.</p></main>`;
}

/* --- Descubrir --- */
let Q = '', GEN = 'All';
function storyCard(s, i) {                       // portada limpia; título + favorito y autoría + badge +18 debajo
  const fav = S.favs.includes(s.id), b = badgeText(s);
  return `<article class="mini"><a href="#/story/${esc(s.id)}" aria-label="${esc(s.title)}">${coverHTML(s, i)}</a>
  <div class="mini-row"><a class="mini-title" href="#/story/${esc(s.id)}">${esc(s.title)}</a><button class="mini-fav" data-act="fav" data-id="${esc(s.id)}" aria-label="Favorito" aria-pressed="${fav}">${fav ? '♥' : '♡'}</button></div>
  <div class="mini-meta">${s.owner ? `<a href="#/user/${encodeURIComponent(s.owner)}">${esc(s.author)}</a>` : `<span>${esc(userName())}</span>`}${s.mature ? '<span class="dot18" title="Contenido +18">+18</span>' : ''}</div>${b ? `<div class="mini-pill">${esc(b)}</div>` : ''}</article>`;
}
function discoverList() {
  const live = publishedStories().filter(matureOK).filter(s => !hidesStory(s.owner));
  const qs = Q.trim().toLowerCase(), tq = qs.includes('#') ? parseTags(qs).map(x => x.toLowerCase()) : null;      // «#romance #au» busca por etiquetas
  const f = live.filter(s => (GEN === 'All' || s.genre === GEN) && (tq ? tq.every(t => s.tags.some(x => x.toLowerCase() === t || x.toLowerCase().includes(t))) : `${s.title} ${s.synopsis} ${s.fandom} ${s.tags.join(' ')}`.toLowerCase().includes(qs)));
  if (f.length) return `<div class="story-grid">${f.map(storyCard).join('')}</div>`;
  if (!live.length) return empty('El estante de Auri está vacío', 'Aquí aparecerán las historias creadas por las personas usuarias. Puedes escribir la primera.', '<a class="button secondary" href="#/write">Crear la primera historia</a>');
  return empty('No encontramos historias', 'Prueba con otra búsqueda o género.', '<button class="button secondary" data-act="clear">Borrar filtros</button>');
}
/* --- Banner de Inicio: carrusel (noticias automáticas + tarjetas manuales de la Owner) --- */
const crAll = () => G.get('banners', []);
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
let CARI = 0, CARTIMER = null, CARHOLD = 0;            // tarjeta actual, temporizador y pausa tras tocar/deslizar
function carSlides() {                                 // primero las tarjetas manuales (recomendaciones y eventos), luego las últimas noticias
  const pub = publishedStories().filter(matureOK), out = [], dOf = (b, n) => b.date || (n && n.date) || (+b.id > 1e12 ? new Date(+b.id).toISOString().slice(0, 10) : '');
  crAll().forEach(b => {
    if (b.kind === 'book') { const st = pub.find(x => x.id === b.storyId); if (!st) return;
      out.push({ k: 'book', badge: '📚 Recomendado', title: b.title || st.title, text: b.text || st.synopsis, cover: st.cover, date: dOf(b), sub: `📖 ${st.title}${st.author ? ' · ' + st.author : ''}`, href: `#/story/${esc(st.id)}/${st.chapters[0].idx + 1}`, tn: st.useReaderCharacter ? st.id : '', btn: b.btn || 'Leer ahora' }); }
    else { const n = b.newsId ? news().find(x => String(x.id) === String(b.newsId)) : null;
      out.push({ k: 'event', badge: '🎉 Evento', date: dOf(b, n), title: b.title, text: b.text, cover: newsCover(n), wide: true, href: n ? '#/news/' + n.id : '', btn: b.btn || 'Ver más' }); }
  });
  news().slice(0, 4).forEach(n => out.push({ k: 'news', badge: '📣 ' + (n.type || 'Noticia'), date: n.date, title: n.title, text: n.text, cover: newsCover(n), wide: true, href: '#/news/' + n.id, btn: 'Leer noticia' }));
  return out.slice(0, 8);
}
function carouselHTML() {
  const sl = carSlides(); if (!sl.length) return '';
  const card = (x, i) => `<article class="cr-slide cr-${x.k}" role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${sl.length}"><div class="cr-txt"><span class="eyebrow">${esc(x.badge)}</span>${x.date ? `<span class="cr-date">Publicado el ${esc(x.date)}</span>` : ''}<h2>${esc(clip(x.title, 70))}</h2>${x.sub && x.sub.indexOf(x.title) < 0 ? `<div class="cr-book">${esc(clip(x.sub, 60))}</div>` : ''}<p>${esc(clip(x.text, 130))}</p>
    ${x.href ? `<a class="button secondary sm" href="${x.href}" data-dir="next" ${x.tn ? `data-readas="${esc(x.tn)}"` : ''}>${esc(x.btn)}</a>` : ''}</div>${safeImg(x.cover) ? `<img class="cr-cover ${x.wide ? 'wide' : ''}" src="${esc(x.cover)}" alt="">` : ''}</article>`;
  return `<section class="carousel" aria-roledescription="carrusel" aria-label="Novedades de Auri"><div class="cr-track" id="cr-track">${sl.map(card).join('')}</div>
  ${sl.length > 1 ? `<div class="cr-dots">${sl.map((_, i) => `<button type="button" class="cr-dot ${i === CARI ? 'on' : ''}" data-act="car-go" data-i="${i}" aria-label="Ir a la tarjeta ${i + 1}"></button>`).join('')}</div>` : ''}</section>`;
}
function carGo(i) { const t = $('#cr-track'); if (!t || !t.children) return; const n = t.children.length; if (!n) return; i = (i + n) % n; t.scrollTo({ left: i * t.clientWidth, behavior: reduceMotion() ? 'auto' : 'smooth' }); }
function carInit() {                                   // se llama tras cada dibujado: restaura la posición, sincroniza los puntos y cambia sola cada 5 s
  clearInterval(CARTIMER); CARTIMER = null;
  const t = $('#cr-track'); if (!t || !t.children) return; const n = t.children.length; if (!n) return;
  if (CARI >= n) CARI = 0; t.scrollLeft = CARI * t.clientWidth;
  let raf = 0;
  t.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const i = Math.round(t.scrollLeft / (t.clientWidth || 1)); if (i !== CARI) { CARI = i; document.querySelectorAll('.cr-dot').forEach((d, k) => d.classList.toggle('on', k === i)); } }); }, { passive: true });
  ['pointerdown', 'touchstart', 'wheel'].forEach(ev => t.addEventListener(ev, () => { CARHOLD = Date.now() + 8000; }, { passive: true }));   // si la persona interactúa, el carrusel espera
  if (n < 2 || reduceMotion()) return;
  CARTIMER = setInterval(() => { if (!document.body.contains(t)) { clearInterval(CARTIMER); CARTIMER = null; return; } if (document.hidden || Date.now() < CARHOLD) return; carGo(CARI + 1); }, 5000);
}
function discoverView() {
  const gens = ['All', ...new Set(publishedStories().map(s => s.genre))];
  return `<main class="page">${carouselHTML() || `<section class="hero"><span class="eyebrow">✦ Un pequeño hogar para grandes emociones</span>
  <h1>Encuentra tu próxima emoción favorita.</h1><p>Historias para leer a gusto, personajes que te acompañan y un rincón para crear algo propio.</p>
  <a class="button secondary" href="#/library">Ir a mi biblioteca</a>${mascot('mascot')}</section>`}
  <div class="section-head"><div><h2>Historias que te roban el sueño</h2><p>Libros creados por personas usuarias.</p></div></div>
  ${popTags().length ? `<div class="tag-row" aria-label="Etiquetas populares"><span class="helper">Etiquetas:</span>${popTags().map(t => `<button type="button" class="tag tag-link ${Q.trim().toLowerCase() === '#' + t.toLowerCase() ? 'on' : ''}" data-act="tag-search" data-id="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
  <div class="filter-row">${gens.map(g => `<button class="chip ${GEN === g ? 'active' : ''}" data-act="genre" data-id="${esc(g)}">${g === 'All' ? 'Todos' : esc(genreName(g))}</button>`).join('')}</div>
  <div id="list">${discoverList()}</div>
  <p class="notice" style="margin-top:24px">En esta versión las historias se guardan en este navegador y solo las ven las cuentas de este dispositivo.</p></main>`;
}

/* --- Escribir (portada, capítulos ilimitados, +18 y revisión) --- */
const STATUS = { draft: 'Borrador', pending: 'En revisión', rejected: 'Rechazada', published: 'Publicada' };
const CH_STATUS = { draft: 'Borrador', pending: 'En revisión', rejected: 'Rechazado', approved: 'Aprobado' };
const CH_MARK = { approved: ' ✓', pending: ' ⏳', rejected: ' ✕' };
/** Estado general de la obra, derivado de sus capítulos */
const storyState = s => publicPrefix(s.chapters).length ? 'published' : s.chapters.some(x => x.status === 'pending') ? 'pending' : s.chapters.some(x => x.status === 'rejected') ? 'rejected' : 'draft';
const statusNote = s => { const p = s.chapters.filter(c => c.status === 'pending').length;
  return [p ? `${p} capítulo(s) en revisión: aún no se ven en la app.` : '', ...s.chapters.filter(c => c.status === 'rejected').map(c => `«${c.title}» fue rechazado${c.reason ? ': ' + c.reason : ''}. Edítalo y vuelve a enviarlo.`)].filter(Boolean).join(' '); };
// Borrador de términos: conviene que una persona con formación legal los revise antes de lanzar la app
const TERMS = `<ol>
<li><b>Etiqueta +18.</b> Marca tu historia como +18 si tiene contenido sexual sugerido, violencia intensa, drogas o temas delicados para menores. Si dudas, márcala.</li>
<li><b>Nivel permitido.</b> El contenido +18 en Auri es solo escrito y de nivel «soft»: se permiten escenas sugerentes o románticas, sin descripciones sexuales explícitas.</li>
<li><b>Menores.</b> Está prohibido sexualizar a personajes menores de 18 años, incluso en ficción. Esas historias se rechazan y pueden causar la suspensión de la cuenta.</li>
<li><b>Contenido prohibido.</b> Contenido sexual explícito, apología del odio, acoso, violencia extrema gratuita, datos personales de terceras personas y plagio.</li>
<li><b>Revisión.</b> Toda historia pasa por moderación antes de aparecer en Descubrir. Puede aprobarse, rechazarse con un motivo o retirarse después si incumple estas reglas.</li>
<li><b>Responsabilidad.</b> Eres responsable de tu contenido y de etiquetarlo bien. Una etiqueta incorrecta puede ser motivo de rechazo.</li>
<li><b>Lectores.</b> Las historias +18 solo se muestran a cuentas que declaren ser mayores de 18 años. Por ahora es una declaración, no una verificación de identidad.</li>
<li><b>Convivencia.</b> Trata bien a las demás personas: el acoso, el odio y el spam no están permitidos en comentarios ni perfiles. Puedes reportar contenido y bloquear o silenciar cuentas.</li>
<li><b>Autoría y fanfics.</b> Tus historias siguen siendo tuyas. En los fanfics respeta a quienes crearon el material original y no copies textos ajenos.</li></ol>`;
function showTerms() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>Términos y condiciones de contenido</h2><div class="terms">${TERMS}</div><button class="button" data-act="close-modal" style="width:100%;margin-top:14px">Entendido</button></div>`;
  document.body.appendChild(m);
}
let W = null, WPREVIEW = false, WCUR = 0;
const newDraft = () => ({ id: 'story-' + Date.now(), title: '', synopsis: '', genre: 'Fantasy', fandom: 'Original', tags: [], cover: '', chapters: [{ id: 1, title: 'Capítulo 1', text: '', status: 'draft' }], mature: false, phase: 'ongoing', prev: '', terms: false, useReaderCharacter: true, updatedAt: today() });
const wc = t => `${t.trim() ? t.trim().split(/\s+/).length : 0} palabras · ${t.length} caracteres`;
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
const coverPrev = () => W.cover ? `<img src="${esc(W.cover)}" alt="Vista previa de la portada">` : 'Sin portada';
const TN_RE = /[\[(]\s*(?:T\/N|TN)\s*[\])]|\bT\/N\b|\bTN\b/gi;
/** TN / T/N / [TN] / (T/N) → nombre del personaje. "TN" en MAYÚSCULAS da el nombre en MAYÚSCULAS; "tn" o "Tn" lo dan tal cual */
const fillTN = (text, name) => text.replace(TN_RE, m => m.replace(/[^A-Za-z]/g, '') === 'TN' ? name.toLocaleUpperCase('es') : name);
/* Comentarios por párrafo: ocultos al leer; se tocan los párrafos para comentar. Se guardan por libro + capítulo + párrafo (con una "huella" del párrafo) */
const PC_MAX = 400, paraSplit = t => String(t || '').split(/\n\s*\n/);
const pQ = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 30);            // huella: si el autor reescribe el párrafo, esos comentarios dejan de mostrarse
const pcKey = (sid, ci, pi) => sid + '|' + ci + '|' + pi;
const pcAll = () => G.get('pcom', {});
const pcPara = (sid, ci, pi) => { const s = findStory(sid), ch = s && s.chapters.find(c => c.idx === ci); return ch ? paraSplit(ch.text)[pi] : undefined; };
const pcList = (sid, ci, pi, all = pcAll()) => { const t = pcPara(sid, ci, pi); return t === undefined ? [] : (all[pcKey(sid, ci, pi)] || []).filter(c => c.q === pQ(t)); };
function readerText(text, on, pc) {
  const name = S.character.name || 'Lectora', raw = paraSplit(text), all = pc && cfg('pcom') !== 'off' ? pcAll() : null;
  return `<div class="reader-text">${(on ? fillTN(text, name) : text).split(/\n\s*\n/).map((p, i) => {
    const n = all && cfg('pcom') === 'dots' ? (all[pcKey(pc.sid, pc.ci, i)] || []).filter(c => c.q === pQ(raw[i])).length : 0;
    return `<p${all ? ` data-pi="${i}"` : ''}>${esc(p)}${n ? `<span class="pc-n" aria-label="${n} comentarios">${n}</span>` : ''}</p>`; }).join('')}</div>`;
}
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>';
function confirmBox(msg, onYes) {                // cuadro de confirmación propio (no usa confirm() del navegador)
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="alertdialog" aria-modal="true"><h2>${esc(msg)}</h2><p class="helper">Esta acción no se puede deshacer.</p>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">Cancelar</button><button class="button danger" data-yes style="flex:1">Eliminar</button></div></div>`;
  m.querySelector('[data-no]').onclick = () => m.remove();
  m.querySelector('[data-yes]').onclick = () => { m.remove(); onYes(); };
  document.body.appendChild(m);
}
/** Elimina por chapter.id (nunca por posición) y actualiza el estado sin mutarlo */
function deleteChapter(cid) {
  collect();
  const gone = W.chapters.find(c => c.id === cid); if (!gone) return;
  W.chapters = W.chapters.filter(c => c.id !== cid);
  if (!W.chapters.length) W.chapters = [{ id: chapId(), title: 'Capítulo 1', text: '', status: 'draft' }];
  persistDraft(); toast(`«${gone.title || 'Capítulo'}» eliminado`); KEEP = true; render();
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
  if (!W) return `<main class="page">${empty('Historia no encontrada', 'Puede que se haya eliminado.', '<a class="button" href="#/library">Ir a mi biblioteca</a>')}</main>`;
  if (!editId) return infoView(false);
  return sub === 'chapters' ? chaptersView() : sub === 'ch' ? chapterView(+cid) : infoView(true);
}
const needTerms = () => !(getUsers()[S.user] || {}).termsAccepted;     // cuentas anteriores al nuevo registro: aceptan una sola vez aquí
const submitBlock = () => `<div class="panel" style="margin-top:16px">${needTerms() ? `<label class="check"><input type="checkbox" id="w-terms" ${W.terms ? 'checked' : ''}><span>Acepto los <button type="button" class="link-btn" data-act="terms">términos y condiciones</button> de Auri.</span></label>` : ''}
  <p class="notice" style="margin:0 0 4px">🔞 Si tu historia tiene contenido +18, acuérdate de marcarla como +18 antes de enviarla. Los términos ya los aceptaste al crear tu cuenta.</p>
  <button class="button" style="margin-top:12px;width:100%" data-act="publish">Enviar a revisión</button>
  <p class="helper" style="margin-top:8px">Se envían todos los capítulos terminados que aún no están en revisión. Moderación los revisa en orden: la historia aparece en Descubrir cuando se aprueba el primero.</p></div>`;

/** Botón de acceso a los capítulos (debajo de los datos del libro) */
const chaptersEntry = () => { const n = W.chapters.length, pend = W.chapters.filter(c => c.status === 'pending').length;
  return `<section class="panel ch-entry"><div><strong>Capítulos</strong><div class="helper">${n} capítulo${n === 1 ? '' : 's'}${pend ? ` · ${pend} en revisión` : ''}. Cada uno se edita en su propia pantalla.</div></div><button class="button secondary" data-act="ch-list">Editar capítulos</button></section>`; };
/* Paso 1: datos de la historia */
function infoView(existing) {
  return `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">✎ ${existing ? 'Datos de la historia' : 'Paso 1 · Datos de la historia'}</span><h2 style="margin-top:8px">${existing ? 'Edita los datos' : 'Aquí empieza una historia'}</h2><p>Portada, título y sinopsis. Después escribirás cada capítulo en su propia pantalla.</p></div></div>
  <section class="panel"><div class="form-grid">
    <div class="form-group full"><label>Portada del libro</label><div class="cover-picker"><div class="cover-prev" id="cover-prev">${coverPrev()}</div>
      <div class="cover-fields"><label class="button secondary sm" style="cursor:pointer">📷 Subir imagen<input id="cover-file" type="file" accept="image/*" hidden></label><button class="button ghost sm" data-act="cover-adjust" type="button">✂ Ajustar imagen</button>
      <input id="cover-url" class="field" placeholder="…o pega la URL de una imagen" value="${W.cover.startsWith('data:') ? '' : esc(W.cover)}">
      <button class="button ghost sm" data-act="clear-cover" type="button">Quitar portada</button>
      <span class="helper">Puedes subir cualquier tamaño: después la ajustas (mover y zoom) a la proporción 2:3 de las tarjetas.</span></div></div></div>
    <div class="form-group full"><label for="w-title">Título</label><input id="w-title" class="field" value="${esc(W.title)}" placeholder="Ponle un nombre…"></div>
    <div class="form-group full"><label for="w-syn">Sinopsis</label><textarea id="w-syn" class="textarea" placeholder="Unas líneas para invitar a leer…">${esc(W.synopsis)}</textarea></div>
    <div class="form-group"><label for="w-genre">Género</label><select id="w-genre" class="select">${Object.keys(GENRES).map(g => `<option value="${g}" ${W.genre === g ? 'selected' : ''}>${GENRES[g]}</option>`).join('')}</select></div>
    <div class="form-group"><label for="w-fandom">Fandom / universo</label><input id="w-fandom" class="field" value="${esc(W.fandom)}"></div>
    <div class="form-group full"><label for="w-tags">Etiquetas</label><input id="w-tags" class="field" value="${esc(tagsText(W.tags))}" placeholder="#romance lento #magia #enemies to lovers" autocapitalize="none"><div id="w-tags-prev" class="tag-prev">${W.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div><div class="tag-sug"><span class="helper">Sugeridas:</span>${[...new Set([...popTags(6), 'lgbtq+', 'yaoi', 'yuri', 'poliamor', 'romance lento', 'au'])].slice(0, 10).map(t => `<button type="button" class="tag tag-link" data-act="tag-add" data-id="${esc(t)}">#${esc(t)}</button>`).join('')}</div><span class="helper">Escribe cada etiqueta con # al inicio. Ej: #romance lento #magia. Así la gente te encuentra al buscar por etiquetas. </span></div>
    <div class="form-group"><label for="w-phase">Estado del libro</label><select id="w-phase" class="select">${Object.keys(PHASE).map(k => `<option value="${k}" ${(W.phase || 'ongoing') === k ? 'selected' : ''}>${PHASE[k]}</option>`).join('')}</select></div>
    ${sagaBox()}
  </div><div class="toggle-line"><div><strong>Tarjeta de personaje lector</strong><div class="helper">Reemplaza TN / T/N por el nombre de tu personaje.</div></div>
  <button type="button" role="switch" class="switch" aria-checked="${W.useReaderCharacter}" data-act="toggle-tn" aria-label="Usar tarjeta de personaje lector"></button></div>
  <div class="toggle-line"><div><strong>Historia +18</strong><div class="helper">${isMinor(getUsers()[S.user]) ? 'Las cuentas menores de 18 años no pueden publicar contenido +18.' : 'Actívalo si tiene contenido sugerente o temas para mayores de edad.'}</div></div>
  <button type="button" role="switch" class="switch" aria-checked="${W.mature}" data-act="toggle-18" aria-label="Historia +18" ${isMinor(getUsers()[S.user]) ? 'disabled' : ''}></button></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px">${existing ? '<button class="button" data-act="info-save">Guardar cambios</button>' : '<button class="button" data-act="save-next">Guardar y siguiente ›</button>'}</div></section>${existing ? chaptersEntry() : ''}</main>`;
}

/* Lista de capítulos de la historia */
function chaptersView() {
  const n = W.chapters.length;
  return `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">☰ Capítulos</span><h2 style="margin-top:8px">${esc(W.title)}</h2><p>Cada capítulo se escribe en su propia pantalla.</p></div><button class="button secondary sm" data-act="info-go">✎ Datos de la historia</button></div>
  ${statusNote(W) ? `<p class="notice" style="margin-bottom:14px">${esc(statusNote(W))}</p>` : ''}
  <div class="ch-list ch-list-big">${W.chapters.map((c, i) => `<div class="ch-item"><button type="button" class="ch-open" data-act="ch-go" data-cid="${c.id}"><b>Cap. ${i + 1}</b><span>${esc(c.title || 'Sin título')}</span><i>${CH_MARK[c.status] || ''}</i></button><button type="button" class="icon-btn ch-trash" data-act="ch-trash" data-cid="${c.id}" aria-label="Eliminar ${esc(c.title || 'capítulo ' + (i + 1))}">${TRASH}</button></div>`).join('')}</div>
  <button type="button" class="button secondary" data-act="ch-add" style="margin:12px 0">＋ Capítulo ${n + 1}</button>${submitBlock()}</main>`;
}

const safeImg = u => typeof u === 'string' && /^data:image\//.test(u);
const chHero = (c, cls = 'ch-hero') => safeImg(c.cover) ? `<img class="${cls}" src="${esc(c.cover)}" alt="Portada del capítulo">` : '';
const chCoverBox = ch => `<div class="chc-box">${safeImg(ch.cover)
  ? `<div class="chc-prev"><img src="${esc(ch.cover)}" alt="Portada del capítulo"><label class="button secondary sm chc-change">Cambiar<input id="chc-file" type="file" accept="image/*" hidden></label><button type="button" class="icon-btn chc-x" data-act="chc-clear" aria-label="Quitar portada del capítulo">✕</button></div>`
  : '<label class="chc-add">🖼 Portada del capítulo (opcional)<input id="chc-file" type="file" accept="image/*" hidden></label>'}</div>`;
/* Pantalla individual para escribir UN capítulo: a pantalla completa, sin la barra de la app */
function chapterView(cid) {
  const i = W.chapters.findIndex(c => c.id === cid);
  if (i < 0) return `<main class="page">${empty('Capítulo no encontrado', 'Puede que se haya eliminado.', '<button class="button" data-act="ch-list">Ver capítulos</button>')}</main>`;
  const ch = W.chapters[i], n = W.chapters.length, before = W.chapters[i - 1], after = W.chapters[i + 1], st = ch.status || 'draft';
  if (WPREVIEW) return `<div class="rf"><header class="rf-top"><button class="button ghost sm" data-act="back-edit">‹ Volver a escribir</button><div class="rf-title">Vista previa · Cap. ${i + 1}</div><span style="width:44px"></span></header>
  <article class="rf-body">${chHero(ch)}<h1 class="rf-h">${esc(ch.title)}</h1>${readerText(ch.text || 'Aquí aparecerá el texto de tu capítulo.', W.useReaderCharacter)}</article></div>`;
  return `<div class="wf"><header class="wf-top"><button class="button ghost sm" data-act="ch-list" aria-label="Guardar y salir a la lista de capítulos">✕ Salir</button>
  <span class="grow">Cap. ${i + 1} de ${n} · <span class="pill st-${st}">${CH_STATUS[st]}</span> <span id="w-saved"></span></span><button class="button secondary sm" data-act="preview">Vista previa</button></header>
  ${st === 'rejected' && ch.reason ? `<p class="notice">Rechazado: ${esc(ch.reason)}</p>` : ''}${ch.live ? '<p class="notice">Mientras se revisa esta edición, los lectores siguen viendo la versión aprobada anterior.</p>' : ''}
  ${chCoverBox(ch)}
  <input id="w-ch-title" class="wf-title" data-cid="${ch.id}" value="${esc(ch.title)}" placeholder="Título del capítulo">
  <textarea id="w-ch-text" class="wf-text" data-cid="${ch.id}" placeholder="Érase una vez…">${esc(ch.text)}</textarea>
  <footer class="wf-bottom"><details class="wf-music" ${ch.music ? 'open' : ''}><summary class="helper" style="cursor:pointer">🎵 Canción del capítulo (opcional)</summary><input id="w-ch-music" class="field" style="margin-top:8px" value="${esc(ch.music || '')}" placeholder="Enlace de YouTube, Spotify o un .mp3"><span class="helper">Quien lee decide si la reproduce. Se revisa junto con el capítulo.</span></details>
  <div class="wf-actions"><span class="helper" id="w-count">${wc(ch.text)}</span><span class="wf-btns">${before ? `<button type="button" class="button ghost sm" data-act="ch-go" data-cid="${before.id}">‹ Cap. ${i}</button>` : ''}<button class="button secondary sm" data-act="save-draft">💾 Guardar borrador</button>${after ? `<button type="button" class="button sm" data-act="ch-go" data-cid="${after.id}">Cap. ${i + 2} ›</button>` : `<button type="button" class="button sm" data-act="ch-add">＋ Cap. ${n + 1}</button>`}</span></div></footer></div>`;
}
/** Lee las historias tal como están guardadas AHORA (moderación puede haber cambiado estados mientras tenías la pantalla abierta) */
const freshStories = () => LS.get(uk('stories'), []).map(norm);
const INFO_FIELDS = ['title', 'synopsis', 'genre', 'fandom', 'tags', 'cover', 'mature', 'phase', 'prev', 'useReaderCharacter'];
/** Guarda SOLO los datos generales (título, sinopsis, portada, género, etiquetas…). Parte del libro tal como está guardado: no toca los capítulos
 *  ni su estado de moderación, y no pide capítulos nuevos ni términos. Devuelve true si guardó. */
function saveInfoOnly(silent) {
  if (!W) return false;
  collect();
  if (!W.title.trim()) { if (!silent) toast('Ponle un título a tu historia.'); return false; }
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
  if (!W.title.trim()) return toast('Ponle un título para continuar.');
  persistDraft(); W.saved = true;
  const only = W.chapters.length === 1 && !W.chapters[0].text.trim();
  go(only ? `/write/${W.id}/ch/${W.chapters[0].id}` : `/write/${W.id}/chapters`);
}
function addChapter() {
  autosave();
  const id = chapId(); W.chapters = [...W.chapters, { id, title: 'Capítulo ' + (W.chapters.length + 1), text: '', status: 'draft' }];
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
  if (!W.title.trim()) return toast('Ponle un título antes de guardar.');
  const badM = W.chapters.find(c => c.music && !musicEmbed(c.music)); if (badM) return toast(`El enlace de música de «${badM.title}» no es válido (YouTube, Spotify o un .mp3).`);
  const cur = freshStories();
  let chs = reconcile(W.chapters, cur.find(s => s.id === W.id));
  const toSend = chs.filter(c => c.status === 'draft' && c.text.trim());
  if (submit) {
    if (!toSend.length) return toast('No hay capítulos nuevos o editados para enviar.');
    if (needTerms()) { if (!W.terms) return toast('Debes aceptar los términos y condiciones para enviar.'); const us = getUsers(); if (us[S.user]) { us[S.user].termsAccepted = today(); G.set('users', us); } }
    chs = chs.map(c => toSend.includes(c) ? { ...c, status: 'pending' } : c);
  }
  W.chapters = chs; W.updatedAt = today();
  fixSaga(); const { saved, ...clean } = W, list = [clean, ...cur.filter(s => s.id !== W.id)];
  if (!LS.set(uk('stories'), list)) return;
  S.stories = list; W.saved = true; WPREVIEW = false;
  if (submit) {
    [...new Set([OWNER_EMAIL, ...Object.keys(getUsers()).filter(e => roleOf(e) !== 'USER')])].filter(e => e !== S.user).forEach(e => notify(e, 'review', W.id, W.title, toSend.length === 1 ? toSend[0].title : toSend.length + ' capítulos'));   // avisa a Owner, Administración y Moderación
    toast(toSend.length === 1 ? 'Capítulo enviado a revisión' : 'Capítulos enviados a revisión'); TAB = 'draft'; go('/library');
  } else toast('Borrador guardado ✓');
}
/** Portada: al elegir una imagen se abre el ajustador (mover, zoom, ver completa) y se guarda al tamaño ideal 480×720 (2:3) */
let COVSRC = null;                                     // imagen original (reducida) para poder volver a ajustarla
function loadCover(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Elige un archivo de imagen.');
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); COVSRC = c.toDataURL('image/jpeg', .9); coverEditor(COVSRC, applyCover, img.width, img.height);
    };
    img.onerror = () => toast('No se pudo leer esa imagen.');
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
function applyCover(d) { W.cover = d; const p = $('#cover-prev'); if (p) p.innerHTML = coverPrev(); const u = $('#cover-url'); if (u) u.value = ''; }
function coverEditor(src, done, ow, oh) {
  const img = new Image();
  img.onload = () => {
    const iw = img.naturalWidth, ih = img.naturalHeight, FW = Math.max(160, Math.min(260, Math.round((window.innerWidth || 390) * .6))), FH = Math.round(FW * 1.5);
    const kc = Math.max(FW / iw, FH / ih), kf = Math.min(FW / iw, FH / ih), zmin = Math.min(1, kf / kc);
    let z = 1, ox = (FW - iw * kc) / 2, oy = (FH - ih * kc) / 2;
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="modal-box cv-box" role="dialog" aria-modal="true" aria-label="Ajustar portada"><h2>Ajusta tu portada</h2><p class="helper" style="margin:0 0 10px">Arrastra la imagen para moverla y usa el zoom. Se guarda en proporción 2:3.</p>
    <div class="cv-frame" style="width:${FW}px;height:${FH}px"><img class="cv-img" alt="" draggable="false" src="${esc(src)}"></div>
    <label class="cv-zoom"><span>Zoom</span><input type="range" min="${zmin}" max="3" step="0.01" value="1" aria-label="Zoom"></label>
    <div class="cv-quick"><button type="button" class="button ghost sm" data-q="fill">Rellenar</button><button type="button" class="button ghost sm" data-q="fit">Ver completa</button><button type="button" class="button ghost sm" data-q="center">Centrar</button></div>
    <p class="helper cv-info">${ow && oh ? `Original: ${ow}×${oh} px. ` : ''}Se guardará a 480×720 px, el tamaño ideal para portadas (las imágenes grandes se reducen solas).</p>
    <div style="display:flex;gap:10px;margin-top:12px"><button class="button ghost" data-no style="flex:1">Cancelar</button><button class="button" data-yes style="flex:1">Aplicar</button></div></div>`;
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
      const OW = 480, OH = 720, k = OW / FW, c = document.createElement('canvas'); c.width = OW; c.height = OH; const x = c.getContext('2d');
      const w = iw * kc * z, h = ih * kc * z;
      if (w < FW - 1 || h < FH - 1) {                    // si la imagen no llena el marco, el fondo es la misma imagen difuminada
        const kb = Math.max(OW / iw, OH / ih); x.fillStyle = '#e8dcf5'; x.fillRect(0, 0, OW, OH);
        try { x.filter = 'blur(18px)'; x.drawImage(img, (OW - iw * kb) / 2, (OH - ih * kb) / 2, iw * kb, ih * kb); x.filter = 'none'; } catch (e) { /* sin filtro: queda el color liso */ }
      }
      x.drawImage(img, ox * k, oy * k, w * k, h * k); m.remove(); done(c.toDataURL('image/jpeg', .85));
    };
    document.body.appendChild(m); paint();
  };
  img.onerror = () => toast('No se pudo leer esa imagen.'); img.src = src;
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
  playMusic(ch.music, b);
}
function closeMusic() { const d = $('#music-dock'); if (d) d.remove(); MUSIC = null; }
function playMusic(url, sid) {                    // solo se abre cuando la persona lectora lo pide
  const m = musicEmbed(url); if (!m) return toast('No se pudo abrir esa canción.');
  closeMusic(); MUSIC = { url, sid };
  const d = document.createElement('div'); d.id = 'music-dock'; d.className = 'music-dock';
  d.innerHTML = `<div class="music-top"><span>🎵 Música del capítulo</span><button class="icon-btn" data-act="music-close" aria-label="Cerrar música">✕</button></div>${m.audio ? `<audio controls autoplay src="${esc(m.src)}"></audio>` : `<iframe src="${esc(m.src)}" height="${m.h}" allow="autoplay; encrypted-media" title="Reproductor de música"></iframe>`}`;
  document.body.appendChild(d);
}

/* --- Historia (varios capítulos) --- */
const readList = id => { const p = S.progress[id]; return Array.isArray(p) ? p : p ? [0] : []; };
const commentsBox = s => `<div class="comments-box"><button class="button secondary" data-act="comments" aria-expanded="${SHOWC}">💬 Comentarios (${comments(s.id).length}) ${SHOWC ? '▴' : '▾'}</button>${SHOWC ? `<div id="comments">${commentsHTML(s)}</div>` : ''}</div>`;
function storyView(id, num) {
  const s = findStory(id);
  if (!s) return `<main class="page">${empty('Esta historia se ha perdido', 'Puede que se haya eliminado o que aún esté en revisión.', '<a class="button" href="#/">Volver a descubrir</a>')}</main>`;
  const mine = S.stories.some(x => x.id === s.id);
  if (s.mature && !mine && isMinor(getUsers()[S.user])) return `<main class="page story-layout"><a class="button ghost" href="#/">‹ Volver</a>
  <div class="empty" style="margin-top:16px">${mascot()}<h3>Contenido +18</h3><p>Esta historia es solo para personas mayores de 18 años, así que no está disponible para tu cuenta.</p></div></main>`;
  if (s.mature && !mine && !isAdult(getUsers()[S.user])) return `<main class="page story-layout"><a class="button ghost" href="#/">‹ Volver</a>
  <div class="empty" style="margin-top:16px">${mascot()}<h3>Contenido +18</h3><p>Esta historia está marcada como +18. Para leerla declara que eres mayor de edad. Por ahora es solo una declaración; la verificación real llegará con el servidor.</p><button class="button" data-act="adult">Soy mayor de 18 años</button></div></main>`;
  if (s.mature && !mine && !cfg('showMature')) return `<main class="page story-layout"><a class="button ghost" href="#/">‹ Volver</a>
  <div class="empty" style="margin-top:16px">${mascot()}<h3>Contenido +18 oculto</h3><p>Tienes desactivado «Mostrar contenido +18». Puedes volver a activarlo en Ajustes.</p><button class="button" data-act="settings">Ir a Ajustes</button></div></main>`;
  return num === 'fin' ? bookEnd(s) : num ? chapterRead(s, +num - 1) : storyDetail(s, mine);
}
const staffBar = (s, mine) => {
  const td = takedown().includes(s.id); if (!(isStaff() && !mine) && !(td && mine)) return '';
  return `<div class="panel staff-bar"><b>${td ? '🚩 Retirada de Descubrir por moderación' : '🛡 Herramientas de moderación'}</b>${isStaff() && !mine ? `<div class="row-btns">${td ? `<button class="button secondary sm" data-act="td-off" data-id="${esc(s.id)}">Restaurar en Descubrir</button>` : `<button class="button danger sm" data-act="td-on" data-id="${esc(s.id)}">Retirar de Descubrir</button>`}${canAct(s.owner) ? `<button class="button ghost sm" data-act="adm-strike" data-id="${esc(s.owner)}">⚠️ Dar strike</button>` : ''}<a class="button ghost sm" href="#/user/${encodeURIComponent(s.owner)}">👤 Perfil</a><a class="button ghost sm" href="#/moderation/reports">🚩 Reportes</a></div>` : ''}</div>`;
};
/* Pantalla 1: portada, título, autoría, likes y sinopsis (sin el texto) */
function storyDetail(s, mine) {
  const read = readList(s.id), fav = S.favs.includes(s.id), n = likes(s.id).length, first = s.chapters[0];
  const lp = (S.pos || {})[s.id], at0 = lp && s.chapters.find(c => c.idx === lp.idx), at = at0 && !read.includes(at0.idx) ? at0 : null;   // si ya lo leíste, sigue con el primero sin leer
  const next = at || s.chapters.find(c => !read.includes(c.idx)) || first, all = !at && s.chapters.every(c => read.includes(c.idx));
  return `<main class="page story-layout"><a class="button ghost" href="#/">‹ Todas las historias</a>
  <section class="detail">${sagaNav(s)}${sagaCovers(s)}
  <span class="eyebrow">${esc(genreName(s.genre))} · ${esc(s.fandom)}${s.mature ? ' · +18' : ''}</span><h1>${esc(s.title)}</h1>
  <div class="detail-by">por ${s.owner ? `<a href="#/user/${encodeURIComponent(s.owner)}">${esc(s.author)}</a>` : esc(userName())}</div>${s.publishedAt ? `<div class="detail-date">📅 Publicado el ${fmtDate(s.publishedAt)}</div>` : ''}
  <div class="detail-likes">👍 ${n} ${n === 1 ? 'like' : 'likes'}</div>${bookState(s)}
  <p class="detail-syn">${esc(s.synopsis)}</p>
  <div class="tags" style="justify-content:center">${tagChips(s.tags)}</div>
  ${staffBar(s, mine)}
  ${mine && statusNote(ownOf(s)) ? `<p class="notice">${esc(statusNote(ownOf(s)))}</p>` : ''}
  <a class="button" data-replace data-dir="next" ${s.useReaderCharacter ? `data-readas="${esc(s.id)}"` : ''} style="width:100%;max-width:420px" href="#/story/${esc(s.id)}/${next.idx + 1}">${!read.length && !at ? 'Empezar a leer' : all ? 'Leer otra vez' : `Continuar: cap. ${next.idx + 1}`}</a>
  <div class="row-btns"><button class="button secondary" data-act="like" data-id="${esc(s.id)}">👍 ${likes(s.id).includes(S.user) ? 'Te gusta' : 'Me gusta'}</button><button class="button secondary" data-act="fav" data-id="${esc(s.id)}">${fav ? '♥ En favoritos' : '♡ Favorito'}</button><button class="button secondary" data-act="lib-toggle" data-id="${esc(s.id)}">${S.lib.includes(s.id) ? '✓ En tu biblioteca' : '📚 Guardar en biblioteca'}</button>${mine ? `<a class="button ghost" href="#/write/${esc(s.id)}">Editar</a>` : `<button class="button ghost" data-act="report-story" data-id="${esc(s.id)}">Reportar</button>`}</div>
  <details class="ch-index"><summary>Capítulos (${s.chapters.length})</summary>${s.chapters.map(c => `<a data-replace ${s.useReaderCharacter ? `data-readas="${esc(s.id)}"` : ''} href="#/story/${esc(s.id)}/${c.idx + 1}"><b>${read.includes(c.idx) ? '✓' : c.idx + 1}</b><span>${esc(c.title || 'Capítulo ' + (c.idx + 1))}${mine && c.status !== 'approved' ? ` (${CH_STATUS[c.status].toLowerCase()})` : ''}</span></a>`).join('')}</details>
  ${commentsBox(s)}</section></main>`;
}
/* Estado del libro + barra de progreso (solo si ya empezaste o lo guardaste) */
function bookState(s) {
  const p = bookProgress(s), ph = s.phase || 'ongoing', inLib = S.lib.includes(s.id), show = readList(s.id).length > 0 || inLib;
  return `<div class="book-state"><span class="pill ph-${ph}">${PHASE[ph]}</span></div>${show ? `<div class="pbar big"><i data-key="b-${esc(s.id)}" data-w="${p.pct}" style="width:${p.pct}%"></i></div><div class="story-meta" style="text-align:center"><b class="plabel ${p.finished ? 'done' : p.caught ? 'caught' : ''}">${p.label}</b> · ${p.done}/${p.total} cap.</div>${p.caught && !p.finished ? `<p class="notice">${esc(moreNotice(s, inLib))}</p>` : ''}` : ''}`;
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
  if (parts.length < 2 || i < 0) return s.cover ? `<img class="detail-cover" src="${esc(s.cover)}" alt="Portada de ${esc(s.title)}">` : `<div class="detail-cover ph">${esc(s.title)}</div>`;
  const pose = k => { const q = sagaPose(k - i); return `transform:translateX(${q.x}px) scale(${q.sc});opacity:${q.op};z-index:${q.z}`; };
  return `<div class="saga-view" data-saga data-ids="${parts.map(p => esc(p.id)).join(',')}" data-i="${i}" data-pos="${i}">${parts.map((p, k) => `<a class="sc" data-k="${k}" href="#/story/${esc(p.id)}" aria-label="${esc(p.title)}" ${k === i ? 'aria-current="true"' : ''} style="${pose(k)}">${coverHTML(p, k)}</a>`).join('')}</div><p class="swipe-hint">Desliza o toca una portada para cambiar de parte</p>`;
}
/* Pantalla final: celebración + tarjeta del libro siguiente (se arma con los datos reales de la secuela) */
function bookEnd(s) {
  const p = bookProgress(s), inLib = S.lib.includes(s.id), inCol = S.cols.includes(s.id), id = esc(s.id), ph = s.phase || 'ongoing';
  const parts = sagaParts(s).filter(x => x.id === s.id || publicPrefix(x.chapters).length), i = parts.findIndex(x => x.id === s.id), nxt = parts[i + 1];
  const pillCls = { 'Terminado': 'ph-finished', 'Al día': 'st-approved', 'En emisión': 'ph-ongoing', 'En pausa': 'ph-paused' };
  const pills = [p.label, PHASE[ph]].filter((x, k, a) => a.indexOf(x) === k);                 // sin etiquetas repetidas ("Terminado Terminado")
  const head = p.finished ? '🎉 ¡Felicidades, terminaste esta historia!' : p.caught ? '✨ ¡Estás al día!' : 'Capítulo completado';
  const notice = p.caught && !p.finished ? `<p class="notice">${esc(moreNotice(s, inLib))}</p>${inLib ? '' : `<button class="button secondary" data-act="lib-toggle" data-id="${id}">📚 Guardar en biblioteca</button>`}` : !p.caught ? `<p class="helper">Todavía te quedan capítulos por leer.</p><a class="button" data-replace href="#/story/${id}">Continuar leyendo</a>` : '';
  const colBtn = inCol ? '<span class="end-note">⭐ Ya está en tus colecciones</span>' : `<button class="button ${nxt ? 'ghost sm' : 'secondary'}" data-act="col-add" data-id="${id}">⭐ Guardar en colecciones</button>`;
  let main;
  if (nxt) {
    const first = publicPrefix(nxt.chapters)[0];
    main = `<article class="seq-card"><div class="seq-cover">${coverHTML(nxt, 1)}</div><div class="seq-info"><span class="eyebrow">${i + 1 < ORD.length ? `A continuación: ${ORD[i + 1]} libro` : `Parte ${i + 2}`}</span><h2>${esc(nxt.title)}</h2>
      <a class="button seq-go" data-replace data-dir="next" ${nxt.useReaderCharacter ? `data-readas="${esc(nxt.id)}"` : ''} href="#/story/${esc(nxt.id)}/${first.idx + 1}">📖 Comenzar a leer ${esc(nxt.title)}</a></div></article>
      <div class="end-sub">${colBtn}<a class="end-link" data-replace href="#/story/${id}">‹ Volver a la portada</a></div>`;
  } else {
    main = `<div class="end-panel">${colBtn}${inLib ? `<button class="button ghost" data-act="lib-del" data-id="${id}">🗑️ Borrar de la biblioteca</button>` : ''}<a class="end-link" href="#/">‹ Volver al inicio</a></div>`;
  }
  return `<div class="rf"><header class="rf-top"><a class="button ghost sm" data-replace href="#/story/${id}">✕ Cerrar</a><div class="rf-title">${esc(s.title)}</div><span style="width:44px"></span></header>
  <div class="rf-body end-card"><h1 class="rf-h end-h">${head}</h1><p class="story-meta">${esc(s.title)}</p>
  <div class="pbar big"><i data-key="b-${esc(s.id)}" data-w="${p.pct}" style="width:${p.pct}%"></i></div>
  <p class="end-pills">${pills.map(x => `<span class="pill ${pillCls[x] || ''}">${x}</span>`).join(' ')}</p>${notice}${main}</div></div>`;
}
/* Pantalla 2: lectura a pantalla completa (sin barra de la app); la salida guarda el progreso */
function chapterRead(s, N) {
  const read = readList(s.id), mine = S.stories.some(x => x.id === s.id);
  let pos = s.chapters.findIndex(c => c.idx === N); if (pos < 0) pos = 0;
  const ch = s.chapters[pos], before = s.chapters[pos - 1], after = s.chapters[pos + 1];
  if (!ch) return `<main class="page">${empty('Aún no hay capítulos', 'Esta historia todavía no tiene capítulos publicados.', `<a class="button" href="#/story/${esc(s.id)}">Volver a la historia</a>`)}</main>`;
  const nc = comments(s.id).length, exit = `data-act="exit-book" data-id="${esc(s.id)}" data-n="${ch.idx}"`;
  return `<div class="rf"><div class="rf-bar"><i id="rf-bar-i"></i></div>
  <header class="rf-top"><button class="button ghost sm" ${exit} aria-label="Guardar progreso y salir del libro">✕ Salir</button><div class="rf-title"><b>Cap. ${ch.idx + 1}</b> · ${esc(ch.title)}</div><button class="icon-btn" data-act="comments" aria-label="Comentarios">💬</button></header>
  <article class="rf-body">${chHero(ch)}<h1 class="rf-h">${esc(ch.title)}</h1>${s.useReaderCharacter && S.chars.length > 1 ? `<label class="helper" style="display:flex;align-items:center;gap:8px;margin-bottom:14px">Leyendo como <select id="char-sel" class="select" style="max-width:200px">${S.chars.map((x, k) => `<option value="${x.id}" ${x.id === S.activeId ? 'selected' : ''}>${esc(x.name || 'Personaje ' + (k + 1))}</option>`).join('')}</select></label>` : ''}${ch.music && musicEmbed(ch.music) ? `<button class="button secondary sm" data-act="music" data-url="${esc(ch.music)}" style="margin-bottom:14px">🎵 Escuchar la canción de este capítulo</button>` : ''}${readerText(ch.text, s.useReaderCharacter, { sid: s.id, ci: ch.idx })}</article>
  <footer class="rf-end"><div class="ch-nav">${before ? `<a class="button secondary" data-replace data-dir="prev" href="#/story/${esc(s.id)}/${before.idx + 1}">‹ Anterior</a>` : '<span></span>'}<button class="button" data-act="read" data-id="${esc(s.id)}" data-n="${ch.idx}">${read.includes(ch.idx) ? 'Leído ✓' : 'Marcar como leído'}</button>${after ? `<a class="button secondary" data-replace data-dir="next" href="#/story/${esc(s.id)}/${after.idx + 1}">Siguiente ›</a>` : '<span></span>'}</div>
  <label class="helper" style="display:flex;align-items:center;gap:8px;margin-top:16px">Ir a <select id="ch-sel" class="select" aria-label="Elegir capítulo">${s.chapters.map(c => `<option value="${c.idx + 1}" ${c === ch ? 'selected' : ''}>${read.includes(c.idx) ? '✓ ' : ''}${esc(c.title || 'Capítulo ' + (c.idx + 1))}${mine && c.status !== 'approved' ? ` (${CH_STATUS[c.status].toLowerCase()})` : ''}</option>`).join('')}</select></label>
  <button class="button secondary" style="width:100%;margin-top:14px" data-act="comments">💬 ${SHOWC ? 'Ocultar comentarios' : `Comentarios (${nc})`}</button>${SHOWC ? `<div id="comments">${commentsHTML(s)}</div>` : ''}
  <button class="button ghost" style="width:100%;margin-top:18px" ${exit}>Guardar progreso y salir del libro</button></footer></div>`;
}

/* --- Moderación por capítulo (solo la cuenta dueña) --- */
function setChapterStatus(id, owner, cid, status, reason = '') {
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
  LS.set(k, list); if (owner === S.user) S.stories = list.map(norm);
  notify(owner, status === 'approved' ? 'approved' : 'rejected', id, reason.slice(0, 200), title);
  if (status === 'approved') announceChapters(id, before);
}
const OPEN = new Set();   // libros desplegados (se conservan al re-dibujar)
function modView(sub) {
  if (!isStaff()) return `<main class="page">${empty('Sin acceso', 'Solo el equipo de moderación puede entrar aquí.', '<a class="button" href="#/">Volver</a>')}</main>`;
  const books = pendingBooks().reverse(), nr = openReports(), tabs = `<div class="tabs" role="tablist"><a class="tab ${sub === 'reports' ? '' : 'active'}" href="#/moderation">📚 Libros (${books.length})</a><a class="tab ${sub === 'reports' ? 'active' : ''}" href="#/moderation/reports">🚩 Reportes${nr ? ` (${nr})` : ''}</a></div>`;
  if (sub === 'reports') return reportsView(tabs);
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">🛡 Moderación</span><h2 style="margin-top:8px">Libros por revisar (${books.length})</h2><p>Una ficha por libro. Los capítulos se aprueban en orden: 1, 2, 3…</p></div></div>
  ${books.length ? '' : `<p class="notice" style="margin-bottom:14px">No hay libros en revisión en <b>este navegador</b>. Por ahora cada navegador o dispositivo guarda sus propios datos: un libro enviado desde otro teléfono, navegador o editor no llega hasta aquí. Para que lleguen entre dispositivos hace falta el servidor.</p>`}
  ${books.length ? books.map(s => {
    const first = !publicPrefix(s.chapters).length, np = s.chapters.filter(c => c.status === 'pending').length;
    return `<details class="panel book" data-book="${esc(s.id)}" ${OPEN.has(s.id) ? 'open' : ''} style="margin-bottom:14px"><summary class="book-sum">${s.cover ? `<img class="book-thumb" src="${esc(s.cover)}" alt="">` : '<span class="book-thumb">📖</span>'}
    <div class="book-info"><strong class="serif">${esc(s.title)}</strong><div class="story-meta">por ${esc(s.author)} · ${np} en revisión · ${s.chapters.length} cap.${s.mature ? ' · +18' : ''}${first ? ' · Historia nueva' : ''}</div></div></summary>
    <div class="book-body"><p class="story-meta">${esc(genreName(s.genre))} · ${esc(s.fandom)} · <a href="#/user/${encodeURIComponent(s.owner)}" style="text-decoration:underline">ver perfil</a></p>${first ? `<p style="color:var(--soft);line-height:1.6;margin:8px 0">${esc(s.synopsis)}</p><div class="tags" style="margin-bottom:10px">${s.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <ol class="mod-list">${s.chapters.map((c, i) => {
      const ok = s.chapters.slice(0, i).every(x => pubChapter(x)), pend = c.status === 'pending';      // N solo si N-1 ya está aprobado
      return `<li class="mod-ch"><div class="mod-ch-head"><b>Cap. ${i + 1}</b><span>${esc(c.title)}</span><span class="pill st-${c.status}">${CH_STATUS[c.status]}</span></div>${pend ? `
      <details style="margin-top:8px"><summary class="helper" style="cursor:pointer">Leer capítulo${c.live ? ' (versión editada)' : ''}</summary><div class="mod-text" style="margin-top:8px">${esc(c.text)}</div></details>${chHero(c, 'mod-cover')}${c.music ? `<p class="helper" style="margin-top:8px">🎵 Canción: ${musicEmbed(c.music) ? `<a href="${esc(c.music)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">${esc(c.music)}</a>` : esc(c.music) + ' (enlace no válido)'}</p>` : ''}
      <textarea id="rej-${esc(s.id)}-${c.id}" class="textarea" style="min-height:64px;margin-top:10px" placeholder="Motivo del rechazo (obligatorio para rechazar)"></textarea>
      <div class="mod-actions"><button class="button" data-act="approve" data-id="${esc(s.id)}" data-owner="${esc(s.owner)}" data-cid="${c.id}" ${ok ? '' : 'disabled'}>✓ Aprobar</button><button class="button danger" data-act="reject" data-id="${esc(s.id)}" data-owner="${esc(s.owner)}" data-cid="${c.id}">✕ Rechazar</button></div>
      ${ok ? '' : `<p class="helper" style="margin-top:6px">Aprueba antes el capítulo ${i} para poder aprobar este.</p>`}` : c.status === 'rejected' && c.reason ? `<p class="helper" style="margin-top:6px">Motivo: ${esc(c.reason)}</p>` : ''}</li>`; }).join('')}</ol></div></details>`; }).join('') : empty('Nada por revisar', 'Cuando alguien envíe un capítulo, su libro aparecerá aquí.')}${reportsPanel()}</main>`;
}

/* --- Diálogos genéricos --- */
function dialog(title, text, yes, no, onYes, danger) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box mini-box" role="alertdialog" aria-modal="true"><h2>${esc(title)}</h2><p class="helper">${esc(text)}</p><div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">${esc(no)}</button><button class="button ${danger ? 'danger' : ''}" data-yes style="flex:1">${esc(yes)}</button></div></div>`;
  m.querySelector('[data-no]').onclick = () => m.remove(); m.querySelector('[data-yes]').onclick = () => { m.remove(); onYes(); };
  document.body.appendChild(m);
}
/** Doble confirmación: el botón solo se activa al escribir la palabra pedida */
function typeConfirm(title, text, word, yes, onYes) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box mini-box" role="alertdialog" aria-modal="true"><h2>${esc(title)}</h2><p class="helper">${esc(text)}</p><input class="field" data-word autocomplete="off" placeholder="${esc(word)}" style="margin-top:12px"><div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">Cancelar</button><button class="button danger" data-yes style="flex:1">${esc(yes)}</button></div></div>`;
  const inp = m.querySelector('[data-word]'), btn = m.querySelector('[data-yes]'); btn.disabled = true;
  inp.oninput = () => { btn.disabled = inp.value.trim().toUpperCase() !== word; };
  btn.onclick = () => { if (btn.disabled) return; m.remove(); onYes(); };
  m.querySelector('[data-no]').onclick = () => m.remove();
  document.body.appendChild(m);
}
const PRIVACY = `<ol><li><b>Dónde se guardan tus datos.</b> Por ahora Auri guarda todo en este navegador (almacenamiento local): tu cuenta, historias, biblioteca, personajes y ajustes. No se envían a ningún servidor.</li>
<li><b>Qué guardamos.</b> Correo, nombre de usuario, biografía, fotos que subas, tus historias y lo que haces en la app (favoritos, progreso, comentarios, likes y seguidores).</li>
<li><b>Anuncios y seguimiento.</b> Auri no muestra anuncios ni te rastrea.</li>
<li><b>Tus derechos.</b> Puedes exportar tus datos, borrar los de este dispositivo o eliminar tu cuenta desde Ajustes, cuando quieras.</li>
<li><b>Cuando haya servidor y funciones con IA.</b> Te avisaremos antes de enviar tus textos a un servicio externo y te pediremos permiso.</li>
<li><b>Menores.</b> El contenido +18 es solo para personas adultas; por ahora se basa en una declaración.</li></ol>`;
function showPrivacy() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>Política de privacidad</h2><div class="terms">${PRIVACY}</div><button class="button" data-act="close-modal" style="width:100%;margin-top:14px">Entendido</button></div>`;
  document.body.appendChild(m);
}
function openReport() {
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="Reportar un problema"><button class="icon-btn close-x" data-x aria-label="Cerrar">✕</button><h2>Reportar un problema</h2><p class="helper">Cuéntanos qué pasó o qué se puede mejorar. Lo verá el equipo de moderación.</p>
  <textarea class="textarea" data-text maxlength="600" placeholder="Describe el problema…" style="margin-top:10px"></textarea><p class="error" data-err></p><button class="button" data-send style="width:100%;margin-top:6px">Enviar</button></div>`;
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = ev => { if (ev.target === m) m.remove(); };
  m.querySelector('[data-send]').onclick = () => {
    const text = m.querySelector('[data-text]').value.trim(); if (!text) { m.querySelector('[data-err]').textContent = 'Escribe qué pasó.'; return; }
    G.set('reports', [{ id: Date.now(), by: S.user, text, date: today() }, ...G.get('reports', [])]); m.remove(); toast('Gracias, recibimos tu reporte ✓');
  };
  document.body.appendChild(m);
}
const REASONS = ['Contenido sexual con menores', 'Contenido sexual explícito', 'Acoso, odio o amenazas', 'Violencia extrema', 'Plagio o copia', 'Spam o publicidad', 'Datos personales de alguien', 'Mal etiquetado (+18 o spoilers)', 'Otro motivo'];
const reportsAll = () => G.get('reports', []);
const openReports = () => reportsAll().filter(r => (r.status || 'open') === 'open').length;
function openReportFor(type, o) {
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="Reportar"><button class="icon-btn close-x" data-x aria-label="Cerrar">✕</button><h2>Reportar ${esc(o.label)}</h2><p class="helper">Marca lo que incumple las normas y, si quieres, cuéntanos más. Lo revisará el equipo de moderación.</p>
  <div class="rp-reasons">${REASONS.map((r, i) => `<label class="check"><input type="checkbox" value="${i}"><span>${esc(r)}</span></label>`).join('')}</div>
  <textarea class="textarea" data-text maxlength="600" placeholder="Explica qué pasó (opcional si marcaste un motivo)…" style="margin-top:8px"></textarea><p class="error" data-err></p><button class="button" data-send style="width:100%;margin-top:6px">Enviar reporte</button></div>`;
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = ev => { if (ev.target === m) m.remove(); };
  m.querySelector('[data-send]').onclick = () => {
    const reasons = [...m.querySelectorAll('input:checked')].map(i => REASONS[+i.value]), text = m.querySelector('[data-text]').value.trim();
    if (!reasons.length && !text) { m.querySelector('[data-err]').textContent = 'Marca un motivo o escribe qué pasó.'; return; }
    if (reportsAll().some(r => r.by === S.user && r.type === type && r.sid === o.sid && String(r.cid || '') === String(o.cid || '') && r.target === o.target && (r.status || 'open') === 'open')) { m.remove(); return toast('Ya reportaste esto: el equipo lo está revisando.'); }
    G.set('reports', [{ id: Date.now(), by: S.user, type, sid: o.sid || '', cid: o.cid || '', ci: o.ci, target: o.target || '', owner: o.owner || '', title: o.title || '', excerpt: String(o.excerpt || '').slice(0, 200), reasons, text, date: today(), status: 'open' }, ...reportsAll()]);
    Object.keys(getUsers()).filter(e => roleOf(e) !== 'USER' && e !== S.user).forEach(e => pushNotif(e, { type: 'sys', extra: 'Nuevo reporte por revisar: ' + o.label, href: '#/moderation/reports' }));
    m.remove(); toast('Gracias, recibimos tu reporte ✓');
  };
  document.body.appendChild(m);
}
let RFILT = 'open';
const RTYPE = { story: '📖 Obra', comment: '💬 Comentario', pcomment: '💬 Comentario de párrafo', user: '👤 Perfil', problem: '🛠 Problema' };
function rpSet(id, st) {
  if (!isStaff()) return; const l = reportsAll(), i = l.findIndex(r => String(r.id) === String(id)); if (i < 0) return;
  l[i] = st === 'open' ? { ...l[i], status: 'open', handledBy: '', handledDate: '' } : { ...l[i], status: st, handledBy: S.user, handledDate: today() };
  G.set('reports', l); logAction('report-' + st, l[i].owner || l[i].target || '', String(id)); KEEP = true; render();
}
function reportCard(r) {
  const ty = r.type || 'problem', open = (r.status || 'open') === 'open', owner = r.owner || '', s = r.sid ? findStory(r.sid) : null, td = r.sid && takedown().includes(r.sid);
  const ctx = ty === 'story' ? `<div class="rp-ctx"><b>${esc(r.title || (s && s.title) || 'Obra')}</b>${s ? ` · por ${esc(s.author || '')}${s.mature ? ' · +18' : ''}<div class="tags">${s.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ' · ya no está disponible'}${td ? '<div class="helper">🚩 Retirada de Descubrir</div>' : ''}</div>`
    : ty === 'comment' || ty === 'pcomment' ? `<div class="rp-ctx"><b>${esc(uName(owner))}</b> escribió: “${esc(r.excerpt || '')}”${ty === 'comment' && r.sid && !comments(r.sid).some(c => String(c.id) === String(r.cid)) ? '<div class="helper">Ese comentario ya no existe.</div>' : ''}</div>`
    : ty === 'user' ? `<div class="rp-ctx"><b>${esc(uName(r.target))}</b></div>` : '';
  const link = ty === 'story' && s ? `<a class="button secondary sm" href="#/story/${esc(r.sid)}" data-dir="next">📖 Ir a la obra</a>` : ty === 'comment' && s ? `<button class="button secondary sm" data-act="rp-comments" data-id="${esc(r.sid)}">📖 Ir al comentario</button>` : ty === 'pcomment' && s ? `<a class="button secondary sm" href="#/story/${esc(r.sid)}/${(+r.ci || 0) + 1}" data-dir="next">📖 Ir al párrafo</a>` : '';
  const who = ty === 'user' ? r.target : owner;
  return `<article class="panel rp ${open ? '' : 'done'}"><div class="rp-head"><span class="pill">${RTYPE[ty]}</span><span class="helper">${esc(r.date)} · reporta ${esc(uName(r.by))}</span></div>${ctx}
  ${(r.reasons || []).length ? `<div class="tags rp-why">${r.reasons.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}${r.text ? `<p class="rp-text">${esc(r.text)}</p>` : ''}
  <div class="rp-acts">${link}${who && getUsers()[who] ? `<a class="button ghost sm" href="#/user/${encodeURIComponent(who)}" data-dir="next">👤 Perfil</a>` : ''}
  ${open ? `${ty === 'story' && s ? (td ? `<button class="button secondary sm" data-act="td-off" data-id="${esc(r.sid)}">Restaurar</button>` : `<button class="button danger sm" data-act="td-on" data-id="${esc(r.sid)}">Retirar de Descubrir</button>`) : ''}${ty === 'comment' && r.sid && comments(r.sid).some(c => String(c.id) === String(r.cid)) ? `<button class="button danger sm" data-act="rp-delcomment" data-id="${esc(r.sid)}" data-cid="${esc(r.cid)}">Eliminar comentario</button>` : ''}${who && canAct(who) ? `<button class="button ghost sm" data-act="adm-strike" data-id="${esc(who)}">⚠️ Strike</button><button class="button ghost sm" data-act="adm-ban" data-id="${esc(who)}">🚫 Suspender</button>` : ''}
  <button class="button sm" data-act="rp-done" data-id="${r.id}">✓ Resuelto</button><button class="button ghost sm" data-act="rp-dismiss" data-id="${r.id}">Descartar</button>`
    : `<span class="helper">${r.status === 'dismissed' ? 'Descartado' : 'Resuelto'} por ${esc(uName(r.handledBy))} · ${esc(r.handledDate || '')}</span><button class="button ghost sm" data-act="rp-reopen" data-id="${r.id}">Reabrir</button>`}
  ${ty === 'problem' && open ? `<button class="icon-btn" data-act="report-del" data-id="${r.id}" aria-label="Eliminar reporte">${TRASH}</button>` : ''}</div></article>`;
}
function reportsView(tabs) {
  const all = reportsAll(), l = all.filter(r => ((r.status || 'open') === 'open') === (RFILT === 'open'));
  return `<main class="page story-layout">${tabs}<div class="section-head" style="margin-top:0"><div><span class="eyebrow">🚩 Reportes</span><h2 style="margin-top:8px">${RFILT === 'open' ? 'Por revisar' : 'Ya atendidos'} (${l.length})</h2><p>Abre la obra, analiza el caso y toma medidas. Todo queda en el registro.</p></div></div>
  <div class="filter-row"><button class="chip ${RFILT === 'open' ? 'active' : ''}" data-act="rp-filter" data-id="open">Abiertos (${openReports()})</button><button class="chip ${RFILT === 'done' ? 'active' : ''}" data-act="rp-filter" data-id="done">Atendidos</button></div>
  ${l.length ? l.map(reportCard).join('') : empty(RFILT === 'open' ? 'Sin reportes pendientes' : 'Nada atendido todavía', RFILT === 'open' ? 'Cuando alguien reporte una obra, un comentario o un perfil, aparecerá aquí.' : 'Los reportes resueltos o descartados se guardan aquí.')}</main>`;
}
const reportsPanel = () => { const l = G.get('reports', []); return l.length ? `<section class="panel" style="margin-top:20px"><h2>📨 Reportes (${l.length})</h2>${l.map(r => `<div class="comment"><div style="flex:1;min-width:0"><strong>${esc(uName(r.by))}</strong> <span class="helper">${esc(r.date)}</span><div style="overflow-wrap:anywhere">${esc(r.text)}</div></div><button class="icon-btn" data-act="report-del" data-id="${r.id}" aria-label="Eliminar reporte">${TRASH}</button></div>`).join('')}</section>` : ''; };

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
  const users = getUsers(), p = d.profile || {}, img = v => typeof v === 'string' && /^data:image\//.test(v);
  if (users[S.user]) { users[S.user] = { ...users[S.user], bio: String(p.bio || '').slice(0, 300), ...(img(p.avatar) ? { avatar: p.avatar } : {}), ...(img(p.banner) ? { banner: p.banner } : {}), ...(Array.isArray(p.interests) && p.interests.some(i => INTEREST_NAMES.includes(i)) ? { interests: p.interests.filter(i => INTEREST_NAMES.includes(i)) } : {}) }; G.set('users', users); }
  arr(x.lib).forEach(id => subscribe(id));
  loadUser(); toast(skipped ? `Datos importados (${skipped} historia(s) omitidas: ya existen en otra cuenta)` : 'Datos importados ✓'); render();
}
function wipeDevice() {
  const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('auri.')) ks.push(k); }
  ks.forEach(k => localStorage.removeItem(k));
  S.user = null; S.theme = 'light'; W = null; document.documentElement.classList.toggle('dark', false); closeMusic(); toast('Datos de este dispositivo borrados'); go('/login');
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
async function saveAccount() {
  const users = getUsers(), u = users[S.user]; if (!u) return;
  const name = $('#ac-name').value.trim(), email = $('#ac-email').value.trim().toLowerCase(), pass = $('#ac-pass').value;
  if (!name) return toast('Escribe un nombre de usuario.');
  if (email !== S.user) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Ingresa un correo válido.');
    if (users[email]) return toast('Ese correo ya tiene una cuenta.');
    if (S.user === OWNER_EMAIL) return toast('La cuenta Owner no puede cambiar de correo.');
    if (email === OWNER_EMAIL) return toast('Ese correo está reservado.');
    if (!pass || u.hash !== await sha(u.salt + pass)) return toast('Escribe tu contraseña actual para cambiar el correo.');
  }
  u.name = name; G.set('users', users);
  if (email !== S.user) renameUser(S.user, email);
  toast('Cuenta actualizada ✓'); render();
}
function deleteAccount() {
  const me = S.user, users = getUsers(); delete users[me]; G.set('users', users);
  const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(`auri.u.${me}.`)) ks.push(k); }
  ks.forEach(k => localStorage.removeItem(k)); localStorage.removeItem('auri.notifs.' + me);
  const fo = follows(); delete fo[me]; for (const k in fo) fo[k] = fo[k].filter(e => e !== me); G.set('follows', fo);
  const lk = G.get('likes', {}); for (const id in lk) lk[id] = lk[id].filter(e => e !== me); G.set('likes', lk);
  const cm = G.get('comments', {}); for (const id in cm) cm[id] = cm[id].filter(c => c.by !== me); G.set('comments', cm);
  const sb = subs(); for (const id in sb) sb[id] = sb[id].filter(e => e !== me); G.set('subs', sb);
  const nk = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('auri.notifs.')) nk.push(k); }
  nk.forEach(k => localStorage.setItem(k, JSON.stringify(LS.get(k, []).filter(n => n.from !== me))));
  S.user = null; localStorage.removeItem('auri.session'); W = null; closeMusic(); toast('Tu cuenta fue eliminada'); go('/login');
}

/* --- Pantalla de Ajustes --- */
const seg = (k, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" class="seg-b ${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-act="cfg" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
const sw = (k, on, label, help, locked) => `<div class="toggle-line"><div><strong>${label}</strong>${help ? `<div class="helper">${help}</div>` : ''}</div><button type="button" role="switch" class="switch" aria-checked="${on}" data-act="cfg-toggle" data-k="${k}" ${locked ? 'disabled' : ''} aria-label="${esc(label)}"></button></div>`;
/** Ajustes: una lista de botones (menú) y cada sección en su propia pantalla */
const CHEV = '<svg class="set-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function settingsView(secId) {
  const u = getUsers()[S.user] || {}, n = cfg('notif'), act = S.chars.find(c => c.id === S.activeId);
  const nOn = ['chapter', 'like', 'comment', 'follow'].filter(k => n[k]).length;
  const SECS = {
    apariencia: { ico: '🎨', c: '#8c5fc1', t: 'Apariencia', sub: `Tema ${({ light: 'claro', dark: 'oscuro', auto: 'automático' })[S.theme] || 'automático'} · Español`, body: () => `<section class="panel set-sec"><div class="set-row"><span>Tema</span>${seg('theme', [['light', '☀ Claro'], ['dark', '🌙 Oscuro'], ['auto', 'Automático']], S.theme)}</div>
      <div class="set-row"><span>Idioma</span><select class="select set-lang" aria-label="Idioma"><option value="es" selected>Español</option><option disabled>English — próximamente</option><option disabled>Português — próximamente</option><option disabled>Français — próximamente</option></select></div></section>` },
    lectura: { ico: '📖', c: '#3e8fd0', t: 'Lectura', sub: `Letra ${({ sm: 'pequeña', md: 'normal', lg: 'grande' })[cfg('fontSize')]} · ${cfg('font') === 'serif' ? 'con serifa' : 'sin serifa'}`, body: () => `<section class="panel set-sec"><div class="set-row"><span>Tamaño de letra</span>${seg('fontSize', [['sm', 'Pequeña'], ['md', 'Normal'], ['lg', 'Grande']], cfg('fontSize'))}</div>
      <div class="set-row"><span>Tipografía</span>${seg('font', [['serif', 'Con serifa'], ['sans', 'Sin serifa']], cfg('font'))}</div>
      <div class="set-row"><span>Interlineado</span>${seg('lh', [['compact', 'Compacto'], ['normal', 'Normal'], ['relaxed', 'Amplio']], cfg('lh'))}</div>
      <div class="set-row"><span>Comentarios en párrafos</span>${seg('pcom', [['tap', 'Al tocar'], ['dots', 'Con contador'], ['off', 'Desactivados']], cfg('pcom'))}</div>
      <p class="helper" style="margin:0 0 6px">«Al tocar» deja la lectura limpia: toca un párrafo y aparece «Comentar». «Con contador» muestra un número discreto en los párrafos que tienen comentarios.</p>
      <div class="set-row"><span>Spoilers en comentarios</span>${seg('spoilers', [['hide', 'Difuminar'], ['show', 'Mostrar']], cfg('spoilers'))}</div>
      <div class="read-prev"><p class="reader-text">Así se verá tu lectura. La luna asomó entre las nubes y el bosque guardó silencio.</p></div>
      <div class="set-row"><span>Música de los capítulos</span>${seg('music', [['ask', 'Preguntar siempre'], ['remember', 'Recordar mi elección']], cfg('music'))}</div>
      <p class="helper" style="margin:0 0 6px">«Recordar» abre sola la canción del capítulo si la última vez elegiste reproducirla (el navegador puede pedirte un toque antes).</p>
      ${sw('skipReadAs', cfg('skipReadAs'), 'Saltar «Leer como…»', `Usa siempre tu personaje activo${act ? ` (${esc(act.name)})` : ''}. Si no tienes uno activo, se te preguntará.`)}</section>` },
    contenido: { ico: '🔞', c: '#e0457b', t: 'Contenido +18', sub: isMinor(u) ? 'No disponible' : cfg('showMature') ? 'Visible' : 'Oculto', body: () => `<section class="panel set-sec">${sw('showMature', cfg('showMature'), 'Mostrar contenido +18', isMinor(u) ? 'No está disponible para cuentas menores de 18 años.' : 'Si lo apagas, las historias para adultos se ocultan en Inicio, búsquedas y bibliotecas. Tus propias obras siempre se ven.', isMinor(u))}</section>` },
    intereses: { ico: '🏷️', c: '#e09a2b', t: 'Tus intereses', sub: `${(u.interests || []).length} tema${(u.interests || []).length === 1 ? '' : 's'}`, body: () => `<section class="panel set-sec"><p class="helper" style="margin:0 0 4px">Los temas que te gustan (mínimo uno).</p>${interestChips(u.interests || [], 'int-set')}</section>` },
    bloqueos: { ico: '🚫', c: '#6b7280', t: 'Bloqueadas y silenciadas', sub: `${bl(S.user, 'blocked').length} bloqueadas · ${bl(S.user, 'muted').length} silenciadas`, body: () => {
      const row = (e, act, lab) => `<div class="cr-row"><span class="cr-rt">${userAvatar(e)} <b>${esc(uName(e))}</b></span><span class="cr-rb"><button class="button secondary sm" data-act="${act}" data-id="${esc(e)}">${lab}</button></span></div>`, b = bl(S.user, 'blocked'), m = bl(S.user, 'muted');
      return `<section class="panel set-sec"><h3>Bloqueadas</h3><p class="helper">No ves sus comentarios ni sus obras y no hay avisos entre ustedes.</p>${b.length ? b.map(e => row(e, 'unblock', 'Desbloquear')).join('') : '<p class="helper">No has bloqueado a nadie.</p>'}</section>
      <section class="panel set-sec"><h3>Silenciadas</h3><p class="helper">No ves sus comentarios ni recibes sus avisos, pero siguen pudiendo ver tu perfil.</p>${m.length ? m.map(e => row(e, 'unmute', 'Dejar de silenciar')).join('') : '<p class="helper">No has silenciado a nadie.</p>'}</section>`; } },
    notificaciones: { ico: '🔔', c: '#d9534f', t: 'Notificaciones', sub: `${nOn} de 4 activadas`, body: () => `<section class="panel set-sec">${sw('notif.chapter', n.chapter, 'Capítulos nuevos de mi biblioteca')}${sw('notif.like', n.like, 'Likes en mis obras')}${sw('notif.comment', n.comment, 'Comentarios en mis obras')}${sw('notif.follow', n.follow, 'Nuevos seguidores')}${sw('notif.mod', true, 'Avisos de moderación', 'Aprobado o rechazado, strikes e invitaciones: siempre activos.', true)}</section>` },
    datos: { ico: '💾', c: '#2f9e7a', t: 'Tus datos', sub: 'Exportar, importar, borrar', body: () => `<section class="panel set-sec"><p class="helper" style="margin:0 0 10px">Hoy tus datos viven en este navegador. Haz una copia para llevarlos a otro dispositivo o editor.</p>
      <div class="set-btns"><button class="button secondary" data-act="export-file">⬇ Exportar mis datos (archivo)</button><button class="button secondary" data-act="export-copy">📋 Copiar mis datos</button>
      <label class="button secondary" style="cursor:pointer">⬆ Importar desde archivo<input id="import-file" type="file" accept="application/json,.json" hidden></label>
      <button class="button danger" data-act="wipe-device">🗑 Borrar datos de este dispositivo</button></div></section>` },
    cuenta: { ico: '👤', c: '#5b6ee1', t: 'Cuenta', sub: S.user, body: () => `<section class="panel set-sec"><div class="form-grid" style="grid-template-columns:1fr"><div class="form-group"><label for="ac-name">Nombre de usuario</label><input id="ac-name" class="field" maxlength="30" value="${esc(u.name || '')}"></div>
      <div class="form-group"><label for="ac-email">Correo</label><input id="ac-email" type="email" class="field" value="${esc(S.user)}"></div>
      <div class="form-group"><label for="ac-pass">Contraseña actual</label><input id="ac-pass" type="password" class="field" autocomplete="current-password" placeholder="Solo para cambiar el correo"></div></div>
      <button class="button" style="margin-top:12px;width:100%" data-act="acct-save">Guardar cambios de cuenta</button></section>
      <section class="panel set-sec danger-zone"><h2>⚠️ Zona de peligro</h2><p class="helper" style="margin:8px 0 12px">Eliminar tu cuenta borra tus historias (publicadas, en revisión y borradores), biblioteca, personajes, comentarios, likes y seguidores. No se puede deshacer.</p><button class="button danger" data-act="acct-delete">Eliminar cuenta</button></section>` },
    acerca: { ico: 'ℹ️', c: '#7a869a', t: 'Acerca de', sub: `Versión ${APP_VERSION}`, body: () => `<section class="panel set-sec"><div class="set-btns"><button class="button secondary" data-act="terms">Términos y condiciones</button><button class="button secondary" data-act="privacy">Política de privacidad</button><button class="button secondary" data-act="report">Reportar un problema</button></div><p class="helper" style="margin:14px 0 0;text-align:center">Auri · versión ${APP_VERSION}</p></section>` }
  };
  if (secId && SECS[secId]) {                                    // pantalla de una sección
    const x = SECS[secId];
    return `<main class="page story-layout settings"><div class="set-head"><button class="icon-btn" data-act="set-back" aria-label="Volver a Ajustes">‹</button><h2><span class="set-ico" style="--c:${x.c}">${x.ico}</span>${x.t}</h2></div>${x.body()}</main>`;
  }
  const item = id => { const x = SECS[id]; return `<a class="set-item" href="#/settings/${id}" data-dir="next"><span class="set-ico" style="--c:${x.c}">${x.ico}</span><span class="set-txt"><b>${x.t}</b><small>${esc(x.sub)}</small></span>${CHEV}</a>`; };
  const group = (t, ids) => `<h3 class="set-group">${t}</h3><div class="set-list">${ids.map(item).join('')}</div>`;
  const role = ROLE_LABEL[roleOf(S.user)];
  return `<main class="page story-layout settings"><div class="set-head"><button class="icon-btn" data-act="settings-back" aria-label="Volver">‹</button><h2>Ajustes</h2></div>
  <a class="set-me" href="#/profile" data-dir="next">${userAvatar(S.user, 'big')}<span class="set-txt"><b>${esc(u.name || 'Mi cuenta')}</b><small>${esc(S.user)}</small>${role ? `<em class="role-tag ${roleOf(S.user).toLowerCase()}">🛡 ${role}</em>` : ''}</span>${CHEV}</a>
  ${group('Cuenta', ['cuenta', 'intereses', 'bloqueos'])}${group('Preferencias', ['apariencia', 'lectura', 'contenido', 'notificaciones'])}${group('Datos y ayuda', ['datos', 'acerca'])}
  <button class="button danger set-logout" data-act="logout">Cerrar sesión</button></main>`;
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
const moreNotice = (s, inLib) => `${s.phase === 'paused' ? 'Esta historia está en pausa. ' : ''}${inLib ? 'Próximamente habrá más capítulos, te avisaremos cuando el autor publique.' : 'Próximamente habrá más capítulos. Guarda el libro en tu biblioteca y te avisaremos cuando el autor publique.'}`;
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
  return `<nav class="saga-nav" aria-label="Partes de la saga">${arrow(parts[i - 1], `◀ Parte ${i}`, 'l')}<span class="saga-now">Saga · Parte ${i + 1} de ${parts.length}</span>${arrow(parts[i + 1], `Parte ${i + 2} ▶`, 'r')}</nav>`;
}
function sagaBox() {                              // solo existe si la persona ya tiene al menos otro libro
  if (!S.stories.some(x => x.id !== W.id)) return '';
  const c = sagaCandidates(W);
  return `<div class="form-group full"><details class="saga-box" ${W.prev ? 'open' : ''}><summary>🔗 Agrupar libro / Vincular como secuela</summary>${c.length
    ? `<label for="w-prev" class="helper" style="display:block;margin:10px 0 6px">¿De cuál de tus libros es secuela este libro?</label><select id="w-prev" class="select"><option value="">No agrupar</option>${c.map(x => `<option value="${esc(x.id)}" ${W.prev === x.id ? 'selected' : ''}>${esc(x.title || 'Sin título')}</option>`).join('')}</select><span class="helper">Los lectores podrán pasar de una parte a la otra.</span>`
    : '<p class="helper" style="margin-top:10px">No hay libros disponibles: cada libro solo puede tener una secuela.</p>'}</details></div>`;
}
function libRow(s, i) {                           // fila de la biblioteca / colecciones con barra de progreso
  const p = bookProgress(s), ph = s.phase || 'ongoing', id = esc(s.id);
  const acts = TAB === 'col' ? `<button class="button ghost sm" data-act="col-del" data-id="${id}">Quitar de colecciones</button>`
    : p.finished ? `<button class="button secondary sm" data-act="lib-del" data-id="${id}">🗑️ Borrar de la biblioteca</button><button class="button sm" data-act="col-add" data-id="${id}">⭐ Guardar en colecciones</button>`
    : `<button class="icon-btn" data-act="lib-del" data-id="${id}" aria-label="Quitar de la biblioteca" title="Quitar de la biblioteca">🗑</button>`;
  return `<article class="row-card">${coverHTML(s, i)}<div class="row-info"><a href="#/story/${id}"><strong class="serif">${esc(s.title)}</strong></a>
    <div class="story-meta">${esc(s.author || '')} · <span class="pill ph-${ph}">${PHASE[ph]}</span></div><div class="pbar"><i data-key="b-${esc(s.id)}" data-w="${p.pct}" style="width:${p.pct}%"></i></div>
    <div class="story-meta"><b class="plabel ${p.finished ? 'done' : p.caught ? 'caught' : ''}">${p.label}</b>${!p.caught && p.done ? ` · ${p.left} por leer` : ''} · ${p.done}/${p.total} cap.</div>
    ${p.caught && !p.finished && TAB === 'lib' ? `<p class="notice">${esc(moreNotice(s, true))}</p>` : ''}
    <div class="card-footer" style="justify-content:flex-start;flex-wrap:wrap"><a class="button secondary sm" href="#/story/${id}">Abrir</a>${acts}</div></div></article>`;
}
let TAB = 'lib';
function libraryView() {
  const drafts = S.stories.filter(s => s.chapters.some(c => c.status !== 'approved')), pubIds = publishedStories().map(s => s.id), all = publishedStories().concat(drafts.filter(d => !pubIds.includes(d.id)).map(d => ({ ...d, owner: S.user, author: userName() }))).filter(matureOK);
  const lists = { lib: all.filter(s => S.lib.includes(s.id)), col: all.filter(s => S.cols.includes(s.id)), fav: all.filter(s => S.favs.includes(s.id)), read: all.filter(s => S.progress[s.id]), draft: drafts };
  const l = lists[TAB], tabs = [['lib', 'Mi biblioteca'], ['col', 'Colecciones'], ['fav', 'Favoritos'], ['read', 'Progreso de lectura'], ['draft', 'Borradores y revisión']];
  const body = !l.length ? empty(TAB === 'draft' ? 'Aún no tienes borradores' : 'Este estante está vacío', 'Cuando guardes historias aparecerán aquí.', `<a class="button secondary" href="${TAB === 'draft' ? '#/write' : '#/'}">${TAB === 'draft' ? 'Escribir una historia' : 'Buscar una historia'}</a>`)
    : `<div class="story-grid">${l.map((s, i) => TAB === 'draft' ? `<article class="row-card">${coverHTML(s, i)}<div class="row-info"><a href="#/write/${esc(s.id)}/chapters"><strong class="serif">${esc(s.title || 'Sin título')}</strong></a>
      <div class="story-meta">${STATUS[storyState(s)]} · ${s.chapters.length} cap. · actualizado el ${esc(s.updatedAt)} ${s.mature ? '<span class="dot18" style="display:inline-grid;vertical-align:middle">+18</span>' : ''}</div>${statusNote(s) ? `<p class="notice">${esc(statusNote(s))}</p>` : ''}
      <div class="card-footer" style="justify-content:flex-start"><a class="button secondary sm" href="#/write/${esc(s.id)}/chapters">Seguir escribiendo</a>${storyState(s) !== 'published' ? `<button class="icon-btn" data-act="delete" data-id="${esc(s.id)}" aria-label="Eliminar">🗑</button>` : ''}</div></div></article>` : TAB === 'lib' || TAB === 'col' ? libRow(s, i) : storyCard(s, i)).join('')}</div>`;
  return `<main class="page"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">Tus estantes</span><h2 style="margin-top:8px">Un lugar para lo que te gusta</h2></div><a class="button" href="#/write">Empezar a escribir</a></div>
  <div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button class="tab ${TAB === k ? 'active' : ''}" data-act="tab" data-id="${k}">${n}</button>`).join('')}</div>${body}</main>`;
}

/* --- Comentarios --- */
let EDITC = null;   // id del comentario que se está editando
function updateComments(sid, fn) { const all = G.get('comments', {}); all[sid] = fn(all[sid] || []); G.set('comments', all); }
let REPLYTO = null, REPLYPRE = ''; const REPOPEN = new Set();        // hilo donde estás respondiendo · hilos con las respuestas abiertas
const ICO_REPLY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12c0 4.4-4 8-9 8-1.2 0-2.3-.2-3.3-.5L3 21l1.6-4.3C3.6 15.5 3 13.8 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></svg>';
const ICO_SEND = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const authLike = (x, s) => (x.lk || []).includes(s.owner) && x.by !== s.owner ? `<span class="c-authlike">${HEART}Le gustó a la autoría</span>` : '';
let MENUC = null;                                      // comentario con el menú «⋯» abierto
function cmRow(x, s, sub, extra = '') {
  const mine = x.by === S.user, lk = x.lk || [], liked = lk.includes(S.user), top = sub ? x.parent : x.id, role = ROLE_LABEL[roleOf(x.by)];
  const menu = MENUC === x.id ? `<div class="c-menu" role="menu">${mine ? `<button type="button" role="menuitem" data-act="c-edit" data-cid="${x.id}">Editar</button>` : `<button type="button" role="menuitem" data-act="report-comment" data-id="${esc(s.id)}" data-cid="${x.id}">Reportar</button>`}${mine || isAdmin() ? `<button type="button" role="menuitem" class="danger-link" data-act="c-del" data-id="${esc(s.id)}" data-cid="${x.id}">Eliminar</button>` : ''}</div>` : '';
  return `<div class="comment ${sub ? 'reply' : ''} ${x.by === s.owner ? 'by-own' : ''}" id="cm-${x.id}">${userAvatar(x.by)}<div class="c-main">
    <div class="c-bubble"><div class="c-meta"><a href="#/user/${encodeURIComponent(x.by)}"><strong>${esc(uName(x.by))}</strong></a>${x.by === s.owner ? '<span class="c-badge own">Autoría</span>' : ''}${role ? `<span class="c-badge staff">${esc(role)}</span>` : ''}${relSpan(x)}${x.edited ? '<span class="c-ed">· editado</span>' : ''}
      <span class="c-more-wrap"><button type="button" class="c-more" data-act="c-more" data-cid="${x.id}" aria-label="Más opciones" aria-expanded="${MENUC === x.id}">⋯</button>${menu}</span></div>
    ${EDITC === x.id ? `<textarea id="c-edit-text" class="textarea" style="min-height:70px;margin-top:6px" maxlength="300">${esc(x.text)}</textarea><div class="c-actions"><button class="button sm" data-act="c-save" data-id="${esc(s.id)}" data-cid="${x.id}">Guardar</button><button class="button ghost sm" data-act="c-cancel">Cancelar</button></div>` : `<div class="c-text">${esc(x.text)}</div>`}</div>
    ${EDITC === x.id ? '' : `<div class="c-actions"><button type="button" class="c-heart ${liked ? 'on' : ''}" data-act="c-like" data-id="${esc(s.id)}" data-cid="${x.id}" aria-pressed="${liked}" aria-label="${liked ? 'Quitar me gusta' : 'Me gusta'}">${HEART}<span class="c-n">${lk.length || ''}</span></button><button type="button" class="c-act" data-act="c-reply" data-top="${top}" data-pre="${sub ? esc('@' + uName(x.by) + ' ') : ''}">${ICO_REPLY}Responder</button>${authLike(x, s)}</div>`}${extra}</div></div>`;
}
function commentsHTML(s) {
  const all = comments(s.id).filter(c => !hidesFrom(c.by)), tops = all.filter(c => !c.parent);
  return `<section class="panel" style="margin-top:20px"><h2>Comentarios (${all.length})</h2>
  <form data-form="comment" data-id="${esc(s.id)}" class="c-compose">${userAvatar(S.user)}<div class="c-pill"><input id="c-text" maxlength="300" placeholder="Escribe un comentario…" aria-label="Escribe un comentario" autocomplete="off"><button class="c-send" type="submit" aria-label="Enviar comentario">${ICO_SEND}</button></div></form>
  ${tops.length ? tops.map(x => {
    const reps = all.filter(r => r.parent === x.id), open = REPOPEN.has(x.id);
    const rf = REPLYTO === x.id ? `<form data-form="reply" data-id="${esc(s.id)}" data-cid="${x.id}" class="c-replyform">${userAvatar(S.user)}<div class="c-pill"><input id="c-reply-text" maxlength="300" value="${esc(REPLYPRE)}" placeholder="Escribe una respuesta…" aria-label="Tu respuesta" autocomplete="off"><button class="c-send" type="submit" aria-label="Enviar respuesta">${ICO_SEND}</button></div><button type="button" class="c-act" data-act="c-reply-cancel">Cancelar</button></form>` : '';
    const tg = reps.length ? `<button type="button" class="c-rtoggle" data-act="c-replies" data-cid="${x.id}" aria-expanded="${open}"><i class="c-line"></i>${open ? 'Ocultar respuestas' : `Ver las respuestas (${reps.length})`}</button>` : '';
    return cmRow(x, s, false, `${tg}${open ? `<div class="c-replies">${reps.map(r => cmRow(r, s, true)).join('')}</div>` : ''}${rf}`);
  }).join('') : '<p class="helper">Sé la primera persona en comentar.</p>'}</section>`;
}

/* --- Mi perfil / perfil de otra persona --- */
const likesReceived = e => publishedStories().filter(s => s.owner === e).reduce((a, s) => a + likes(s.id).length, 0);
/** Portada del perfil con desvanecimiento inferior; encima, solo las cantidades */
function profileHero(e, own) {
  const u = getUsers()[e] || {}, pubs = publishedStories().filter(s => s.owner === e), has = typeof u.banner === 'string' && /^data:image\//.test(u.banner);
  const stat = (n, l) => `<span class="pf-stat"><b>${n}</b><small>${l}</small></span>`;
  return `<section class="pf-hero"><div class="pf-banner" ${has ? `style="background-image:url('${esc(u.banner)}')"` : ''}>
    ${own ? `<div class="pf-bn-btns"><label class="button secondary sm" style="cursor:pointer">🖼 ${has ? 'Cambiar portada' : 'Añadir portada'}<input id="bn-file" type="file" accept="image/*" hidden></label>${has ? '<button class="button ghost sm" data-act="bn-clear">Quitar</button>' : ''}</div>` : ''}
    <div class="pf-fade"></div>
    <div class="pf-stats4">${stat(followers(e).length, 'Seguidores')}${stat(likesReceived(e), 'Likes')}${stat(pubs.length, 'Libros')}${stat(following(e).length, 'Siguiendo')}</div></div></section>`;
}
const worksGrid = list => list.length ? `<div class="story-grid">${list.map(storyCard).join('')}</div>` : empty('Aún no hay obras publicadas', 'Cuando se publique una historia aparecerá aquí.', '<a class="button secondary" href="#/write">Escribir una historia</a>');
const profileExtras = () => isStaff() ? `<section class="panel" style="margin-top:22px"><div class="toggle-line" style="border:0;margin:0;padding:0"><div><strong>🛡 Moderación</strong><div class="helper">Capítulos por revisar${pendingBooks().length ? ` (${pendingBooks().length} libro(s))` : ''}. Reportes abiertos: ${openReports()}.</div></div><a class="button secondary" href="#/moderation${openReports() && !pendingBooks().length ? '/reports' : ''}">Abrir</a></div></section>` : '';
function readersOf(sid, owner) {
  const us = LS.get('auri.users', {}), out = [];
  for (const e in us) { if (e === owner) continue; const p = LS.get('auri.u.' + e + '.progress', {})[sid], r = Array.isArray(p) ? p : p ? [0] : [];
    out.push({ e, r, lib: LS.get('auri.u.' + e + '.lib', []).includes(sid), fav: LS.get('auri.u.' + e + '.favs', []).includes(sid) }); }
  return out;
}
function statsView() {
  const back = '<a class="button ghost sm" href="#/profile" data-dir="prev">‹ Mi perfil</a>';
  const books = S.stories.map(s => ({ s, ps: publicPrefix(s.chapters) })).filter(x => x.ps.length).map(({ s, ps }) => {
    const R = readersOf(s.id, S.user), rd = R.filter(x => x.r.length), n = ps.length, per = ps.map((_, i) => rd.filter(x => x.r.includes(i)).length);
    let worst = -1, drop = 0; for (let i = 1; i < n; i++) if (per[i - 1] - per[i] > drop) { drop = per[i - 1] - per[i]; worst = i; }
    return { s, n, rd, per, fin: rd.filter(x => x.r.includes(n - 1)).length, libs: R.filter(x => x.lib).length, favs: R.filter(x => x.fav).length, lk: likes(s.id).length, cm: comments(s.id).length, worst, drop, ps };
  });
  if (!books.length) return `<main class="page story-layout">${back}${empty('Aún no hay estadísticas', 'Cuando tengas una obra aprobada, aquí verás quién la lee, hasta dónde llegan y qué les gusta.', '<a class="button" href="#/write">Escribir una historia</a>')}</main>`;
  const uniq = new Set(); books.forEach(b => b.rd.forEach(x => uniq.add(x.e)));
  const sum = k => books.reduce((a, b) => a + b[k], 0), card = (n, l) => `<div class="st-card"><b>${n}</b><span>${l}</span></div>`;
  return `<main class="page story-layout">${back}<div class="section-head"><div><span class="eyebrow">📊 Estadísticas</span><h2 style="margin-top:8px">Tus lectores</h2><p>Qué pasa con tus obras publicadas.</p></div></div>
  <div class="st-cards">${card(uniq.size, 'lectores')}${card(sum('lk'), 'likes')}${card(sum('cm'), 'comentarios')}${card(sum('libs'), 'en bibliotecas')}</div>
  ${books.map(b => { const mx = Math.max(1, ...b.per); return `<section class="panel st-book"><h3 class="serif">${esc(b.s.title)}</h3>
    <div class="st-mini"><span>👀 ${b.rd.length} lector${b.rd.length === 1 ? '' : 'es'}</span><span>🏁 ${b.fin} terminaron</span><span>📚 ${b.libs} en biblioteca</span><span>♥ ${b.favs} favoritos</span><span>👍 ${b.lk}</span><span>💬 ${b.cm}</span></div>
    <h4>Lectores por capítulo</h4>${b.ps.map((c, i) => `<div class="st-row"><span class="st-l">Cap. ${i + 1}</span><span class="st-bar"><i style="width:${Math.round(b.per[i] / mx * 100)}%"></i></span><span class="st-n">${b.per[i]}</span></div>`).join('')}
    ${b.worst > 0 && b.drop > 0 ? `<p class="helper">La mayor caída es entre el capítulo ${b.worst} y el ${b.worst + 1}: ${b.drop} lector${b.drop === 1 ? '' : 'es'} menos. Quizá valga la pena revisar ese tramo.</p>` : ''}</section>`; }).join('')}
  <p class="notice">Por ahora se cuentan solo las cuentas de este dispositivo. Con el servidor se sumarán todas las lecturas.</p></main>`;
}
function profileView() {
  const u = getUsers()[S.user] || {}, works = S.stories.filter(s => storyState(s) !== 'draft').map(s => ({ ...s, owner: S.user, author: u.name }));
  const sk = strikesOf(S.user), role = ROLE_LABEL[roleOf(S.user)];
  return `<main class="page">${profileHero(S.user, true)}${sk.length ? `<a class="strike-line" href="#/strike/${esc(sk[sk.length - 1].id)}">⚠️ Tienes ${sk.length} strike${sk.length === 1 ? '' : 's'} · ver detalle</a>` : ''}<div class="panel pf-edit"><div class="pf-top"><div class="pf-photo">${frWrap(S.user, 'xl', avatarHTML(u.avatar, u.name, 'xl'))}</div>
  <div class="pf-title"><h2 class="serif">${esc(u.name || 'Mi perfil')}</h2>${role ? `<span class="role-tag ${roleOf(S.user).toLowerCase()}">🛡 ${role}</span>` : ''}
  <div class="pf-btns"><label class="button secondary sm" style="cursor:pointer">📷 ${u.avatar ? 'Cambiar foto' : 'Añadir foto'}<input id="av-file" type="file" accept="image/*" hidden></label>${u.avatar ? '<button class="button ghost sm" data-act="av-clear">Quitar foto</button>' : ''}${isOwner() ? `<button class="button ghost sm" data-act="owner-frame">${u.frameOn === false ? 'Ponerme el marco' : 'Quitar marco'}</button>` : ''}</div></div></div>
  <form data-form="myprofile" class="pf-form"><div class="form-group"><label for="pf-name">Usuario</label><input id="pf-name" class="field" maxlength="30" value="${esc(u.name)}"></div>
  <div class="form-group"><label for="pf-bio">Biografía</label><textarea id="pf-bio" class="textarea" maxlength="300" placeholder="Cuéntales algo sobre ti…">${esc(u.bio || '')}</textarea></div>
  <button class="button" type="submit">Guardar perfil</button></form></div>
  <div class="section-head"><h2>Mis obras</h2><span style="display:flex;gap:8px"><a class="button ghost sm" href="#/stats" data-dir="next">📊 Estadísticas</a><a class="button sm" href="#/write">＋ Nueva</a></span></div>${worksGrid(works)}
  ${charsSection()}${profileExtras()}</main>`;
}
function userView(e) {
  const u = getUsers()[e];
  if (!u) return `<main class="page">${empty('Perfil no encontrado', 'Esta persona no existe en este dispositivo.', '<a class="button" href="#/">Volver</a>')}</main>`;
  const works = publishedStories().filter(s => s.owner === e && matureOK(s)), fl = following(S.user).includes(e);
  return `<main class="page">${profileHero(e, false)}<div class="profile-head panel"><div class="pf-avatar">${frWrap(e, 'xl', avatarHTML(u.avatar, u.name, 'xl'))}</div>
  <div class="pf-form"><h2 class="serif" style="font-size:27px;margin:0">${esc(u.name)}</h2>${ROLE_LABEL[roleOf(e)] ? `<span class="role-tag ${roleOf(e).toLowerCase()}">🛡 ${ROLE_LABEL[roleOf(e)]}</span>` : ''}<p style="color:var(--soft);line-height:1.6;margin:0">${esc(u.bio || 'Esta persona aún no escribió su biografía.')}</p>
  <button class="button ${fl ? 'secondary' : ''}" data-act="follow" data-id="${esc(e)}">${fl ? 'Siguiendo ✓' : '＋ Seguir'}</button>
  <div class="pf-more"><button class="button ghost sm" data-act="${iMute(e) ? 'unmute' : 'mute'}" data-id="${esc(e)}">${iMute(e) ? '🔔 Dejar de silenciar' : '🔇 Silenciar'}</button><button class="button ghost sm" data-act="${iBlock(e) ? 'unblock' : 'block'}" data-id="${esc(e)}">${iBlock(e) ? '✅ Desbloquear' : '🚫 Bloquear'}</button><button class="button ghost sm" data-act="report-user" data-id="${esc(e)}">Reportar</button></div></div></div>
  ${admMenu(e)}<div class="section-head"><h2>Obras de ${esc(u.name)}</h2></div>${worksGrid(works)}</main>`;
}

/* --- Strikes, suspensión y menú de administración --- */
function strikeView(id) {
  const all = strikesOf(S.user), i = all.findIndex(s => s.id === id), s = all[i];
  if (!s) return `<main class="page">${empty('Strike no encontrado', 'Este aviso ya no está disponible.', '<a class="button" href="#/">Volver</a>')}</main>`;
  return `<main class="page story-layout"><div class="panel strike-card"><div class="end-emoji">⚠️</div><h2 class="serif" style="text-align:center;margin:0 0 4px">Has recibido un strike</h2><p class="helper" style="text-align:center">${esc(s.date.slice(0, 10))}</p>
  <h3>Motivo indicado por la administración</h3><blockquote class="strike-reason">${esc(s.reason)}</blockquote>
  <div class="strike-count"><b>${all.length}</b><span>${all.length === 1 ? 'strike acumulado' : 'strikes acumulados'}</span></div>
  ${all.length > 1 ? `<h3>Historial</h3>${all.map((x, k) => `<p class="helper"><b>${k + 1}.</b> ${esc(x.date.slice(0, 10))} — ${esc(x.reason)}</p>`).join('')}` : ''}
  <p class="helper">Si crees que es un error, puedes escribirle a la administración de Auri Studios.</p><a class="button" href="#/">Entendido</a></div></main>`;
}
function bannedView() {
  const b = activeBan(S.user);
  return `<main class="qz-wrap"><div class="qz-card" style="justify-content:center;text-align:center"><div class="end-emoji">🚫</div><h1>Cuenta suspendida</h1>
  <p class="helper">${b.until ? `Tu cuenta está suspendida hasta el ${esc(b.until.slice(0, 10))}.` : 'Tu cuenta está suspendida de forma permanente.'}</p><blockquote class="strike-reason">${esc(b.reason)}</blockquote>
  <button class="button ghost" data-act="logout" style="margin-top:16px">Cerrar sesión</button></div></main>`;
}
/** Ventana con formulario: onYes(modal) devuelve un texto de error (se muestra dentro) o '' para cerrar */
function formModal(title, body, yes, onYes, danger) {
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>${body}<p class="error-line" data-err role="alert"></p><div style="display:flex;gap:10px;margin-top:14px"><button class="button ghost" data-no style="flex:1">Cancelar</button><button class="button ${danger ? 'danger' : ''}" data-yes style="flex:1">${esc(yes)}</button></div></div>`;
  m.querySelector('[data-no]').onclick = () => m.remove();
  m.querySelector('[data-yes]').onclick = () => { const r = onYes(m); if (r) { m.querySelector('[data-err]').textContent = r; return; } m.remove(); };
  document.body.appendChild(m); return m;
}
function openStrikeForm(t) {
  if (!canAct(t)) return;
  formModal('Dar strike a ' + uName(t), `<p class="helper">La persona recibirá una notificación y verá este motivo.</p><textarea class="textarea" data-reason maxlength="500" placeholder="Escribe el motivo del strike…"></textarea>`, 'Dar strike',
    m => { const e = giveStrike(t, m.querySelector('[data-reason]').value); if (!e) { toast('Strike enviado'); KEEP = true; render(); } return e; }, true);
}
function openBanForm(t) {
  if (!canAct(t)) return;
  formModal('Suspender a ' + uName(t), `<div class="form-group"><label>Duración</label><select class="select" data-days><option value="1">1 día</option><option value="7" selected>7 días</option><option value="30">30 días</option><option value="0">Permanente</option></select></div><textarea class="textarea" data-reason maxlength="500" placeholder="Motivo de la suspensión…"></textarea>`, 'Suspender',
    m => { const e = applyBan(t, m.querySelector('[data-days]').value, m.querySelector('[data-reason]').value); if (!e) { toast('Cuenta suspendida'); KEEP = true; render(); } return e; }, true);
}
const TERMS_MOD = ['Usaré las herramientas de moderación solo para proteger a la comunidad, nunca por motivos personales.', 'Trataré con respeto y de forma imparcial a todas las personas, sin favoritismos.', 'Mantendré la confidencialidad de la información a la que acceda por mi rol.',
  'Los strikes y suspensiones que aplique quedan registrados y pueden ser revisados por la Owner.', 'Entiendo que la Owner puede retirar mi rol en cualquier momento.'];
const TERMS_ADM = ['Usaré mis permisos de administración con responsabilidad y solo para proteger a la comunidad.', 'Publicaré anuncios claros, veraces y respetuosos en nombre de Auri Studios.', 'Revisaré los capítulos de forma imparcial y explicaré el motivo cuando rechace uno.',
  'Puedo descender a personas moderadoras, pero no ascender a nadie: eso corresponde a la Owner.', 'Mantendré la confidencialidad de la información a la que acceda por mi rol.', 'Entiendo que la Owner puede retirar mi rol en cualquier momento.'];
function openAcceptMod(nid) {
  const inv = myInvite(nid); if (!inv) return toast('Esta invitación ya no está disponible.');
  const adm = inv.role === 'ADMIN', list = adm ? TERMS_ADM : TERMS_MOD;
  const m = formModal(adm ? 'Términos de Administración' : 'Términos de Moderación', `<ul class="terms">${list.map(t => `<li>${esc(t)}</li>`).join('')}</ul><label class="check-line"><input type="checkbox" data-ok> <span>${adm ? 'Acepto los Términos de Administración de Auri Studios' : 'Confirmo que soy mayor de edad (18+ años) y acepto los Términos de Moderación de Auri Studios'}</span></label>`, 'Confirmar',
    mm => { if (!mm.querySelector('[data-ok]').checked) return 'Debes marcar la casilla para continuar.'; const e = acceptInvite(nid); if (!e) { KEEP = true; render(); showModOverlay(); } return e; });
  const b = m.querySelector('[data-yes]'), c = m.querySelector('[data-ok]'); b.disabled = true; c.onchange = () => { b.disabled = !c.checked; };
}
let MODOV = null;
/** Pantalla de felicitación: el marco es obligatorio (sin cerrar ni cancelar) y no se puede quitar después */
function showModOverlay() {
  const role = roleOf(S.user), adm = role === 'ADMIN'; if (MODOV || (role !== 'MODERATOR' && !adm) || (getUsers()[S.user] || {}).frameWorn) return;
  const o = MODOV = document.createElement('div'); o.className = 'mod-ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="mod-ov-box"><div class="end-emoji">🎉</div><h1>¡Felicidades!</h1><p>${adm ? 'Ya eres parte de la administración de <b>Auri Studios</b>' : 'Ya eres moderador en <b>Auri Studios</b>'}</p><div class="mod-ov-av"><span class="fr xl ${adm ? 'adm' : 'mod'}">${userAvatar(S.user, 'xl')}${frameImg(adm ? FRAME_ADM : FRAME_MOD, 'off')}</span></div><p class="helper">Este marco es parte de tu rol: es obligatorio y no se puede quitar.</p><button class="button" data-wear>Ponerme el marco</button></div>`;
  const btn = o.querySelector('[data-wear]'), img = o.querySelector('.fr-img');
  img.addEventListener('error', () => { img.style.display = 'none'; o.querySelector('.fr').classList.add('fr-fallback'); });
  btn.onclick = () => {
    btn.disabled = true; img.classList.remove('off'); o.classList.add('worn'); btn.textContent = '¡Listo!';
    const us = getUsers(); if (us[S.user]) { us[S.user].frameWorn = true; G.set('users', us); }
    setTimeout(() => { o.classList.add('bye'); setTimeout(() => { o.remove(); MODOV = null; KEEP = true; render(); }, 380); }, 1300);
  };
  document.body.appendChild(o);
}
/** Menú de Administración (solo se dibuja si quien mira tiene permiso sobre esa cuenta) */
function admMenu(t) {
  if (!canAct(t)) return '';
  const st = strikesOf(t).length, ban = activeBan(t), r = roleOf(t), up = isOwner();
  const canDown = (up && (r === 'MODERATOR' || r === 'ADMIN')) || (isAdm() && r === 'MODERATOR');
  const tst = isOwner() && (getUsers()[t] || {}).test ? `<div class="adm-test"><b>🧪 Cuenta de prueba</b>${r !== 'MODERATOR' ? '<button class="adm-item" data-act="test-role" data-id="' + esc(t) + '" data-role="MODERATOR">🛡 Poner como moderadora (directo)</button>' : ''}${r !== 'ADMIN' ? '<button class="adm-item" data-act="test-role" data-id="' + esc(t) + '" data-role="ADMIN">⭐ Poner como administración (directo)</button>' : ''}${r !== 'USER' ? '<button class="adm-item" data-act="test-role" data-id="' + esc(t) + '" data-role="USER">👤 Volver a usuaria normal</button>' : ''}<small class="helper">Para verla como esa persona: cierra sesión y entra con ${esc(TEST_EMAIL)} / ${esc(TEST_PASS)}.</small></div>` : '';
  return `<section class="panel adm" aria-label="Administración"><div class="toggle-line" style="border:0;margin:0;padding:0"><div><strong>🛡 Administración</strong><div class="helper">${st} strike${st === 1 ? '' : 's'} · ${ban ? 'suspendida' : 'cuenta activa'}${r === 'MODERATOR' ? ' · moderación' : r === 'ADMIN' ? ' · administración' : ''}</div></div><button class="button secondary sm" data-act="adm-toggle" aria-expanded="false">Opciones ▾</button></div>
  <div class="adm-list" hidden><button class="adm-item" data-act="adm-strike" data-id="${esc(t)}">⚠️ Dar strike</button>
  ${ban ? `<button class="adm-item" data-act="adm-unban" data-id="${esc(t)}">✅ Levantar suspensión</button>` : `<button class="adm-item danger" data-act="adm-ban" data-id="${esc(t)}">🚫 Banear / suspender cuenta</button>`}
  ${up && r === 'USER' ? `<button class="adm-item" data-act="adm-mod" data-id="${esc(t)}">🛡 Hacer moderador</button>` : ''}
  ${up && r === 'MODERATOR' ? `<button class="adm-item" data-act="adm-admin" data-id="${esc(t)}">⭐ Ascender a administración</button>` : ''}
  ${tst}${canDown ? `<button class="adm-item" data-act="adm-revoke" data-id="${esc(t)}">${r === 'ADMIN' ? '↩️ Quitar administración (vuelve a moderación)' : '↩️ Quitar moderación'}</button>` : ''}</div></section>`;
}

/* --- Noticias (solo la cuenta dueña publica) --- */
function openBookPicker() {
  const m = document.createElement('div'); m.className = 'modal sheet'; let tab = 'home', q = '';
  m.innerHTML = `<div class="modal-box bp-box" role="dialog" aria-modal="true" aria-label="Recomendar un libro"><button class="icon-btn close-x" data-x aria-label="Cerrar">✕</button><h2>Recomendar un libro</h2><p class="helper">Toca un libro y aparece en el banner de Inicio.</p>
  <div class="bp-tabs"><button type="button" class="chip active" data-t="home">🏠 Inicio</button><button type="button" class="chip" data-t="favs">♥ Mis favoritos</button><button type="button" class="chip" data-t="lib">📚 Mi biblioteca</button></div>
  <input class="field bp-q" type="search" placeholder="Buscar por título o autoría…" aria-label="Buscar libro"><div class="bp-list"></div></div>`;
  const list = m.querySelector('.bp-list');
  const src = () => { const all = publishedStories().filter(matureOK); return (tab === 'favs' ? all.filter(x => S.favs.includes(x.id)) : tab === 'lib' ? all.filter(x => S.lib.includes(x.id)) : all).filter(x => !q || `${x.title} ${x.author}`.toLowerCase().includes(q)); };
  const paint = () => { const on = new Set(crAll().filter(b => b.kind === 'book').map(b => b.storyId)), l = src();
    list.innerHTML = l.length ? l.map((x, i) => `<button type="button" class="bp-item" data-id="${esc(x.id)}"><span class="bp-cv">${coverHTML(x, i)}</span><span class="bp-t"><b>${esc(x.title)}</b><small>por ${esc(x.author || '')}</small></span>${on.has(x.id) ? '<span class="pill">En el banner ✓</span>' : '<span class="bp-add">＋</span>'}</button>`).join('')
      : `<p class="helper" style="text-align:center;margin:18px 0">${tab === 'favs' ? 'Aún no tienes libros favoritos.' : tab === 'lib' ? 'Tu biblioteca está vacía.' : 'No hay libros publicados.'}</p>`; };
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = ev => { if (ev.target === m) m.remove(); };
  m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('active', x === b)); paint(); });
  m.querySelector('.bp-q').oninput = ev => { q = ev.target.value.trim().toLowerCase(); paint(); };
  list.onclick = ev => { const it = ev.target.closest('.bp-item'); if (!it || !canNews()) return; const sid = it.dataset.id, L = crAll();
    if (L.some(b => b.kind === 'book' && b.storyId === sid)) return toast('Ese libro ya está en el banner.');
    if (L.length >= 6) return toast('Máximo 6 tarjetas manuales: elimina alguna.');
    G.set('banners', [...L, { id: Date.now(), kind: 'book', by: S.user, date: today(), storyId: sid, title: '', text: '', btn: 'Leer ahora' }]); m.remove(); toast('Añadido al banner ✓'); KEEP = true; render(); };
  paint(); document.body.appendChild(m);
}
function crPanel() {
  const L = crAll(), pubs = publishedStories(), nw = news();
  return `<section class="panel" style="margin-bottom:20px"><h2>🎠 Banner de Inicio</h2><p class="helper" style="margin:4px 0 12px">Las noticias salen solas en el carrusel. Aquí añades tarjetas manuales (aparecen primero).${isOwner() ? '' : ' Solo puedes editar y eliminar las tuyas.'}</p>
  ${L.length ? L.map((b, i) => { const mine = ownsPost(b); return `<div class="cr-row"><span class="cr-rt">${b.kind === 'book' ? '📚' : '🎉'} <b>${esc(b.title || (findStory(b.storyId) || {}).title || 'Libro eliminado')}</b>${isOwner() ? ` <small class="helper">· ${esc(uName(b.by || OWNER_EMAIL) === 'Usuario' ? 'Owner' : uName(b.by || OWNER_EMAIL))}</small>` : ''}</span><span class="cr-rb">${mine ? `<button class="icon-btn sm" data-act="cr-up" data-id="${b.id}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button class="icon-btn sm" data-act="cr-down" data-id="${b.id}" ${i < L.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button><button class="link-btn" data-act="cr-edit" data-id="${b.id}">Editar</button><button class="link-btn danger-link" data-act="cr-del" data-id="${b.id}">Eliminar</button>` : '<small class="helper">de otra persona</small>'}</span></div>`; }).join('') : '<p class="helper">Aún no hay tarjetas manuales.</p>'}
 <button type="button" class="button secondary" data-act="cr-pick-open" style="margin:8px 0">＋ Recomendar un libro</button>
  <details class="cr-add" hidden><summary>＋ Recomendar un libro</summary><form data-form="cr-book" class="form-grid" style="grid-template-columns:1fr;margin-top:10px">
    <div class="form-group"><label for="cb-story">Libro</label><select id="cb-story" class="select">${pubs.length ? pubs.map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('') : '<option value="">No hay libros publicados</option>'}</select></div>
    <div class="form-group"><label for="cb-title">Título (opcional)</label><input id="cb-title" class="field" maxlength="70" placeholder="Si lo dejas vacío usa el del libro (el título del libro siempre se muestra)"></div>
    <div class="form-group"><label for="cb-text">Texto (opcional)</label><textarea id="cb-text" class="textarea" maxlength="160" placeholder="Por qué lo recomiendas… (si lo dejas vacío usa la sinopsis)"></textarea></div>
    <div class="form-group"><label for="cb-btn">Texto del botón</label><input id="cb-btn" class="field" maxlength="24" value="Leer ahora"></div><button class="button" type="submit">Añadir al banner</button></form></details>
  <details class="cr-add"><summary>＋ Anunciar un evento</summary><form data-form="cr-event" class="form-grid" style="grid-template-columns:1fr;margin-top:10px">
    <div class="form-group"><label for="ce-title">Título</label><input id="ce-title" class="field" maxlength="70" placeholder="Ej: Evento Fundador"></div>
    <div class="form-group"><label for="ce-text">Descripción corta (la tarjeta del banner)</label><textarea id="ce-text" class="textarea" maxlength="160"></textarea></div>
    <div class="form-group"><label>Imagen (opcional, cualquier tamaño)</label><div id="ce-prev" class="ce-prev"></div><label class="button secondary sm" style="cursor:pointer;width:fit-content">🖼 Elegir imagen<input id="ce-file" type="file" accept="image/*" hidden></label></div>
    <div class="form-group"><label for="ce-post">Publicación completa (se abre al tocar el botón)</label><textarea id="ce-post" class="textarea" maxlength="4000" placeholder="Escribe el post completo. Si lo dejas vacío usa la descripción corta. Puedes editarlo después en Noticias."></textarea></div>
    <div class="form-group"><label for="ce-btn">Texto del botón</label><input id="ce-btn" class="field" maxlength="24" value="Ver más"></div>
    <div class="form-group"><label for="ce-news">El botón lleva a…</label><select id="ce-news" class="select"><option value="">Una publicación nueva (la creo con estos datos)</option>${nw.map(n => `<option value="${n.id}">Noticia existente: ${esc(clip(n.title, 40))}</option>`).join('')}</select></div><button class="button" type="submit">Añadir al banner</button></form></details></section>`;
}
/* Compositor de noticias (Owner): cada párrafo puede llevar una imagen de cualquier tamaño */
const ownsPost = o => !!o && canNews() && (isOwner() || (o.by || OWNER_EMAIL) === S.user);   // Owner: todo; Administración: solo lo suyo (lo antiguo sin firma es de la Owner)
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
const ndPanel = () => { const L = ndAll(); return L.length ? `<section class="panel" style="margin-bottom:20px"><h2>📝 Borradores (${L.length})</h2><p class="helper" style="margin:4px 0 10px">Lo que no terminas de escribir se guarda aquí. Solo tú lo ves.</p>
  ${L.map(d => `<div class="cr-row"><span class="cr-rt">📝 <b>${esc(d.title || 'Sin título')}</b> <small class="helper">${esc(d.updated.slice(0, 10))}${d.id === NBID ? ' · editando' : ''}</small></span><span class="cr-rb"><button class="button secondary sm" data-act="nd-open" data-id="${esc(d.id)}">Continuar</button><button class="button danger sm" data-act="nd-del" data-id="${esc(d.id)}">Eliminar</button></span></div>`).join('')}</section>` : ''; };
function nbCollect() { document.querySelectorAll('.nb-t').forEach(x => { const i = +x.dataset.i; if (NB[i]) NB[i].t = x.value; }); const ty = $('#n-type'), ti = $('#n-title'); if (ty) NBM.type = ty.value; if (ti) NBM.title = ti.value; }
const nbRow = (b, i) => `<div class="nb-row"><div class="nb-head"><b>Párrafo ${i + 1}</b>${NB.length > 1 ? `<button type="button" class="link-btn danger-link" data-act="nb-del" data-i="${i}">Quitar</button>` : ''}</div>
  <textarea class="textarea nb-t" data-i="${i}" maxlength="3000" placeholder="${i ? 'Escribe el siguiente párrafo…' : 'Escribe el mensaje…'}" aria-label="Párrafo ${i + 1}">${esc(b.t)}</textarea>
  ${safeImg(b.img) ? `<div class="nb-prev"><img src="${esc(b.img)}" alt=""><button type="button" class="button ghost sm" data-act="nb-img-clear" data-i="${i}">Quitar imagen</button></div>`
    : `<label class="button secondary sm nb-pick">🖼 Añadir imagen<input type="file" accept="image/*" class="nb-file" data-i="${i}" hidden></label>`}</div>`;
const newsBody = n => newsBlocks(n).map(b => `${b.t ? `<p>${esc(b.t)}</p>` : ''}${safeImg(b.img) ? `<figure class="news-fig"><img src="${esc(b.img)}" alt="" loading="lazy"></figure>` : ''}`).join('');
function newsView(nid) {
  if (nid) {                                           // publicación completa (al tocar «Leer noticia» en el banner)
    const n = news().find(x => String(x.id) === String(decodeURIComponent(nid)));
    return `<main class="page story-layout"><a class="button ghost sm" href="#/news" data-dir="prev">‹ Todas las noticias</a>${n ? `<article class="panel news-item news-full" style="margin-top:14px"><span class="tag">${esc(n.type)}</span> <span class="helper">${esc(n.date)}${n.edited ? ' · editado' : ''}</span><h2 class="serif" style="margin:10px 0 14px">${esc(n.title)}</h2>${newsBody(n)}<div class="news-by">${userAvatar(n.by || OWNER_EMAIL)}<span>Publicado por <b>${esc(uName(n.by || OWNER_EMAIL) === 'Usuario' ? 'Auri Studios' : uName(n.by || OWNER_EMAIL))}</b> · ${esc(ROLE_LABEL[roleOf(n.by || OWNER_EMAIL)] || 'Auri Studios')}</span></div></article>` : empty('Noticia no encontrada', 'Puede que se haya eliminado.', '<a class="button" href="#/news">Ver noticias</a>')}</main>`;
  }
  const list = news(), pub = canNews();
  return `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">📣 Noticias de Auri</span><h2 style="margin-top:8px">Novedades y eventos</h2></div></div>
  ${pub ? crPanel() : ''}
  ${pub ? ndPanel() : ''}
  ${pub ? `<form class="panel" data-form="news" style="margin-bottom:20px"><h2>${NBEDIT ? '✏️ Editar anuncio publicado' : 'Publicar anuncio'}</h2><div class="form-grid" style="grid-template-columns:1fr">
  <div class="form-group"><label for="n-type">Tipo</label><select id="n-type" class="select">${['Actualización', 'Evento', 'Aviso'].map(t => `<option ${NBM.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <div class="form-group"><label for="n-title">Título</label><input id="n-title" class="field" maxlength="80" value="${esc(NBM.title)}"></div>
  <div id="nb-list">${NB.map(nbRow).join('')}</div>
  <button type="button" class="button ghost sm" data-act="nb-add" style="width:fit-content">＋ Añadir párrafo</button></div><div class="nb-btns">${NBEDIT ? '<button type="button" class="button ghost" data-act="news-edit-cancel">Cancelar</button><button class="button" type="submit">Guardar cambios</button>' : '<button type="button" class="button ghost" data-act="nd-save">💾 Guardar borrador</button><button class="button" type="submit">Publicar</button>'}</div></form>` : ''}
  ${list.length ? list.map(n => { const cv = newsCover(n); return `<article id="news-${n.id}" class="panel news-item news-card ${cv ? 'has-img' : ''}"><div class="news-cardtxt"><span class="tag">${esc(n.type)}</span> <span class="helper">${esc(n.date)}${n.edited ? ' · editado' : ''}</span><h3>${esc(n.title)}</h3><p>${esc(clip(n.text, 150))}</p>
    <div class="news-acts"><a class="button secondary sm" href="#/news/${n.id}" data-dir="next">Leer publicación</a>${ownsPost(n) ? `<button class="button secondary sm" data-act="news-edit" data-id="${n.id}">Editar</button><button class="button danger sm" data-act="news-del" data-id="${n.id}">Eliminar</button>` : ''}</div></div>${cv ? `<img class="news-thumb" src="${esc(cv)}" alt="" loading="lazy">` : ''}</article>`; }).join('') : empty('Aún no hay noticias', pub ? 'Publica tu primer anuncio arriba.' : 'Aquí aparecerán las actualizaciones y eventos de Auri.')}</main>`;
}

const notifHref = n => n.type === 'chapter' ? '#/story/' + n.storyId + '/' + n.extra : n.type === 'follow' ? '#/user/' + encodeURIComponent(n.from) : n.type === 'review' ? '#/moderation' : n.type === 'rejected' ? '#/write/' + n.storyId + '/chapters' : '#/story/' + n.storyId;
/* --- Notificaciones --- */
const notifWhat = n => { const t = esc((findStory(n.storyId) || {}).title || 'una obra eliminada');
  return { follow: 'empezó a seguirte', like: `le dio like a tu obra «${t}»`, comment: `comentó en «${t}»: “${esc(n.extra)}”`, review: `envió ${n.chap ? `«${esc(n.chap)}» de ` : ''}«${esc(n.extra)}» a revisión`,
    chapter: `publicó ${/^\d+ cap/.test(n.chap) ? esc(n.chap) : `el capítulo «${esc(n.chap)}»`} en «${t}»`,
    reply: `respondió tu comentario en «${t}»: “${esc(n.extra)}”`, clike: `le dio like a tu comentario en «${t}»`,
    approved: `aprobó ${n.chap ? `el capítulo «${esc(n.chap)}» de ` : 'tu obra '}«${t}»: ya se ve en la app 🎉`, rejected: `rechazó ${n.chap ? `el capítulo «${esc(n.chap)}» de ` : 'tu obra '}«${t}». Motivo: ${esc(n.extra)}` }[n.type] || ''; };
const SYS_T = ['strike', 'modinvite', 'sys'];
function sysNotif(n) {
  const d = `<div class="helper">${esc(n.date.slice(0, 10))}</div>`, cls = `notif sys ${n.read ? '' : 'new'}`;
  if (n.type === 'strike') return `<a class="${cls}" href="#/strike/${esc(n.extra)}"><span class="sys-ic">⚠️</span><div><strong>¡Has recibido un strike!</strong> Toca para ver más información${d}</div></a>`;
  if (n.type === 'modinvite') return `<div class="${cls}"><span class="sys-ic">🛡</span><div>${n.role === 'ADMIN' ? '<strong>¡Felicidades!</strong> La Owner te ha invitado a formar parte de la administración de Auri Studios' : '<strong>¡Inspirador!</strong> La Owner te ha invitado a formar parte del equipo de moderación de Auri Studios'}${d}
    ${n.done ? `<div class="helper"><b>${n.done === 'accepted' ? '✓ Aceptaste la invitación' : 'Rechazaste la invitación'}</b></div>` : `<div class="inv-btns"><button class="button sm" data-act="inv-accept" data-nid="${esc(n.id)}">Aceptar</button><button class="button ghost sm" data-act="inv-decline" data-nid="${esc(n.id)}">Rechazar</button></div>`}</div></div>`;
  return n.href ? `<a class="${cls}" href="${esc(n.href)}"><span class="sys-ic">🛡</span><div>${esc(n.extra)}${d}</div></a>` : `<div class="${cls}"><span class="sys-ic">🛡</span><div>${esc(n.extra)}${d}</div></div>`;
}
const notifItem = n => SYS_T.includes(n.type) ? sysNotif(n) : `<a class="notif ${n.read ? '' : 'new'}" href="${esc(notifHref(n))}">${userAvatar(n.from)}<div><strong>${esc(['approved', 'rejected'].includes(n.type) ? 'Moderación' : uName(n.from))}</strong> ${notifWhat(n)}<div class="helper">${esc(n.date.slice(0, 10))}</div></div></a>`;
/** Ventanita superpuesta (no cambia de pantalla) con botón X; al abrirla se marcan como leídas */
function notifPop() {
  const k = 'auri.notifs.' + S.user, list = LS.get(k, []);
  const html = `<div class="pop-back" data-act="notif-toggle"></div><section class="pop" role="dialog" aria-label="Notificaciones"><header class="pop-head"><strong>🔔 Notificaciones</strong><button class="icon-btn" data-act="notif-toggle" aria-label="Cerrar notificaciones">✕</button></header>
  <div class="pop-body">${list.length ? list.map(notifItem).join('') : '<p class="helper pop-empty">Todavía no tienes notificaciones. Te avisaremos cuando alguien te siga, le dé like o comente tus obras, y cuando haya capítulos nuevos.</p>'}</div></section>`;
  LS.set(k, list.map(n => ({ ...n, read: true })));
  return html;
}
function notifView() {                                   // (pantalla completa, solo si se abre la dirección #/notifications)
  const list = LS.get('auri.notifs.' + S.user, []);
  const html = `<main class="page story-layout"><div class="section-head" style="margin-top:0"><div><span class="eyebrow">🔔 Notificaciones</span><h2 style="margin-top:8px">Lo que pasa con tus obras</h2></div></div>
  ${list.length ? list.map(notifItem).join('') : empty('Sin notificaciones', 'Te avisaremos cuando alguien te siga, le dé like o comente una de tus obras.')}</main>`;
  LS.set('auri.notifs.' + S.user, list.map(n => ({ ...n, read: true })));
  return html;
}

/* --- Mis Personajes: reemplazan [TN] en las historias que lo permiten --- */
function charsSection() {
  const act = S.chars.find(c => c.id === S.activeId);
  return `<section class="chars-sec"><div class="section-head"><div><h2>Mis Personajes</h2><p>Su nombre reemplaza a [TN] en las historias que lo permiten.</p></div></div>
  ${act ? `<p class="reading-as">Leyendo como <b>${esc(act.name)}</b></p>` : ''}
  <div class="char-grid"><button type="button" class="char-tile add" data-act="char-add" aria-label="Crear personaje"><span class="plus">＋</span><span>Crear personaje</span></button>${S.chars.map(c => {
    const on = c.id === S.activeId;
    return `<div class="char-tile ${on ? 'active' : ''}"><button type="button" class="char-pick" data-act="char-sel" data-cid="${c.id}" aria-pressed="${on}"><span class="ct-img">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : `<b>${esc([...c.name][0].toUpperCase())}</b>`}</span><strong>${esc(c.name)}</strong>${on ? `<em>Leyendo como ${esc(c.name)}</em>` : '<em>Toca para usar</em>'}</button>
      <div class="tile-acts"><button type="button" class="icon-btn" data-act="char-edit" data-cid="${c.id}" aria-label="Editar ${esc(c.name)}">✎</button><button type="button" class="icon-btn" data-act="char-del" data-cid="${c.id}" aria-label="Eliminar ${esc(c.name)}">${TRASH}</button></div></div>`;
  }).join('')}</div></section>`;
}
/** Hoja inferior para crear / editar un personaje: nombre + foto opcional. after(id) se llama al guardar un personaje NUEVO */
function openCharForm(id, after) {
  const cur = id ? S.chars.find(c => c.id === id) : null; let photo = cur ? cur.photo || '' : '';
  if (!cur && S.chars.length >= MAX_CHARS) return toast(`Puedes guardar hasta ${MAX_CHARS} personajes.`);
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box char-form" role="dialog" aria-modal="true" aria-label="${cur ? 'Editar personaje' : 'Crear personaje'}"><button class="icon-btn close-x" data-x aria-label="Cerrar">✕</button><h2>${cur ? 'Editar personaje' : 'Nuevo personaje'}</h2>
  <div class="cf-photo"><span class="cf-prev" data-prev>${photo ? `<img src="${esc(photo)}" alt="">` : '🐱'}</span><div class="cover-fields"><label class="button secondary sm" style="cursor:pointer">📷 Subir foto (opcional)<input type="file" accept="image/*" hidden data-file></label><button type="button" class="button ghost sm" data-nophoto ${photo ? '' : 'hidden'}>Quitar foto</button></div></div>
  <div class="form-group"><label>Nombre del personaje</label><input class="field" data-name maxlength="30" placeholder="Ej: Aiko" value="${esc(cur ? cur.name : '')}"></div>
  <p class="error" data-err></p><div class="cf-btns"><button class="button ghost" data-cancel>Cancelar</button><button class="button" data-save>Guardar</button></div></div>`;
  const q = sel => m.querySelector(sel), close = () => m.remove(), setPrev = () => { q('[data-prev]').innerHTML = photo ? `<img src="${esc(photo)}" alt="">` : '🐱'; q('[data-nophoto]').hidden = !photo; };
  q('[data-x]').onclick = close; q('[data-cancel]').onclick = close; m.onclick = ev => { if (ev.target === m) close(); };
  q('[data-file]').onchange = () => fitPhoto(q('[data-file]').files[0], 600, 800, d => { photo = d; setPrev(); });
  q('[data-nophoto]').onclick = () => { photo = ''; setPrev(); };
  q('[data-save]').onclick = () => {
    const name = q('[data-name]').value.trim(); if (!name) { q('[data-err]').textContent = 'Escribe un nombre para tu personaje.'; return; }
    if (cur) { S.chars = S.chars.map(c => c.id === cur.id ? { ...c, name, photo } : c); if (cur.id === S.activeId) setActive(cur.id); saveChars(); close(); toast('Personaje actualizado'); return render(); }
    let nid; do { nid = chapId(); } while (S.chars.some(c => c.id === nid));
    S.chars = [...S.chars, { id: nid, ...emptyChar(), name, photo }];
    if (S.chars.length === 1) setActive(nid); else saveChars();                 // el primero queda en uso automáticamente
    close(); toast('Personaje creado ✨'); if (after) after(nid); else { KEEP = true; render(); }
  };
  document.body.appendChild(m);
}
/** "Leer como…": antes de empezar una historia con reemplazo de [TN], se elige el personaje */
function readAs(path) {
  const go2 = () => { NAVDIR = 'next'; goReplace(path); };
  const m = document.createElement('div'); m.className = 'modal sheet';
  m.innerHTML = `<div class="modal-box readas" role="dialog" aria-modal="true" aria-label="Leer como"><button class="icon-btn close-x" data-x aria-label="Cerrar">✕</button><h2>Leer como…</h2>
  <p class="helper">Elige con qué personaje quieres leer: su nombre reemplazará a [TN] en la historia.</p>
  <div class="ra-car" role="listbox" aria-label="Personajes">${S.chars.length ? S.chars.map(c => {
    const on = c.id === S.activeId;
    return `<button type="button" class="ra-card ${on ? 'active' : ''}" data-pick="${c.id}" role="option" aria-selected="${on}"><span class="ra-img">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : `<b>${esc([...c.name][0].toUpperCase())}</b>`}</span><strong class="ra-name">${esc(c.name)}</strong>${on ? '<i class="ra-badge">Último usado</i>' : ''}</button>`; }).join('') : '<p class="helper">Todavía no tienes personajes.</p>'}</div>
  ${S.chars.length > 2 ? '<p class="helper ra-hint">Desliza para ver más →</p>' : ''}
  <button type="button" class="button secondary" data-new>＋ Crear personaje</button><button type="button" class="button ghost" data-skip>Leer sin personaje</button></div>`;
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

/* 6. ROUTER ------------------------------------------------------- */
const go = p => { location.hash = '#' + p; if (location.hash === '#' + p) render(); };
const goReplace = p => { if (location.replace) location.replace('#' + p); else location.hash = '#' + p; };   // no apila historial: "atrás" sale del libro
/* Progreso de lectura: capítulo + posición de scroll por historia */
const scrollPct = () => { const de = document.documentElement, max = Math.max(1, (de.scrollHeight || 0) - (window.innerHeight || 0)); return Math.min(1, Math.max(0, (window.scrollY || 0) / max)); };
function savePos(sid, idx, pct) { S.pos = { ...S.pos, [sid]: { idx, pct } }; LS.set(uk('pos'), S.pos); }
const saveReadPos = (sid, idx) => savePos(sid, idx, scrollPct());
function restoreReadPos(sid, idx) {
  const p = (S.pos || {})[sid];
  if (p && p.idx === idx && p.pct > 0.02) setTimeout(() => { const de = document.documentElement; window.scrollTo(0, p.pct * Math.max(1, (de.scrollHeight || 0) - (window.innerHeight || 0))); }, 40);
}
function autoGrow() { const t = $('#w-ch-text'); if (t && t.style && t.scrollHeight) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; } }
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
  m.innerHTML = `<div class="modal-box mini-box" role="dialog" aria-modal="true" aria-label="Guardar en tu biblioteca"><h2>📚 ¿Guardar en tu biblioteca?</h2>
  <p class="helper">«${esc(title)}»<br>Así recibirás un aviso cuando haya capítulos nuevos.</p>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="button ghost" data-no style="flex:1">Cancelar</button><button class="button" data-yes style="flex:1">Aceptar</button></div></div>`;
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
  libPrompt(sv.title, () => { libAdd(id); toast('Guardado en tu biblioteca. Te avisaremos cuando haya capítulos nuevos.'); if (onYes) onYes(); }, () => { if (onNo) onNo(); });
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
  if (S.user && canNews() && $('#nb-list')) { if (NBFRESH) NBFRESH = false; else nbDraftSave(true); }       // si te vas de Noticias sin terminar, lo escrito queda como borrador
  if (W && S.user && ($('#w-ch-text') || $('#w-title'))) autosave();      // guarda lo que estabas escribiendo antes de cambiar de pantalla
  if (S.user) S.stories = freshStories();                       // siempre lo último guardado (p. ej. estados que cambió moderación)
  const path = location.hash.slice(1) || '/', [, a, b, c, d] = path.split('/'), app = $('#app');
  const nav = path !== LASTP, dir = nav ? NAVDIR : '', from = LASTP;
  if (nav) { SHOWC = false; LASTP = path; NAVDIR = ''; NOTIF_OPEN = false; SETDEEP = a === 'settings' && !!b && from === '/settings'; }
  if (!S.user && a !== 'login' && a !== 'register' && a !== 'signup') return go('/login');
  if (S.user && (a === 'login' || a === 'register' || a === 'signup')) return go('/');
  if (a === 'signup' && !QZ) return go('/register');
  if (S.user && activeBan(S.user)) { app.innerHTML = bannedView(); return; }                   // cuenta suspendida: solo ve el aviso
  if (a === 'user' && decodeURIComponent(b || '') === S.user) return go('/profile');
  if (a === 'character') return go('/profile');                    // los personajes ahora viven en Mi Perfil
  if (nav && dir !== 'swipe') ghostOut(app);
  if (a === 'login' || a === 'register') app.innerHTML = authView(a);
  else if (a === 'signup') app.innerHTML = signupView();
  else if (a === 'write') { const v = writeRoute(b, c, d); app.innerHTML = c === 'ch' && W ? v : shell('/write', v); }   // escribir un capítulo = pantalla completa
  else if (a === 'story') { const v = storyView(b, c); app.innerHTML = c ? v : shell('', v); }   // leer un capítulo = pantalla completa
  else if (a === 'library') app.innerHTML = shell('/library', libraryView());
  else if (a === 'profile') app.innerHTML = shell('/profile', profileView());
  else if (a === 'user') app.innerHTML = shell('', userView(decodeURIComponent(b || '')));
  else if (a === 'strike') app.innerHTML = shell('', strikeView(b));
  else if (a === 'moderation') app.innerHTML = shell('/moderation', modView(b));
  else if (a === 'stats') app.innerHTML = shell('', statsView());
  else if (a === 'news') app.innerHTML = shell('/news', newsView(b));
  else if (a === 'settings') app.innerHTML = shell('', settingsView(b));
  else if (a === 'notifications') app.innerHTML = shell('', notifView());
  else app.innerHTML = shell('/', discoverView());
  if (a !== 'write') { W = null; WPREVIEW = false; }
  if (a !== 'story') EDITC = null;
  if (a !== 'story' || (MUSIC && b !== MUSIC.sid)) closeMusic();
  if (!KEEP) { window.scrollTo(0, 0); if (a === 'story' && c) restoreReadPos(b, +c - 1); }
  KEEP = false; autoGrow(); if (nav) { if (dir === 'swipe') fadeInfo(); else enterView(app, dir); } animateBars(); carInit();
  if (nav) autoMusic(a, b, c);
  if (nav && a === 'story' && c && c !== 'fin') pcHintOnce();
  if (S.user) showModOverlay();                                      // moderador/a sin marco puesto: el aviso reaparece hasta que se lo ponga
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
  b.textContent = n ? `💬 ${n} comentario${n === 1 ? '' : 's'}` : '💬 Comentar'; p.appendChild(b);
}
function pcHintOnce() { if (cfg('pcom') !== 'off' && !cfg('pcHint')) { setCfg('pcHint', true); toast('Tip: toca un párrafo para comentarlo 💬'); } }
let PCREPLY = null, PCREPPRE = ''; const PCREPOPEN = new Set();       // comentarios de párrafo: hilo en el que respondes · hilos abiertos
function pcItem(c, s, sub = false, extra = '') {
  const hide = c.spoiler && cfg('spoilers') === 'hide' && c.by !== S.user, mine = c.by === S.user, can = mine || s.owner === S.user || isStaff();
  const lk = c.lk || [], liked = lk.includes(S.user), top = sub ? c.parent : c.id, role = ROLE_LABEL[roleOf(c.by)], cid = esc(String(c.id));
  const items = `${!mine ? `<button type="button" role="menuitem" data-act="report-pc" data-cid="${cid}">Reportar</button>` : ''}${can ? `<button type="button" role="menuitem" class="danger-link" data-act="pc-del" data-cid="${cid}">Eliminar</button>` : ''}`;
  const menu = MENUC === c.id && items ? `<div class="c-menu" role="menu">${items}</div>` : '';
  return `<div class="comment ${sub ? 'reply' : ''} ${c.by === s.owner ? 'by-own' : ''}">${userAvatar(c.by)}<div class="c-main"><div class="c-bubble"><div class="c-meta"><b class="c-name">${esc(uName(c.by))}</b>${c.by === s.owner ? '<span class="c-badge own">Autoría</span>' : ''}${role ? `<span class="c-badge staff">${esc(role)}</span>` : ''}${c.spoiler ? '<span class="pc-tag">⚠ Spoiler</span>' : ''}${relSpan(c)}
    ${items ? `<span class="c-more-wrap"><button type="button" class="c-more" data-act="pc-more" data-cid="${cid}" aria-label="Más opciones" aria-expanded="${MENUC === c.id}">⋯</button>${menu}</span>` : ''}</div>
    <div class="c-text pc-text ${hide ? 'spoil' : ''}" ${hide ? 'data-act="pc-reveal" role="button" aria-label="Spoiler oculto: toca para ver"' : ''}>${esc(c.text)}</div>${hide ? '<button type="button" class="link-btn pc-hint" data-act="pc-reveal-btn">👁 Revelar spoiler</button>' : ''}</div>
    <div class="c-actions"><button type="button" class="c-heart ${liked ? 'on' : ''}" data-act="pc-like" data-cid="${cid}" aria-pressed="${liked}" aria-label="${liked ? 'Quitar me gusta' : 'Me gusta'}">${HEART}<span class="c-n">${lk.length || ''}</span></button><button type="button" class="c-act" data-act="pc-reply" data-top="${esc(String(top))}" data-pre="${sub ? esc('@' + uName(c.by) + ' ') : ''}">${ICO_REPLY}Responder</button>${authLike(c, s)}</div>${extra}</div></div>`;
}
function paintPcList() {
  const box = $('#pc-list'); if (!box || !PCS) return; const s = findStory(PCS.sid); if (!s) return;
  const l = pcList(PCS.sid, PCS.ci, PCS.pi).filter(c => !hidesFrom(c.by)), tops = l.filter(c => !c.parent);
  box.innerHTML = tops.length ? tops.map(x => {
    const reps = l.filter(r => r.parent === x.id), open = PCREPOPEN.has(x.id);
    const tg = reps.length ? `<button type="button" class="c-rtoggle" data-act="pc-replies" data-cid="${esc(String(x.id))}" aria-expanded="${open}"><i class="c-line"></i>${open ? 'Ocultar respuestas' : `Ver las respuestas (${reps.length})`}</button>` : '';
    const rf = PCREPLY === x.id ? `<form data-form="pcreply" data-top="${esc(String(x.id))}" class="c-replyform">${userAvatar(S.user)}<div class="c-pill"><input id="pc-reply-text" maxlength="${PC_MAX}" value="${esc(PCREPPRE)}" placeholder="Escribe una respuesta…" aria-label="Tu respuesta" autocomplete="off"><button class="c-send" type="submit" aria-label="Enviar respuesta">${ICO_SEND}</button></div><button type="button" class="c-act" data-act="pc-reply-cancel">Cancelar</button></form>` : '';
    return pcItem(x, s, false, `${tg}${open ? `<div class="c-replies">${reps.map(r => pcItem(r, s, true)).join('')}</div>` : ''}${rf}`);
  }).join('') : '<p class="helper" style="text-align:center;margin:10px 0">Aún no hay comentarios en este párrafo. ¡Sé la primera persona!</p>';
  const t = $('#pc-count'); if (t) t.textContent = l.length ? `(${l.length})` : '';
}
function openParaSheet(pi) {
  const m0 = (location.hash || '').match(/^#\/story\/([^/]+)\/(\d+)/); if (!m0) return;
  const sid = decodeURIComponent(m0[1]), ci = +m0[2] - 1, raw = pcPara(sid, ci, pi); if (raw === undefined) return;
  PCS = { sid, ci, pi, q: pQ(raw) }; const old = $('#pc-sheet'); if (old) old.remove();
  const ex = raw.replace(/\s+/g, ' ').trim(), m = document.createElement('div'); m.className = 'modal sheet'; m.id = 'pc-sheet';
  m.innerHTML = `<div class="modal-box pc-box" role="dialog" aria-modal="true" aria-label="Comentarios del párrafo"><div class="pc-head"><strong>💬 Comentarios del párrafo <span id="pc-count"></span></strong><button class="icon-btn" data-act="pc-close" aria-label="Cerrar">✕</button></div>
  <blockquote class="pc-quote">“${esc(ex.length > 150 ? ex.slice(0, 150) + '…' : ex)}”</blockquote><div id="pc-list" class="pc-list"></div>
  <div class="pc-compose"><textarea id="pc-text" class="textarea" maxlength="${PC_MAX}" placeholder="Escribe un comentario…" aria-label="Tu comentario"></textarea>
  <div class="pc-row"><label class="pc-spoil"><input type="checkbox" id="pc-spoil"> ⚠ Contiene spoiler</label><button class="button sm" data-act="pc-send">Publicar</button></div></div></div>`;
  m.addEventListener('click', e => { if (e.target === m) { m.remove(); PCS = null; pcClear(); } });
  document.body.appendChild(m); paintPcList();
}
function sendParaComment() {
  if (!PCS) return; const s = findStory(PCS.sid), ta = $('#pc-text'), text = ((ta || {}).value || '').trim().slice(0, PC_MAX), spoiler = !!($('#pc-spoil') || {}).checked;
  if (!s) return; if (!text) return toast('Escribe tu comentario.'); if (pcPara(PCS.sid, PCS.ci, PCS.pi) === undefined) return toast('Este párrafo ya no existe.');
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
  if (pp && !e.target.closest('[data-act]')) { pcTap(pp); return; }
  if (!e.target.closest('[data-act]')) pcClear();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id } = el.dataset;
  const persist = (k, v) => LS.set(uk(k), v);
  const actions = {
    'exit-book': () => {                               // salir del libro: guarda el progreso y, si no está en tu biblioteca, pregunta
      saveReadPos(id, +el.dataset.n);
      const leave = () => { toast('Progreso guardado'); goReplace('/story/' + id); };
      if (!askSaveLib(id, () => goReplace('/story/' + id), leave)) leave();
    },
    'adm-toggle': () => { const l = el.parentNode.parentNode.querySelector('.adm-list'); if (!l) return; l.hidden = !l.hidden; el.setAttribute('aria-expanded', String(!l.hidden)); },
    'adm-strike': () => openStrikeForm(id), 'adm-ban': () => openBanForm(id),
    'adm-unban': () => { const r = liftBan(id); if (r) return toast(r); toast('Suspensión levantada'); KEEP = true; render(); },
    'test-role': () => { testRole(id, el.dataset.role); toast('Rol de prueba actualizado ✓'); KEEP = true; render(); },
    'adm-mod': () => { if (!isOwner() || !canAct(id)) return; dialog('¿Invitar a ' + uName(id) + ' a la moderación?', 'Recibirá una invitación y deberá aceptarla y confirmar que es mayor de edad.', 'Enviar invitación', 'Cancelar', () => { const r = inviteMod(id); toast(r || 'Invitación enviada ✓'); }); },
    'adm-admin': () => { if (!isOwner() || !canAct(id)) return; dialog('¿Ascender a ' + uName(id) + ' a administración?', 'Recibirá una invitación que puede aceptar o rechazar. Si acepta, podrá publicar anuncios, revisar capítulos y descender moderadores, pero no ascender a nadie.', 'Enviar invitación', 'Cancelar', () => { const r = inviteRole(id, 'ADMIN'); toast(r || 'Invitación enviada ✓'); }); },
    'adm-revoke': () => { const r0 = roleOf(id); dialog(r0 === 'ADMIN' ? '¿Quitar la administración a ' + uName(id) + '?' : '¿Quitar la moderación a ' + uName(id) + '?', r0 === 'ADMIN' ? 'Perderá sus permisos de administración y su marco, y seguirá como moderador/a.' : 'Perderá los permisos y el marco de moderación.', 'Quitar', 'Cancelar', () => { const r = revokeMod(id); toast(r || 'Rol retirado'); KEEP = true; render(); }, true); },
    'inv-accept': () => openAcceptMod(el.dataset.nid),
    'inv-decline': () => { declineInvite(el.dataset.nid); toast('Invitación rechazada'); KEEP = true; render(); },
    'owner-frame': () => { if (!isOwner()) return; const us = getUsers(); us[S.user].frameOn = us[S.user].frameOn === false; G.set('users', us); KEEP = true; render(); },
    'ch-go': () => { autosave(); go(`/write/${W.id}/ch/${el.dataset.cid}`); },
    'ch-list': () => { autosave(); go(`/write/${W.id}/chapters`); },
    'info-go': () => go(`/write/${W.id}`),
    'save-next': saveInfo,
    'info-save': () => { if (saveInfoOnly()) { toast('Cambios guardados ✓'); KEEP = true; render(); } },
    comments: () => { SHOWC = !SHOWC; KEEP = true; render(); if (SHOWC) { const c = $('#comments'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    'ch-add': addChapter,
    'ch-trash': () => { const c = W.chapters.find(x => x.id === +el.dataset.cid); if (c) confirmBox(`¿Seguro que quieres eliminar el «${c.title || 'capítulo'}»?`, () => deleteChapter(c.id)); },
    'toggle-18': () => { if (isMinor(getUsers()[S.user])) return toast('Las cuentas menores de 18 años no pueden publicar contenido +18.'); collect(); W.mature = !W.mature; el.setAttribute('aria-checked', W.mature); },
    terms: showTerms, 'close-modal': () => el.closest('.modal').remove(),
    adult: () => { const u = getUsers(); if (isMinor(u[S.user])) return; u[S.user].adultDeclared = true; G.set('users', u); render(); },
    approve: () => { if (!isStaff()) return; const bk = allStories().find(x => x.id === id), i = bk ? bk.chapters.findIndex(c => c.id === +el.dataset.cid) : -1;
      if (i < 0) return; if (!bk.chapters.slice(0, i).every(c => pubChapter(c))) return toast('Aprueba primero los capítulos anteriores.');
      setChapterStatus(id, el.dataset.owner, +el.dataset.cid, 'approved'); toast('Capítulo aprobado'); render(); },
    reject: () => { if (!isStaff()) return; const r = (($('#rej-' + id + '-' + el.dataset.cid) || {}).value || '').trim(); if (!r) return toast('Escribe el motivo del rechazo.'); setChapterStatus(id, el.dataset.owner, +el.dataset.cid, 'rejected', r); toast('Capítulo rechazado'); render(); },
    'char-sel': () => { setActive(+el.dataset.cid); KEEP = true; render(); },
    'char-add': () => openCharForm(null),
    'char-edit': () => openCharForm(+el.dataset.cid),
    'char-del': () => { const cid = +el.dataset.cid, x = S.chars.find(k => k.id === cid); if (!x) return;
      confirmBox(`¿Seguro que quieres eliminar a «${x.name}»?`, () => { S.chars = S.chars.filter(k => k.id !== cid); setActive(S.activeId === cid ? undefined : S.activeId); KEEP = true; render(); }); },
    'cr-pick-open': () => { if (canNews()) openBookPicker(); },
    'report-story': () => { const s0 = findStory(id); if (s0) openReportFor('story', { sid: id, target: id, owner: s0.owner, title: s0.title, label: '«' + s0.title + '»' }); },
    'report-comment': () => { const c = comments(id).find(x => String(x.id) === el.dataset.cid); if (c) openReportFor('comment', { sid: id, cid: c.id, target: c.by, owner: c.by, excerpt: c.text, label: 'un comentario de ' + uName(c.by) }); },
    'report-pc': () => { const c = PCS && pcList(PCS.sid, PCS.ci, PCS.pi).find(x => String(x.id) === el.dataset.cid); if (c) openReportFor('pcomment', { sid: PCS.sid, ci: PCS.ci, target: c.by, owner: c.by, excerpt: c.text, label: 'un comentario de párrafo de ' + uName(c.by) }); },
    'report-user': () => openReportFor('user', { target: id, owner: id, label: 'a ' + uName(id) }),
    'rp-filter': () => { RFILT = id; KEEP = true; render(); },
    'rp-done': () => rpSet(id, 'resolved'), 'rp-dismiss': () => rpSet(id, 'dismissed'), 'rp-reopen': () => rpSet(id, 'open'),
    'rp-comments': () => { go('/story/' + id); setTimeout(() => { SHOWC = true; KEEP = true; render(); }, 60); },
    'rp-delcomment': () => { if (!isStaff()) return; confirmBox('¿Eliminar este comentario por incumplir las normas?', () => { updateComments(id, l => l.filter(c => String(c.id) !== el.dataset.cid && String(c.parent) !== el.dataset.cid)); logAction('del-comment', id, el.dataset.cid); KEEP = true; render(); }); },
    'td-on': () => { if (!isStaff()) return; dialog('¿Retirar esta obra de Descubrir?', 'Nadie más podrá encontrarla ni leerla hasta que se restaure. Se avisará a su autoría.', 'Retirar', 'Cancelar', () => { const s0 = findStory(id); G.set('takedown', [...takedown().filter(x => x !== id), id]); logAction('takedown', s0 ? s0.owner : '', id); if (s0 && s0.owner) pushNotif(s0.owner, { type: 'sys', extra: 'Tu obra «' + s0.title + '» fue retirada de Descubrir por moderación. Si crees que fue un error, escribe a la administración.' }); toast('Obra retirada de Descubrir'); KEEP = true; render(); }, true); },
    'td-off': () => { if (!isStaff()) return; G.set('takedown', takedown().filter(x => x !== id)); const s0 = findStory(id); logAction('restore', s0 ? s0.owner : '', id); if (s0 && s0.owner) pushNotif(s0.owner, { type: 'sys', extra: 'Tu obra «' + s0.title + '» volvió a estar visible en Descubrir.' }); toast('Obra restaurada ✓'); KEEP = true; render(); },
    mute: () => { setBM('muted', id, true); toast('Silenciada: no verás sus comentarios ni recibirás avisos suyos.'); KEEP = true; render(); },
    unmute: () => { setBM('muted', id, false); toast('Dejaste de silenciar a esta persona.'); KEEP = true; render(); },
    block: () => dialog('¿Bloquear a ' + uName(id) + '?', 'No verás sus comentarios ni sus obras, dejarán de seguirse y no habrá avisos entre ustedes. Puedes desbloquearla en Ajustes.', 'Bloquear', 'Cancelar', () => { blockUser(id); toast('Cuenta bloqueada'); KEEP = true; render(); }, true),
    unblock: () => { setBM('blocked', id, false); toast('Desbloqueada ✓'); KEEP = true; render(); },
    'c-more': () => { const c = +el.dataset.cid; MENUC = MENUC === c ? null : c; KEEP = true; render(); },
    'c-like': () => { const cid = +el.dataset.cid; let added = false, target = ''; updateComments(id, l => l.map(c => { if (c.id !== cid) return c; const lk = c.lk || []; added = !lk.includes(S.user); target = c.by; return { ...c, lk: added ? [...lk, S.user] : lk.filter(x => x !== S.user) }; })); if (added && target) notify(target, 'clike', id, ''); KEEP = true; render(); const hb = document.querySelector(`.c-heart[data-cid="${cid}"]`); if (hb && added) { hb.classList.add('pulse'); setTimeout(() => hb.classList.remove('pulse'), 500); } },
    'c-reply': () => { REPLYTO = +el.dataset.top; REPLYPRE = el.dataset.pre || ''; REPOPEN.add(REPLYTO); KEEP = true; render(); const i = $('#c-reply-text'); if (i && i.focus) { i.focus(); if (i.setSelectionRange) i.setSelectionRange(i.value.length, i.value.length); } },
    'c-reply-cancel': () => { REPLYTO = null; REPLYPRE = ''; KEEP = true; render(); },
    'c-replies': () => { const c = +el.dataset.cid; REPOPEN.has(c) ? REPOPEN.delete(c) : REPOPEN.add(c); KEEP = true; render(); },
    'c-edit': () => { MENUC = null; EDITC = +el.dataset.cid; KEEP = true; render(); },
    'c-cancel': () => { EDITC = null; KEEP = true; render(); },
    'c-save': () => { const t = ($('#c-edit-text').value || '').trim(), cid = +el.dataset.cid; if (!t) return toast('El comentario no puede estar vacío.');
      updateComments(id, l => l.map(c => c.id === cid && c.by === S.user ? { ...c, text: t, edited: true } : c)); EDITC = null; KEEP = true; render(); },
    'c-del': () => { const cid = +el.dataset.cid; confirmBox('¿Seguro que quieres eliminar este comentario?', () => { updateComments(id, l => { const t = l.find(c => c.id === cid); return t && (t.by === S.user || isAdmin()) ? l.filter(c => c.id !== cid && c.parent !== cid) : l; }); KEEP = true; render(); }); },
    music: () => { setCfg('musicLast', 'play'); playMusic(el.dataset.url, location.hash.split('/')[2]); }, 'music-close': () => { setCfg('musicLast', 'close'); closeMusic(); },
    'lib-toggle': () => { if (S.lib.includes(id)) { libRemove(id); toast('Quitado de tu biblioteca. Ya no recibirás avisos de esta obra.'); } else { libAdd(id); toast('Guardado en tu biblioteca. Te avisaremos cuando haya capítulos nuevos.'); } KEEP = true; render(); },
    'lib-del': () => { libRemove(id); toast('Quitado de tu biblioteca. Ya no recibirás avisos de esta obra.'); KEEP = true; render(); },
    'col-add': () => { colAdd(id); toast('Guardado en tus colecciones ⭐'); KEEP = true; render(); },
    'col-del': () => { colDel(id); toast('Quitado de tus colecciones'); KEEP = true; render(); },
    like: () => { const s = findStory(id); if (s) { toggleLike(s); KEEP = true; render(); } },
    follow: () => { toggleFollow(id); KEEP = true; render(); },
    'car-go': () => { CARHOLD = Date.now() + 8000; carGo(+el.dataset.i); },
    'nd-save': () => { if (nbDraftSave(false)) { KEEP = true; render(); } },
    'nd-open': () => { if (!canNews()) return; const d = ndAll().find(x => x.id === id); if (!d) return; if (NBID !== d.id) nbDraftSave(true);
      NB = d.blocks && d.blocks.length ? d.blocks.map(b => ({ t: b.t || '', img: b.img || '' })) : [{ t: '', img: '' }]; NBM = { type: d.type || 'Actualización', title: d.title || '' }; NBID = d.id; KEEP = true; render(); const f = $('#n-title'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    'nd-del': () => { if (!canNews()) return; confirmBox('¿Seguro que quieres eliminar este borrador?', () => { G.set('newsdrafts', ndAll().filter(x => x.id !== id)); if (id === NBID) nbReset(); KEEP = true; render(); }); },
    'nb-add': () => { nbCollect(); if (NB.length >= 20) return toast('Máximo 20 párrafos por publicación.'); NB.push({ t: '', img: '' }); KEEP = true; render(); },
    'nb-del': () => { nbCollect(); NB.splice(+el.dataset.i, 1); if (!NB.length) NB.push({ t: '', img: '' }); KEEP = true; render(); },
    'nb-img-clear': () => { nbCollect(); const b = NB[+el.dataset.i]; if (b) b.img = ''; KEEP = true; render(); },
    'cr-edit': () => { const b = crAll().find(x => String(x.id) === id); if (!ownsPost(b)) return;
      formModal('Editar tarjeta', `<div class="form-group"><label for="ed-t">Título</label><input id="ed-t" class="field" maxlength="70" value="${esc(b.title || '')}"></div><div class="form-group"><label for="ed-x">Texto</label><textarea id="ed-x" class="textarea" maxlength="160">${esc(b.text || '')}</textarea></div><div class="form-group"><label for="ed-b">Texto del botón</label><input id="ed-b" class="field" maxlength="24" value="${esc(b.btn || '')}"></div>`, 'Guardar',
        m => { const t = m.querySelector('#ed-t').value.trim(), x = m.querySelector('#ed-x').value.trim(); if (b.kind === 'event' && (!t || !x)) return 'Escribe título y descripción.';
          const L = crAll(), i = L.findIndex(y => String(y.id) === id); if (i < 0 || !ownsPost(L[i])) return 'Esa tarjeta ya no existe.';
          L[i] = { ...L[i], title: t.slice(0, 70), text: x.slice(0, 160), btn: m.querySelector('#ed-b').value.trim().slice(0, 24), edited: today() }; G.set('banners', L); KEEP = true; render(); toast('Tarjeta actualizada ✓'); }); },
    'news-edit': () => { const n = news().find(x => String(x.id) === id); if (!ownsPost(n)) return; if (!NBEDIT) nbDraftSave(true);
      NB = newsBlocks(n).map(b => ({ t: b.t || '', img: b.img || '' })); NBM = { type: n.type, title: n.title }; NBID = ''; NBEDIT = String(n.id); KEEP = true; render(); const f = $('#n-title'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    'news-edit-cancel': () => { nbReset(); toast('Edición cancelada'); render(); },
    'cr-del': () => { const b = crAll().find(x => String(x.id) === id); if (!ownsPost(b)) return; confirmBox('¿Quitar esta tarjeta del banner?', () => { G.set('banners', crAll().filter(b => String(b.id) !== id)); KEEP = true; render(); }); },
    'cr-up': () => { const L = crAll(), i = L.findIndex(b => String(b.id) === id); if (i < 0 || !ownsPost(L[i])) return; if (i > 0) { [L[i - 1], L[i]] = [L[i], L[i - 1]]; G.set('banners', L); KEEP = true; render(); } },
    'cr-down': () => { const L = crAll(), i = L.findIndex(b => String(b.id) === id); if (i < 0 || !ownsPost(L[i])) return; if (i < L.length - 1) { [L[i + 1], L[i]] = [L[i], L[i + 1]]; G.set('banners', L); KEEP = true; render(); } },
    'news-del': () => { const n0 = news().find(n => String(n.id) === id); if (ownsPost(n0)) confirmBox('¿Eliminar este anuncio?', () => { G.set('news', news().filter(n => String(n.id) !== id)); if (NBEDIT === id) nbReset(); KEEP = true; render(); }); },
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
      G.set('pcom', all); if (added && target) notify(target, 'clike', PCS.sid, ''); paintPcList(); const hb = document.querySelector(`#pc-list .c-heart[data-cid="${cid}"]`); if (hb && added) { hb.classList.add('pulse'); setTimeout(() => hb.classList.remove('pulse'), 500); } },
    'pc-reply': () => { PCREPLY = el.dataset.top; PCREPPRE = el.dataset.pre || ''; PCREPOPEN.add(PCREPLY); paintPcList(); const i = $('#pc-reply-text'); if (i && i.focus) { i.focus(); if (i.setSelectionRange) i.setSelectionRange(i.value.length, i.value.length); } },
    'pc-reply-cancel': () => { PCREPLY = null; PCREPPRE = ''; paintPcList(); },
    'pc-replies': () => { const c = el.dataset.cid; PCREPOPEN.has(c) ? PCREPOPEN.delete(c) : PCREPOPEN.add(c); paintPcList(); },
    'pc-reveal-btn': () => { const t = el.previousElementSibling; if (t) { t.classList.remove('spoil'); t.removeAttribute('data-act'); } el.remove(); },
    'pc-reveal': () => { el.classList.remove('spoil'); const h = el.nextElementSibling; if (h && h.classList.contains('pc-hint')) h.remove(); },
    'pc-del': () => { if (!PCS) return; const s = findStory(PCS.sid), cid = el.dataset.cid; confirmBox('¿Seguro que quieres eliminar este comentario?', () => { const all = pcAll(), k = pcKey(PCS.sid, PCS.ci, PCS.pi); const t0 = (all[k] || []).find(c => c.id === cid); if (t0 && (t0.by === S.user || (s && s.owner === S.user) || isStaff())) all[k] = all[k].filter(c => c.id !== cid && c.parent !== cid); G.set('pcom', all); paintPcList(); if (cfg('pcom') === 'dots') { KEEP = true; render(); } }); },
    'set-back': () => { NAVDIR = 'prev'; const h = window.history; if (SETDEEP && h && h.length > 1) h.back(); else goReplace('/settings'); },   // si vienes del menú: retrocede en el historial (no apila otra copia)
    'settings-back': () => { const h = window.history; if (h && h.length > 1) h.back(); else go('/'); },
    cfg: () => { const k = el.dataset.k, v = el.dataset.v; if (k === 'theme') { S.theme = v; applyTheme(); } else setCfg(k, v); KEEP = true; render(); },
    'cfg-toggle': () => { const k = el.dataset.k;
      if (k.startsWith('notif.')) { const key = k.slice(6); setCfg('notif', { ...cfg('notif'), [key]: !cfg('notif')[key] }); }
      else if (k === 'showMature') {
        if (isMinor(getUsers()[S.user])) return toast('El contenido +18 no está disponible para tu edad.');
        if (!cfg('showMature') && !isAdult(getUsers()[S.user])) return dialog('¿Eres mayor de 18 años?', 'El contenido +18 es solo para personas adultas. Esto es una declaración; la verificación real llegará con el servidor.', 'Soy mayor de 18', 'Cancelar', () => { const u = getUsers(); u[S.user].adultDeclared = true; G.set('users', u); setCfg('showMature', true); KEEP = true; render(); });
        setCfg('showMature', !cfg('showMature'));
      } else setCfg(k, !cfg(k));
      KEEP = true; render(); },
    'export-file': exportFile, 'export-copy': exportCopy,
    'wipe-device': () => typeConfirm('Borrar datos de este dispositivo', 'Se borra TODO lo guardado de Auri en este navegador: todas las cuentas, historias, bibliotecas y ajustes. No se puede deshacer. Haz una copia antes si la quieres. Escribe BORRAR para confirmar.', 'BORRAR', 'Borrar todo', wipeDevice),
    'acct-save': saveAccount,
    'acct-delete': () => { if (isOwner()) return toast('La cuenta Owner no se puede eliminar desde aquí.');
      typeConfirm('Eliminar cuenta', 'Se borrarán tu cuenta, tus historias, biblioteca, personajes, comentarios, likes y seguidores. No se puede deshacer. Escribe ELIMINAR para confirmar.', 'ELIMINAR', 'Eliminar mi cuenta', deleteAccount); },
    privacy: showPrivacy, report: openReport,
    'report-del': () => { G.set('reports', G.get('reports', []).filter(r => String(r.id) !== id)); KEEP = true; render(); },
    'qz-back': () => { const b = $('#qz-birth'); if (b && QZ) QZ.birth = b.value; if (QZ.step > 1) { QZ.step--; render(); } else go('/register'); },
    'qz-next': () => {
      if (QZ.step === 1) {
        const v = ($('#qz-birth') || {}).value || '';
        if (!validBirth(v) || ageOf(v) > 120) return void ($('#qz-err').textContent = 'Escribe una fecha de nacimiento válida.');
        QZ.birth = v;
        if (ageOf(v) < MIN_AGE) { QZ.blocked = true; PENDING = null; return render(); }          // no se crea ninguna cuenta ni se guarda nada
      } else if (!QZ.gender) return toast('Elige una opción para continuar.');
      QZ.step++; render(); },
    'qz-gender': () => { QZ.gender = el.dataset.v; KEEP = true; render(); },
    'qz-int': () => { const v = el.dataset.v; QZ.interests = QZ.interests.includes(v) ? QZ.interests.filter(x => x !== v) : [...QZ.interests, v]; KEEP = true; render(); },
    'qz-18': () => { QZ.mature = !QZ.mature; KEEP = true; render(); },
    'qz-terms': () => { QZ.terms = !!el.checked; KEEP = true; render(); },
    'qz-finish': () => { if (!QZ.interests.length) return toast('Elige al menos un tema.'); if (!QZ.terms) return toast('Debes aceptar los términos y condiciones.'); createAccount(); },
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
    genre: () => { GEN = id; render(); }, clear: () => { Q = ''; GEN = 'All'; render(); },
    'tag-search': () => { Q = Q.trim().toLowerCase() === '#' + id.toLowerCase() ? '' : '#' + id; GEN = 'All'; const i = $('#sq'); if (i) i.value = Q; if ((location.hash.slice(1) || '/') === '/') { render(); } else go('/'); },
    'tag-add': () => { const i = $('#w-tags'); if (!i) return; const cur = parseTags(i.value); if (!cur.some(t => t.toLowerCase() === id.toLowerCase())) cur.push(id); i.value = tagsText(cur); i.dispatchEvent(new Event('input', { bubbles: true })); }, tab: () => { TAB = id; render(); tabFx(); },
    delete: () => { if (confirm('¿Eliminar este borrador? No se puede deshacer.')) { S.stories = S.stories.filter(s => s.id !== id); persist('stories', S.stories); render(); } },
    'toggle-tn': () => { collect(); W.useReaderCharacter = !W.useReaderCharacter; el.setAttribute('aria-checked', W.useReaderCharacter); },
    preview: () => { collect(); WPREVIEW = true; render(); }, 'back-edit': () => { WPREVIEW = false; render(); },
    'save-draft': () => saveStory(false), publish: () => saveStory(true),
    'cover-adjust': () => { const src = COVSRC || (/^data:image\//.test(W.cover || '') ? W.cover : ''); if (!src) return toast('Sube una imagen para poder ajustarla.'); coverEditor(src, applyCover); },
    'clear-cover': () => { COVSRC = null; W.cover = ''; $('#cover-url').value = ''; $('#cover-prev').innerHTML = coverPrev(); }
  };
  actions[act] && actions[act]();
});
document.addEventListener('input', e => {
  if (e.target.id === 'w-ch-text') { $('#w-count').textContent = wc(e.target.value); autoGrow(); }
  if (['w-ch-text', 'w-ch-title', 'w-ch-music'].includes(e.target.id)) {            // guardado automático mientras escribes
    const sv = $('#w-saved'); if (sv) sv.textContent = '';
    clearTimeout(ASV); ASV = setTimeout(() => { autosave(); const v = $('#w-saved'); if (v && W) v.textContent = 'Guardado ✓'; }, 1200);
  }
  if (e.target.id === 'w-tags') { const pv = $('#w-tags-prev'); if (pv) pv.innerHTML = parseTags(e.target.value).map(t => `<span class="tag">#${esc(t)}</span>`).join(''); }
  if (e.target.id === 'sq') {                           // la búsqueda de la cabecera filtra Descubrir (si estás en otra pantalla, te lleva allí)
    Q = e.target.value;
    if ((location.hash.slice(1) || '/') === '/') { const l = $('#list'); if (l) l.innerHTML = discoverList(); }
    else { go('/'); setTimeout(() => { const i = $('#sq'); if (i && i.focus) { i.focus(); if (i.setSelectionRange) i.setSelectionRange(Q.length, Q.length); } }, 0); }
  }
  if (e.target.id === 'cover-url') {
    const v = e.target.value.trim(); W.cover = /^https?:\/\//i.test(v) ? v : ''; $('#cover-prev').innerHTML = coverPrev();
    const im = $('#cover-prev img'); if (im) im.onerror = () => { $('#cover-prev').textContent = 'No se pudo cargar la imagen'; };
  }
});
document.addEventListener('change', e => {
  const id = e.target.id, f = e.target.files && e.target.files[0];
  if (e.target.classList && e.target.classList.contains('nb-file') && canNews()) { const i = +e.target.dataset.i; nbCollect(); newsPhoto(f, d => { if (NB[i]) NB[i].img = d; KEEP = true; render(); }); return; }
  if (id === 'ce-file' && canNews()) { newsPhoto(f, d => { CEIMG = d; const p = $('#ce-prev'); if (p) p.innerHTML = `<img src="${esc(d)}" alt="Vista previa de la imagen del evento">`; }); return; }
  if (id === 'cover-file') { loadCover(f); e.target.value = ''; }
  if (id === 'import-file') importFromFile(f);
  if (id === 'bn-file') cropPhoto(f, 960, 360, d => { const u = getUsers(); u[S.user].banner = d; G.set('users', u); render(); }, .78);       // portada del perfil
  if (id === 'chc-file') cropPhoto(f, 720, 405, d => {                                                                                    // portada de un capítulo (opcional)
    collect(); const cid = +$('#w-ch-text').dataset.cid; W.chapters = W.chapters.map(c => c.id === cid ? { ...c, cover: d } : c); persistDraft(); KEEP = true; render(); }, .72);
  if (id === 'char-sel') { setActive(+e.target.value); KEEP = true; render(); }
  if (id === 'ch-sel') NAVDIR = +e.target.value > +location.hash.split('/')[3] ? 'next' : 'prev';
  if (id === 'ch-sel') goReplace('/story/' + location.hash.split('/')[2] + '/' + e.target.value);
  if (id === 'av-file') squarePhoto(f, 256, d => { const u = getUsers(); u[S.user].avatar = d; G.set('users', u); render(); });
});
document.addEventListener('error', e => { if (e.target.classList && e.target.classList.contains('cover-img')) e.target.style.display = 'none'; if (e.target.classList && e.target.classList.contains('fr-img')) { e.target.style.display = 'none'; if (e.target.parentNode) e.target.parentNode.classList.add('fr-fallback'); } }, true);
document.addEventListener('click', e => { if (MENUC !== null && !e.target.closest('.c-more-wrap')) { MENUC = null; KEEP = true; if (PCS) paintPcList(); if (!e.target.closest('[data-act]')) render(); } }, true);
document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form, v = id => ($(id) ? $(id).value : '');
  if (kind === 'myprofile') {
    const name = $('#pf-name').value.trim(); if (!name) return toast('El usuario no puede estar vacío.');
    const u = getUsers(); u[S.user].name = name; u[S.user].bio = $('#pf-bio').value.trim(); G.set('users', u); toast('Perfil guardado'); return render();
  }
  if (kind === 'pcreply') {
    if (!PCS) return; const t = (($('#pc-reply-text') || {}).value || '').trim().slice(0, PC_MAX), top = form.dataset.top, s0 = findStory(PCS.sid), all = pcAll(), k = pcKey(PCS.sid, PCS.ci, PCS.pi), parent = (all[k] || []).find(c => String(c.id) === top);
    if (!t || !s0 || !parent) return;
    all[k].push({ id: Date.now() + Math.random().toString(36).slice(2, 5), by: S.user, text: t, date: today(), spoiler: false, q: PCS.q, parent: parent.id }); G.set('pcom', all);
    notify(parent.by, 'reply', s0.id, t.slice(0, 80)); PCREPLY = null; PCREPPRE = ''; PCREPOPEN.add(parent.id); paintPcList(); return;
  }
  if (kind === 'reply') {
    const t = (($('#c-reply-text') || {}).value || '').trim(), sid = form.dataset.id, top = +form.dataset.cid, s0 = findStory(sid), parent = comments(sid).find(c => c.id === top); if (!t || !s0 || !parent) return;
    updateComments(sid, l => [...l, { id: Date.now(), by: S.user, text: t.slice(0, 300), date: today(), parent: top }]);
    notify(parent.by, 'reply', sid, t.slice(0, 80)); if (s0.owner && s0.owner !== parent.by) notify(s0.owner, 'comment', sid, t.slice(0, 80));
    REPLYTO = null; REPLYPRE = ''; REPOPEN.add(top); KEEP = true; return render();
  }
  if (kind === 'comment') { const t = $('#c-text').value.trim(); if (!t) return; addComment(findStory(form.dataset.id), t); KEEP = true; return render(); }
  if (kind === 'cr-book' || kind === 'cr-event') {
    if (!canNews()) return; const L = crAll(); if (L.length >= 6) return toast('Máximo 6 tarjetas manuales: elimina alguna.');
    if (kind === 'cr-book') { const sid = v('#cb-story'); if (!sid || !publishedStories().some(x => x.id === sid)) return toast('Elige un libro publicado.');
      G.set('banners', [...L, { id: Date.now(), kind: 'book', storyId: sid, by: S.user, date: today(), title: v('#cb-title').trim().slice(0, 70), text: v('#cb-text').trim().slice(0, 160), btn: v('#cb-btn').trim().slice(0, 24) }]); }
    else { const t = v('#ce-title').trim(), m = v('#ce-text').trim(); if (!t || !m) return toast('Escribe título y descripción.');
      let nid = v('#ce-news');
      if (!nid) {                                      // el evento crea su publicación completa (firmada por la Owner) en Noticias
        const post = v('#ce-post').trim() || m; nid = String(Date.now() + 1);
        if (!G.set('news', [{ id: +nid, type: 'Evento', title: t.slice(0, 80), text: post, blocks: [{ t: post, img: CEIMG }], by: S.user, date: today() }, ...news()])) return; }
      G.set('banners', [...L, { id: Date.now(), kind: 'event', by: S.user, date: today(), title: t.slice(0, 70), text: m.slice(0, 160), btn: v('#ce-btn').trim().slice(0, 24), newsId: nid }]); CEIMG = ''; }
    toast('Tarjeta añadida al banner'); return render();
  }
  if (kind === 'news') {
    if (!canNews()) return; nbCollect(); const t = NBM.title.trim(), blocks = NB.map(b => ({ t: b.t.trim(), img: b.img })).filter(b => b.t || b.img);
    if (!t || !blocks.length) return toast('Escribe un título y al menos un párrafo o una imagen.');
    if (NBEDIT) { const L = news(), i = L.findIndex(x => String(x.id) === NBEDIT); if (i < 0 || !ownsPost(L[i])) { nbReset(); toast('Esa noticia ya no existe.'); return render(); }
      L[i] = { ...L[i], type: NBM.type, title: t, text: blocks.map(b => b.t).filter(Boolean).join('\n\n'), blocks, edited: today() }; if (!G.set('news', L)) return;
      nbReset(); toast('Cambios guardados ✓'); return render(); }
    if (!G.set('news', [{ id: Date.now(), type: NBM.type, title: t, text: blocks.map(b => b.t).filter(Boolean).join('\n\n'), blocks, by: S.user, date: today() }, ...news()])) return;
    if (NBID) G.set('newsdrafts', ndAll().filter(x => x.id !== NBID));
    nbReset(); toast('Anuncio publicado'); return render();
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
  const bar = $('#rf-bar-i'); if (bar && bar.style) bar.style.width = (scrollPct() * 100) + '%';
  clearTimeout(POSQ); POSQ = setTimeout(() => { const n = (location.hash || '').match(/^#\/story\/([^/]+)\/(\d+)/); if (n && n[1] === m[1] && n[2] === m[2]) saveReadPos(decodeURIComponent(m[1]), +m[2] - 1); }, 500);
}, { passive: true });

/* ARRANQUE */
applyTheme(); applyReading();
if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (S.theme === 'auto') applyTheme(); }); }
if (S.user) loadUser();
render();
seedTest();
setInterval(() => document.querySelectorAll('.rel-t[data-ts]').forEach(t => { const r = relTime(t.dataset.ts); if (r && t.textContent !== r) t.textContent = r; }), 30000);
(function splash() {                                   // pantalla de bienvenida corta con las orejitas de Auri
  if (reduceMotion() || !document.body || !document.createElement) return;
  const d = document.createElement('div'); d.className = 'splash'; d.innerHTML = LOADER() + '<b>Auri Studios</b>'; document.body.appendChild(d);
  setTimeout(() => { d.classList.add('bye'); setTimeout(() => d.remove(), 320); }, 650);
})();
