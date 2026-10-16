import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MONGODB_URI missing in .env');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });

    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}