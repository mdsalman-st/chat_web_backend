import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: 100,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: '',
    },
    color: {
      type: String,
      enum: ['yellow', 'blue', 'green', 'pink', 'purple', 'gray'],
      default: 'yellow',
    },
    roleTag: {
      type: String,
      trim: true,
      default: '',
    },
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

noteSchema.index({ user: 1, pinned: -1, updatedAt: -1 });

const Note = mongoose.model('Note', noteSchema);

export default Note;