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
  const [connectionMessage, setConnectionMessage] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const wsAttemptIndexRef = useRef<number>(0);
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
    const CLOUD_RUN_DEV_URL = 'wss://ais-dev-f73mcmuyldhv26doe2k27r-254952566287.asia-northeast1.run.app/ws';
    const CLOUD_RUN_PRE_URL = 'wss://ais-pre-f73mcmuyldhv26doe2k27r-254952566287.asia-northeast1.run.app/ws';
    const localWsUrl = `${wsProtocol}//${window.location.host}/ws`;

    // Dynamic HTTP touch in background to trigger scale-up / wake-up for sleeping Cloud Run containers
    try {
      fetch('https://ais-dev-f73mcmuyldhv26doe2k27r-254952566287.asia-northeast1.run.app/', { mode: 'no-cors' }).catch(() => {});
      fetch('https://ais-pre-f73mcmuyldhv26doe2k27r-254952566287.asia-northeast1.run.app/', { mode: 'no-cors' }).catch(() => {});
    } catch (_) {}

    // Multi-tier Fallback Connection URLs List
    const isStaticDeploy = !window.location.hostname.includes('run.app') && 
                           !window.location.hostname.includes('localhost') && 
                           !window.location.hostname.includes('127.0.0.1');

    let urlsToTry: string[] = [];
    if (isStaticDeploy) {
      // Vercel / External deploy:
      // Try DEV URL first since developer container is actively running right now in Workspace.
      // Then fallback to PRE URL.
      urlsToTry = [CLOUD_RUN_DEV_URL, CLOUD_RUN_PRE_URL, localWsUrl];
    } else {
      urlsToTry = [localWsUrl, CLOUD_RUN_DEV_URL, CLOUD_RUN_PRE_URL];
    }

    // Determine current target URL
    let wsUrl = forceUrl;
    if (!wsUrl) {
      const idx = wsAttemptIndexRef.current % urlsToTry.length;
      wsUrl = urlsToTry[idx];
    }

    setActiveWsUrl(wsUrl);

    let stepMsg = '';
    if (wsUrl === CLOUD_RUN_DEV_URL) {
      stepMsg = '⚡ 1단계: 실시간 개발 환경 서버 연결 중... (Gemini 프록시 부팅)';
    } else if (wsUrl === CLOUD_RUN_PRE_URL) {
      stepMsg = '🌐 2단계: 퍼블릭 공유용 클라우드 서버 연결 중... (인스턴스 활성화)';
    } else {
      stepMsg = '🔌 3단계: 기본 서비스 게이트웨이 웹소켓 연결 중...';
    }
    setConnectionMessage(stepMsg);
    console.log(`[Socket Attempt] Target=${wsUrl} Code=${code} Host=${isHost}`);

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
    } catch (e) {
      console.error('WebSocket instantiation error:', e);
      handleSocketFailure(code, isHost, name, wsUrl, urlsToTry);
      return;
    }

    // Timeout watchdog: wait 4.5 seconds for handshaking, then fallback
    const connectionTimeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket connection handshake timed out.');
        try { socket.close(); } catch (_) {}
        handleSocketFailure(code, isHost, name, wsUrl, urlsToTry);
      }
    }, 4500);

    socket.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('WebSocket connection established successfully:', wsUrl);
      setWsStatus('connected');
      setErrorMsg('');
      setConnectionMessage('');
      wsAttemptIndexRef.current = 0; // reset attempts on success

      // Save connection details for automatic re-connect loops
      connectionDetailsRef.current = { roomCode: code, isHost, nickName: name };

      // Immediately Join/Create Section
      socket.send(JSON.stringify({
        type: 'JOIN_SESSION',
        payload: {
          roomCode: code,
          playerId,
          nickName: name,
          isHost
        }
      }));
    };

    socket.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        console.log(`Socket received message: ${type}`, payload);

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
      
      // If we closed deliberately by exit, do not trigger reconnect or errors
      if (!connectionDetailsRef.current) {
        setWsStatus('disconnected');
        return;
      }

      setWsStatus('disconnected');
      setErrorMsg('서버와 연결이 유실되었습니다. 예비 터널로 자동 우회/재연결합니다...');
      
      // Attempt reconnect with next URL in queue
      reconnectTimeoutRef.current = setTimeout(() => {
        wsAttemptIndexRef.current += 1;
        connectWebSocket(code, isHost, name);
      }, 1500);
    };

    socket.onerror = (err) => {
      clearTimeout(connectionTimeout);
      console.error('WebSocket error event structure:', err);
      // Let onclose handle the fallback & retry cycle
    };
  };

  // Separated socket failure router to safely go through tier list
  const handleSocketFailure = (code: string, isHost: boolean, name: string, failedUrl: string, urlList: string[]) => {
    wsAttemptIndexRef.current += 1;
    const nextIdx = wsAttemptIndexRef.current % urlList.length;
    const nextUrl = urlList[nextIdx];
    
    setErrorMsg(`[서버 접속 지연] 다음 대체 터널로 조인하는 중... (${wsAttemptIndexRef.current}차 시도)`);
    console.log(`Routing connection to fallback index=${nextIdx} URL=${nextUrl}`);

    // Wait 1.0 second before trying next server in queue to prevent tight spinning
    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket(code, isHost, name, nextUrl);
    }, 1000);
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
