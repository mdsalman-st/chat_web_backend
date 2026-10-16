import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    salt: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['student', 'employee', 'trader', 'creator', 'developer', 'freelancer', 'teacher', 'doctor', 'other'],
      default: 'student',
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    secretCode: {
      type: String,
      select: false,
    },
    roleDetails: {
      type: Object,
      default: {},
    },
    lastLogin: Date,
  },
  {
    timestamps: true,
  }
);

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.salt;
  delete obj.secretCode;
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;