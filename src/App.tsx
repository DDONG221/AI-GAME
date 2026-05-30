import React, { useState, useEffect, useRef } from 'react';
import { GameRoom, WSMessage } from './types.js';
import HostView from './components/HostView.js';
import PlayerView from './components/PlayerView.js';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Users, ArrowRight, RefreshCw, AlertTriangle, HelpCircle, Gamepad2 } from 'lucide-react';
import { Peer } from 'peerjs';

function getOrCreatePlayerId(): string {
  let pid = localStorage.getItem('ai_catch_tail_player_id');
  if (!pid) {
    pid = 'p-' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('ai_catch_tail_player_id', pid);
  }
  return pid;
}

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

// Helper to filter state to prevent client-side peeking/cheating (WebRTC security/fair-play)
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
      role: (isSelf || isClientHost || revealAll) ? p.role : 'PENDING',
      word: (isSelf || room.phase === 'RESULT') ? p.word : '',
      submission: (room.phase === 'REVEAL' || room.phase === 'VOTING' || revealAll || isSelf) ? p.submission : '',
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

export default function App() {
  const playerId = getOrCreatePlayerId();
  const [viewMode, setViewMode] = useState<'landing' | 'host' | 'player'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState<string>('');

  // WebRTC Peer References
  const peerRef = useRef<Peer | null>(null);
  const playerConnectionsRef = useRef<Record<string, any>>({});
  const hostConnRef = useRef<any>(null);

  // Broadcast function to update players
  const broadcastToPlayers = (currentRoom: GameRoom) => {
    if (!currentRoom) return;
    Object.keys(playerConnectionsRef.current).forEach((pId) => {
      const conn = playerConnectionsRef.current[pId];
      if (conn && conn.open) {
        const filteredState = getFilteredRoomState(currentRoom, pId, false);
        conn.send({
          type: 'STATE_UPDATE',
          payload: filteredState
        });
      }
    });
  };

  // Host state update state-machine, matches server.ts backend logic
  const hostProcessAction = (type: string, payload: any, senderConn?: any) => {
    setRoom((prevRoom) => {
      if (!prevRoom) return null;
      const room = JSON.parse(JSON.stringify(prevRoom)) as GameRoom;

      switch (type) {
        case 'JOIN_SESSION': {
          const { playerId: pId, nickName, isHost } = payload;
          
          if (isHost) {
            let hostPlayer = room.players.find(p => p.isHost);
            if (!hostPlayer) {
              room.players.push({
                id: pId,
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
              });
            } else {
              hostPlayer.isConnected = true;
            }
          } else {
            // Check for nickname collision
            if (room.players.some(p => !p.isHost && p.nickName === nickName && p.id !== pId)) {
              if (senderConn) {
                senderConn.send({
                  type: 'JOIN_ERROR',
                  payload: { message: '이미 방에 사용 중인 닉네임입니다. 다른 닉네임을 써주세요.' }
                });
              }
              return prevRoom;
            }

            // Check for maximum capacity limit (30 players maximum, excluding host)
            const activePlayers = room.players.filter(p => !p.isHost);
            let player = room.players.find(p => p.id === pId);
            if (!player && activePlayers.length >= 30) {
              if (senderConn) {
                senderConn.send({
                  type: 'JOIN_ERROR',
                  payload: { message: '방 정원이 가득 찼습니다. (최대 30명)' }
                });
              }
              return prevRoom;
            }

            if (!player) {
              const avatarEmoji = AVATAR_EMOJIS[room.players.length % AVATAR_EMOJIS.length];
              const avatarColor = AVATAR_COLORS[room.players.length % AVATAR_COLORS.length];

              player = {
                id: pId,
                nickName,
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
              if (nickName) player.nickName = nickName;
            }
          }

          if (senderConn) {
            playerConnectionsRef.current[pId] = senderConn;
          }
          break;
        }

        case 'UPDATE_GAME_SETS': {
          const { category, customCategory, liarMode } = payload;
          room.category = category;
          room.customCategory = customCategory || '';
          room.liarMode = liarMode || 'RELATED_WORD';
          break;
        }

        case 'PROCEED_PHASE': {
          room.phase = payload.targetPhase;
          break;
        }

        case 'SUBMIT_ANSWER': {
          const { playerId: pId, answer } = payload;
          const player = room.players.find(p => p.id === pId);
          if (player) {
            player.submission = answer || '';
          }

          const activePlayers = room.players.filter(p => !p.isHost && p.isConnected);
          const allSubmitted = activePlayers.every(p => p.submission.trim().length > 0);
          if (allSubmitted) {
            room.phase = 'REVEAL';
          }
          break;
        }

        case 'VOTE_PLAYER': {
          const { voterId, targetId } = payload;
          const voter = room.players.find(p => p.id === voterId);
          if (voter) {
            voter.votedFor = targetId;
          }

          const activePlayers = room.players.filter(p => !p.isHost && p.isConnected);
          const allVoted = activePlayers.every(p => p.votedFor !== null);
          if (allVoted) {
            room.phase = 'VOTE_REVEAL';
          }
          break;
        }

        case 'REVEAL_VOTES_AND_CHECK': {
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

          const liar = room.players.find(p => p.role === 'LIAR');
          if (liar && highestVotedIds.includes(liar.id)) {
            room.phase = 'LIAR_GUESS';
          } else {
            room.winner = 'LIAR';
            room.players.forEach(p => {
              if (p.role === 'LIAR') p.points += 3;
            });
            room.phase = 'RESULT';
          }
          break;
        }

        case 'SUBMIT_LIAR_GUESS': {
          const { guess } = payload;
          const isLiarCorrect = guess?.trim() === room.citizenWord?.trim();
          if (isLiarCorrect) {
            room.winner = 'LIAR';
            room.players.forEach(p => {
              if (p.role === 'LIAR') p.points += 3;
            });
          } else {
            room.winner = 'CITIZENS';
            room.players.forEach(p => {
              if (p.role === 'CITIZEN') p.points += 2;
            });
          }
          room.phase = 'RESULT';
          break;
        }

        case 'RESTART_TO_LOBBY': {
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
          break;
        }

        case 'REMOVE_PLAYER': {
          const { playerIdToRemove } = payload;
          const idx = room.players.findIndex(p => p.id === playerIdToRemove);
          if (idx !== -1) {
            room.players.splice(idx, 1);
          }
          const conn = playerConnectionsRef.current[playerIdToRemove];
          if (conn) {
            conn.send({
              type: 'JOIN_ERROR',
              payload: { message: '방장에 의해 강퇴되었습니다.' }
            });
            try { conn.close(); } catch (_) {}
            delete playerConnectionsRef.current[playerIdToRemove];
          }
          break;
        }
      }

      setTimeout(() => {
        broadcastToPlayers(room);
      }, 0);

      return room;
    });
  };

  // Host startup sequence (Async fetch to trigger Cloud Run proxy or Client fallbacks)
  const hostStartGameAsync = async (category: string, customCategory: string, liarMode: 'RELATED_WORD' | 'NO_WORD') => {
    setRoom((prev) => {
      if (!prev) return null;
      const next = JSON.parse(JSON.stringify(prev)) as GameRoom;
      next.phase = 'ROLE_RESET';
      setTimeout(() => broadcastToPlayers(next), 0);
      return next;
    });

    const finalCategory = customCategory?.trim() ? customCategory.trim() : category;

    let clues: any;
    try {
      const targetUrl = `https://ais-pre-f73mcmuyldhv26doe2k27r-254952566287.asia-northeast1.run.app/api/gemini-clues?category=${encodeURIComponent(finalCategory)}`;
      console.log('[Clues Fetch] Requesting:', targetUrl);
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error('API request failed');
      clues = await res.json();
    } catch (err) {
      console.warn('[Clues Fetch] Failed to fetch clues, using rich local fallbacks:', err);
      const fallbacks: any = {
        '과일': [
          { citizenWord: "사과", liarWord: "배", aiPrompt: "이 과일의 첫 느낌을 다섯 글자로 찬양해 본다면?", decoys: ["복숭아", "바나나"] },
          { citizenWord: "바나나", liarWord: "파인애플", aiPrompt: "이 노란 매력을 무인도에 고립된 내 지인에게 비유해 주세요.", decoys: ["망고", "오렌지"] }
        ],
        '동물': [
          { citizenWord: "호랑이", liarWord: "사자", aiPrompt: "이 동물이 만약 직장 상사라면 부하 직원들에게 가장 자주 던질 잔소리는?", decoys: ["치타", "표범"] },
          { citizenWord: "고양이", liarWord: "강아지", aiPrompt: "이 생물이 인간 세계에서 커피숍을 열었을 때 출시할 기상천외한 메뉴 이름은?", decoys: ["토끼", "햄스터"] }
        ],
        '음식': [
          { citizenWord: "떡볶이", liarWord: "라면", aiPrompt: "이 음식을 일요일 오후 세 시에 혼자 티비를 보면서 한 숟가락 입에 넣었을 때 떠오르는 상상은?", decoys: ["김밥", "순대"] }
        ]
      };
      const catFallbacks = fallbacks[category] || [
        { citizenWord: "우주비행사", liarWord: "비행기조종사", aiPrompt: "이 사람들이 출근길 외투 주머니에 절대 빠뜨리지 않는 가장 의외의 물건은?", decoys: ["소방관", "경찰관"] }
      ];
      clues = catFallbacks[Math.floor(Math.random() * catFallbacks.length)];
    }

    setRoom((prev) => {
      if (!prev) return null;
      const room = JSON.parse(JSON.stringify(prev)) as GameRoom;

      room.citizenWord = clues.citizenWord || '사과';
      room.liarWord = clues.liarWord || '배';
      room.aiPrompt = clues.aiPrompt || '이 물건을 다섯 글자로 설명해주세요!';
      room.decoys = clues.decoys || ['복숭아', '수박'];
      room.category = finalCategory;
      room.liarMode = liarMode;

      room.players.forEach(p => {
        p.submission = '';
        p.votedFor = null;
        p.role = 'PENDING';
        p.word = '';
      });

      const candidatePlayers = room.players.filter(p => !p.isHost);
      if (candidatePlayers.length < 1) {
        alert('게임을 시작하려면 최소 1명 이상의 플레이어가 참여해야 합니다!');
        room.phase = 'LOBBY';
        setTimeout(() => broadcastToPlayers(room), 0);
        return room;
      }

      const liarIndex = Math.floor(Math.random() * candidatePlayers.length);
      const liarPlayer = candidatePlayers[liarIndex];

      room.players.forEach(p => {
        if (p.isHost) return;
        if (p.id === liarPlayer.id) {
          p.role = 'LIAR';
          p.word = liarMode === 'RELATED_WORD' ? room.liarWord : '당신은 라이어입니다!';
        } else {
          p.role = 'CITIZEN';
          p.word = room.citizenWord;
        }
      });

      room.winner = null;
      room.roundCount += 1;
      room.phase = 'ROLE_REVEAL';

      setTimeout(() => broadcastToPlayers(room), 0);
      return room;
    });
  };

  const initializeHostPeer = (code: string, name: string) => {
    setWsStatus('connecting');
    setConnectionMessage('⚡ 리얼타임 P2P 방 주소 등록 중...');
    setErrorMsg('');

    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (_) {}
    }
    playerConnectionsRef.current = {};

    const hostPeerId = `aicatch-tail-${code.toUpperCase()}`;
    const peer = new Peer(hostPeerId, { debug: 1 });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Host Peer opened with ID:', id);
      setWsStatus('connected');
      setConnectionMessage('');

      const initialRoom: GameRoom = {
        roomCode: code.toUpperCase(),
        category: '과일',
        customCategory: '',
        citizenWord: '',
        liarWord: '',
        aiPrompt: '대기 중입니다...',
        phase: 'LOBBY',
        players: [{
          id: playerId,
          nickName: name || 'Host',
          avatarColor: '#1e293b',
          avatarEmoji: '👑',
          role: 'PENDING',
          word: '',
          submission: '',
          votedFor: null,
          points: 0,
          isHost: true,
          isConnected: true
        }],
        liarMode: 'RELATED_WORD',
        winner: null,
        roundCount: 0,
        decoys: []
      };
      setRoom(initialRoom);
      setViewMode('host');
    });

    peer.on('connection', (conn) => {
      console.log('Incoming connection from player:', conn.peer);
      
      conn.on('data', (data: any) => {
        console.log('Host received P2P message:', data);
        if (data && data.type) {
          hostProcessAction(data.type, data.payload, conn);
        }
      });

      conn.on('close', () => {
        setRoom((prev) => {
          if (!prev) return null;
          const next = JSON.parse(JSON.stringify(prev)) as GameRoom;
          const pId = Object.keys(playerConnectionsRef.current).find(
            key => playerConnectionsRef.current[key] === conn
          );
          if (pId) {
            const player = next.players.find(p => p.id === pId);
            if (player) {
              player.isConnected = false;
              console.log(`Player ${player.nickName} disconnected`);
            }
          }
          setTimeout(() => broadcastToPlayers(next), 0);
          return next;
        });
      });
    });

    peer.on('error', (err: any) => {
      console.error('Host peer error:', err);
      if (err.type === 'unavailable-id') {
        setErrorMsg('이미 누군지 선점된 방 코드입니다. 다른 임의의 코드로 다시 생성해보세요!');
      } else {
        setErrorMsg(`P2P 네트워크 지연: ${err.message || err.type}`);
      }
      setWsStatus('disconnected');
    });
  };

  const initializePlayerPeer = (code: string, name: string) => {
    setWsStatus('connecting');
    setConnectionMessage('⚡ 방장과 다이렉트 WebRTC 터널 생성 중...');
    setErrorMsg('');

    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (_) {}
    }
    if (hostConnRef.current) {
      try { hostConnRef.current.close(); } catch (_) {}
    }

    const peer = new Peer({ debug: 1 });
    peerRef.current = peer;

    peer.on('open', (myPeerId) => {
      console.log('Player peer opened with code:', myPeerId);
      const hostId = `aicatch-tail-${code.toUpperCase()}`;
      setConnectionMessage(`🌐 방장 통신 검색 중 (ID: ${code.toUpperCase()})...`);

      const conn = peer.connect(hostId, { reliable: true });
      hostConnRef.current = conn;

      const connTimeout = setTimeout(() => {
        if (!conn.open) {
          setErrorMsg('방장을 찾을 수 없습니다. 대기방(로비) 화면의 방 코드가 일치하는지 확인해 주세요.');
          setWsStatus('disconnected');
          try { conn.close(); } catch (_) {}
        }
      }, 7000);

      conn.on('open', () => {
        clearTimeout(connTimeout);
        console.log('Connected to Host Peer successfully');
        setWsStatus('connected');
        setConnectionMessage('');
        setErrorMsg('');

        conn.send({
          type: 'JOIN_SESSION',
          payload: {
            playerId,
            nickName: name,
            isHost: false
          }
        });
      });

      conn.on('data', (data: any) => {
        console.log('Player received state update:', data);
        if (data && data.type) {
          if (data.type === 'STATE_UPDATE') {
            setRoom(data.payload);
            setViewMode('player');
            setErrorMsg('');
          } else if (data.type === 'JOIN_ERROR') {
            setErrorMsg(data.payload.message || '방 참가 거부됨');
            setWsStatus('disconnected');
            setViewMode('landing');
            try { peer.destroy(); } catch (_) {}
          }
        }
      });

      conn.on('close', () => {
        console.log('Host closed connection');
        setWsStatus('disconnected');
        setErrorMsg('방장과 연결이 끊겼습니다. 메인 화면으로 이동합니다.');
        setViewMode('landing');
      });
    });

    peer.on('error', (err: any) => {
      console.error('Player connection error:', err);
      setErrorMsg(`P2P 연결 실패: 방 코드가 올바른가요? (${err.message || err.type})`);
      setWsStatus('disconnected');
    });
  };

  const sendAction = (type: string, payload: any) => {
    if (viewMode === 'host') {
      if (type === 'START_GAME') {
        hostStartGameAsync(payload.category, payload.customCategory, payload.liarMode);
      } else {
        hostProcessAction(type, payload);
      }
    } else {
      if (hostConnRef.current && hostConnRef.current.open) {
        hostConnRef.current.send({ type, payload });
      } else {
        console.warn('Cannot send action. Connection lost.');
        setErrorMsg('방장과의 연결 수신 감도가 나쁩니다. 재연결을 진행하세요.');
      }
    }
  };

  const handleCreateRoom = () => {
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    setRoomCode(randomCode);
    initializeHostPeer(randomCode, 'Host');
  };

  const handleJoinOrCreatePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      setErrorMsg('방 번호 4자리를 입력해 주세요.');
      return;
    }
    if (!nickname.trim()) {
      setErrorMsg('사용하실 닉네임을 입력해 주세요.');
      return;
    }
    setErrorMsg('');
    initializePlayerPeer(roomCode.trim().toUpperCase(), nickname.trim());
  };

  const handleExitRoom = () => {
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (_) {}
    }
    if (hostConnRef.current) {
      try { hostConnRef.current.close(); } catch (_) {}
    }
    peerRef.current = null;
    hostConnRef.current = null;
    playerConnectionsRef.current = {};
    setRoom(null);
    setViewMode('landing');
    setErrorMsg('');
    setWsStatus('disconnected');
  };

  // Check for URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');
    if (codeFromUrl) {
      setRoomCode(codeFromUrl.toUpperCase());
    }
  }, []);



  // Check if we are on a developer preview URL
  const isDevUrl = window.location.href.includes('ais-dev-');

  // Calculate the shared public URL from the development URL (replaces ais-dev with ais-pre)
  const getSharedUrl = () => {
    const origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  };

  const copySharedUrl = () => {
    navigator.clipboard.writeText(getSharedUrl());
    alert('공유용 접속 주소(Shared URL)가 성공적으로 복사되었습니다! 친구들에게 이 주소를 전달하여 참여하게 하세요.');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between" id="app-root">
      {/* Top Main Navigation Header */}
      <header className="bg-white border-b border-slate-200 py-3.5 px-6 shadow-sm flex items-center justify-between select-none">
        <div onClick={handleExitRoom} className="flex items-center gap-2.5 cursor-pointer">
          <div className="bg-indigo-600 text-white p-2 rounded-xl">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-slate-800 text-sm tracking-wide">AI 꼬리잡기</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">Liar Game Evolution</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {viewMode !== 'landing' && (
            <button
              onClick={handleExitRoom}
              className="bg-slate-50 hover:bg-slate-100 font-extrabold text-slate-600 px-4 py-2 rounded-xl border border-slate-200 transition-all cursor-pointer"
            >
              종료 (방 나가기)
            </button>
          )}

          {/* Connection Ring status indicator */}
          {wsStatus === 'connecting' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              서버 연결 중...
            </span>
          )}
          {wsStatus === 'connected' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px] md:text-xs">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              {viewMode === 'host' ? '👑 P2P 실시간 호스트 채널 활성화' : '🟢 P2P 실시간 로비 참가 완료'}
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center py-8">
        <AnimatePresence mode="wait">
          {viewMode === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl px-4 grid grid-cols-1 md:grid-cols-2 gap-8"
              id="landing-portal"
            >
              {/* Promo Banner / Information Column */}
              <div className="flex flex-col justify-space-between space-y-6 md:pr-4">
                <div className="space-y-4">
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-black tracking-widest uppercase px-3.5 py-1.5 rounded-full inline-block">
                    GEMINI AI POWERED
                  </span>
                  <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight leading-none">
                    AI 꼬리잡기 <br />
                    <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">차세대 라이어 게임</span>
                  </h1>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    전통적인 라이어 라이브 추리 게임에 최첨단 AI 실시간 개입을 접목했습니다! 잭박스(Jackbox)나 카훗(Kahoot) 등 대면 파티 게임처럼, 방장(호스트)이 빅 스크린을 띄워 이끌고 참여자들은 각자 모바일로 접속해 완벽히 동기화된 게임을 만끽하세요!
                  </p>
                </div>

                {/* Features description lists */}
                <div className="bg-white/65 border border-slate-200/50 rounded-2.5xl p-5 space-y-4 shadow-inner" id="game-specs">
                  <div className="flex gap-3">
                    <span className="text-lg bg-indigo-50 text-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center shrink-0">🧠</span>
                    <div>
                      <h4 className="font-bold text-slate-700 text-xs leading-none">AI 라이브 돌발 질문 생성</h4>
                      <p className="text-slate-400 text-[11px] mt-1 leading-normal">제공된 테마에 맞춰 시민들이 비밀 단어를 영리하게 숨기도록 Gemini가 절묘한 설명 요건을 생성합니다.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 animate-pulse">
                    <span className="text-lg bg-emerald-50 text-emerald-600 w-8 h-8 rounded-lg flex items-center justify-center shrink-0">📱</span>
                    <div>
                      <h4 className="font-bold text-slate-700 text-xs leading-none">완벽한 실시간 다중 접속 모바일 동기화</h4>
                      <p className="text-slate-400 text-[11px] mt-1 leading-normal">별도의 설치 없이 컴퓨터 대형 스크린전광판에 띄운 호스트 게임룸을 보며 모바일 기기의 브라우저로 투표하고 즐기세요.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Login / Actions Column */}
              <div className="space-y-6">
                {/* Host Mode Option card */}
                <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[160px] border border-slate-800">
                  <div className="absolute right-0 bottom-0 text-white/5 font-black text-8xl pointer-events-none select-none">👑</div>
                  <div className="space-y-1.5 relative">
                    <span className="bg-amber-400/20 text-amber-400 text-[10px] font-black px-2.5 py-0.5 rounded-md tracking-wider">HOST MODE</span>
                    <h3 className="text-xl font-bold">1. 방 개설하기 (👑 호스트)</h3>
                    <p className="text-slate-400 text-xs leading-relaxed max-w-xs">
                      친구들과 대면 모임이나 스트리밍, 대형 화면을 공유할 수 있는 사람(내가 호스트)이 되어 게임방을 개설합니다.
                    </p>
                  </div>

                  <button
                    onClick={handleCreateRoom}
                    className="mt-6 flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white font-bold px-6 py-3.5 rounded-2xl transition-all cursor-pointer relative z-10 text-sm shadow-md shadow-indigo-500/20"
                  >
                    새로운 게임방 개설하기
                    <Crown className="w-4 h-4 fill-current text-white" />
                  </button>
                </div>

                {/* Player Mode Option Card Form */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md">
                  <div className="mb-4">
                    <span className="bg-indigo-50 text-indigo-600 text-[10px] font-extrabold px-2.5 py-0.5 rounded-md tracking-wider">PLAYER CONTROLLER</span>
                    <h3 className="text-xl font-bold text-slate-800 mt-1">2. 대결 참여하기 (📱 플레이어)</h3>
                    <p className="text-slate-400 text-xs mt-0.5">화면에 뜬 4자리 방 코드와 닉네임을 입력해 접속하세요!</p>
                  </div>

                  <form onSubmit={handleJoinOrCreatePlayer} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3" id="player-inputs">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ROOM CODE</label>
                        <input
                          type="text"
                          maxLength={4}
                          value={roomCode}
                          onChange={(e) => setRoomCode(e.target.value.replace(/\s/g, '').toUpperCase())}
                          placeholder="A7E3"
                          className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white border focus:border-indigo-500 rounded-xl py-3 px-4 outline-none font-mono font-bold text-lg text-center tracking-widest transition-all placeholder:font-sans placeholder:tracking-normal uppercase"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NICKNAME</label>
                        <input
                          type="text"
                          maxLength={12}
                          value={nickname}
                          onChange={(e) => setNickname(e.target.value)}
                          placeholder="길동이"
                          className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white border focus:border-indigo-500 rounded-xl py-3 px-4 outline-none font-bold text-sm transition-all"
                        />
                      </div>
                    </div>

                    {errorMsg && (
                      <div className="bg-red-50 text-red-600 text-xs py-2.5 px-4 rounded-xl border border-red-100 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md hover:shadow-lg cursor-pointer text-sm"
                    >
                      게임 참여하기 (입장)
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>

                  {isDevUrl ? (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] text-amber-950 leading-relaxed font-medium space-y-2">
                      <p className="text-amber-800 font-bold flex items-center gap-1">
                        ⚠️ 개발용(Dev) 프리뷰 화면 감지됨
                      </p>
                      <p>
                        현재 이 주소는 <b>개발 환경 전전용(Dev) 화면</b>입니다. 개발자 전용 보안 제한 때문에 <b>친구들이나 휴대전화 등 외부 디바이스에서 이 방으로 접속할 수 없습니다.</b>
                      </p>
                      <p className="text-amber-900">
                        친구들과 실시간 멀티플레이를 테스트하거나 실제로 즐기시려면, 아래의 <b>공유용(Shared) 정식 주소</b>로 모두 접속해 주세요!
                      </p>
                      <div className="pt-1 flex flex-col gap-1.5">
                        <span className="font-mono bg-white border border-amber-300 text-slate-700 px-2 py-1 rounded select-all block break-all text-center font-bold">
                          {getSharedUrl()}
                        </span>
                        <button
                          type="button"
                          onClick={copySharedUrl}
                          className="mt-1 bg-amber-600 hover:bg-amber-700 hover:scale-[1.02] text-white font-bold py-2 px-3 rounded-lg text-center cursor-pointer transition-all text-[11px] shadow-sm"
                        >
                          📋 공유용 링크 복사하기
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 text-[11px] text-indigo-950 leading-relaxed font-medium">
                      💡 <b className="text-indigo-700">멀티플레이 팁</b>: 친구들과 같이 게임할 때는 방장(호스트)과 플레이어 모두 <b>동일한 공유용 주소(Shared URL)</b>로 브라우저 탭을 열고 동일한 코드를 입력해 입장하고 플레이해야 정상 동기화됩니다!
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Router to Active Custom Panels */}
          {viewMode === 'host' && room && (
            <motion.div
              key="host-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <HostView room={room} playerId={playerId} sendAction={sendAction} />
            </motion.div>
          )}

          {viewMode === 'player' && room && (
            <motion.div
              key="player-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <PlayerView room={room} playerId={playerId} sendAction={sendAction} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Real-time Connection Process UI Overlay */}
        {wsStatus === 'connecting' && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-6"
            >
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-pulse" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-3xl">
                  🔌
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-800">실시간 멀티플레이 게이트 연결 중</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  멀티플레이 데이터 전송 터널을 개설하는 중입니다. <br />
                  잠시만 기다려 주시면 안전하게 대기실로 자동 이동합니다!
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-[11px] text-indigo-950 font-bold leading-relaxed space-y-1">
                <span className="block text-indigo-700 font-extrabold uppercase tracking-wider text-[10px] mb-1">
                  CURRENT CONNECTION FLOW
                </span>
                <div className="text-slate-800 select-all font-mono break-all text-xs">
                  {connectionMessage || '🔌 실시간 멀티플레이 터널 개설 중...'}
                </div>
              </div>

              {errorMsg && (
                <div className="bg-yellow-50 text-yellow-700 text-[11px] py-2 px-3 rounded-xl border border-yellow-200 flex items-center justify-center gap-1.5 font-medium animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <p className="text-[10px] text-slate-400 leading-normal">
                💡 최초 접속 또는 Vercel 등의 외부 배포 환경에서 실행할 경우, 클라우드 서버 인스턴스 전원(Cold-Start)이 켜지는 동안 약 5~10초의 물리적 부팅 시간이 소요될 수 있습니다.
              </p>

              <button
                onClick={handleExitRoom}
                className="mt-2 text-[11px] text-red-500 hover:text-red-700 font-extrabold underline cursor-pointer hover:scale-105 transition-all text-center block mx-auto"
              >
                연결 취소하고 메인으로 돌아가기
              </button>
            </motion.div>
          </div>
        )}
      </main>

      {/* Footer System Credits */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-[10px] font-semibold text-slate-400 font-mono select-none flex items-center justify-between">
        <span>● AI CATCH THE TAIL - STABLE MULTIPLAYER</span>
        <span>UTC 2026-05-30</span>
      </footer>
    </div>
  );
}
