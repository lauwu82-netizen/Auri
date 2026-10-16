// Revisión automática de Auri: sintaxis, traducciones faltantes y claves duplicadas.
// Uso: node scripts/check.js   (sale con error si algo falla)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
let bad = 0;
const fail = m => { console.error('✗ ' + m); bad++; };
const ok = m => console.log('✓ ' + m);

for (const f of ['app.js', 'i18n.js']) {
  try { cp.execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); ok('Sintaxis ' + f); }
  catch (e) { fail('Error de sintaxis en ' + f + '\n' + String(e.stderr || e)); }
}

const i18nSrc = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

// claves duplicadas en el diccionario (la última pisa a la primera)
const seen = new Map(), dup = [];
for (const m of i18nSrc.matchAll(/^\s*("(?:[^"\\\n]|\\.)*")\s*:/gm)) {
  const k = JSON.parse(m[1]); if (seen.has(k)) dup.push(k); seen.set(k, 1);
}
dup.length ? fail('Claves repetidas en i18n.js: ' + dup.slice(0, 10).map(x => JSON.stringify(x)).join(', ')) : ok('Sin claves repetidas');

// textos t('...') sin traducción al inglés
global.window = {}; require(path.join(root, 'i18n.js'));
const keys = new Set(Object.keys(window.I18N.en));
const miss = new Set();
const re = /\bt\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
for (const m of app.matchAll(re)) {
  const s = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
  if (!keys.has(s) && s !== 'texto en español') miss.add(s);
}
miss.size ? fail(miss.size + ' texto(s) sin traducir al inglés:\n  - ' + [...miss].slice(0, 30).join('\n  - ')) : ok('Todos los t(...) tienen traducción');
console.log(bad ? '\n' + bad + ' problema(s)' : '\nTodo en orden');
process.exit(bad ? 1 : 0);
