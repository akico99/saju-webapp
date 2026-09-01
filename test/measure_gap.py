import sys
import fitz

pdf_path = sys.argv[1]
doc = fitz.open(pdf_path)
page = doc.load_page(0)
pix = page.get_pixmap(dpi=150)
w, h = pix.width, pix.height
DARK = (14, 19, 32)

def row(y):
    return set(pix.pixel(x, y) for x in range(0, w, 10))

found = None
for y in range(0, 400):
    if DARK in row(y):
        found = y
        break

if found is None:
    print('NOT_FOUND')
else:
    print(round(found * 25.4 / 150, 2))
