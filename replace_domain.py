import os,fnmatch

target='kronixlabs.github.io'
replacement='kronixlabs.com'
root='c:/Users/a/Documents/GitHub/kronixlabs.github.io'

for dirpath, dirnames, filenames in os.walk(root):
    for fname in filenames:
        if fnmatch.fnmatch(fname, '*.html') or fnmatch.fnmatch(fname, '*.xml') or fnmatch.fnmatch(fname,'*.txt') or fnmatch.fnmatch(fname,'*.md'):
            path=os.path.join(dirpath,fname)
            try:
                with open(path,'r',encoding='utf-8') as f:
                    data=f.read()
                if target in data:
                    new=data.replace(target,replacement)
                    with open(path,'w',encoding='utf-8') as f:
                        f.write(new)
                    print('updated', path)
            except Exception as e:
                print('error',path,e)
