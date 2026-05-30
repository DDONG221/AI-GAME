import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { generateGameClues } from './src/gemini.js';
import { GameRoom, Player } from './src/types.js';

const app = express();
const PORT = 3000;
const server = http.createServer(app);

// Enable CORS for all requests to support external P2P hosts (e.g. Vercel)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// REST API for fetching Gemini clues to support client-side/P2P hosting
app.get('/api/gemini-clues', async (req, res) => {
  const category = (req.query.category as string) || '과일';
  try {
    const clues = await generateGameClues(category);
    res.json(clues);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate clues' });
  }
});

// In-memory data store for rooms and socket associations
const rooms: Record<string, GameRoom> = {};
const clientSockets = new Map<string, WebSocket>();

// Track player info directly on socket instances
interface CustomWebSocket extends WebSocket {
  playerId?: string;
  roomCode?: string;
  isHost?: boolean;
}

// Static avatar assets
const AVATAR_EMOJIS = ['🦊', '🐰', '🦁', '🦉', '🐹', '🐼', '🐨', '🐸', '🐙', '🦖', '🦄', '🐝'];
const AVATAR_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899'  // Pink
];

// Helper to filter state to prevent client-side peeking/cheating
function getFilteredRoomState(room: GameRoom, clientId: string, isClientHost: boolean): any {
  const filteredPlayers = room.players.map(p => {
    const isSelf = p.id === clientId;
    const revealAll = room.phase === 'RESULT' || room.phase === 'VOTE_REVEAL' || room.phase === 'LIAR_GUESS';
    
    return {
      id: p.id,
      nickName: p.nickName,
      avatarColor: p.avatarColor,
      avatarEmoji: p.avatarEmoji,
      isConnected: p.isConnected,
      points: p.points,
      isHost: p.isHost,
      // Hide roles and words unless looking at oneself, or in a reveal phase
      role: (isSelf || isClientHost || revealAll) ? p.role : 'PENDING',
      word: (isSelf || room.phase === 'RESULT') ? p.word : '',
      // Hide submissions except in review phases or if it is the owner
      submission: (room.phase === 'REVEAL' || room.phase === 'VOTING' || revealAll || isSelf) ? p.submission : '',
      // Hide individual votes until reveal/result
      votedFor: (room.phase === 'VOTE_REVEAL' || room.phase === 'RESULT' || isSelf) ? p.votedFor : null
    };
  });

  return {
    roomCode: room.roomCode,
    category: room.category,
    customCategory: room.customCategory,
    aiPrompt: room.aiPrompt,
    phase: room.phase,
    players: filteredPlayers,
    liarMode: room.liarMode,
    citizenWord: (room.phase === 'RESULT' || room.phase === 'LIAR_GUESS') ? room.citizenWord : '',
    liarWord: (room.phase === 'RESULT' || room.phase === 'LIAR_GUESS') ? room.liarWord : '',
    decoys: (room.phase === 'LIAR_GUESS' || room.phase === 'RESULT') ? room.decoys : [],
    winner: room.winner,
    roundCount: room.roundCount
  };
}

// Broadcast filtered room update to everyone in a specific room
function broadcastRoomState(roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;

  // Let's find all sockets connected to this room
  for (const client of wss.clients as Set<CustomWebSocket>) {
    if (client.roomCode === roomCode && client.readyState === WebSocket.OPEN) {
      const isHost = client.isHost || false;
      const pId = client.playerId || '';
      const filteredState = getFilteredRoomState(room, pId, isHost);
      client.send(JSON.stringify({
        type: 'STATE_UPDATE',
        payload: filteredState
      }));
    }
  }
}

// Setup WebSocket Server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: CustomWebSocket) => {
  console.log('New connection established');

  ws.on('message', async (messageData: string) => {
    try {
      const { type, payload } = JSON.parse(messageData);
      console.log(`Received message type: ${type}`, payload);

      switch (type) {
        case 'JOIN_SESSION': {
          const { roomCode, playerId, nickName, isHost } = payload;
          if (!roomCode) return;

          const code = roomCode.toUpperCase();
          ws.playerId = playerId;
          ws.roomCode = code;
          ws.isHost = isHost;

          // Create the room memory if requested by a host and it doesn't exist
          if (isHost && !rooms[code]) {
            rooms[code] = {
              roomCode: code,
              category: '과일',
              customCategory: '',
              citizenWord: '',
              liarWord: '',
              aiPrompt: '대기 중입니다...',
              phase: 'LOBBY',
              players: [],
              liarMode: 'RELATED_WORD',
              winner: null,
              roundCount: 0,
              decoys: []
            };
            console.log(`Room ${code} created by host`);
          }

          const room = rooms[code];
          if (!room) {
            ws.send(JSON.stringify({
              type: 'JOIN_ERROR',
              payload: { message: '존재하지 않는 방 번호입니다. 방 번호를 확인해 주세요.' }
            }));
            return;
          }

          if (isHost) {
            // Find existing host inside room list or update connection
            let hostPlayer = room.players.find(p => p.isHost);
            if (!hostPlayer) {
              hostPlayer = {
                id: playerId,
                nickName: nickName || 'Host',
                avatarColor: '#1e293b',
                avatarEmoji: '👑',
                role: 'PENDING',
                word: '',
                submission: '',
                votedFor: null,
                points: 0,
                isHost: true,
                isConnected: true
              };
              room.players.push(hostPlayer);
            } else {
              hostPlayer.isConnected = true;
            }
          } else {
            // Player joins
            let player = room.players.find(p => p.id === playerId);
            if (!player) {
              // Ensure we don't have nickname collision inside the room
              if (room.players.some(p => p.nickName === nickName)) {
                ws.send(JSON.stringify({
                  type: 'JOIN_ERROR',
                  payload: { message: '이미 방에 사용 중인 닉네임입니다. 다른 닉네임을 써주세요.' }
                }));
                return;
              }

              // Check for maximum capacity limit (30 players maximum, excluding host)
              const activePlayers = room.players.filter(p => !p.isHost);
              if (activePlayers.length >= 30) {
                ws.send(JSON.stringify({
                  type: 'JOIN_ERROR',
                  payload: { message: '방 정원이 가득 찼습니다. (최대 30명)' }
                }));
                return;
              }

              // Assign random color and emoji
              const avatarEmoji = AVATAR_EMOJIS[room.players.length % AVATAR_EMOJIS.length];
              const avatarColor = AVATAR_COLORS[room.players.length % AVATAR_COLORS.length];

              player = {
                id: playerId,
                nickName: nickName,
                avatarColor,
                avatarEmoji,
                role: 'PENDING',
                word: '',
                submission: '',
                votedFor: null,
                points: 0,
                isHost: false,
                isConnected: true
              };
              room.players.push(player);
            } else {
              player.isConnected = true;
              if (nickName) player.nickName = nickName; // sync nickname
            }
          }

          clientSockets.set(playerId, ws);
          broadcastRoomState(code);
          break;
        }

        case 'UPDATE_GAME_SETS': {
          const { roomCode, category, customCategory, liarMode } = payload;
          const room = rooms[roomCode?.toUpperCase()];
          if (!room) return;

          room.category = category;
          room.customCategory = customCategory || '';
          room.liarMode = liarMode || 'RELATED_WORD';
          
          broadcastRoomState(room.roomCode);
          break;
        }

        case 'START_GAME': {
          const { roomCode, category, customCategory } = payload;
          const code = roomCode?.toUpperCase();
          const room = rooms[code];
          if (!room) return;

          room.phase = 'ROLE_RESET';
          broadcastRoomState(code);

          const finalCategory = customCategory?.trim() ? customCategory.trim() : category;
          room.category = finalCategory;
          
          try {
            // Generate clues from Gemini API on backend
            const clues = await generateGameClues(finalCategory);
            
            room.citizenWord = clues.citizenWord || '사과';
            room.liarWord = clues.liarWord || '배';
            room.aiPrompt = clues.aiPrompt || '이 물건을 다섯 글자로 칭찬해 주세요!';
            room.decoys = clues.decoys || ['복숭아', '수박'];

            // Clear previous round answers/votes
            room.players.forEach(p => {
              p.submission = '';
              p.votedFor = null;
              p.role = 'PENDING';
              p.word = '';
            });

            // Assign roles - select 1 random non-host player as Liar
            const candidatePlayers = room.players.filter(p => !p.isHost);
            if (candidatePlayers.length < 1) {
              ws.send(JSON.stringify({
                type: 'GAME_ERROR',
                payload: { message: '게임을 시작하려면 최소 1명 이상의 플레이어가 참여해아 합니다!' }
              }));
              room.phase = 'LOBBY';
              broadcastRoomState(code);
              return;
            }

            const liarIndex = Math.floor(Math.random() * candidatePlayers.length);
            const liarPlayer = candidatePlayers[liarIndex];

            room.players.forEach(p => {
              if (p.isHost) return;
              if (p.id === liarPlayer.id) {
                p.role = 'LIAR';
                p.word = room.liarMode === 'RELATED_WORD' ? room.liarWord : '당신은 라이어입니다!';
              } else {
                p.role = 'CITIZEN';
                p.word = room.citizenWord;
              }
            });

            room.winner = null;
            room.roundCount += 1;
            room.phase = 'ROLE_REVEAL';
            broadcastRoomState(code);
          } catch (err) {
            console.error("Failed to start round", err);
            room.phase = 'LOBBY';
            broadcastRoomState(code);
          }
          break;
        }

        case 'PROCEED_PHASE': {
          const { roomCode, targetPhase } = payload;
          const room = rooms[roomCode?.toUpperCase()];
          if (!room) return;

          room.phase = targetPhase;
          broadcastRoomState(room.roomCode);
          break;
        }

        case 'SUBMIT_ANSWER': {
          const { roomCode, playerId, answer } = payload;
          const code = roomCode?.toUpperCase();
          const room = rooms[code];
          if (!room) return;

          const player = room.players.find(p => p.id === playerId);
          if (player) {
            player.submission = answer || '';
          }

          // Check if all players (excluding host) have submitted answers
          const activePlayers = room.players.filter(p => !p.isHost && p.isConnected);
          const allSubmitted = activePlayers.every(p => p.submission.trim().length > 0);

          if (allSubmitted) {
            room.phase = 'REVEAL';
          }
          broadcastRoomState(code);
          break;
        }

        case 'VOTE_PLAYER': {
          const { roomCode, voterId, targetId } = payload;
          const code = roomCode?.toUpperCase();
          const room = rooms[code];
          if (!room) return;

          const voter = room.players.find(p => p.id === voterId);
          if (voter) {
            voter.votedFor = targetId;
          }

          // Check if all active players (excluding host) have voted
          const activePlayers = room.players.filter(p => !p.isHost && p.isConnected);
          const allVoted = activePlayers.every(p => p.votedFor !== null);

          if (allVoted) {
            // Count votes
            const votes: Record<string, number> = {};
            activePlayers.forEach(p => {
              if (p.votedFor) {
                votes[p.votedFor] = (votes[p.votedFor] || 0) + 1;
              }
            });

            // Find highest vote getter
            let highestVoteCount = 0;
            let highestVotedIds: string[] = [];
            for (const [votedId, count] of Object.entries(votes)) {
              if (count > highestVoteCount) {
                highestVoteCount = count;
                highestVotedIds = [votedId];
              } else if (count === highestVoteCount) {
                highestVotedIds.push(votedId);
              }
            }

            room.phase = 'VOTE_REVEAL';
          }
          broadcastRoomState(code);
          break;
        }

        case 'REVEAL_VOTES_AND_CHECK': {
          const { roomCode } = payload;
          const code = roomCode?.toUpperCase();
          const room = rooms[code];
          if (!room) return;

          // Establish who got voted out
          const activePlayers = room.players.filter(p => !p.isHost && p.isConnected);
          const votes: Record<string, number> = {};
          activePlayers.forEach(p => {
            if (p.votedFor) {
              votes[p.votedFor] = (votes[p.votedFor] || 0) + 1;
            }
          });

          let highestVoteCount = 0;
          let highestVotedIds: string[] = [];
          for (const [votedId, count] of Object.entries(votes)) {
            if (count > highestVoteCount) {
              highestVoteCount = count;
              highestVotedIds = [votedId];
            } else if (count === highestVoteCount) {
              highestVotedIds.push(votedId);
            }
          }

          // Let's check status
          // If the Liar is in the highest voted list (even in a tie)
          const liar = room.players.find(p => p.role === 'LIAR');
          if (liar && highestVotedIds.includes(liar.id)) {
            // Liar is caught! Goes to guessing phase
            room.phase = 'LIAR_GUESS';
          } else {
            // Liar escaped! Liar wins
            room.winner = 'LIAR';
            // Award points
            room.players.forEach(p => {
              if (p.role === 'LIAR') p.points += 3;
            });
            room.phase = 'RESULT';
          }

          broadcastRoomState(code);
          break;
        }

        case 'SUBMIT_LIAR_GUESS': {
          const { roomCode, guess } = payload;
          const code = roomCode?.toUpperCase();
          const room = rooms[code];
          if (!room) return;

          const isLiarCorrect = guess?.trim() === room.citizenWord?.trim();
          if (isLiarCorrect) {
            // Liar guessed the secret word correctly! Liar wins!
            room.winner = 'LIAR';
            room.players.forEach(p => {
              if (p.role === 'LIAR') p.points += 3;
            });
          } else {
            // Liar guessed wrong! Citizens win!
            room.winner = 'CITIZENS';
            room.players.forEach(p => {
              if (p.role === 'CITIZEN') p.points += 2;
            });
          }

          room.phase = 'RESULT';
          broadcastRoomState(code);
          break;
        }

        case 'RESTART_TO_LOBBY': {
          const { roomCode } = payload;
          const code = roomCode?.toUpperCase();
          const room = rooms[code];
          if (!room) return;

          // Clear round specific variables, reset back to lobby
          room.phase = 'LOBBY';
          room.citizenWord = '';
          room.liarWord = '';
          room.aiPrompt = '대기 중입니다...';
          room.winner = null;
          room.decoys = [];
          room.players.forEach(p => {
            p.role = 'PENDING';
            p.word = '';
            p.submission = '';
            p.votedFor = null;
          });

          broadcastRoomState(code);
          break;
        }

        case 'REMOVE_PLAYER': {
          const { roomCode, playerIdToRemove } = payload;
          const code = roomCode?.toUpperCase();
          const room = rooms[code];
          if (!room) return;

          room.players = room.players.filter(p => p.id !== playerIdToRemove);
          const socketToRemove = clientSockets.get(playerIdToRemove);
          if (socketToRemove) {
            socketToRemove.close();
            clientSockets.delete(playerIdToRemove);
          }

          broadcastRoomState(code);
          break;
        }

        default:
          console.log(`Unknown event: ${type}`);
          break;
      }
    } catch (err) {
      console.error('Error parsing/handling WebSocket message', err);
    }
  });

  ws.on('close', () => {
    console.log('Socket disconnected');
    if (ws.playerId && ws.roomCode) {
      const room = rooms[ws.roomCode];
      if (room) {
        const player = room.players.find(p => p.id === ws.playerId);
        if (player) {
          player.isConnected = false;
          console.log(`Player ${player.nickName} marked as disconnected`);
        }
        broadcastRoomState(ws.roomCode);
      }
      clientSockets.delete(ws.playerId);
    }
  });
});

// Attach WS handler to our server and upgrades securely
server.on('upgrade', (request, socket, head) => {
  try {
    const url = request.url || '';
    const pathname = url.split('?')[0]; // Safe split that avoids fragile URL host-base parsing
    if (pathname === '/ws' || pathname === '/ws/') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  } catch (err) {
    console.error('Error during websocket upgrade handshaking:', err);
    try { socket.destroy(); } catch (_) {}
  }
});

// Mount Vite Dev Server in dev mode, serve dist static contents in production
async function startApp() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Host server bootstrapped on port ${PORT}`);
  });
}

startApp();
