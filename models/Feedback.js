import mongoose from 'mongoose';

const FeedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  name: {
    type: String,
    trim: true,
    default: 'Anonymous Student'
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  category: {
    type: String,
    enum: ['rating', 'bug', 'feature', 'question', 'general'],
    default: 'general'
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  pageUrl: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['new', 'reviewed', 'resolved'],
    default: 'new'
  }
}, {
  timestamps: true
});

export default mongoose.model('Feedback', FeedbackSchema);
