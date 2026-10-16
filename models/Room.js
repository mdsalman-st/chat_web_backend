import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    name: {
      type: String,
      default: '',
      trim: true,
    },
    lastMessage: {
      text: String,
      at: Date,
      sender: String,
    },
  },
  { timestamps: true }
);

const Room = mongoose.model('Room', roomSchema);

export default Room;