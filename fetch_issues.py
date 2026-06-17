import urllib.request
import json

urls = [
    'https://api.github.com/repos/electron/electron/issues/47946',
    'https://api.github.com/repos/electron/electron/pulls/47386',
    'https://api.github.com/repos/ChurchApps/FreeShow/issues/2176'
]

for url in urls:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            print(f'--- {url} ---')
            print(f'TITLE: {data.get("title")}')
            print(f'BODY: {data.get("body", "")[:1000]}')
            print('-'*50)
    except Exception as e:
        print(f'Failed to fetch {url}: {e}')
