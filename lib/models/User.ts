import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  image: { type: String },
  googleId: { type: String },
  lastLogin: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);

