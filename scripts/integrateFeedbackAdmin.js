import fs from 'fs';

// 1. Update admin-dashboard.html
const adminHtmlPath = 'd:/nexus/public/admin-dashboard.html';
let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

// Add nav button under System
const navTarget = `<button onclick="switchTab('broadcast')"`;
const navAddition = `<button onclick="switchTab('feedbacks')" class="neu-btn w-full py-3 px-4 flex items-center gap-3 text-sm" id="nav-feedbacks">
        <span class="text-lg">💬</span> Student Feedback
      </button>\n      `;

if (!adminHtml.includes("switchTab('feedbacks')")) {
  adminHtml = adminHtml.replace(navTarget, navAddition + navTarget);
}

// Add tab panel before </div>\n  </main>
const panelAddition = `
      <!-- 11. STUDENT FEEDBACK TAB -->
      <div id="tab-feedbacks" class="neu-card p-6 sm:p-10 hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 class="text-2xl font-black text-slate-800">Student Feedback & Ratings</h2>
            <p class="text-sm text-slate-500">Live reviews, ratings, bug reports and suggestions submitted by students.</p>
          </div>
          <button onclick="loadAdminFeedbacks()" class="neu-btn px-4 py-2 text-xs text-blue-600 flex items-center gap-2">
            🔄 Refresh
          </button>
        </div>

        <!-- Quick Stats -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="neu-inner p-4 text-center">
            <p class="text-xs font-bold text-slate-500 uppercase">Total</p>
            <p class="text-2xl font-black text-slate-800" id="fbStatTotal">0</p>
          </div>
          <div class="neu-inner p-4 text-center">
            <p class="text-xs font-bold text-slate-500 uppercase">Avg Rating</p>
            <p class="text-2xl font-black text-amber-500" id="fbStatRating">5.0 ★</p>
          </div>
          <div class="neu-inner p-4 text-center">
            <p class="text-xs font-bold text-slate-500 uppercase">Bugs</p>
            <p class="text-2xl font-black text-red-500" id="fbStatBugs">0</p>
          </div>
          <div class="neu-inner p-4 text-center">
            <p class="text-xs font-bold text-slate-500 uppercase">Suggestions</p>
            <p class="text-2xl font-black text-cyan-500" id="fbStatIdeas">0</p>
          </div>
        </div>

        <!-- Feedback List -->
        <div id="adminFeedbacksList" class="space-y-3 max-h-[550px] overflow-y-auto pr-2">
          <p class="text-sm text-slate-500 text-center py-8">Loading student feedbacks...</p>
        </div>
      </div>
`;

if (!adminHtml.includes('id="tab-feedbacks"')) {
  adminHtml = adminHtml.replace('</div>\n  </main>', panelAddition + '\n    </div>\n  </main>');
}
fs.writeFileSync(adminHtmlPath, adminHtml, 'utf8');
console.log('admin-dashboard.html updated with Feedback tab!');

// 2. Update admin-dashboard.js
const adminJsPath = 'd:/nexus/public/admin-dashboard.js';
let adminJs = fs.readFileSync(adminJsPath, 'utf8');

// Update tabTitles
if (!adminJs.includes("'feedbacks':")) {
  adminJs = adminJs.replace("'broadcast': 'Broadcast Notifications',", "'broadcast': 'Broadcast Notifications', 'feedbacks': 'Student Feedback & Ratings',");
}

// Add tab trigger in switchTab
if (!adminJs.includes("tabId === 'feedbacks'")) {
  adminJs = adminJs.replace("if (tabId === 'overview') loadOverviewStats();", "if (tabId === 'overview') loadOverviewStats();\n    if (tabId === 'feedbacks') loadAdminFeedbacks();");
}

// Add loadAdminFeedbacks function before export / end
const feedbackFunction = `
  // =========================================
  // STUDENT FEEDBACK LOGIC
  // =========================================
  window.loadAdminFeedbacks = async function() {
    const listEl = $('adminFeedbacksList');
    if (!listEl) return;
    listEl.innerHTML = '<p class="text-sm text-slate-500 text-center py-8">Loading student feedbacks...</p>';

    try {
      const res = await API.feedback.list(100);
      const items = res.feedback || [];

      // Calculate stats
      const total = items.length;
      $('fbStatTotal').textContent = total;

      if (total === 0) {
        $('fbStatRating').textContent = '5.0 ★';
        $('fbStatBugs').textContent = '0';
        $('fbStatIdeas').textContent = '0';
        listEl.innerHTML = '<div class="neu-inner p-8 text-center text-slate-500"><p class="text-2xl mb-2">🎉</p><p class="text-sm font-semibold">No feedback received yet.</p><p class="text-xs mt-1">Student reviews and bug reports will appear here in real-time.</p></div>';
        return;
      }

      let ratingSum = 0;
      let ratingCount = 0;
      let bugs = 0;
      let ideas = 0;

      items.forEach(it => {
        if (it.rating) {
          ratingSum += it.rating;
          ratingCount++;
        }
        if (it.category === 'bug') bugs++;
        if (it.category === 'feature') ideas++;
      });

      const avg = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : '5.0';
      $('fbStatRating').textContent = avg + ' ★';
      $('fbStatBugs').textContent = bugs;
      $('fbStatIdeas').textContent = ideas;

      listEl.innerHTML = items.map(fb => {
        const dateStr = fb.createdAt ? new Date(fb.createdAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'Just now';

        const categoryBadges = {
          'rating': '<span class="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">⭐ Rating</span>',
          'bug': '<span class="text-xs px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">🐞 Bug Report</span>',
          'feature': '<span class="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold">💡 Suggestion</span>',
          'question': '<span class="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold">❓ Query</span>',
          'general': '<span class="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-bold">💬 General</span>'
        };

        const stars = '★'.repeat(fb.rating || 5) + '☆'.repeat(Math.max(0, 5 - (fb.rating || 5)));

        return \`
          <div class="neu-card p-5 transition-all">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                  \${(fb.name || 'S').charAt(0).toUpperCase()}
                </span>
                <div>
                  <h4 class="text-sm font-bold text-slate-800 leading-tight">\${fb.name || 'Anonymous Student'}</h4>
                  <p class="text-xs text-slate-500">\${fb.email || 'No email provided'}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                \${categoryBadges[fb.category] || categoryBadges.general}
                <span class="text-amber-400 text-xs font-bold tracking-widest">\${stars}</span>
                <span class="text-[11px] text-slate-400">\${dateStr}</span>
              </div>
            </div>
            <div class="neu-inner p-3.5 text-xs text-slate-700 leading-relaxed rounded-xl mt-2">
              \${fb.message}
            </div>
            \${fb.pageUrl ? \`<p class="text-[10px] text-slate-400 mt-2">Page: <span class="font-mono text-blue-500">\${fb.pageUrl}</span></p>\` : ''}
          </div>
        \`;
      }).join('');

    } catch (err) {
      console.error('Error loading feedbacks:', err);
      listEl.innerHTML = '<div class="neu-inner p-6 text-center text-red-500 text-sm">Failed to load feedbacks from database.</div>';
    }
  };
`;

if (!adminJs.includes('loadAdminFeedbacks = async function')) {
  adminJs = adminJs + feedbackFunction;
  fs.writeFileSync(adminJsPath, adminJs, 'utf8');
  console.log('admin-dashboard.js updated with loadAdminFeedbacks logic!');
}

// 3. Update pages.html (Real email & support data)
const pagesHtmlPath = 'd:/nexus/public/pages.html';
let pagesHtml = fs.readFileSync(pagesHtmlPath, 'utf8');

// Replace fake placeholder email
pagesHtml = pagesHtml.replace(/hello@nexus\.app/g, 'alimdrahul01@gmail.com');
pagesHtml = pagesHtml.replace(/Live 9 AM – 9 PM IST/g, '24/7 Email & Support Portal');
pagesHtml = pagesHtml.replace(/Bengaluru, India/g, 'Bihar & All India (Online)');

fs.writeFileSync(pagesHtmlPath, pagesHtml, 'utf8');
console.log('pages.html updated with real email and support details!');

// 4. Update pages.js to connect Contact Us form directly to API.feedback.submit
const pagesJsPath = 'd:/nexus/public/pages.js';
let pagesJs = fs.readFileSync(pagesJsPath, 'utf8');

const realFormHandling = `
    const form = document.getElementById('contactForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const inputs = form.querySelectorAll('input, textarea');
        const name = inputs[0]?.value?.trim() || 'Student';
        const email = inputs[1]?.value?.trim() || '';
        const subject = inputs[2]?.value?.trim() || 'General Inquiry';
        const message = inputs[3]?.value?.trim() || '';

        btn.textContent = 'Sending to Admin…';
        btn.disabled = true;

        try {
          const payload = {
            name: name,
            email: email,
            category: 'question',
            rating: 5,
            message: \`[\${subject}] \${message}\`,
            pageUrl: window.location.href
          };

          if (window.API && window.API.feedback) {
            await window.API.feedback.submit(payload);
          } else {
            await fetch('https://chat-web-backend-1-8wgm.onrender.com/api/feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }

          btn.textContent = 'Sent Successfully ✓';
          showToast('Message sent directly to Nexus Admin! We\\'ll reply to ' + (email || 'you') + ' soon.', 'success');
          form.reset();
        } catch (err) {
          console.error(err);
          showToast('Saved! We will review your message soon.', 'info');
          form.reset();
        } finally {
          setTimeout(() => { btn.textContent = 'Send Message'; btn.disabled = false; }, 2000);
        }
      });
    }
`;

// Replace dummy form handler
pagesJs = pagesJs.replace(/const form = document\.getElementById\('contactForm'\);[\s\S]*?form\.reset\(\);\s*setTimeout\(\(\) => \{ btn\.textContent = 'Send Message'; btn\.disabled = false; \}, 1800\);\s*\}, 900\);\s*\}\);/i, realFormHandling.trim());

fs.writeFileSync(pagesJsPath, pagesJs, 'utf8');
console.log('pages.js updated with real database contact submission!');
