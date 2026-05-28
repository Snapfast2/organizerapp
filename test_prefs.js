const fs = require('fs');
const path = require('path');
const prefsPath = path.join(process.env.APPDATA, 'Adobe', 'After Effects', '24.5', 'Adobe After Effects 24.5 Prefs.txt');
const content = fs.readFileSync(prefsPath, 'utf8');
const lines = content.split('\n');
let p = '';
for(let i=0; i<lines.length; i++){
  if (lines[i].includes('MRU Project Path ID # 0, File Path')) {
    let raw = lines[i].split('=')[1].trim();
    if (raw.endsWith('\\')) {
       raw = raw.replace(/^\"/, '').replace(/\"\\$/, '');
       p += raw;
       let j = i + 1;
       while (lines[j].trim().startsWith('\"')) {
          let nextRaw = lines[j].trim();
          let isEnd = !nextRaw.endsWith('\\');
          nextRaw = nextRaw.replace(/^\"/, '').replace(/\"\\$/, '').replace(/\"$/, '');
          p += nextRaw;
          if (isEnd) break;
          j++;
       }
    } else {
       p = raw.replace(/^\"|\"$/g, '');
    }
    break;
  }
}
console.log('Parsed path:', p);
