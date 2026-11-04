export interface Player {
  id: string;
  name: string;
  sit: boolean;
  balance?: number;
  userId?: string | null;
  isOnline?: boolean;
  isConnected?: boolean;
  lastSeenAt?: number;
  isGameOperator?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole?: 'go' | 'player';
  text: string;
  createdAt: number;
}

export interface GODisconnectEvent {
  disconnectedAt: number;
  expiresAt: number;
  status: 'volunteering' | 'queued';
  volunteerUserId?: string | null;
  volunteerName?: string | null;
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

export interface ChipRequest {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface DealerRequest {
  id: string;
  playerId: string;
  playerName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
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
  hands?: Record<string, any>;
  revealedHands?: Record<string, any>;
  handEvaluations?: Record<string, { rankName: string; score: number }>;
  board?: PokerCard[];
  boardCards?: PokerCard[];
  deck?: PokerCard[];
  deckRemaining?: number;
  // Rummy virtual card fields
  openCard?: PokerCard | null;
  discardPile?: PokerCard[];
  jokerCard?: PokerCard | null;
  rummyStep?: 'draw' | 'discard';
  dropped?: Record<string, number>;
  rummyScores?: Record<string, number>;
  // Blackjack virtual card fields
  dealerHand?: any;
  dealerHoleRevealed?: boolean;
  bjStatus?: Record<string, 'playing' | 'stood' | 'busted' | 'blackjack' | 'doubled'>;
  bjOutcomes?: Record<string, { outcome: string; net: number; total: number }>;
  settled?: boolean;
  mutualShowRequest?: {
    requesterId: string;
    requesterName: string;
    approvals: Record<string, 'accepted' | 'rejected'>;
  } | null;
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
  chipRequests?: ChipRequest[];
  dealerRequests?: DealerRequest[];
  chatMessages?: ChatMessage[];
  bjDealerId?: string | 'house';
  bjDealerRotation?: boolean;
  gameOperatorUserId?: string | null;
  nextGameOperatorUserId?: string | null;
  goLastHeartbeat?: number;
  goDisconnectEvent?: GODisconnectEvent | null;
  readyPlayers?: Record<string, boolean>;
  activityLog?: string[];
  myRole?: 'owner_go' | 'go' | 'owner_player' | 'player';
  isSessionOwner?: boolean;
  isGameOperator?: boolean;
  isQueuedGameOperator?: boolean;
  operatorProfile?: Player | null;
}

export interface SessionDoc {
  _id: string;
  name: string;
  gameType: 'tp' | 'pk' | 'rummy' | 'bj';
  status: 'active' | 'archived';
  sessionMode?: 'tracker' | 'online';
  roomCode?: string;
  hostUserId?: string;
  gameOperatorUserId?: string | null;
  nextGameOperatorUserId?: string | null;
  goLastHeartbeat?: number;
  goDisconnectEvent?: GODisconnectEvent | null;
  readyPlayers?: Record<string, boolean>;
  activityLog?: string[];
  myRole?: 'owner_go' | 'go' | 'owner_player' | 'player';
  isSessionOwner?: boolean;
  isGameOperator?: boolean;
  isQueuedGameOperator?: boolean;
  operatorProfile?: Player | null;
  balanceMode?: boolean;
  players?: Player[];
  round?: Round | null;
  debts?: Record<string, number>;
  wins?: Record<string, number>;
  hist?: HistEntry[];
  tot?: { rounds: number; total: number; big: number };
  rummyConfig?: any;
  chipRequests?: ChipRequest[];
  dealerRequests?: DealerRequest[];
  chatMessages?: ChatMessage[];
  bjDealerId?: string | 'house';
  bjDealerRotation?: boolean;
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

