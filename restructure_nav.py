#!/usr/bin/env python3
"""Reorganize directories and update navigation labels/URLs across site.

Per the new spec, Spanish sections get new slugs and friendly labels; English
sections get updated slugs and labels too.

This script performs:
1. Renames directories/files as per mapping.
2. Creates redirect stubs at old locations (meta refresh + canonical).
3. Updates all HTML files replacing old URLs and link text labels.
4. Adjusts meta title/description/open graph titles for renamed sections.

Run from repo root: python restructure_nav.py
"""
import pathlib, shutil, os
from bs4 import BeautifulSoup

root = pathlib.Path(__file__).parent

# mapping of old -> new path (relative to repo root)
renames = {
    # Spanish directories
    'es/framework': 'es/como-lo-hacemos',
    'es/firm': 'es/sobre-kronix',
    'es/industries': 'es/industrias',
    'es/insights': 'es/recursos',
    # English directories
    'en/framework': 'en/how-we-work',
    'en/firm': 'en/about',
    # note: industries and insights stay same but labels update
}

# single-page moves
file_moves = {
    'es/consultoria/arquitectura-ia-empresarial.html': 'es/implementacion-ia/index.html',
    'en/consulting/enterprise-ai-architecture.html': 'en/ai-implementation/index.html'
}

# URL text replacements and label mapping for nav
label_map = {
    # spanish labels
    'Framework': 'Cómo lo hacemos',
    'Arquitectura IA': 'Implementación de IA',
    'Firma': 'Sobre KRONIX',
    'Insights': 'Recursos',
    'Industries': 'Industrias',
    # english labels
    'Framework': 'How we work',
    'Arquitectura IA': 'AI Implementation',
    'Firma': 'About KRONIX',
    'Industries': 'Industry Solutions',
}

# url replacement mapping for hrefs
url_map = {
    '/es/framework/': '/es/como-lo-hacemos/',
    '/es/firm/': '/es/sobre-kronix/',
    '/es/industries/': '/es/industrias/',
    '/es/insights/': '/es/recursos/',
    '/es/consultoria/arquitectura-ia-empresarial.html': '/es/implementacion-ia/',
    '/en/framework/': '/en/how-we-work/',
    '/en/firm/': '/en/about/',
    '/en/consulting/enterprise-ai-architecture.html': '/en/ai-implementation/',
}

# helper: create redirect stub

def make_redirect(old, new):
    path = root / old
    path.parent.mkdir(parents=True, exist_ok=True)
    html = f"""<!DOCTYPE html>
<html><head>
<meta charset=\"utf-8\">
<meta http-equiv=\"refresh\" content=\"0; url={new}\" />
<link rel=\"canonical\" href=\"{new}\" />
<title>Moved</title>
</head><body>
<p>Page moved <a href=\"{new}\">here</a>.</p>
</body></html>"""
    path.write_text(html, encoding='utf-8')
    print(f"Created redirect stub {old} -> {new}")

# perform directory renames
for old, new in renames.items():
    oldp = root / old
    newp = root / new
    if oldp.exists():
        newp.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(oldp), str(newp))
        print(f"Renamed {old} -> {new}")
        make_redirect(old, '/' + new + '/')

# perform file moves
for old, new in file_moves.items():
    oldp = root / old
    newp = root / new
    newp.parent.mkdir(parents=True, exist_ok=True)
    if oldp.exists():
        shutil.move(str(oldp), str(newp))
        print(f"Moved file {old} -> {new}")
        make_redirect(old, '/' + new.rstrip('index.html'))

# now rewrite links and labels in all html
for html_path in root.rglob('*.html'):
    text = html_path.read_text(encoding='utf-8')
    soup = BeautifulSoup(text, 'html.parser')
    changed = False

    # rewrite hrefs
    for tag in soup.find_all(href=True):
        href = tag['href']
        for o, n in url_map.items():
            if href.startswith(o) or href == o:
                tag['href'] = href.replace(o, n)
                changed = True

    # rewrite link text nav labels
    for tag in soup.find_all('a'):
        if tag.string and tag.string.strip() in label_map:
            newlabel = label_map[tag.string.strip()]
            tag.string = tag.string.replace(tag.string.strip(), newlabel)
            changed = True

    # rewrite meta titles and descriptions if they mention old names
    for meta in soup.find_all(['meta','title']):
        if meta.name == 'title':
            for o, l in label_map.items():
                if o in meta.text:
                    meta.string = meta.text.replace(o, l)
                    changed = True
        elif meta.get('content'):
            for o, l in label_map.items():
                if o in meta['content']:
                    meta['content'] = meta['content'].replace(o, l)
                    changed = True

    if changed:
        html_path.write_text(str(soup), encoding='utf-8')
        print(f"Updated labels/links in {html_path}")

print('Done restructuring navigation.')
