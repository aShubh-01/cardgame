import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  gameType: { type: String, required: true, enum: ['tp', 'pk', 'rummy', 'bj'] },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  userEmail: { type: String, default: null },
  players: { type: Array, default: [] },
  ante: {
    mode: { type: String, default: 'each' },
    amt: { type: Number, default: 100 }
  },
  balanceMode: { type: Boolean, default: false },
  defaultBuyIn: { type: Number, default: 1000 },
  round: { type: mongoose.Schema.Types.Mixed, default: null },
  debts: { type: Object, default: {} },
  wins: { type: Object, default: {} },
  hist: { type: Array, default: [] },
  rno: { type: Number, default: 0 },
  seq: { type: Number, default: 1 },
  tot: {
    rounds: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    big: { type: Number, default: 0 }
  },
  rummyConfig: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true, minimize: false });

SessionSchema.index({ userId: 1, gameType: 1 });

export default mongoose.models.Session || mongoose.model('Session', SessionSchema);

