import fs from 'fs';
import path from 'path';

const publicDir = 'd:\\nexus\\public';
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html') && f !== 'vault.html');

console.log(`Fixing checklist items in ${htmlFiles.length} files...`);

for (const file of htmlFiles) {
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Add defer to non-role-guard scripts
  content = content.replace(/<script\s+src="([^"]+)"([^>]*)>/gi, (match, src, rest) => {
    if (src.includes('role-guard.js')) return match; // Keep role guard synchronous in head
    if (rest.includes('defer') || rest.includes('async')) return match;
    changed = true;
    return `<script src="${src}" defer${rest}>`;
  });

  // 2. Add aria-label to icon-only buttons if missing
  // Toggle sidebar button
  content = content.replace(/<button([^>]*onclick="toggleSidebar\(\)"[^>]*)>/gi, (match, attrs) => {
    if (attrs.includes('aria-label=')) return match;
    changed = true;
    return `<button${attrs} aria-label="Toggle navigation menu">`;
  });

  // Notif button
  content = content.replace(/<button([^>]*id="notifBtn"[^>]*)>/gi, (match, attrs) => {
    if (attrs.includes('aria-label=')) return match;
    changed = true;
    return `<button${attrs} aria-label="Notifications">`;
  });

  // Prev / Next calendar buttons
  content = content.replace(/<button([^>]*onclick="calPrevMonth\(\)"[^>]*)>/gi, (match, attrs) => {
    if (attrs.includes('aria-label=')) return match;
    changed = true;
    return `<button${attrs} aria-label="Previous month">`;
  });
  content = content.replace(/<button([^>]*onclick="calNextMonth\(\)"[^>]*)>/gi, (match, attrs) => {
    if (attrs.includes('aria-label=')) return match;
    changed = true;
    return `<button${attrs} aria-label="Next month">`;
  });

  // Generic icon-only buttons missing aria-label
  content = content.replace(/<button\s+([^>]*class="[^"]*(?:hover:text-white|w-9\s+h-9)[^"]*"[^>]*)>(\s*<svg[\s\S]*?<\/svg>\s*)<\/button>/gi, (match, attrs, svgInner) => {
    if (attrs.includes('aria-label=')) return match;
    changed = true;
    return `<button ${attrs} aria-label="Action button">${svgInner}</button>`;
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${file}`);
  }
}

console.log('Finished updating checklist fixes!');
