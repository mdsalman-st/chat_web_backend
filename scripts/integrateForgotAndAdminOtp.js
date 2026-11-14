import fs from 'fs';

// ============================================================================
// 1. UPDATE auth.html WITH FORGOT PASSWORD MODAL & LINK
// ============================================================================
const authPath = 'd:/nexus/public/auth.html';
let authHtml = fs.readFileSync(authPath, 'utf8');

// Add "Forgot password?" link above login password
const pwdLabel = `<label class="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Password</label>`;
const newPwdLabel = `
            <div class="flex justify-between items-center mb-2">
              <label class="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Password</label>
              <button type="button" onclick="openForgotModal()" class="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold transition">Forgot password?</button>
            </div>
`;

if (!authHtml.includes('openForgotModal')) {
  authHtml = authHtml.replace(pwdLabel, newPwdLabel.trim());
}

// Add Forgot Password Modal HTML before </body>
const forgotModalHtml = `
  <!-- ================= FORGOT PASSWORD MODAL ================= -->
  <div id="forgotModal" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 opacity-0 pointer-events-none transition-all duration-300">
    <div class="w-full max-w-md bg-ink-900 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl transform scale-95 transition-all duration-300" id="forgotModalBox">
      
      <div class="flex justify-between items-center mb-5 pb-3 border-b border-white/[0.08]">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <span>🔐</span> Reset Your Password
        </h3>
        <button type="button" onclick="closeForgotModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <!-- STEP 1: Enter Email -->
      <div id="forgotStep1">
        <p class="text-xs text-slate-400 mb-4 leading-relaxed">
          Enter your registered email address. We will send you a 6-digit verification OTP code.
        </p>
        <div class="mb-4">
          <label class="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Registered Email</label>
          <input type="email" id="forgotEmail" placeholder="you@example.com" class="w-full px-4 py-3 rounded-xl bg-ink-950/60 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20">
        </div>
        <button type="button" id="forgotSendOtpBtn" onclick="sendForgotOtp()" class="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg hover:brightness-110 transition">
          Send Verification OTP
        </button>
      </div>

      <!-- STEP 2: Enter OTP + New Password -->
      <div id="forgotStep2" class="hidden">
        <div class="mb-4 p-3 rounded-xl bg-cyan-500/[0.08] border border-cyan-500/20 text-xs text-cyan-300">
          ✓ OTP sent to <strong id="forgotSentEmailDisplay" class="text-white"></strong>. Please check your inbox.
        </div>
        <div class="mb-4">
          <label class="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">6-Digit OTP Code</label>
          <input type="text" id="forgotOtp" maxlength="6" placeholder="123456" class="w-full px-4 py-3 rounded-xl bg-ink-950/60 border border-white/10 text-white text-center text-lg tracking-widest font-mono font-bold focus:outline-none focus:border-cyan-400">
        </div>
        <div class="mb-5">
          <label class="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">New Password (8+ chars)</label>
          <input type="password" id="forgotNewPassword" placeholder="Minimum 8 characters" class="w-full px-4 py-3 rounded-xl bg-ink-950/60 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400">
          <p class="text-[10px] text-slate-500 mt-1">Include uppercase, lowercase, number & special symbol.</p>
        </div>
        <button type="button" id="forgotResetBtn" onclick="submitResetPassword()" class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg hover:brightness-110 transition">
          Confirm & Reset Password
        </button>
        <button type="button" onclick="backToStep1()" class="w-full text-center text-xs text-slate-400 hover:text-white mt-3">
          ← Re-enter Email
        </button>
      </div>

    </div>
  </div>
`;

if (!authHtml.includes('id="forgotModal"')) {
  authHtml = authHtml.replace('</body>', forgotModalHtml + '\n</body>');
}

// Add JS handlers for Forgot Password modal
const forgotJs = `
    /* ---------- FORGOT PASSWORD MODAL LOGIC ---------- */
    window.openForgotModal = function() {
      const modal = document.getElementById('forgotModal');
      const box = document.getElementById('forgotModalBox');
      const loginEmail = document.getElementById('loginEmail').value.trim();
      if (loginEmail) document.getElementById('forgotEmail').value = loginEmail;
      
      modal.classList.remove('opacity-0', 'pointer-events-none');
      box.classList.remove('scale-95');
      box.classList.add('scale-100');
    };

    window.closeForgotModal = function() {
      const modal = document.getElementById('forgotModal');
      const box = document.getElementById('forgotModalBox');
      modal.classList.add('opacity-0', 'pointer-events-none');
      box.classList.remove('scale-100');
      box.classList.add('scale-95');
    };

    window.backToStep1 = function() {
      document.getElementById('forgotStep1').classList.remove('hidden');
      document.getElementById('forgotStep2').classList.add('hidden');
    };

    window.sendForgotOtp = async function() {
      const email = document.getElementById('forgotEmail').value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showToast('Please enter a valid registered email', 'error');
      }

      const btn = document.getElementById('forgotSendOtpBtn');
      btn.disabled = true;
      btn.textContent = 'Sending OTP…';

      try {
        const res = await API.auth.forgotPassword(email);
        showToast(res.message || 'OTP sent successfully', 'success');
        
        // If in dev mode, show toast with OTP for immediate test
        if (res.devOtp) {
          showToast('OTP: ' + res.devOtp + ' (Valid 10 mins)', 'info');
        }

        document.getElementById('forgotSentEmailDisplay').textContent = email;
        document.getElementById('forgotStep1').classList.add('hidden');
        document.getElementById('forgotStep2').classList.remove('hidden');
        document.getElementById('forgotOtp').focus();
      } catch (err) {
        showToast(err.message || 'Failed to send OTP', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Verification OTP';
      }
    };

    window.submitResetPassword = async function() {
      const email = document.getElementById('forgotEmail').value.trim();
      const otp = document.getElementById('forgotOtp').value.trim();
      const newPassword = document.getElementById('forgotNewPassword').value;

      if (!otp || otp.length !== 6) {
        return showToast('Enter 6-digit OTP code', 'error');
      }
      if (!newPassword || newPassword.length < 8) {
        return showToast('Password must be at least 8 characters', 'error');
      }

      const btn = document.getElementById('forgotResetBtn');
      btn.disabled = true;
      btn.textContent = 'Resetting…';

      try {
        const res = await API.auth.resetPassword(email, otp, newPassword);
        showToast('Password reset successfully! Please sign in.', 'success');
        closeForgotModal();
        backToStep1();
        document.getElementById('loginEmail').value = email;
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
      } catch (err) {
        showToast(err.message || 'Failed to reset password', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm & Reset Password';
      }
    };
`;

if (!authHtml.includes('openForgotModal = function')) {
  authHtml = authHtml.replace('</script>\n\n</body>', forgotJs + '\n  </script>\n\n</body>');
  fs.writeFileSync(authPath, authHtml, 'utf8');
  console.log('auth.html updated with Forgot Password modal & OTP flow!');
}

// ============================================================================
// 2. UPDATE admin-dashboard.html SETTINGS TAB (EMAIL OTP, PASSWORD OTP & SOCIALS)
// ============================================================================
const adminHtmlPath = 'd:/nexus/public/admin-dashboard.html';
let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

const profileTabOld = `        <form onsubmit="handleUpdateProfile(event)" class="mb-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div><label class="text-xs font-bold text-slate-500 block mb-2 ml-1">Full Name</label><input type="text" id="profileName" class="neu-inner w-full px-4 py-3.5 text-sm"></div>
              <div><label class="text-xs font-bold text-slate-500 block mb-2 ml-1">Email (Read-only)</label><input type="email" id="profileEmail" disabled class="neu-inner w-full px-4 py-3.5 text-sm opacity-50"></div>
            </div>
            <button type="submit" class="neu-btn px-8 py-4 text-sm text-blue-600">Update Profile</button>
        </form>`;

const profileTabNew = `
        <!-- ADMIN PROFILE & EMAIL CHANGE -->
        <div class="mb-8 p-6 neu-inner rounded-2xl">
          <h3 class="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span>👤</span> Super Admin Details & Email Change
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="text-xs font-bold text-slate-500 block mb-1">Full Name</label>
              <input type="text" id="profileName" class="neu-inner w-full px-4 py-2.5 text-sm" placeholder="Admin Name">
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 block mb-1">Current Registered Email</label>
              <input type="email" id="profileEmail" disabled class="neu-inner w-full px-4 py-2.5 text-sm opacity-70">
            </div>
          </div>
          <div class="flex flex-wrap gap-3">
            <button type="button" onclick="handleUpdateProfileName()" class="neu-btn px-5 py-2.5 text-xs text-blue-600">
              Save Name
            </button>
            <button type="button" onclick="openEmailChangeModal()" class="neu-btn px-5 py-2.5 text-xs text-emerald-600">
              Change Admin Email (with OTP) ✉️
            </button>
            <button type="button" onclick="openAdminPasswordModal()" class="neu-btn px-5 py-2.5 text-xs text-purple-600">
              Change Admin Password (with OTP) 🔑
            </button>
          </div>
        </div>

        <!-- SOCIAL MEDIA LINKS CONFIGURATION -->
        <div class="mb-8 p-6 neu-inner rounded-2xl">
          <h3 class="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            <span>🌐</span> Official Social Media Channels (Website Footer & Header)
          </h3>
          <p class="text-xs text-slate-500 mb-4">Update the official links where students can follow Nexus on Telegram, WhatsApp, YouTube, and Instagram.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="text-xs font-bold text-slate-500 block mb-1">📢 Telegram Channel / Group</label>
              <input type="url" id="socialTelegram" class="neu-inner w-full px-4 py-2.5 text-sm" placeholder="https://t.me/nexus_edtech">
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 block mb-1">💬 WhatsApp Channel / Community</label>
              <input type="url" id="socialWhatsapp" class="neu-inner w-full px-4 py-2.5 text-sm" placeholder="https://whatsapp.com/channel/...">
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 block mb-1">📺 YouTube Channel</label>
              <input type="url" id="socialYoutube" class="neu-inner w-full px-4 py-2.5 text-sm" placeholder="https://youtube.com/@nexusedtech">
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 block mb-1">📸 Instagram Profile</label>
              <input type="url" id="socialInstagram" class="neu-inner w-full px-4 py-2.5 text-sm" placeholder="https://instagram.com/nexus_edtech">
            </div>
          </div>
          <button type="button" onclick="saveSocialLinks()" class="neu-btn px-6 py-2.5 text-xs text-blue-600">
            Save Social Media Links ✓
          </button>
        </div>
`;

if (!adminHtml.includes('openEmailChangeModal')) {
  adminHtml = adminHtml.replace(profileTabOld, profileTabNew.trim());
}

// Add Email Change & Password Modals to admin-dashboard.html
const adminModals = `
  <!-- EMAIL CHANGE MODAL -->
  <div id="emailChangeModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="neu-card p-6 w-full max-w-md">
      <h3 class="text-lg font-black text-slate-800 mb-2">Change Admin Email Address</h3>
      <p class="text-xs text-slate-500 mb-4">A 6-digit OTP will be sent to the new email address to verify ownership.</p>
      <div id="emailStep1">
        <div class="mb-4">
          <label class="text-xs font-bold text-slate-500 block mb-1">New Email Address</label>
          <input type="email" id="newAdminEmailInput" class="neu-inner w-full px-4 py-2.5 text-sm" placeholder="newadmin@gmail.com">
        </div>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="closeEmailChangeModal()" class="neu-btn px-4 py-2 text-xs">Cancel</button>
          <button type="button" onclick="requestAdminEmailOtp()" id="btnReqEmailOtp" class="neu-btn px-4 py-2 text-xs text-blue-600">Send OTP</button>
        </div>
      </div>
      <div id="emailStep2" class="hidden">
        <div class="mb-4">
          <label class="text-xs font-bold text-slate-500 block mb-1">Enter 6-Digit OTP</label>
          <input type="text" id="emailChangeOtp" maxlength="6" class="neu-inner w-full px-4 py-2.5 text-sm text-center font-mono font-bold tracking-widest" placeholder="123456">
        </div>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="closeEmailChangeModal()" class="neu-btn px-4 py-2 text-xs">Cancel</button>
          <button type="button" onclick="verifyAdminEmailOtp()" id="btnVerifyEmailOtp" class="neu-btn px-4 py-2 text-xs text-emerald-600">Verify & Update Email</button>
        </div>
      </div>
    </div>
  </div>

  <!-- PASSWORD CHANGE MODAL -->
  <div id="adminPasswordModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="neu-card p-6 w-full max-w-md">
      <h3 class="text-lg font-black text-slate-800 mb-2">Change Admin Password with OTP</h3>
      <p class="text-xs text-slate-500 mb-4">For security, an OTP will be sent to your registered email before changing the password.</p>
      <div id="pwdStep1">
        <p class="text-xs text-slate-600 mb-4">Click below to send OTP to your current email.</p>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="closeAdminPasswordModal()" class="neu-btn px-4 py-2 text-xs">Cancel</button>
          <button type="button" onclick="requestAdminPwdOtp()" id="btnReqPwdOtp" class="neu-btn px-4 py-2 text-xs text-blue-600">Send Password OTP</button>
        </div>
      </div>
      <div id="pwdStep2" class="hidden">
        <div class="mb-3">
          <label class="text-xs font-bold text-slate-500 block mb-1">6-Digit OTP Code</label>
          <input type="text" id="adminPwdOtp" maxlength="6" class="neu-inner w-full px-4 py-2 text-sm text-center font-mono font-bold tracking-widest" placeholder="123456">
        </div>
        <div class="mb-4">
          <label class="text-xs font-bold text-slate-500 block mb-1">New Password (8+ chars, upper/lower/symbol)</label>
          <input type="password" id="adminNewPassword" class="neu-inner w-full px-4 py-2 text-sm" placeholder="••••••••">
        </div>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="closeAdminPasswordModal()" class="neu-btn px-4 py-2 text-xs">Cancel</button>
          <button type="button" onclick="verifyAdminPwdOtp()" id="btnVerifyPwdOtp" class="neu-btn px-4 py-2 text-xs text-emerald-600">Update Password</button>
        </div>
      </div>
    </div>
  </div>
`;

if (!adminHtml.includes('id="emailChangeModal"')) {
  adminHtml = adminHtml.replace('</body>', adminModals + '\n</body>');
  fs.writeFileSync(adminHtmlPath, adminHtml, 'utf8');
  console.log('admin-dashboard.html updated with Email & Password OTP modals!');
}

// ============================================================================
// 3. UPDATE admin-dashboard.js WITH ADMIN OTP & SOCIAL MEDIA LOGIC
// ============================================================================
const adminJsPath = 'd:/nexus/public/admin-dashboard.js';
let adminJs = fs.readFileSync(adminJsPath, 'utf8');

const adminSettingsJs = `
  // =========================================
  // ADMIN OTP & SOCIAL MEDIA SETTINGS
  // =========================================
  window.openEmailChangeModal = function() {
    $('emailChangeModal').classList.remove('hidden');
    $('emailStep1').classList.remove('hidden');
    $('emailStep2').classList.add('hidden');
    $('newAdminEmailInput').focus();
  };
  window.closeEmailChangeModal = function() {
    $('emailChangeModal').classList.add('hidden');
  };

  window.openAdminPasswordModal = function() {
    $('adminPasswordModal').classList.remove('hidden');
    $('pwdStep1').classList.remove('hidden');
    $('pwdStep2').classList.add('hidden');
  };
  window.closeAdminPasswordModal = function() {
    $('adminPasswordModal').classList.add('hidden');
  };

  window.requestAdminEmailOtp = async function() {
    const newEmail = $('newAdminEmailInput').value.trim();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      alert('Please enter a valid email address');
      return;
    }
    const btn = $('btnReqEmailOtp');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res = await API.auth.requestEmailChange(newEmail);
      alert(res.message || 'OTP sent successfully');
      if (res.devOtp) alert('Verification OTP: ' + res.devOtp);
      $('emailStep1').classList.add('hidden');
      $('emailStep2').classList.remove('hidden');
    } catch (err) {
      alert(err.message || 'Failed to request email OTP');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send OTP';
    }
  };

  window.verifyAdminEmailOtp = async function() {
    const otp = $('emailChangeOtp').value.trim();
    if (!otp || otp.length !== 6) {
      alert('Enter 6-digit OTP code');
      return;
    }
    const btn = $('btnVerifyEmailOtp');
    btn.disabled = true;
    btn.textContent = 'Verifying…';

    try {
      const res = await API.auth.verifyEmailChange(otp);
      alert('Email updated successfully! Please re-login with your new email.');
      closeEmailChangeModal();
      API.auth.logout();
      window.location.href = 'auth.html';
    } catch (err) {
      alert(err.message || 'OTP verification failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verify & Update Email';
    }
  };

  window.requestAdminPwdOtp = async function() {
    const btn = $('btnReqPwdOtp');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res = await API.auth.requestPasswordOtp();
      alert(res.message || 'OTP sent to your registered email');
      if (res.devOtp) alert('Password Reset OTP: ' + res.devOtp);
      $('pwdStep1').classList.add('hidden');
      $('pwdStep2').classList.remove('hidden');
    } catch (err) {
      alert(err.message || 'Failed to send OTP');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Password OTP';
    }
  };

  window.verifyAdminPwdOtp = async function() {
    const otp = $('adminPwdOtp').value.trim();
    const newPassword = $('adminNewPassword').value;

    if (!otp || otp.length !== 6) {
      alert('Enter 6-digit OTP');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      alert('Password must be 8+ characters');
      return;
    }
    const btn = $('btnVerifyPwdOtp');
    btn.disabled = true;
    btn.textContent = 'Updating…';

    try {
      const res = await API.auth.verifyPasswordOtp(otp, newPassword);
      alert(res.message || 'Password changed successfully!');
      closeAdminPasswordModal();
    } catch (err) {
      alert(err.message || 'Failed to update password');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  };

  window.handleUpdateProfileName = async function() {
    const name = $('profileName').value.trim();
    if (!name) return alert('Name cannot be empty');
    try {
      await API.auth.updateDetails({ name });
      alert('Admin name updated successfully');
    } catch (err) {
      alert(err.message || 'Failed to update name');
    }
  };

  // Load & Save Social Links
  window.loadPlatformSettings = async function() {
    try {
      const res = await API.auth.getPlatformConfig();
      if (res && res.config && res.config.socialLinks) {
        if ($('socialTelegram')) $('socialTelegram').value = res.config.socialLinks.telegram || '';
        if ($('socialWhatsapp')) $('socialWhatsapp').value = res.config.socialLinks.whatsapp || '';
        if ($('socialYoutube')) $('socialYoutube').value = res.config.socialLinks.youtube || '';
        if ($('socialInstagram')) $('socialInstagram').value = res.config.socialLinks.instagram || '';
      }
    } catch (e) {}
  };

  window.saveSocialLinks = async function() {
    try {
      const socialLinks = {
        telegram: $('socialTelegram')?.value.trim() || '',
        whatsapp: $('socialWhatsapp')?.value.trim() || '',
        youtube: $('socialYoutube')?.value.trim() || '',
        instagram: $('socialInstagram')?.value.trim() || ''
      };
      await API.auth.updatePlatformConfig({ socialLinks });
      alert('Social media links saved successfully to platform database!');
    } catch (err) {
      alert(err.message || 'Failed to save social media links');
    }
  };
`;

if (!adminJs.includes('openEmailChangeModal = function')) {
  adminJs += '\n' + adminSettingsJs;
  // Trigger loadPlatformSettings when switching to profile
  adminJs = adminJs.replace("if (tabId === 'feedbacks') loadAdminFeedbacks();", "if (tabId === 'feedbacks') loadAdminFeedbacks();\n    if (tabId === 'profile') loadPlatformSettings();");
  fs.writeFileSync(adminJsPath, adminJs, 'utf8');
  console.log('admin-dashboard.js updated with Admin OTP & Socials settings!');
}
