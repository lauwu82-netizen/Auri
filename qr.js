/* Generador de códigos QR de Auri (modo bytes, corrección M, versiones 1 a 10). Sin dependencias.
   auriQR(texto) devuelve una matriz de filas con true = módulo oscuro, o null si el texto es muy largo. */
(function () {
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  const rsGen = n => { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; };
  const rsEnc = (data, n) => { const g = rsGen(n), r = new Array(n).fill(0); for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); } return r; };
  // [codewords totales, correccion por bloque, [bloques, datos por bloque], ...]
  const VER = [null, [26, 10, [1, 16]], [44, 16, [1, 28]], [70, 26, [1, 44]], [100, 18, [2, 32]], [134, 24, [2, 43]], [172, 16, [4, 27]], [196, 18, [4, 31]], [242, 22, [2, 38], [2, 39]], [292, 22, [3, 36], [2, 37]], [346, 26, [4, 43], [1, 44]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const dataCap = v => VER[v].slice(2).reduce((s, b) => s + b[0] * b[1], 0);
  const bch = (v, g, deg) => { let d = v << deg; const gl = g.toString(2).length; while (d.toString(2).length >= gl) d ^= g << (d.toString(2).length - gl); return (v << deg) | d; };
  function build(bytes, ver) {
    const n = 17 + ver * 4, cap = dataCap(ver), bits = [], push = (v, l) => { for (let i = l - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    push(4, 4); push(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => push(b, 8));
    for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const cw = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
    for (let p = 0; cw.length < cap; p++) cw.push(p % 2 ? 0x11 : 0xEC);
    const info = VER[ver], ecn = info[1], blocks = []; let pos = 0;
    for (const [cnt, len] of info.slice(2)) for (let i = 0; i < cnt; i++) { const d = cw.slice(pos, pos + len); pos += len; blocks.push({ d, e: rsEnc(d, ecn) }); }
    const out = [], mx = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < mx; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecn; i++) blocks.forEach(b => out.push(b.e[i]));
    const M = Array.from({ length: n }, () => new Array(n).fill(null)), F = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < n && c < n) { M[r][c] = v; F[r][c] = true; } };
    const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) set(r + i, c + j, i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4))); };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = ALIGN[ver];
    for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (c === 6 && r === al[al.length - 1])) continue; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1); }
    for (let i = 0; i < 9; i++) if (i !== 6) { set(8, i, false); set(i, 8, false); } for (let i = 0; i < 8; i++) { set(8, n - 1 - i, false); set(n - 1 - i, 8, false); }
    set(n - 8, 8, true);
    if (ver >= 7) { const v = bch(ver, 0x1F25, 12); for (let i = 0; i < 18; i++) { const b = ((v >> i) & 1) === 1, a = Math.floor(i / 3), c = n - 11 + (i % 3); set(a, c, b); set(c, a, b); } }
    const bitsOut = []; out.forEach(b => { for (let i = 7; i >= 0; i--) bitsOut.push((b >> i) & 1); });
    const masks = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0, (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
    const fill = mk => {
      const G = M.map(r => r.slice()); let bi = 0, up = true;
      for (let c = n - 1; c > 0; c -= 2) { if (c === 6) c--; for (let k = 0; k < n; k++) { const r = up ? n - 1 - k : k; for (let d = 0; d < 2; d++) { const cc = c - d; if (F[r][cc]) continue; let b = bi < bitsOut.length ? bitsOut[bi++] === 1 : false; if (masks[mk](r, cc)) b = !b; G[r][cc] = b; } } up = !up; }
      const f = bch((0 << 3) | mk, 0x537, 10) ^ 0x5412;
      for (let i = 0; i < 15; i++) { const b = ((f >> i) & 1) === 1; if (i < 6) G[i][8] = b; else if (i < 8) G[i + 1][8] = b; else G[n - 15 + i][8] = b; if (i < 8) G[8][n - 1 - i] = b; else if (i < 9) G[8][15 - i] = b; else G[8][15 - i - 1] = b; }
      return G;
    };
    const pen = G => {
      let p = 0;
      for (let a = 0; a < 2; a++) for (let i = 0; i < n; i++) { let run = 1; for (let j = 1; j < n; j++) { const x = a ? G[j][i] : G[i][j], y = a ? G[j - 1][i] : G[i][j - 1]; if (x === y) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) if (G[i][j] === G[i + 1][j] && G[i][j] === G[i][j + 1] && G[i][j] === G[i + 1][j + 1]) p += 3;
      const pat = [true, false, true, true, true, false, true, false, false, false, false], pat2 = pat.slice().reverse();
      for (let a = 0; a < 2; a++) for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) { let m1 = true, m2 = true; for (let k = 0; k < 11; k++) { const v = a ? G[j + k][i] : G[i][j + k]; if (v !== pat[k]) m1 = false; if (v !== pat2[k]) m2 = false; } if (m1) p += 40; if (m2) p += 40; }
      let dark = 0; G.forEach(r => r.forEach(v => { if (v) dark++; })); p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10 * 1;
      return p;
    };
    let best = null, bp = 1e9; for (let m = 0; m < 8; m++) { const G = fill(m), p = pen(G); if (p < bp) { bp = p; best = G; } }
    return best.map(r => r.map(v => !!v));
  }
  window.auriQR = function (text) {
    const bytes = Array.from(unescape(encodeURIComponent(String(text))), ch => ch.charCodeAt(0));
    for (let v = 1; v <= 10; v++) if (bytes.length + 2 + (v >= 10 ? 1 : 0) <= dataCap(v)) return build(bytes, v);
    return null;
  };
})();
