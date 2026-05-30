import React, { useState, useEffect, useRef } from 'react';
import { GameRoom, WSMessage } from './types.js';
import HostView from './components/HostView.js';
import PlayerView from './components/PlayerView.js';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Users, ArrowRight, RefreshCw, AlertTriangle, HelpCircle, Gamepad2 } from 'lucide-react';

function getOrCreatePlayerId(): string {
  let pid = localStorage.getItem('ai_catch_tail_player_id');
  if (!pid) {
    pid = 'p-' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('ai_catch_tail_player_id', pid);
  }
  return pid;
}

export default function App() {
  const playerId = getOrCreatePlayerId();
  const [viewMode, setViewMode] = useState<'landing' | 'host' | 'player'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [activeWsUrl, setActiveWsUrl] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionDetailsRef = useRef<{ roomCode: string; isHost: boolean; nickName: string } | null>(null);

  // Initialize and connect WebSocket with smart automatic fallback reconnection loop
  const connectWebSocket = (code: string, isHost: boolean, name: string, forceUrl?: string) => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (_) {}
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    setWsStatus('connecting');
    setErrorMsg('');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const CLOUD_RUN_WS_URL = 'wss://ais-pre-f73mcmuyldhv26doe2k27r-254952566287.asia-northeast1.run.app/ws';
    
    // Choose connection path:
    // If we are on static host like Vercel, Netlify, or GitHub Pages, default immediately to Cloud Run because those platforms do not run server.ts backends.
    const isStaticDeploy = window.location.hostname.includes('vercel.app') || 
                           window.location.hostname.includes('netlify.app') || 
                           window.location.hostname.includes('github.io');
                           
    let wsUrl = forceUrl || (isStaticDeploy ? CLOUD_RUN_WS_URL : `${wsProtocol}//${window.location.host}/ws`);
    
    setActiveWsUrl(wsUrl);
    console.log(`Connecting to WebSocket on URL: ${wsUrl}`);
    
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
    } catch (e) {
      console.error('Failed to instantiate WebSocket:', e);
      if (wsUrl !== CLOUD_RUN_WS_URL) {
        console.log('Instant fallback to central Cloud Run gateway (instantiation error)...');
        connectWebSocket(code, isHost, name, CLOUD_RUN_WS_URL);
      } else {
        setErrorMsg('서버 소켓 생성 실패. 인터넷 연결을 확인해 주세요.');
        setWsStatus('disconnected');
      }
      return;
    }

    // Timeout watchdog: if we can't connect in 3 seconds to a local/non-fallback url, fall back to central Cloud Run
    const connectionTimeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket connection attempt timeout. Falling back to central public server...');
        if (wsUrl !== CLOUD_RUN_WS_URL) {
          setErrorMsg('서버와 실시간 연결 중... 클라우드 멀티플레이 서버로 우회 접속합니다.');
          try { socket.close(); } catch (_) {}
          // Connect using stable Cloud Run gateway
          connectWebSocket(code, isHost, name, CLOUD_RUN_WS_URL);
        }
      }
    }, 3000);

    socket.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('WebSocket successfully opened on url:', wsUrl);
      setWsStatus('connected');
      
      // Save details for reconnects
      connectionDetailsRef.current = { roomCode: code, isHost, nickName: name };

      // Immediately Join Session
      const joinMsg: WSMessage = {
        type: 'JOIN_SESSION',
        payload: {
          roomCode: code,
          playerId,
          nickName: name,
          isHost
        }
      };
      socket.send(JSON.stringify(joinMsg));
    };

    socket.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        console.log(`Client received message: ${type}`, payload);

        if (type === 'STATE_UPDATE') {
          setRoom(payload);
          setErrorMsg('');
          if (isHost && viewMode !== 'host') {
            setViewMode('host');
          } else if (!isHost && viewMode !== 'player') {
            setViewMode('player');
          }
        } else if (type === 'JOIN_ERROR') {
          setErrorMsg(payload.message || '방 가입 중 에러가 발생했습니다.');
          connectionDetailsRef.current = null;
          try { socket.close(); } catch (_) {}
          setViewMode('landing');
        } else if (type === 'GAME_ERROR') {
          alert(payload.message || '게임 에러가 발생했습니다.');
        }
      } catch (err) {
        console.error('Failed to parse incoming WS message:', err);
      }
    };

    socket.onclose = () => {
      clearTimeout(connectionTimeout);
      console.log('WebSocket closed');
      setWsStatus('disconnected');
      
      // Trigger reconnection only if we have active game intent and didn't close deliberately
      if (connectionDetailsRef.current) {
        setErrorMsg('서버 실시간 연결 해제됨. 2.5초 후 재연결을 시도합니다...');
        console.log('Reconnection triggered in 2.5 seconds...');
        reconnectTimeoutRef.current = setTimeout(() => {
          const det = connectionDetailsRef.current;
          if (det) {
            connectWebSocket(det.roomCode, det.isHost, det.nickName, wsUrl);
          }
        }, 2500);
      }
    };

    socket.onerror = (err) => {
      clearTimeout(connectionTimeout);
      console.error('WebSocket encountered an error:', err);
      if (wsUrl !== CLOUD_RUN_WS_URL) {
        console.log('Attempting instant fallback to central Cloud Run gateway...');
        try { socket.close(); } catch (_) {}
        connectWebSocket(code, isHost, name, CLOUD_RUN_WS_URL);
      } else {
        if (connectionDetailsRef.current) {
          setErrorMsg('실시간 게임 서버 연결에 실패했습니다. 방 번호가 존재하지 않거나 클라우드 서버 부팅 중일 수 있습니다.');
        }
      }
    };
  };

  // Safe action dispatch sender helper
  const sendAction = (type: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('Socket is not open. Action aborted:', type);
      setErrorMsg('서버와 실시간 연결이 원활하지 않습니다. 재연결 중입니다...');
    }
  };

  const handleCreateRoom = () => {
    // Generate valid 4 letter uppercase room code
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    setRoomCode(randomCode);
    connectWebSocket(randomCode, true, 'Host');
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
    connectWebSocket(roomCode.trim().toUpperCase(), false, nickname.trim());
  };

  // Exits the current room session and cleans listeners
  const handleExitRoom = () => {
    connectionDetailsRef.current = null;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setRoom(null);
    setViewMode('landing');
    setErrorMsg('');
  };

  // Check for URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');
    if (codeFromUrl) {
      setRoomCode(codeFromUrl.toUpperCase());
    }
  }, []);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
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
              {activeWsUrl.includes('ais-pre') ? '🌐 멀티플레이 클라우드 서버 연결 완료' : '🟢 로컬 서버 연결 완료'}
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
      </main>

      {/* Footer System Credits */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-[10px] font-semibold text-slate-400 font-mono select-none flex items-center justify-between">
        <span>● AI CATCH THE TAIL - STABLE MULTIPLAYER</span>
        <span>UTC 2026-05-30</span>
      </footer>
    </div>
  );
}
