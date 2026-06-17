import urllib.request
import json

url = 'https://api.github.com/repos/electron/electron/issues/47946/comments'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read())
        for idx, comment in enumerate(data):
            print(f'--- COMMENT {idx + 1} ({comment["user"]["login"]}) ---')
            print(comment["body"][:1000])
except Exception as e:
    print(e)
