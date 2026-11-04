import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: 'backend/.env' });

async function updateUserRole() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({ email: String, role: String }));
  const res = await User.updateOne(
    { email: 'alimdrahul01@gmail.com' },
    { $set: { role: 'super_admin' } }
  );
  console.log('Updated user role to super_admin:', res);

  const u = await User.findOne({ email: 'alimdrahul01@gmail.com' });
  console.log('User now in DB:', u);
  await mongoose.disconnect();
}

updateUserRole().catch(console.error);
