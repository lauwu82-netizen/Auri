// Prueba de humo: abre la app en español e inglés y recorre las pantallas buscando errores de JavaScript.
// Requiere: npm i playwright && npx playwright install chromium
const { chromium } = require('playwright'); const path = require('path');
const routes = ['/welcome', '/start', '/login', '/register', '/', '/library', '/write', '/news', '/messages', '/notifications', '/settings', '/profile'];
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [lang, loc] of [['es', 'es-MX'], ['en', 'en-US']]) {
    const c = await b.newContext({ locale: loc }), pg = await c.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto('file://' + path.join(__dirname, '..', 'index.html')); await pg.waitForTimeout(800);
    for (const r of routes) { await pg.evaluate(r => { location.hash = '#' + r; }, r); await pg.waitForTimeout(300); }
    console.log((errs.length ? '✗ ' : '✓ ') + lang + ': ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'sin errores')); bad += errs.length; await c.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
