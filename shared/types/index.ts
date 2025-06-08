// User interface
export interface User {
  id: string;
  socketId: string;
  inCall: boolean;
  partner?: string;
}

// Chat message interface
export interface ChatMessage {
  text: string;
  from: string;
  to: string;
  timestamp: number;
}

// WebRTC signaling interfaces
export interface SignalOffer {
  offer: RTCSessionDescriptionInit;
  to: string;
  from: string;
}

export interface SignalAnswer {
  answer: RTCSessionDescriptionInit;
  to: string;
}

export interface SignalCandidate {
  candidate: RTCIceCandidateInit;
  to: string;
}

// Connection status
export type ConnectionStatus = 'idle' | 'searching' | 'connecting' | 'connected';

// History entry
export interface HistoryEntry {
  id: string;
  partnerId: string;
  timestamp: number;
  duration: number;
}

// Report interface
export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  timestamp: number;
  status: 'pending' | 'reviewed' | 'resolved';
}

export interface UserMatchData {
  partnerId: string;
}

export interface GameInvite {
  gameType: string;
  from: string;
  to: string;
}

export interface GameMove {
  gameType: string;
  move: any;
  from: string;
  to: string;
}

export interface StatsData {
  online: number;
  inQueue: number;
} 