#!/usr/bin/env python3
"""Copy /en/index.html to the root index.html, adjusting URLs.

Usage: python sync_root.py

This script reads the English homepage, updates the canonical/hreflang/og/twitter
URLs so they point to the root domain, and writes the result to index.html.
"""
from bs4 import BeautifulSoup
import pathlib

root = pathlib.Path(__file__).parent
import sys

lang = sys.argv[1] if len(sys.argv) > 1 else "es"
if lang not in ("es","en"):
    print(f"Unsupported language {lang}, choose 'es' or 'en'.")
    sys.exit(1)

src = root / lang / "index.html"
dest = root / "index.html"

html = src.read_text(encoding="utf-8")
soup = BeautifulSoup(html, "html.parser")

# update canonical to root
link_can = soup.find('link', rel='canonical')
if link_can:
    link_can['href'] = 'https://kronixlabs.com/'

# ensure we don't copy any redirect script from source (e.g. navigator.language)
for script in soup.find_all('script'):
    if script.string and 'navigator.language' in script.string:
        script.decompose()

# ensure hreflang alternates include root x-default
existing = {tag['hreflang']: tag for tag in soup.find_all('link', hreflang=True)}
# correct any mis-specified hreflang tags (english page had a bug, we override)
for lang, href in [('es','https://kronixlabs.com/es/'), ('en','https://kronixlabs.com/en/')]:
    if lang in existing:
        existing[lang]['href'] = href
    else:
        soup.head.append(soup.new_tag('link', rel='alternate', hreflang=lang, href=href))
# x-default
if 'x-default' in existing:
    existing['x-default']['href'] = 'https://kronixlabs.com/'
else:
    soup.head.append(soup.new_tag('link', rel='alternate', hreflang='x-default', href='https://kronixlabs.com/'))

# update og:url and twitter:url if present
og_url = soup.find('meta', property='og:url')
if og_url:
    og_url['content'] = 'https://kronixlabs.com/'

tw_url = soup.find('meta', attrs={'name': 'twitter:url'})
if tw_url:
    tw_url['content'] = 'https://kronixlabs.com/'

# remove any language-redirect script at bottom if exists
for script in soup.find_all('script'):
    if script.string and ('navigator.language' in script.string or '/es/' in script.string or '/en/' in script.string):
        script.decompose()

# finally write to dest
with dest.open('w', encoding='utf-8') as f:
    f.write(str(soup))

print(f"Synced {src} -> {dest}")
