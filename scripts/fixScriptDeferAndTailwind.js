import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = 'd:/nexus/public';

console.log('🔧 Fixing Tailwind CDN, API.js defer, and auth.html visibility...\n');

// 1. Fix auth.html specifically
const authPath = path.join(PUBLIC_DIR, 'auth.html');
let authContent = fs.readFileSync(authPath, 'utf8');

// Remove defer from tailwind and api.js
authContent = authContent.replace(
  /<script src="https:\/\/cdn\.tailwindcss\.com" defer><\/script>/g,
  '<script src="https://cdn.tailwindcss.com"></script>'
);

authContent = authContent.replace(
  /<script src="api\.js" defer><\/script>/g,
  '<script src="api.js"></script>'
);

// Ensure .anim never hides the form with opacity: 0
authContent = authContent.replace(
  /\.anim\s*\{\s*opacity:\s*0\s*;/g,
  '.anim { opacity: 1;'
);

fs.writeFileSync(authPath, authContent, 'utf8');
console.log('✅ auth.html fixed: Tailwind loaded synchronously, API.js ready, .anim opacity restored to 1');

// 2. Fix all other HTML files for Tailwind CDN and api.js
const htmlFiles = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
  if (file === 'auth.html') return;
  const filePath = path.join(PUBLIC_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Tailwind CDN must run synchronously so tailwind.config and classes work properly
  content = content.replace(
    /<script src="https:\/\/cdn\.tailwindcss\.com" defer><\/script>/g,
    '<script src="https://cdn.tailwindcss.com"></script>'
  );

  // api.js must be ready before page-specific scripts execute
  content = content.replace(
    /<script src="api\.js" defer><\/script>/g,
    '<script src="api.js"></script>'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed scripts in: ${file}`);
  }
});

console.log('\n🎉 All pages updated cleanly!');
