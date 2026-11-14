import fs from 'fs';
import path from 'path';

const publicDir = 'd:\\nexus\\public';

// List of HTML files to optimize (excluding already optimized ones and partials like vault.html)
const targetFiles = [
  'admin-dashboard.html',
  'analytics.html',
  'calendar.html',
  'credentials.html',
  'details.html',
  'files.html',
  'messages.html',
  'notes.html',
  'pages.html',
  'settings.html',
  'student-dashboard.html',
  'subject-admin.html',
  'tasks.html',
  'test-live.html',
  'test-results.html',
  'test-select.html'
];

const fileDescriptions = {
  'admin-dashboard.html': 'Super Admin Dashboard — Nexus Management & Control',
  'analytics.html': 'Performance Analytics & Learning Insights — Nexus',
  'calendar.html': 'Interactive Study Schedule & Exam Calendar — Nexus',
  'credentials.html': 'Setup Account Credentials & Security — Nexus',
  'details.html': 'Profile & Academic Details Setup — Nexus',
  'files.html': 'Study Materials & Document Vault — Nexus',
  'messages.html': 'Secure Messages & Announcements — Nexus',
  'notes.html': 'Smart Revision Notes & Study Journal — Nexus',
  'pages.html': 'Workspace Navigation & Quick Access — Nexus',
  'settings.html': 'Account Settings & Preferences — Nexus',
  'student-dashboard.html': 'Student Learning Dashboard & Exam Prep — Nexus',
  'subject-admin.html': 'Subject & Curriculum Management — Nexus',
  'tasks.html': 'Daily Study Tasks & Productivity Planner — Nexus',
  'test-live.html': 'Live Digital Board Exam Environment — Nexus',
  'test-results.html': 'Exam Performance Scorecard & Analysis — Nexus',
  'test-select.html': 'Select Board Exam & Chapter Practice Test — Nexus'
};

for (const fileName of targetFiles) {
  const filePath = path.join(publicDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping missing file: ${fileName}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Ensure <html lang="en">
  content = content.replace(/<html(?:\s+lang="[^"]*")?>/i, '<html lang="en">');

  // Check description
  const desc = fileDescriptions[fileName] || 'Nexus — Adaptive AI Workspace';

  // Extract title
  const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
  const currentTitle = titleMatch ? titleMatch[1] : 'Nexus';

  // Check if tailwind CDN is present
  const hasTailwind = content.includes('cdn.tailwindcss.com');

  const metaBlock = `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#05070d" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)">
  <meta name="color-scheme" content="dark light">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Nexus">
  <meta name="application-name" content="Nexus">
  <meta name="format-detection" content="telephone=no">
  <title>${currentTitle}</title>

  <!-- Preconnect & Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" media="print" onload="this.media='all'">

  <!-- PWA Manifest & Icons -->
  <link rel="manifest" href="manifest.json">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="apple-touch-icon" href="apple-touch-icon.svg">
  <link rel="icon" type="image/svg+xml" sizes="192x192" href="icon-192.svg">
  <link rel="icon" type="image/svg+xml" sizes="512x512" href="icon-512.svg">

  <!-- DNS Prefetch -->
  <link rel="dns-prefetch" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://fonts.gstatic.com">${hasTailwind ? '\n  <link rel="dns-prefetch" href="https://cdn.tailwindcss.com">' : ''}`;

  // Replace head portion up to fonts / title
  // Let's locate <head> ... and the existing font/meta tags
  // We can safely replace from <head> down to the first <script or <link rel="stylesheet"
  
  // Replace <head> with <head> + metaBlock, removing redundant old viewport, title, preconnect, google font links
  content = content.replace(/<head>([\s\S]*?)<\/head>/i, (match, headInner) => {
    // Remove old meta viewport, title, preconnect fonts, google fonts href, dns-prefetch, manifest
    let cleaned = headInner
      .replace(/<meta\s+charset=[^>]*>/gi, '')
      .replace(/<meta\s+name="viewport"[^>]*>/gi, '')
      .replace(/<meta\s+name="description"[^>]*>/gi, '')
      .replace(/<meta\s+name="theme-color"[^>]*>/gi, '')
      .replace(/<title>[^<]*<\/title>/gi, '')
      .replace(/<link\s+rel="preconnect"[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
      .replace(/<link\s+rel="preconnect"[^>]*fonts\.gstatic\.com[^>]*>/gi, '')
      .replace(/<link\s+href="https:\/\/fonts\.googleapis\.com\/css2\?[^>]*rel="stylesheet"[^>]*>/gi, '')
      .replace(/<link\s+rel="stylesheet"[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
      .replace(/<link\s+rel="manifest"[^>]*>/gi, '')
      .replace(/<link\s+rel="icon"[^>]*>/gi, '')
      .replace(/<link\s+rel="apple-touch-icon"[^>]*>/gi, '')
      .replace(/<link\s+rel="dns-prefetch"[^>]*>/gi, '')
      .trim();

    return `<head>\n${metaBlock}\n\n  ${cleaned}\n</head>`;
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Optimized: ${fileName}`);
}

console.log('All 16 files optimized successfully!');
