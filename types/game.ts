export interface Player {
  id: string;
  name: string;
  sit: boolean;
  balance?: number;
}

export interface Ante {
  mode: string;
  amt: number;
}

export interface PokerCard {
  rank: string;
  suit: string;
  red: boolean;
}

export interface Round {
  no: number;
  phase: string;
  parts: string[];
  contrib: Record<string, number>;
  folded: Record<string, number>;
  turn: string;
  stake: number;
  stack: string[];
  log: string[];
  lastBy: string;
  winner: string | null;
  street?: number;
  cur?: number;
  st?: Record<string, number>;
  acted?: Record<string, number>;
  locked?: boolean;
  winners?: string[];
  lastRaiser?: string | null;
  minRaise?: number;
  cards?: PokerCard[];
  allIn?: Record<string, boolean>;
  potWinners?: Record<string, string[]>;
  playerStatus?: Record<string, 'blind' | 'seen'>;
  dealer?: string;
  smallBlind?: { playerId: string; amt: number };
  bigBlind?: { playerId: string; amt: number };
}

export interface HistEntry {
  no: number;
  winner: string;
  pot: number;
  got: number;
  pays: { name: string; amt: number }[];
}

export interface GameState {
  players: Player[];
  ante: Ante;
  balanceMode?: boolean;
  defaultBuyIn?: number;
  round: Round | null;
  debts: Record<string, number>;
  wins: Record<string, number>;
  hist: HistEntry[];
  rno: number;
  seq: number;
  tot: { rounds: number; total: number; big: number };
  dealerIdx?: number;
  blinds?: { sb: number; bb: number };
  rummyConfig?: any;
}

export interface SessionDoc {
  _id: string;
  name: string;
  gameType: 'tp' | 'pk' | 'rummy' | 'bj';
  status: 'active' | 'archived';
  balanceMode?: boolean;
  players?: Player[];
  round?: Round | null;
  debts?: Record<string, number>;
  wins?: Record<string, number>;
  hist?: HistEntry[];
  tot?: { rounds: number; total: number; big: number };
  rummyConfig?: any;
  createdAt?: string;
  updatedAt?: string;
}

export type GType = 'tp' | 'pk' | 'rummy' | 'bj' | null;

export const COL = ['#c1121f', '#1b8a6b', '#7b2cbf', '#e07a00', '#2563eb', '#d6336c', '#0f766e', '#6b7280'];
export const STREETS = ['Pre-flop', 'Flop', 'Turn', 'River'];

export function freshGameState(): GameState {
  return {
    players: [],
    ante: { mode: 'each', amt: 100 },
    balanceMode: false,
    defaultBuyIn: 1000,
    round: null,
    debts: {},
    wins: {},
    hist: [],
    rno: 0,
    seq: 1,
    tot: { rounds: 0, total: 0, big: 0 },
  };
}

export const esc = (s: any) =>
  String(s).replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

export const money = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');

