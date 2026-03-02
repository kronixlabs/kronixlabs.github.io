#!/usr/bin/env python3
"""Convert redirect stubs into proper directory structures and add file-level redirects.

This script assumes `restructure_nav.py` has already moved directories and created stub
files at the old locations. Those stub files live at paths like `es/framework` (no
extension). GitHub Pages will correctly serve them for requests to `/es/framework` but
not for deeper paths under that prefix, causing 404s. We also want to provide
per-page redirects for moved HTML files.

This tool will:

1. Scan for existing stub files (files containing "Page moved" in their body).
2. For each stub whose name has no extension, create a directory of the same name and
   move the stub into that directory as `index.html`.
3. For each rename mapping defined below, iterate the HTML files under the new path
   and create corresponding stub pages under the old path pointing to the new
   location (meta-refresh plus canonical).

Run from repo root: python fix_redirects.py

"""

import pathlib, shutil, os

root = pathlib.Path(__file__).parent

# same rename map used by restructure_nav
renames = {
    # Spanish
    'es/framework': 'es/como-lo-hacemos',
    'es/firm': 'es/sobre-kronix',
    'es/industries': 'es/industrias',
    'es/insights': 'es/recursos',
    # English
    'en/framework': 'en/how-we-work',
    'en/firm': 'en/about',
    # note: industries and insights remain the same for English
}

# helper to write a redirect stub at given path (relative to repo root)
def make_stub(path: pathlib.Path, target_url: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    html = f"""<!DOCTYPE html>
<html><head>
<meta charset=\"utf-8\"> 
<meta http-equiv=\"refresh\" content=\"0; url={target_url}\" />
<link rel=\"canonical\" href=\"{target_url}\" />
<title>Moved</title>
</head><body>
<p>Page moved <a href=\"{target_url}\">here</a>.</p>
</body></html>"""
    path.write_text(html, encoding='utf-8')
    print(f"Stub created: {path} -> {target_url}")

# convert stub files without extension into directories
for file in root.rglob('*'):
    if file.is_file() and file.suffix == '':
        txt = file.read_text(encoding='utf-8', errors='ignore')
        if 'Page moved' in txt:
            # We need to turn this file into a directory containing index.html
            target_dir = file
            content = txt
            # remove the file first to free the name
            file.unlink()
            target_dir.mkdir(parents=True, exist_ok=True)
            idx = target_dir / 'index.html'
            idx.write_text(content, encoding='utf-8')
            print(f"Converted stub {file} -> {idx}")

# produce file-level redirects for pages moved under renamed directories
for old_rel, new_rel in renames.items():
    old_dir = root / old_rel
    new_dir = root / new_rel
    # ensure old_dir exists as directory
    old_dir.mkdir(parents=True, exist_ok=True)
    # redirect old_dir/index.html to new_dir root
    make_stub(old_dir / 'index.html', '/' + new_rel + '/')
    if new_dir.exists():
        for html in new_dir.rglob('*.html'):
            relpath = html.relative_to(new_dir)
            oldfile = old_dir / relpath
            target = '/' + new_rel + '/' + '/'.join(relpath.parts)
            if not oldfile.exists():
                make_stub(oldfile, target)


# After performing initial redirects we may have run standardize_head
# which overwrote stub heads with their own URL.  Fix them now by
# ensuring canonical points to the destination and add a proper
# hreflang for the opposite language (if desired).

def repair_stub(stub_path: pathlib.Path, target_url: str):
    if not stub_path.exists():
        return
    text = stub_path.read_text(encoding='utf-8')
    # simple check: only rewrite if stub contains "Page moved" phrase
    if 'Page moved' not in text:
        return
    # recreate stub with correct head (using same template as make_stub)
    stub_path.write_text(
        f"""<!DOCTYPE html>
<html><head>
<meta charset=\"utf-8\"> 
<meta http-equiv=\"refresh\" content=\"0; url={target_url}\" />
<link rel=\"canonical\" href=\"{target_url}\" />
<title>Moved</title>
</head><body>
<p>Page moved <a href=\"{target_url}\">here</a>.</p>
</body></html>""",
        encoding='utf-8')
    print(f"Repaired stub head for {stub_path} -> {target_url}")

# now repair canonical references for every redirect we created earlier
for old_rel, new_rel in renames.items():
    old_dir = root / old_rel
    new_dir = root / new_rel
    repair_stub(old_dir / 'index.html', '/' + new_rel + '/')
    if new_dir.exists():
        for html in new_dir.rglob('*.html'):
            relpath = html.relative_to(new_dir)
            repair_stub(old_dir / relpath, '/' + new_rel + '/' + '/'.join(relpath.parts))

# also handle explicit file moves that were stubbed earlier
for old, new in file_moves.items():
    repair_stub(root / old, '/' + new.rstrip('index.html'))

print('Redirect fixes complete.')
