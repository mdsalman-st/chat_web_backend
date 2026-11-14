import mongoose from 'mongoose';

const PlatformConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'default_platform_config'
  },
  socialLinks: {
    telegram: { type: String, default: 'https://t.me/nexus_edtech' },
    whatsapp: { type: String, default: 'https://whatsapp.com/channel/nexus' },
    youtube: { type: String, default: 'https://youtube.com/@nexusedtech' },
    instagram: { type: String, default: 'https://instagram.com/nexus_edtech' }
  },
  supportEmail: {
    type: String,
    default: 'alimdrahul01@gmail.com'
  },
  supportPhone: {
    type: String,
    default: '+91 9876543210'
  },
  announcement: {
    type: String,
    default: 'Welcome to Nexus 2026 Board Exam Portal!'
  }
}, {
  timestamps: true
});

export default mongoose.model('PlatformConfig', PlatformConfigSchema);
