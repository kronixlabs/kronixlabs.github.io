import os, fnmatch
from bs4 import BeautifulSoup

root = r"c:\Users\a\Documents\GitHub\kronixlabs.github.io"

slug_map = {
    'enterprise-ai-architecture.html': 'arquitectura-ia-empresarial.html',
    'enterprise-ai-architecture-framework.html': 'arquitectura-empresarial-ia.html',
    'distribution.html': 'distribucion.html',
    'strategic-ai-consultancy.html': 'consultora-estrategica-ia.html',
    'multi-site-ai-system.html': 'sistema-multisede-ia.html',
    'the-success-code.html': 'el-codigo-del-exito.html',
}
inv_slug_map = {v: k for k, v in slug_map.items()}


def web_path(file_path):
    rel = os.path.relpath(file_path, root).replace('\\', '/')
    if rel.endswith('index.html'):
        url = '/' + rel[:-10]
        if not url.endswith('/'):
            url += '/'
    else:
        url = '/' + rel
    return url


# maps certain directory segments between languages when they don't match verbatim
# e.g. English "how-we-work" corresponds to Spanish "como-lo-hacemos".
DIR_MAP = {
    '/en/how-we-work/': '/es/como-lo-hacemos/',
    '/es/como-lo-hacemos/': '/en/how-we-work/',
}

def partner_path(url):
    # first handle english -> spanish
    if url.startswith('/en/'):
        # if we have a directory mapping, apply it
        for e_dir, s_dir in DIR_MAP.items():
            if url.startswith(e_dir):
                # replace prefix
                url2 = url.replace(e_dir, s_dir, 1)
                break
        else:
            url2 = url.replace('/en/', '/es/', 1)
        # translate filename slug if needed
        fname = os.path.basename(url2)
        if fname in slug_map:
            url2 = url2.replace(fname, slug_map[fname])
        return url2
    # spanish -> english
    if url.startswith('/es/'):
        for s_dir, e_dir in DIR_MAP.items():
            if url.startswith(s_dir):
                url2 = url.replace(s_dir, e_dir, 1)
                break
        else:
            url2 = url.replace('/es/', '/en/', 1)
        fname = os.path.basename(url2)
        if fname in inv_slug_map:
            url2 = url2.replace(fname, inv_slug_map[fname])
        return url2
    return '/'


def standardize_head(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
    head = soup.head
    if head is None:
        return False
    # save existing title/description
    title_text = head.title.string if head.title else ''
    desc_tag = head.find('meta', attrs={'name': 'description'})
    desc = desc_tag['content'] if desc_tag else ''

    # clear head
    head.clear()

    def new_tag(tagname, **attrs):
        # tagname is the tag name; attrs holds attributes like name, content, property, etc.
        # BeautifulSoup.new_tag takes name as first positional arg; to avoid keyword conflicts
        # we pass attributes via the attrs parameter.
        return soup.new_tag(tagname, attrs=attrs)

    # add base tags
    head.append(new_tag('meta', charset='utf-8'))
    head.append(new_tag('meta', name='viewport', content='width=device-width,initial-scale=1.0,viewport-fit=cover'))
    head.append(new_tag('meta', name='color-scheme', content='dark light'))
    head.append(new_tag('meta', name='theme-color', content='#0C002B'))
    head.append(new_tag('meta', name='apple-mobile-web-app-capable', content='yes'))
    head.append(new_tag('meta', name='apple-mobile-web-app-status-bar-style', content='black'))

    # SEO primary
    t = soup.new_tag('title')
    t.string = title_text or ''
    head.append(t)
    if desc:
        head.append(new_tag('meta', name='description', content=desc))
    head.append(new_tag('meta', name='robots', content='index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'))
    # canonical + hreflangs
    url = web_path(file_path)
    canon = 'https://kronixlabs.com' + url
    head.append(new_tag('link', rel='canonical', href=canon))
    # hreflangs
    es_equiv = partner_path(url) if url.startswith('/en/') else '/es/' if url=='/' else partner_path(url)
    en_equiv = partner_path(url) if url.startswith('/es/') else '/en/' if url=='/' else partner_path(url)
    head.append(new_tag('link', rel='alternate', hreflang='es', href='https://kronixlabs.com' + es_equiv))
    head.append(new_tag('link', rel='alternate', hreflang='en', href='https://kronixlabs.com' + en_equiv))
    head.append(new_tag('link', rel='alternate', hreflang='x-default', href='https://kronixlabs.com/'))

    # Open Graph
    head.append(new_tag('meta', property='og:type', content='website'))
    head.append(new_tag('meta', property='og:site_name', content='KRONIX Labs'))
    locale = 'en_US' if url.startswith('/en/') or url == '/en/' else 'es_CO'
    head.append(new_tag('meta', property='og:locale', content=locale))
    head.append(new_tag('meta', property='og:title', content=title_text or ''))
    if desc:
        head.append(new_tag('meta', property='og:description', content=desc))
    head.append(new_tag('meta', property='og:image', content='https://kronixlabs.com/Kronix-Labs.png'))
    head.append(new_tag('meta', property='og:image:width', content='1200'))
    head.append(new_tag('meta', property='og:image:height', content='630'))
    head.append(new_tag('meta', property='og:image:alt', content='KRONIX Labs — ' + ('Enterprise AI Infrastructure' if locale=='en_US' else 'Infraestructura IA Empresarial')))
    head.append(new_tag('meta', property='og:url', content=canon))

    # Twitter
    head.append(new_tag('meta', name='twitter:card', content='summary_large_image'))
    head.append(new_tag('meta', name='twitter:title', content=title_text or ''))
    if desc:
        head.append(new_tag('meta', name='twitter:description', content=desc))
    head.append(new_tag('meta', name='twitter:image', content='https://kronixlabs.com/Kronix-Labs.png'))

    # PWA icons/manifest
    head.append(new_tag('link', rel='apple-touch-icon', sizes='180x180', href='/apple-touch-icon.png'))
    head.append(new_tag('link', rel='icon', type='image/svg+xml', href='/Kronix-Labs.svg'))
    head.append(new_tag('link', rel='icon', type='image/png', href='/Kronix-Labs.png'))
    head.append(new_tag('link', rel='manifest', href='/manifest.json'))

    # performance preconnects & preload
    head.append(new_tag('link', rel='preconnect', href='https://fonts.googleapis.com'))
    head.append(new_tag('link', rel='preconnect', href='https://fonts.gstatic.com', crossorigin=''))
    head.append(new_tag('link', rel='preconnect', href='https://www.googletagmanager.com'))
    head.append(new_tag('link', rel='preload', as_='style', href='https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap'))
    head.append(new_tag('link', href='https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap', rel='stylesheet'))

    # Analytics snippet placeholder stays same (not rewriting analytic script)
    # Copy existing analytics script(s) from original head if any
    for script in soup.find_all('script'):
        if script.get('src','').startswith('https://www.googletagmanager.com/gtag.js') or 'gtag(' in script.text:
            head.append(script)
    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(str(soup))
    return True


# run
for dirpath, dirnames, filenames in os.walk(root):
    for fname in filenames:
        if fname.endswith('.html'):
            path = os.path.join(dirpath, fname)
            standardize_head(path)
            print('processed', path)
