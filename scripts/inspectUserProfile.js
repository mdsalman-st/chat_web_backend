import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkUsers() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const users = await User.find({}).sort({ updatedAt: -1 }).limit(5).lean();
  users.forEach(u => {
    console.log('User:', u.email, 'Role:', u.role);
    console.log('  studentProfile:', JSON.stringify(u.studentProfile));
    console.log('  roleDetails:', JSON.stringify(u.roleDetails));
  });
  await mongoose.disconnect();
}
checkUsers().catch(console.error);
