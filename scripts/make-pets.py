# Genera los gatitos fundadores (Top 50) a partir de pets/gato.png: mismo dibujo, otros colores y una medalla dorada.
from PIL import Image
SRC = Image.open('pets/gato.png').convert('RGBA')
OUT = (60, 40, 50, 255); ORG = (242, 178, 122, 255); WHT = (255, 241, 222, 255); EYE = (40, 30, 40, 255)
GOLD = (255, 207, 64, 255); GOLD_L = (255, 236, 150, 255); GOLD_D = (196, 134, 24, 255); RIB = (224, 70, 96, 255)
def rgb(*c): return (*c, 255)
# nombre: (cuerpo, panza, contorno, ojo)
CATS = {
 'morado': (rgb(156, 110, 214), rgb(212, 192, 246), OUT, rgb(110, 232, 150)),
 'azul':   (rgb(96, 150, 232),  rgb(204, 228, 255), OUT, EYE),
 'rosa':   (rgb(246, 150, 192), rgb(255, 226, 238), OUT, EYE),
 'blanco': (rgb(246, 243, 240), rgb(255, 255, 255), OUT, EYE),
 'negro':  (rgb(64, 60, 80),    rgb(98, 94, 118),   rgb(26, 20, 32), rgb(236, 214, 80)),
 'marron': (rgb(150, 100, 66),  rgb(224, 192, 152), OUT, EYE),
 'gris':   (rgb(152, 158, 172), rgb(226, 229, 236), OUT, EYE),
 'calico': None, 'siames': None,
}
def tone(name, f, x, y, px):
    """color de un píxel según el gato; px es el color original"""
    if name == 'calico':                                  # blanco con manchas naranjas y oscuras
        if px == ORG or px == WHT:
            if (4 <= x <= 7 and 6 <= y <= 9) or (10 <= x <= 12 and 1 <= y <= 4 and f != 3) or (f == 3 and 3 <= x <= 7 and 8 <= y <= 11): return rgb(70, 62, 74)
            if (8 <= x <= 10 and 7 <= y <= 11) or (11 <= x <= 13 and 5 <= y <= 7 and f != 3) or (f == 3 and 11 <= x <= 13 and 6 <= y <= 8): return rgb(232, 150, 70)
            return rgb(250, 247, 243)
        return px
    if name == 'siames':                                  # crema con puntas oscuras (cara, orejas, cola y patas)
        if px == ORG or px == WHT:
            pt = (f != 3 and ((x >= 9 and y <= 7) or x <= 3 or y >= 12)) or (f == 3 and ((x >= 10 and y <= 8) or x <= 2))
            return rgb(122, 88, 74) if pt else (rgb(246, 232, 208) if px == ORG else rgb(255, 248, 236))
        return px
    body, belly, out, eye = CATS[name]
    return {ORG: body, WHT: belly, OUT: out, EYE: eye}.get(px, px)
def put(im, f, x, y, c): im.putpixel((f * 16 + x, y), c)
for name in CATS:
    im = Image.new('RGBA', SRC.size, (0, 0, 0, 0))
    for f in range(4):
        for y in range(16):
            for x in range(16):
                px = SRC.getpixel((f * 16 + x, y))
                if px[3]: put(im, f, x, y, tone(name, f, x, y, px))
        top = next(y for y in range(16) if SRC.getpixel((f * 16 + 10, y))[3])
        if name == 'morado':                              # antenitas verdes, como Auri
            for x in (11, 12): put(im, f, x, top, OUT); put(im, f, x, top - 1, rgb(110, 232, 150))
        mx, my = (10, 9) if f != 3 else (10, 11)          # medalla colgando del pecho
        put(im, f, mx, my - 1, RIB); put(im, f, mx + 1, my - 1, RIB)
        put(im, f, mx, my, GOLD_L); put(im, f, mx + 1, my, GOLD)
        put(im, f, mx, my + 1, GOLD); put(im, f, mx + 1, my + 1, GOLD_D)
    im.save(f'pets/fundador-{name}.png')
