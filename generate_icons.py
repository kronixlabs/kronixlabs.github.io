from PIL import Image
import os

src = r"c:\Users\a\Documents\GitHub\kronixlabs.github.io\Kronix-Labs.png"
if not os.path.exists(src):
    raise FileNotFoundError(src)
img = Image.open(src)
print('original size', img.size)
dst_dir = r"c:\Users\a\Documents\GitHub\kronixlabs.github.io\icons"
os.makedirs(dst_dir, exist_ok=True)
for s in (192,512):
    out = img.resize((s,s), Image.LANCZOS)
    out_path = os.path.join(dst_dir, f"icon-{s}.png")
    out.save(out_path)
    print('saved', out_path)
