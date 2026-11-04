import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { requireSubjectAccess } from '../middleware/requireSubjectAccess.js';
import { adminOnly, superAdminOnly } from '../middleware/adminMiddleware.js';

async function runVerification() {
  console.log('🧪 Starting Admin Endpoints & Access Control Verification...\n');

  // Test 1: Test requireSubjectAccess with role 'super_admin'
  let passedSuperAdmin = false;
  requireSubjectAccess({ user: { role: 'super_admin' }, body: { subjectCode: 'physics' } }, {}, () => {
    passedSuperAdmin = true;
  });
  console.log(passedSuperAdmin ? '✅ requireSubjectAccess passes for super_admin' : '❌ Failed for super_admin');

  // Test 2: Test requireSubjectAccess with role 'admin' and no assignedSubject
  let passedAdminWithoutSubject = false;
  requireSubjectAccess({ user: { role: 'admin', assignedSubject: null }, body: { subjectCode: 'math' } }, {}, () => {
    passedAdminWithoutSubject = true;
  });
  console.log(passedAdminWithoutSubject ? '✅ requireSubjectAccess passes for platform admin without assignedSubject' : '❌ Failed for platform admin');

  // Test 3: Test requireSubjectAccess with role 'subject_admin' matching subject
  let passedSubjectAdminMatch = false;
  requireSubjectAccess({ user: { role: 'subject_admin', assignedSubject: 'mathematics' }, body: { subjectCode: 'mathematics' } }, {}, () => {
    passedSubjectAdminMatch = true;
  });
  console.log(passedSubjectAdminMatch ? '✅ requireSubjectAccess passes for subject_admin matching subject' : '❌ Failed for matching subject_admin');

  // Test 4: Test requireSubjectAccess with role 'subject_admin' mismatched subject
  let blockedSubjectAdminMismatch = false;
  const mockRes = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) blockedSubjectAdminMismatch = true;
      }
    })
  };
  requireSubjectAccess({ user: { role: 'subject_admin', assignedSubject: 'mathematics' }, body: { subjectCode: 'physics' } }, mockRes, () => {});
  console.log(blockedSubjectAdminMismatch ? '✅ requireSubjectAccess correctly blocks mismatched subject' : '❌ Failed to block mismatch');

  // Test 5: adminOnly middleware allows admin, super_admin, subject_admin
  let superAdminAllowed = false;
  adminOnly({ user: { role: 'super_admin' } }, {}, () => { superAdminAllowed = true; });
  let adminAllowed = false;
  adminOnly({ user: { role: 'admin' } }, {}, () => { adminAllowed = true; });
  let subjectAdminAllowed = false;
  adminOnly({ user: { role: 'subject_admin' } }, {}, () => { subjectAdminAllowed = true; });

  console.log(superAdminAllowed && adminAllowed && subjectAdminAllowed ? '✅ adminOnly correctly allows admin, super_admin, and subject_admin' : '❌ adminOnly blocked a valid admin role');

  console.log('\n🎉 Verification completed successfully!');
}

runVerification();
