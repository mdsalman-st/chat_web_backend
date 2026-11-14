import fs from 'fs';

// 1. Update index.html footer with social links
const indexPath = 'd:/nexus/public/index.html';
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const socialLinksHtml = `
          <div class="footer-social-links" style="display: flex; gap: 10px; margin-top: 1rem;">
            <a href="https://t.me/nexus_edtech" target="_blank" rel="noopener noreferrer" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; color: #38bdf8; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); font-size: 14px;" aria-label="Join our Telegram Channel">📢</a>
            <a href="https://whatsapp.com/channel/nexus" target="_blank" rel="noopener noreferrer" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; color: #4ade80; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); font-size: 14px;" aria-label="Join our WhatsApp Channel">💬</a>
            <a href="https://youtube.com/@nexusedtech" target="_blank" rel="noopener noreferrer" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; color: #f87171; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); font-size: 14px;" aria-label="Subscribe on YouTube">📺</a>
            <a href="https://instagram.com/nexus_edtech" target="_blank" rel="noopener noreferrer" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; color: #f472b6; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); font-size: 14px;" aria-label="Follow on Instagram">📸</a>
          </div>
`;

if (!indexHtml.includes('footer-social-links')) {
  indexHtml = indexHtml.replace('Made with pride for Indian Students\n          </div>', 'Made with pride for Indian Students\n          </div>\n' + socialLinksHtml);
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('index.html updated with social media icons in footer!');
}

// 2. Update pages.html contact cards to 4 cols with social handles
const pagesPath = 'd:/nexus/public/pages.html';
let pagesHtml = fs.readFileSync(pagesPath, 'utf8');

const oldCards = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">`;
const newCards = `<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">`;

const socialCard = `
        <div class="nx-card p-5">
          <div class="text-2xl mb-2">🌐</div>
          <p class="text-xs uppercase tracking-wider text-cyan-400 font-bold mb-1">Community</p>
          <div class="flex gap-2.5 mt-2">
            <a href="https://t.me/nexus_edtech" target="_blank" rel="noopener" class="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 font-bold hover:bg-blue-500/30">Telegram</a>
            <a href="https://whatsapp.com/channel/nexus" target="_blank" rel="noopener" class="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold hover:bg-emerald-500/30">WhatsApp</a>
          </div>
        </div>
`;

if (!pagesHtml.includes('Community</p>')) {
  pagesHtml = pagesHtml.replace(oldCards, newCards);
  pagesHtml = pagesHtml.replace('Bihar & All India (Online)</p>\n        </div>', 'Bihar & All India (Online)</p>\n        </div>\n' + socialCard);
  fs.writeFileSync(pagesPath, pagesHtml, 'utf8');
  console.log('pages.html updated with Social Media community card!');
}
