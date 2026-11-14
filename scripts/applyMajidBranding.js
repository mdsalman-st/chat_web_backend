import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = 'd:/nexus/public';

console.log('🚀 Starting MAJID Rebranding across all frontend assets...\n');

// 1. Update manifest.json
const manifestPath = path.join(PUBLIC_DIR, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.name = 'MAJID — Adaptive AI Workspace & Exam Prep';
  manifest.short_name = 'MAJID';
  manifest.description = 'India\'s AI-powered exam preparation & adaptive workspace for BSEB, CBSE, UP Board students.';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('✅ Updated manifest.json');
}

// 2. Generate clean SVG favicons and app icons
const svgFaviconContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="16" fill="#080e1e"/>
  <!-- Glowing golden aura -->
  <circle cx="32" cy="24" r="14" fill="#f59e0b" opacity="0.15"/>
  <!-- Light rays -->
  <path d="M32 7L32 4M21 11L18 8M43 11L46 8" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Golden Open Book -->
  <path d="M32 18C26 14 18 14 13 16V34C18 32 26 32 32 36C38 32 46 32 51 34V16C46 14 38 14 32 18Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.8"/>
  <path d="M32 18V36" stroke="#b45309" stroke-width="1.8"/>
  <!-- Leaping Children Silhouette Lines -->
  <path d="M15 50L21 42L25 36M21 42L17 38M25 36L29 29" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="26" cy="28" r="2.5" fill="#38bdf8"/>
  <path d="M49 50L43 42L39 36M43 42L47 38M39 36L35 29" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="38" cy="28" r="2.5" fill="#38bdf8"/>
  <!-- MAJID Typography -->
  <text x="32" y="58" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="900" fill="#ffffff" letter-spacing="1.2">MAJID</text>
</svg>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), svgFaviconContent, 'utf8');
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.svg'), svgFaviconContent, 'utf8');
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.svg'), svgFaviconContent, 'utf8');
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.svg'), svgFaviconContent, 'utf8');
console.log('✅ Generated MAJID vector icons (favicon.svg, icon-192.svg, icon-512.svg, apple-touch-icon.svg)');

// 3. Process all HTML files
const htmlFiles = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
  const filePath = path.join(PUBLIC_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace Title tag
  content = content.replace(/<title>(.*?)<\/title>/gi, (match, title) => {
    let newTitle = title.replace(/\bNexus\b/g, 'MAJID');
    return `<title>${newTitle}</title>`;
  });

  // Replace meta apple-mobile-web-app-title and application-name
  content = content.replace(/(<meta\s+name=["']apple-mobile-web-app-title["']\s+content=["'])Nexus(["']>)/gi, '$1MAJID$2');
  content = content.replace(/(<meta\s+name=["']application-name["']\s+content=["'])Nexus(["']>)/gi, '$1MAJID$2');
  content = content.replace(/(<meta\s+name=["']author["']\s+content=["'])Nexus EdTech(["']>)/gi, '$1MAJID EdTech$2');

  // Replace og:title & twitter:title
  content = content.replace(/(<meta\s+property=["']og:title["']\s+content=["'][^"']*?)Nexus([^"']*?["']>)/gi, '$1MAJID$2');
  content = content.replace(/(<meta\s+name=["']twitter:title["']\s+content=["'][^"']*?)Nexus([^"']*?["']>)/gi, '$1MAJID$2');

  // Specific: index.html replacements
  if (file === 'index.html') {
    // Header logo
    content = content.replace(
      /<a href="index\.html" class="site-logo" aria-label="[^"]*">\s*<span class="site-logo-icon">⚡<\/span>\s*<span>Nexus<\/span>\s*<\/a>/gi,
      `<a href="index.html" class="site-logo" aria-label="MAJID Home">
        <img src="logo.jpg" alt="MAJID Logo" class="site-logo-img">
        <span>MAJID</span>
      </a>`
    );

    // Footer brand title
    content = content.replace(
      /<div class="footer-brand-title">\s*<span[^>]*>⚡<\/span>\s*Nexus\s*<\/div>/gi,
      `<div class="footer-brand-title" style="display: flex; align-items: center; gap: 10px;">
            <img src="logo.jpg" alt="MAJID Logo" style="width: 32px; height: 32px; border-radius: 8px; object-fit: contain; background: #fff; padding: 2px;">
            <span>MAJID</span>
          </div>`
    );

    // Copyright
    content = content.replace(/© 2026 Nexus/gi, '© 2026 MAJID');
    content = content.replace(/Nexus EdTech/gi, 'MAJID EdTech');
    content = content.replace(/"name":\s*"Nexus"/gi, '"name": "MAJID"');
  }

  // Specific: auth.html
  if (file === 'auth.html') {
    content = content.replace(
      /<h1 class="font-black tracking-\[-0\.03em\] text-\[clamp\(1\.8rem,4\.5vw,2\.5rem\)\] text-white mb-3">\s*Welcome to <span class="grad-text">Nexus<\/span>\s*<\/h1>/gi,
      `<img src="logo.jpg" alt="MAJID Logo" class="w-16 h-16 rounded-2xl object-contain bg-white p-1 mb-3 shadow-[0_0_25px_rgba(255,255,255,0.15)] mx-auto">
      <h1 class="font-black tracking-[-0.03em] text-[clamp(1.8rem,4.5vw,2.5rem)] text-white mb-3">
        Welcome to <span class="grad-text">MAJID</span>
      </h1>`
    );
  }

  // Specific: admin-dashboard.html
  if (file === 'admin-dashboard.html') {
    content = content.replace(
      /<div class="w-10 h-10 rounded-full neu-inner flex items-center justify-center text-xl">👑<\/div>\s*<div>\s*<h1 class="text-base font-black leading-tight text-slate-800">Super Admin<\/h1>\s*<p class="text-\[10px\] font-bold text-slate-500 uppercase tracking-widest">Nexus Control<\/p>\s*<\/div>/gi,
      `<img src="logo.jpg" alt="MAJID Logo" class="w-10 h-10 rounded-xl object-contain bg-white p-0.5 shadow-sm border border-slate-200">
      <div>
        <h1 class="text-base font-black leading-tight text-slate-800">MAJID Admin</h1>
        <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Super Control</p>
      </div>`
    );
  }

  // Universal Sidebar logo in other dashboards (student-dashboard, analytics, calendar, dashboard, files, messages, notes, settings, tasks, etc.)
  content = content.replace(
    /<div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white text-base font-bold shadow-[^"]*">⚡<\/div>\s*<div>\s*<p class="text-base font-black[^"]*">Nexus<\/p>/gi,
    `<img src="logo.jpg" alt="MAJID Logo" class="w-9 h-9 rounded-xl object-contain bg-white p-0.5 shadow-md">
          <div>
            <p class="text-base font-black leading-tight">MAJID</p>`
  );

  // Secondary sidebar logos (e.g. pages.html)
  content = content.replace(
    /<div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">⚡<\/div>\s*<span class="text-base font-black text-white">Nexus<\/span>/gi,
    `<img src="logo.jpg" alt="MAJID Logo" class="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shadow-sm">
        <span class="text-base font-black text-white">MAJID</span>`
  );

  content = content.replace(
    /<div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">⚡<\/div>\s*<span class="text-sm font-black text-white">Nexus<\/span>/gi,
    `<img src="logo.jpg" alt="MAJID Logo" class="w-7 h-7 rounded-lg object-contain bg-white p-0.5 shadow-sm">
        <span class="text-sm font-black text-white">MAJID</span>`
  );

  // Generic copyright replacement
  content = content.replace(/©\s*2026\s*Nexus/gi, '© 2026 MAJID');
  content = content.replace(/Welcome to Nexus/gi, 'Welcome to MAJID');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Branded: ${file}`);
  } else {
    console.log(`ℹ️  No changes needed: ${file}`);
  }
});

console.log('\n🎉 MAJID Rebranding completed successfully!');
