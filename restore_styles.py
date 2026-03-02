import os, fnmatch
from bs4 import BeautifulSoup

root = r"c:\Users\a\Documents\GitHub\kronixlabs.github.io"

# Tailwind CDN + common styles that should be in every page
TAILWIND_SCRIPT = '''<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          kronixBlue: '#1FA2FF',
          kronixDark: '#0B0F2B',
          kronixDeep: '#070A1E',
          kronixGray: '#C7C9D3'
        },
        fontFamily: { sans: ['Montserrat','system-ui','sans-serif'] }
      }
    }
  }
</script>'''

GLOBAL_STYLES = '''<style>
:root { --blue:#1FA2FF; --dark:#0B0F2B; --deep:#070A1E; --gray:#C7C9D3; }
body { background:#0B0F2B; color:#fff; font-family:'Montserrat',system-ui,sans-serif; overflow-x:hidden; }
.grid-bg { background-image: linear-gradient(rgba(31,162,255,0.04) 1px, transparent 1px), linear-gradient(90deg,rgba(31,162,255,0.04) 1px, transparent 1px); background-size:60px 60px; }
@keyframes fadeUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
@keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(31,162,255,.35)} 50%{box-shadow:0 0 0 14px rgba(31,162,255,0)} }
@keyframes flowDown { 0%,100%{opacity:0;transform:translateY(-8px)} 50%{opacity:1;transform:translateY(8px)} }
@keyframes bounce { 0%, 20%, 50%, 80%, 100% {transform: translateX(-50%) translateY(0);} 40% {transform: translateX(-50%) translateY(-10px);} 60% {transform: translateX(-50%) translateY(-5px);} }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
.fade-up { opacity:0; animation:fadeUp .7s ease forwards; }
.d1{animation-delay:.1s} .d2{animation-delay:.25s} .d3{animation-delay:.4s} .d4{animation-delay:.55s} .d5{animation-delay:.7s}
.btn-glow { animation:pulseGlow 2.8s ease-in-out infinite; }
.cap-card { border:1px solid rgba(255,255,255,.07); border-radius:16px; padding:2rem; transition:border-color .25s,transform .25s,box-shadow .25s; background:rgba(255,255,255,.02); }
.cap-card:hover { border-color:rgba(31,162,255,.4); transform:translateY(-5px); box-shadow:0 20px 60px rgba(31,162,255,.08); }
.fade-in-on-scroll { opacity:0; transform:translateY(30px); }
.fade-in-on-scroll.visible { animation:fadeUp 0.6s ease-out forwards; }
.badge { display:inline-block; padding:8px 16px; background:linear-gradient(135deg,rgba(31,162,255,.1),rgba(31,162,255,.05)); border:1px solid rgba(31,162,255,.3); border-radius:8px; font-size:12px; font-weight:600; color:#1FA2FF; text-transform:uppercase; letter-spacing:.05em; }
.metric-value { font-size:2.75rem; font-weight:800; background:linear-gradient(135deg,#1FA2FF,#7DD3FF); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.form-input { width:100%; padding:.875rem 1rem; border-radius:10px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); color:#fff; font-family:inherit; font-size:.875rem; transition:border-color .2s,background .2s; outline:none; }
.form-input:focus { border-color:rgba(31,162,255,.6); background:rgba(31,162,255,.06); }
.form-input::placeholder { color:rgba(255,255,255,.35); }
.nav-link { color:rgba(255,255,255,.75); font-size:.875rem; transition:color .2s; }
.nav-link:hover { color:#1FA2FF; }
.nav-link.active { color:#1FA2FF; }
#mobile-menu { display:none; }
#mobile-menu.open { display:flex; }
.scroll-indicator { position:fixed; top:0; left:0; height:3px; background:var(--blue); transition:width .1s; z-index:9999; width:0%; }
@media (max-width:768px) {
  .sticky-mobile-cta { position:fixed; bottom:0; left:0; right:0; padding:1rem; background:rgba(11,15,43,.95); border-top:1px solid rgba(31,162,255,.2); z-index:998; backdrop-filter:blur(12px); }
}
.kx-wa-btn { position:fixed; bottom:28px; right:28px; z-index:997; top:auto; background:#1FA2FF; color:#fff; padding:14px 20px; border-radius:14px; font-weight:600; font-size:14px; font-family:inherit; box-shadow:0 10px 40px rgba(31,162,255,.45); display:flex; align-items:center; gap:8px; cursor:pointer; opacity:0; transform:translateY(20px); transition:all .4s ease; border:none; }
.kx-wa-btn.show { opacity:1; transform:translateY(0); }
.kx-wa-btn:hover { transform:translateY(-3px); box-shadow:0 16px 50px rgba(31,162,255,.55); }
</style>'''

def restore_styles(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
    head = soup.head
    if head is None:
        return False
    # Check if Tailwind is already present
    existing_tailwind = head.find('script', src='https://cdn.tailwindcss.com')
    existing_style = head.find('style')
    if existing_tailwind and existing_style:
        return False  # Already restored
   # Add Tailwind script before closing head
    tail_soup = BeautifulSoup(TAILWIND_SCRIPT, 'html.parser')
    for elem in tail_soup:
        if elem.name:
            head.append(elem)
    # Add global styles
    style_soup = BeautifulSoup(GLOBAL_STYLES, 'html.parser')
    for elem in style_soup:
        if elem.name:
            head.append(elem)
    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(str(soup.prettify()))
    return True

# run
count = 0
for dirpath, dirnames, filenames in os.walk(root):
    for fname in filenames:
        if fname.endswith('.html'):
            path = os.path.join(dirpath, fname)
            if restore_styles(path):
                print('restored', path)
                count += 1
            else:
                print('already restored', path)
print(f'\nTotal files restored: {count}')
