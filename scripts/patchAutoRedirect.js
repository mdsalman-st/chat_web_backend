import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = 'd:/nexus/public';

console.log('⚡ Patching Auto-Login Redirect across entry pages...\n');

// 1. Patch profession.html
const profPath = path.join(PUBLIC_DIR, 'profession.html');
let profContent = fs.readFileSync(profPath, 'utf8');
const redirectScript = `  <!-- ⚡ AUTO-REDIRECT IF ALREADY LOGGED IN -->
  <script>
    (function () {
      try {
        var token = localStorage.getItem('nexus_token') || localStorage.getItem('token');
        var rawUser = localStorage.getItem('nexus_user') || localStorage.getItem('user');
        if (token && rawUser) {
          var user = JSON.parse(rawUser);
          if (user && user.role) {
            var r = String(user.role).toLowerCase();
            if (r === 'super_admin' || r === 'admin') {
              window.location.replace('admin-dashboard.html');
            } else if (r === 'student') {
              window.location.replace('student-dashboard.html');
            } else {
              window.location.replace('dashboard.html');
            }
          }
        }
      } catch (e) {}
    })();
  </script>`;

if (!profContent.includes('AUTO-REDIRECT IF ALREADY LOGGED IN')) {
  profContent = profContent.replace(
    /<title>(.*?)<\/title>/i,
    `<title>$1</title>\n\n${redirectScript}`
  );
  fs.writeFileSync(profPath, profContent, 'utf8');
  console.log('✅ Patched profession.html with instant auto-redirect');
}

// 2. Patch auth.html
const authPath = path.join(PUBLIC_DIR, 'auth.html');
let authContent = fs.readFileSync(authPath, 'utf8');

// Fix login destination
authContent = authContent.replace(
  /setTimeout\(\(\)\s*=>\s*\{\s*window\.location\.href\s*=\s*'dashboard\.html';\s*\}, 320\);/g,
  `const role = String(res.user?.role || '').toLowerCase();
          const target = (role === 'super_admin' || role === 'admin') ? 'admin-dashboard.html' : (role === 'student' ? 'student-dashboard.html' : 'dashboard.html');
          setTimeout(() => { window.location.href = target; }, 320);`
);

// Fix bottom check
authContent = authContent.replace(
  /if\s*\(\s*API\.Token\.exists\(\)\s*\)\s*\{\s*window\.location\.href\s*=\s*'dashboard\.html';\s*\}/g,
  `if (API.Token.exists()) {
      var u = API.User.get();
      var r = String(u?.role || '').toLowerCase();
      var target = (r === 'super_admin' || r === 'admin') ? 'admin-dashboard.html' : (r === 'student' ? 'student-dashboard.html' : 'dashboard.html');
      window.location.replace(target);
    }`
);
fs.writeFileSync(authPath, authContent, 'utf8');
console.log('✅ Patched auth.html login routing and destination');

// 3. Patch role-guard.js
const guardPath = path.join(PUBLIC_DIR, 'role-guard.js');
let guardContent = fs.readFileSync(guardPath, 'utf8');

// Ensure staff on student page or super_admin on staff page route properly
const oldGuardLogic = `  if (pageType === 'student') {
    // Non-student on student page → send to staff dashboard
    if (role && role !== 'student') {
      window.location.replace('dashboard.html');
      return;
    }
  } else {
    // Student on staff page → send to student dashboard
    if (role === 'student') {
      window.location.replace('student-dashboard.html');
      return;
    }
  }`;

const newGuardLogic = `  if (pageType === 'student') {
    // Non-student on student page → send to proper dashboard
    if (role && role !== 'student') {
      if (role === 'super_admin' || role === 'admin') {
        window.location.replace('admin-dashboard.html');
      } else {
        window.location.replace('dashboard.html');
      }
      return;
    }
  } else {
    // Student on staff page → send to student dashboard
    if (role === 'student') {
      window.location.replace('student-dashboard.html');
      return;
    }
    // Super admin on general staff page → send to admin dashboard
    if (role === 'super_admin' || role === 'admin') {
      if (window.location.pathname.toLowerCase().indexOf('admin-dashboard') === -1) {
        window.location.replace('admin-dashboard.html');
        return;
      }
    }
  }`;

guardContent = guardContent.replace(oldGuardLogic, newGuardLogic);
fs.writeFileSync(guardPath, guardContent, 'utf8');
console.log('✅ Patched role-guard.js with super_admin smart routing');

console.log('\n🎉 Auto-Login Redirect fully activated!');
