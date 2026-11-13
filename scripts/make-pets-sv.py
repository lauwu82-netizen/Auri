# Mascotas de San Valentín: cupido (pase de lector, 3 colores) y diablillo (pase de escritor).
# Hojas de 4 cuadros de 16x16: quieta, paso 1, paso 2, dormida. Salen en pets/<clave>.png
from PIL import Image

def ZZ(x0, y0):
    return [(x0 + i, y0 + j, 'z') for j, row in enumerate(['zzzz', '..z.', '.z..', 'zzzz']) for i, ch in enumerate(row) if ch == 'z']
def fix(rows):
    rows = list(rows) + ['.' * 16] * 16
    return [r.ljust(16, '.')[:16] for r in rows[:16]]
def check(name, rows):
    for i, r in enumerate(rows): assert len(r) == 16, (name, i, len(r), r)
def put(rows, pts):
    g = [list(r) for r in rows]
    for x, y, c in pts: g[y][x] = c
    return [''.join(r) for r in g]

# ---------------- CUPIDO ----------------
CUPID_TOP = ["................", "......####......", ".....#hhhh#.....", "....#hhhhhh#....", ".##.#hssssh#.##.",
             "#ww.#sesses#.ww#", "#www#cssssc#www#", ".#ww.#ssss#.ww#.", "..#w..####..w#..",
             "....#ssssss#..g.", "...s#spppps#s#g.", "....#pppppp#.#g.", "....#pp##pp#..g."]
CUPID_LEGS = {'idle': ["....#ss##ss#....", "....###..###...."], 'w1': ["...#ss#..#ss#...", "...###....###..."], 'w2': ["....#ss##ss#....", "...####..####..."]}
def female(rows):                     # Cupida: flequillo y pelo largo, broche de corazón y vestidito con vuelo
    r = list(rows)
    r[1] = "......####.p.p.."; r[2] = ".....#hhhh#.p..."
    r[5] = "#ww.#hesseh#.ww#"; r[6] = "#www#hcssch#www#"; r[8] = "..#w.h####h.w#.."
    r[12] = "...#pppppppp#.g."
    return r
def cupid(kind, fem=False):
    top = female(CUPID_TOP) if fem else CUPID_TOP
    if kind == 'sleep':
        head = [r.replace('sesses', 'eessee').replace('hesseh', 'eessee') for r in top[1:9]]
        rows = ['.' * 16] * 4 + head + ["....#ssssss#....", "...#spppppps#...", "...#pppppppp#...", "...##########..."]
        return fix(put(rows, ZZ(11, 0)))
    rows = top + CUPID_LEGS[kind]
    return fix(rows[1:] + ['.' * 16] if kind == 'w1' else rows)       # el paso 1 da un saltito
CUPID_PAL = {
 'cupida': {'h': (255, 206, 96), 'p': (255, 150, 190), 'w': (255, 255, 255), 'W': (226, 232, 250), 'g': (255, 204, 70)},
 'cupido': {'h': (236, 206, 150), 'p': (120, 190, 240), 'w': (255, 255, 255), 'W': (212, 232, 250), 'g': (255, 204, 70)},
}
CUPID_BASE = {'#': (84, 48, 74), 's': (255, 226, 202), 'c': (255, 150, 170), 'e': (62, 38, 58), 'z': (150, 130, 200)}

# ---------------- DIABLILLO ----------------
IMP_TOP = [".kk..........kk.", ".kkk........kkk.", "..kk.######.kk..", "....#rrrrrr#....", "...#rrrrrrrr#...", "...#ryrrrryr#...",
           ".dd#rrrrrrrr#dd.", "dddd#rmmmmr#dddd", ".ddd.#rrrr#.dd..", "..d.#hhmhhr#.h.h", "....#hhhmhh#.hhh",
           "....#rhhmhr#..h.", "....#rrhhrr#..t.", ]
IMP_LEGS = {'idle': ["....#rr##rr#tt..", "....###..###...."], 'w1': ["...#rr#..#rr#tt.", "...###....###..."], 'w2': ["....#rr##rr#tt..", "...####..####..."]}
def imp(kind):
    if kind == 'sleep':
        head = [r.replace('y', 'm') for r in IMP_TOP[:9]]
        rows = ['.' * 16] * 4 + head + ["....#hhmhhr#....", "....#hhhmhh#....", "...#rrhmhrr#...."] + ["...##########..."]
        return fix(put(rows, ZZ(11, 0))[:16])
    rows = ['.' * 16] + IMP_TOP + IMP_LEGS[kind]
    rows = rows[1:] + ['.' * 16] if kind == 'w1' else rows
    return fix(rows)
IMP_PAL = {'#': (60, 20, 44), 'r': (214, 64, 90), 'd': (120, 34, 78), 'k': (58, 36, 64), 'y': (255, 226, 96), 'm': (70, 20, 44), 'h': (255, 176, 196), 't': (120, 34, 78), 'z': (180, 120, 190)}

def sheet(frames, pal):
    im = Image.new('RGBA', (64, 16), (0, 0, 0, 0))
    for f, rows in enumerate(frames):
        check('f%d' % f, rows)
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch != '.': im.putpixel((f * 16 + x, y), pal[ch] + (255,))
    return im
if __name__ == '__main__':
    for name, pal in CUPID_PAL.items():
        sheet([cupid(k, name == 'cupida') for k in ('idle', 'w1', 'w2', 'sleep')], {**CUPID_BASE, **pal}).save('pets/%s.png' % name)
    sheet([imp(k) for k in ('idle', 'w1', 'w2', 'sleep')], IMP_PAL).save('pets/diablillo.png')
