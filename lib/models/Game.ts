import mongoose from 'mongoose';

const GameSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  gameType: { type: String, required: true, enum: ['tp', 'pk', 'rummy', 'bj'] },
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

GameSchema.index({ userId: 1, gameType: 1 }, { unique: true });

export default mongoose.models.Game || mongoose.model('Game', GameSchema);
