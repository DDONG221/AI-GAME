export type GameStatePhase =
  | 'LOBBY'
  | 'ROLE_RESET'
  | 'ROLE_REVEAL' // Players see their role/word, and AI's question is displayed
  | 'SUBMISSION'   // Players submit description
  | 'REVEAL'       // Host screens reveal description, players read
  | 'VOTING'       // Players voting
  | 'VOTE_REVEAL'  // Showing vote counts on host screen
  | 'LIAR_GUESS'   // Liar tries to guess Citizen word if caught
  | 'RESULT';      // Final winners and stats

export interface Player {
  id: string;
  nickName: string;
  avatarColor: string;
  avatarEmoji: string;
  role: 'CITIZEN' | 'LIAR' | 'PENDING';
  word: string; // The word given to this player
  submission: string; // Player's description text
  votedFor: string | null; // ID of player this player voted for
  points: number;
  isHost: boolean;
  isConnected: boolean;
}

export interface GameRoom {
  roomCode: string;
  category: string;
  customCategory: string; // Optional custom category
  citizenWord: string;
  liarWord: string;
  aiPrompt: string; // AI question/mission
  phase: GameStatePhase;
  players: Player[];
  liarMode: 'RELATED_WORD' | 'NO_WORD'; // Liar gets a related word or "Liar" text
  winner: 'CITIZENS' | 'LIAR' | null;
  roundCount: number;
  decoys: string[];
}

export interface WSMessage {
  type: string;
  payload: any;
}
