import fs from 'fs';

// files.html
let f = fs.readFileSync('d:/nexus/public/files.html', 'utf8');
f = f.replace(/id="viewGridBtn"/g, 'id="viewGridBtn" aria-label="Grid view"');
f = f.replace(/id="viewListBtn"/g, 'id="viewListBtn" aria-label="List view"');
fs.writeFileSync('d:/nexus/public/files.html', f, 'utf8');

// messages.html
let m = fs.readFileSync('d:/nexus/public/messages.html', 'utf8');
m = m.replace(/id="vaultSend"/g, 'id="vaultSend" aria-label="Send message"');
fs.writeFileSync('d:/nexus/public/messages.html', m, 'utf8');

// notes.html
let n = fs.readFileSync('d:/nexus/public/notes.html', 'utf8');
n = n.replace(/data-view="grid"/g, 'data-view="grid" aria-label="Grid view"');
n = n.replace(/data-view="list"/g, 'data-view="list" aria-label="List view"');
fs.writeFileSync('d:/nexus/public/notes.html', n, 'utf8');

console.log('Final 4 buttons patched with aria-label!');
