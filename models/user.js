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
      enum: ['student', 'employee', 'trader', 'creator', 'developer', 'freelancer', 'teacher', 'doctor', 'admin', 'other'],
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
    studentProfile: {
      board: { type: String, default: 'ncert_default' },
      boardName: { type: String, default: 'NCERT Default' },
      isOtherBoard: { type: Boolean, default: false },
      otherBoardName: { type: String, default: '' },
      classLevel: { type: String, default: '10' },
      stream: { type: String, default: null },
      streamName: { type: String, default: null },
      medium: { type: String, enum: ['Hindi', 'English'], default: 'Hindi' },
      selectedSubjects: [
        {
          code: String,
          name: String,
          hindiName: String,
          icon: String,
        },
      ],
      academicYear: { type: String, default: '2025-2026' },
      targetGoal: { type: String, default: '' },
      isProfileComplete: { type: Boolean, default: false },
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