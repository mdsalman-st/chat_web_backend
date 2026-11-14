import fs from 'fs';
import path from 'path';

const publicDir = 'd:\\nexus\\public';
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

console.log(`Auditing ${htmlFiles.length} HTML files against the checklist...\n`);

let report = {
  imgTags: [],
  missingImgWidthHeight: [],
  missingImgAlt: [],
  scriptsWithoutDefer: [],
  inputsWithoutLabels: [],
  buttonsWithoutAria: [],
  fontDisplaySwap: [],
  viewportCheck: [],
  titleDescCheck: []
};

for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(publicDir, file), 'utf8');

  // 1. Check images
  const imgRegex = /<img\s+([^>]+)>/gi;
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    const fullTag = match[0];
    const attrs = match[1];
    report.imgTags.push({ file, tag: fullTag });
    if (!attrs.includes('width=') || !attrs.includes('height=')) {
      report.missingImgWidthHeight.push({ file, tag: fullTag });
    }
    if (!attrs.includes('alt=')) {
      report.missingImgAlt.push({ file, tag: fullTag });
    }
  }

  // 2. Check scripts
  const scriptRegex = /<script\s+src="([^"]+)"([^>]*)>/gi;
  while ((match = scriptRegex.exec(content)) !== null) {
    const src = match[1];
    const rest = match[2];
    if (!rest.includes('defer') && !rest.includes('async') && !src.includes('role-guard.js')) {
      report.scriptsWithoutDefer.push({ file, src, rest });
    }
  }

  // 3. Check font display=swap
  if (content.includes('fonts.googleapis.com')) {
    if (!content.includes('display=swap')) {
      report.fontDisplaySwap.push(file);
    }
  }

  // 4. Viewport & SEO
  if (!content.includes('name="viewport"')) {
    report.viewportCheck.push(file);
  }
  if (!content.includes('name="description"')) {
    report.titleDescCheck.push(file);
  }

  // 5. Inputs without label or aria-label
  const inputRegex = /<input\s+([^>]+)>/gi;
  while ((match = inputRegex.exec(content)) !== null) {
    const attrs = match[1];
    if (attrs.includes('type="hidden"')) continue;
    if (!attrs.includes('aria-label=') && !attrs.includes('id=')) {
      report.inputsWithoutLabels.push({ file, tag: match[0] });
    }
  }

  // 6. Icon buttons without aria-label
  const btnRegex = /<button\s+([^>]*)(?:aria-label="[^"]*")?([^>]*)>([\s\S]*?)<\/button>/gi;
  while ((match = btnRegex.exec(content)) !== null) {
    const fullBtn = match[0];
    const inner = match[3].trim();
    if (inner.includes('<svg') && !inner.replace(/<[^>]+>/g, '').trim()) {
      if (!fullBtn.includes('aria-label=')) {
        report.buttonsWithoutAria.push({ file, btn: fullBtn.slice(0, 100) });
      }
    }
  }
}

console.log('--- AUDIT RESULTS ---');
console.log(`Total <img> tags found: ${report.imgTags.length}`);
console.log(`Images missing width/height: ${report.missingImgWidthHeight.length}`);
console.log(`Images missing alt text: ${report.missingImgAlt.length}`);
console.log(`Scripts without defer (excluding head role-guard): ${report.scriptsWithoutDefer.length}`);
console.log(`Pages missing font-display=swap: ${report.fontDisplaySwap.length}`);
console.log(`Pages missing viewport: ${report.viewportCheck.length}`);
console.log(`Pages missing meta description: ${report.titleDescCheck.length}`);
console.log(`Buttons with only SVG missing aria-label: ${report.buttonsWithoutAria.length}`);

if (report.scriptsWithoutDefer.length > 0) {
  console.log('\nScripts needing defer:');
  report.scriptsWithoutDefer.forEach(s => console.log(`  ${s.file}: ${s.src}`));
}
if (report.buttonsWithoutAria.length > 0) {
  console.log('\nButtons needing aria-label:');
  report.buttonsWithoutAria.slice(0, 10).forEach(b => console.log(`  ${b.file}: ${b.btn}`));
}
