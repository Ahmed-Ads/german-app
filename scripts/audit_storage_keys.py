import subprocess, re

main_html = subprocess.check_output(['git', 'show', 'main:index.html'], text=True, encoding='utf-8')
with open('index.html', 'r', encoding='utf-8') as f:
    curr_html = f.read()

def find_storage_details(html, label):
    print(f'=== {label} ===')
    # STORAGE_KEYS block
    m = re.search(r'const STORAGE_KEYS\s*=\s*\{([^}]+)\};', html)
    if m:
        print('STORAGE_KEYS:')
        print(m.group(0))
    else:
        print('STORAGE_KEYS: Not found')
    
    # Constants
    for const_m in re.finditer(r'const\s+([A-Za-z0-9_]+_KEY)\s*=\s*[\'"]([^\'"]+)[\'"]', html):
        print(f'Constant: {const_m.group(0)}')

    # Direct localStorage calls
    ls_matches = set(re.findall(r'localStorage\.(?:getItem|setItem|removeItem)\([\'"]([^\'"]+)[\'"]', html))
    print('Direct localStorage string literals:', sorted(list(ls_matches)))

    # Direct appStorage literal calls
    as_matches = set(re.findall(r'appStorage\.(?:get|set|remove)\([\'"]([^\'"]+)[\'"]', html))
    print('Direct appStorage string literals:', sorted(list(as_matches)))
    
    # window.storage calls
    ws_matches = set(re.findall(r'window\.storage\.(?:get|set)\(([^,)]+)', html))
    print('window.storage arguments:', sorted(list(ws_matches)))

    # window.storage implementation
    ws_impl = re.search(r'window\.storage\s*=\s*\{[\s\S]*?\n\};', html)
    if ws_impl:
        print('\nwindow.storage implementation:')
        print(ws_impl.group(0))
    print()

find_storage_details(main_html, 'main:index.html')
find_storage_details(curr_html, 'current index.html')
