import urllib.request
import json

url = 'https://api.github.com/repos/electron/electron/issues/47946'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read())
        print(f"BODY:\n{data.get('body', '')}")
except Exception as e:
    print(e)
