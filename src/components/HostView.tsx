import React, { useState } from 'react';
import { GameRoom, Player } from '../types.js';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Users, Play, ArrowRight, RotateCcw, AlertCircle, Eye, EyeOff, BookOpen, Clock, HelpCircle, Award } from 'lucide-react';

interface HostViewProps {
  room: GameRoom;
  playerId: string;
  sendAction: (type: string, payload: any) => void;
}

export default function HostView({ room, playerId, sendAction }: HostViewProps) {
  const [selectedCategory, setSelectedCategory] = useState('과일');
  const [customCat, setCustomCat] = useState('');
  const [liarMode, setLiarMode] = useState<'RELATED_WORD' | 'NO_WORD'>('RELATED_WORD');
  const [showNamesInReveal, setShowNamesInReveal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Helper to determine the secure public URL for players
  const getPublicJoinUrl = () => {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    return `${origin}/?code=${room.roomCode}`;
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(getPublicJoinUrl());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const activePlayers = room.players.filter(p => !p.isHost);
  const connectedPlayers = activePlayers.filter(p => p.isConnected);
  const submittedCount = activePlayers.filter(p => p.submission.trim().length > 0).length;
  const votedCount = activePlayers.filter(p => p.votedFor !== null).length;

  const categories = ['과일', '동물', '음식', '직업', '영화', '가상 인물', '여행지'];

  const handleStartGame = () => {
    sendAction('START_GAME', {
      roomCode: room.roomCode,
      category: selectedCategory,
      customCategory: customCat,
      liarMode
    });
  };

  const handleLiarModeChange = (mode: 'RELATED_WORD' | 'NO_WORD') => {
    setLiarMode(mode);
    sendAction('UPDATE_GAME_SETS', {
      roomCode: room.roomCode,
      category: selectedCategory,
      customCategory: customCat,
      liarMode: mode
    });
  };

  const proceedPhase = (nextPhase: typeof room.phase) => {
    sendAction('PROCEED_PHASE', {
      roomCode: room.roomCode,
      targetPhase: nextPhase
    });
  };

  const checkVotesAndTriggerGuess = () => {
    sendAction('REVEAL_VOTES_AND_CHECK', {
      roomCode: room.roomCode
    });
  };

  const restartToLobby = () => {
    sendAction('RESTART_TO_LOBBY', {
      roomCode: room.roomCode
    });
  };

  const removePlayer = (pid: string) => {
    if (confirm("이 플레이어를 영구 추방하시겠습니까?")) {
      sendAction('REMOVE_PLAYER', {
        roomCode: room.roomCode,
        playerIdToRemove: pid
      });
    }
  };

  // Helper to calculate total votes for each player
  const getVoteCountForPlayer = (pid: string) => {
    return activePlayers.filter(p => p.votedFor === pid).length;
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6" id="host-view-container">
      {/* Top Floating Dashboard Bar */}
      <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl p-4 mb-6 flex flex-wrap gap-4 items-center justify-between shadow-sm" id="host-hud">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl font-mono text-xs font-semibold tracking-wider">
            HOST CONTROLLER
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 text-sm font-medium">
            <Users className="w-4 h-4 text-slate-400" />
            참여자 {connectedPlayers.length}/{activePlayers.length}명
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleCopyInviteLink}
            className={`flex items-center gap-1.5 font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer ${
              copiedLink
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-100'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'
            }`}
          >
            {copiedLink ? '✓ 초대 링크 복사됨!' : '📱 초대용 링크 복사'}
          </button>
          <div className="text-right">
            <p className="text-xs text-slate-400 font-mono">ROOM CODE</p>
            <p className="text-2xl font-black text-indigo-600 tracking-widest font-mono select-all animate-pulse">
              {room.roomCode}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {room.phase === 'LOBBY' && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            id="lobby-layout"
          >
            {/* Setting Panel */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm" id="game-setup-card">
                <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <span className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg text-sm">🎮</span>
                  게임 옵션 설정
                </h2>

                {/* Categories */}
                <div className="mb-6">
                  <label className="text-xs font-bold text-slate-400 block mb-2 tracking-wider">주제 카테고리 선택</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => { setSelectedCategory(cat); setCustomCat(''); }}
                        className={`py-2.5 px-3 rounded-xl font-medium text-sm transition-all border ${
                          selectedCategory === cat && !customCat
                            ? 'bg-indigo-600 text-white border-transparent shadow-md shadow-indigo-100'
                            : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={customCat}
                      onChange={(e) => {
                        setCustomCat(e.target.value);
                        setSelectedCategory(e.target.value);
                      }}
                      placeholder="✍️ 직접 재미있는 주제를 입력해 보세요 (예: 회사 상사, 아이돌)"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl py-3 px-4 outline-none text-sm transition-all"
                    />
                  </div>
                </div>

                {/* Liar Settings */}
                <div className="border-t border-slate-100 pt-6">
                  <label className="text-xs font-bold text-slate-400 block mb-3 tracking-wider">라이어 제시어 설정</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => handleLiarModeChange('RELATED_WORD')}
                      className={`text-left p-4 rounded-xl border transition-all ${
                        liarMode === 'RELATED_WORD'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 shadow-sm'
                          : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-bold text-sm">💡 영리한 라이어 (유사 단어)</p>
                      <p className="text-xs text-slate-500 mt-1">라이어에게도 아주 유사한 다른 단어가 제시됩니다. (사과 vs 배)</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLiarModeChange('NO_WORD')}
                      className={`text-left p-4 rounded-xl border transition-all ${
                        liarMode === 'NO_WORD'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 shadow-sm'
                          : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-bold text-sm">💀 멍한 라이어 (제시어 없음)</p>
                      <p className="text-xs text-slate-500 mt-1">라이어에게 단어가 노출되지 않아 추리로만 버텨야 합니다.</p>
                    </button>
                  </div>
                </div>
              </div>

              {/* Start Button Box */}
              <div className="bg-slate-900 rounded-3xl p-6 text-white flex items-center justify-between shadow-lg relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
                <div>
                  <h3 className="font-extrabold text-lg flex items-center gap-1">
                    <Crown className="w-5 h-5 text-amber-400" /> 준비 완료?
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">참여자가 접속하면 게임을 바로 실행하세요.</p>
                </div>

                <button
                  type="button"
                  disabled={activePlayers.length < 1}
                  onClick={handleStartGame}
                  className={`flex items-center gap-2 font-bold px-6 py-3.5 rounded-2xl transition-all shadow-lg ${
                    activePlayers.length >= 1
                      ? 'bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer hover:scale-105 shadow-indigo-500/20'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  게임 시작
                </button>
              </div>
            </div>

            {/* Players List Panel */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm h-full" id="lobby-players-list">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    대기실 참여자 ({activePlayers.length}명)
                  </h2>
                </div>

                {activePlayers.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl animate-pulse">
                      📱
                    </div>
                    <div className="space-y-3 px-2">
                      <p className="font-bold text-slate-600">접속을 대기하는 중입니다.</p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        상단의 <b>[📱  초대용 링크 복사]</b> 버튼을 누르면 <br />
                        자동으로 방 코드가 입력되는 전용 링크가 복사됩니다! <br />
                        친구들이나 모바일 등 다른 기기의 브라우저 주소창에 <br />
                        해당 주소를 열어서 입장하게 하세요.
                      </p>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10px] text-amber-950 leading-relaxed text-left font-medium">
                        ⚠️ <b>잠깐! 멀티플레이 팁</b>: 대기실 화면과 모바일은 꼭 <b>동일한 웹주소(보안 제한이 없는 공유용 Shared URL)</b> 상에 있을 때 실시간 방 입장을 허용합니다.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1">
                    {activePlayers.map((p, idx) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/80 transition-all border border-slate-100 group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            style={{ backgroundColor: p.avatarColor }}
                            className="w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm font-semibold text-white"
                          >
                            {p.avatarEmoji}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              {p.nickName}
                              {!p.isConnected && (
                                <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded font-normal">오프라인</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400">누적 점수: {p.points}점</p>
                          </div>
                        </div>

                        <button
                          onClick={() => removePlayer(p.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity p-1"
                          title="추방"
                        >
                          ✕
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {room.phase === 'ROLE_RESET' && (
          <motion.div
            key="role-reset"
            className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[300px]"
          >
            <div className="animate-spin rounded-full h-14 w-14 border-4 border-indigo-100 border-t-indigo-600 mb-6" />
            <h3 className="text-2xl font-black text-slate-800 mb-2">AI가 제시어와 질문을 제조하는 중...</h3>
            <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
              Gemini 3.5 모델이 카테고리 [{room.category}]에 어울리는 최적의 제시어와 절묘한 돌발 질문을 실시간 생성하고 있습니다. 잠시만 대기해 주세요.
            </p>
          </motion.div>
        )}

        {room.phase === 'ROLE_REVEAL' && (
          <motion.div
            key="role-reveal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
          >
            {/* Top Bar Banner with Theme */}
            <div className="bg-gradient-to-r from-red-500 via-indigo-600 to-purple-600 p-8 text-white relative">
              <div className="absolute right-4 bottom-4 text-white/5 font-black text-9xl">AI</div>
              <div className="relative">
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
                  ROUND {room.roundCount || 1}
                </span>
                <p className="text-slate-100 text-sm font-medium">카테고리: {room.category}</p>
                <h1 className="text-3xl md:text-4xl font-black mt-1">AI의 돌발 질문 도착!</h1>
              </div>
            </div>

            {/* Prompt Challenge Block */}
            <div className="p-8 md:p-12 text-center bg-indigo-50/20 border-b border-slate-100">
              <p className="text-xs text-slate-400 uppercase font-black tracking-wider mb-3">QUESTION / MISSION</p>
              <div className="bg-white rounded-2xl p-6 md:p-8 max-w-3xl mx-auto shadow-md border border-indigo-100/50 inline-block">
                <p className="text-xl md:text-2xl font-black text-indigo-900 leading-relaxed">
                  "{room.aiPrompt}"
                </p>
              </div>
            </div>

            <div className="p-8 md:p-10 flex flex-col md:flex-row gap-8 items-center justify-between">
              <div className="text-slate-600 text-sm max-w-xl">
                <p className="font-bold text-slate-800 text-base mb-2">💡 진행 안내</p>
                <p className="leading-relaxed">
                  참여자의 모바일 화면에 역할(시민 또는 라이어)과 개별 제시어가 도착했습니다. 질문에 대응할 답변을 작성하도록 안내해 주세요. 시민들은 비밀 단어를 지키고, 라이어는 무엇인지 눈치껏 추리해야 합니다!
                </p>
              </div>

              <button
                onClick={() => proceedPhase('SUBMISSION')}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 cursor-pointer text-lg shrink-0"
              >
                답변 제출 받기
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {room.phase === 'SUBMISSION' && (
          <motion.div
            key="submission"
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Left Status Bar */}
            <div className="lg:col-span-8 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-2xl font-black text-slate-800">답변 제출 진행 중...</h2>
                  <p className="text-sm text-slate-400 mt-1">{room.category} - {room.aiPrompt}</p>
                </div>
                <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3.5 py-1.5 rounded-full font-mono font-bold text-sm">
                  <Clock className="w-4 h-4 animate-pulse" />
                  {submittedCount} / {activePlayers.length} 제출
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full"
                  style={{ width: `${(submittedCount / activePlayers.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Submissions player cards list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                {activePlayers.map((p) => {
                  const done = p.submission.trim().length > 0;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        done
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 shadow-sm'
                          : 'bg-slate-50 border-slate-100 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          style={{ backgroundColor: p.avatarColor }}
                          className="w-10 h-10 rounded-full flex items-center justify-center text-lg text-white"
                        >
                          {p.avatarEmoji}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                            {p.nickName}
                            {!p.isConnected && (
                              <span className="bg-red-50 text-red-600 text-[9px] px-1 py-0.5 rounded">Off</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">
                            {done ? '✨ 작성 완료!' : '✍️ 열심히 작성 중...'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center">
                        {done ? (
                          <span className="text-emerald-500 text-lg">●</span>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-pulse" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Guide Block */}
            <div className="lg:col-span-4 flex flex-col justify-between space-y-6">
              <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden flex-1 flex flex-col justify-between">
                <div className="absolute right-0 bottom-0 text-white/5 font-bold text-7xl select-none">AI</div>
                <div>
                  <h3 className="font-bold text-lg mb-2">💡 호스트 안내</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    모든 플레이어가 답변 제출을 완료하면 자동으로 화면이 다음 단계로 이동합니다. 혹시 미제출자가 자리를 비웠거나 시간이 초과된 경우 오른쪽 아래 아래버튼을 눌러 작성 완료 여부와 무관하게 바로 다음 발표 단계로 진행할 수 있습니다.
                  </p>
                </div>
              </div>

              <button
                onClick={() => proceedPhase('REVEAL')}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg text-lg cursor-pointer shrink-0"
              >
                강제 답변 공개
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {room.phase === 'REVEAL' && (
          <motion.div
            key="reveal"
            className="space-y-6"
          >
            {/* Header Description Info */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1 rounded-full">{room.category}</span>
                <p className="text-slate-400 text-xs font-mono mt-1">AI PROMPT QUESTION</p>
                <h2 className="text-xl md:text-2xl font-black text-slate-800 mt-1 leading-relaxed">
                  "{room.aiPrompt}"
                </h2>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNamesInReveal(!showNamesInReveal)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all ${
                    showNamesInReveal
                      ? 'bg-slate-100 text-slate-800 border-slate-200'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                  }`}
                >
                  {showNamesInReveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showNamesInReveal ? "작성자 숨기기" : "작성자 공개"}
                </button>

                <button
                  onClick={() => proceedPhase('VOTING')}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-md cursor-pointer text-sm"
                >
                  투표 시작하기
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Render submission cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="submission-review-grid">
              {activePlayers.map((p, idx) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between min-h-[160px] relative overflow-hidden"
                >
                  <div className="absolute top-4 right-4 bg-slate-50 text-slate-400 font-mono text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                    {idx + 1}
                  </div>

                  <p className="text-slate-700 font-bold text-base leading-relaxed break-words bg-slate-50/50 p-4 rounded-2xl border border-slate-50">
                    "{p.submission || '답변 없음'}"
                  </p>

                  <div className="flex items-center justify-between border-t border-slate-50 pt-4 mt-4">
                    <div className="flex items-center gap-2">
                      <div
                        style={{ backgroundColor: showNamesInReveal ? p.avatarColor : '#e2e8f0' }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-bold shadow-sm transition-all"
                      >
                        {showNamesInReveal ? p.avatarEmoji : '❓'}
                      </div>
                      <p className="font-extrabold text-xs text-slate-500">
                        {showNamesInReveal ? p.nickName : "추리 대기 중"}
                      </p>
                    </div>

                    {!p.isConnected && (
                      <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Off</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {room.phase === 'VOTING' && (
          <motion.div
            key="voting"
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Progress Status Card */}
            <div className="lg:col-span-8 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-2xl font-black text-slate-800">실시간 범인 지목 투표</h2>
                  <p className="text-sm text-slate-400 mt-1">수상한 답변의 주인을 추리하여 투표하세요!</p>
                </div>
                <div className="flex items-center gap-1.5 bg-yellow-50 text-yellow-700 px-3.5 py-1.5 rounded-full font-mono font-bold text-sm">
                  <Clock className="w-4 h-4 animate-pulse" />
                  {votedCount} / {activePlayers.length} 투표 완료
                </div>
              </div>

              {/* Progress Slider bar */}
              <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full"
                  style={{ width: `${(votedCount / activePlayers.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* List of active players voting progress */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                {activePlayers.map((p) => {
                  const voted = p.votedFor !== null;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        voted
                          ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900 shadow-sm'
                          : 'bg-slate-50 border-slate-100 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          style={{ backgroundColor: p.avatarColor }}
                          className="w-10 h-10 rounded-full flex items-center justify-center text-lg text-white"
                        >
                          {p.avatarEmoji}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                            {p.nickName}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">
                            {voted ? '✨ 투표 사격 완료!' : '🎯 고민하며 저울질 중...'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center">
                        {voted ? (
                          <span className="text-indigo-500 text-lg font-black font-mono">OK</span>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-pulse" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Bar Guidance Card */}
            <div className="lg:col-span-4 flex flex-col justify-between space-y-6">
              <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden flex-1 flex flex-col justify-between">
                <div className="absolute right-0 bottom-0 text-white/5 font-bold text-7xl select-none">AI</div>
                <div>
                  <h3 className="font-bold text-lg mb-2">💡 호스트 가이드</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    모든 플레이어가 투표를 마치면 결과를 열 수 있습니다. 강제로 투표를 종료하려면 아래 버튼을 누르세요. 라이어에게 지목된 사람과 시민이 지목된 사람들의 차이를 밝혀냅니다!
                  </p>
                </div>
              </div>

              <button
                onClick={checkVotesAndTriggerGuess}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg text-lg cursor-pointer shrink-0"
              >
                투표 마감 및 확인
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {room.phase === 'VOTE_REVEAL' && (
          <motion.div
            key="vote-reveal"
            className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-8"
          >
            <div className="text-center pb-4 border-b border-slate-100">
              <span className="text-xs text-indigo-600 font-bold tracking-widest uppercase bg-indigo-50 px-3.5 py-1 rounded-full">DEDUCTION SHOWDOWN</span>
              <h2 className="text-2xl md:text-3xl font-black text-slate-800 mt-2">투표 집계 개표 결과!</h2>
              <p className="text-slate-500 text-sm mt-1">과연 지목된 플레이어가 진짜 라이어일까요?</p>
            </div>

            {/* Voting Bar Chart Display in high fidelity */}
            <div className="max-w-xl mx-auto space-y-5" id="vote-bars-table">
              {activePlayers.map((p) => {
                const votes = getVoteCountForPlayer(p.id);
                const maxVotes = Math.max(...activePlayers.map(p2 => getVoteCountForPlayer(p2.id))) || 1;
                const ratio = Math.min(100, Math.max(0, (votes / maxVotes) * 100));

                return (
                  <div key={p.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          style={{ backgroundColor: p.avatarColor }}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-bold shadow"
                        >
                          {p.avatarEmoji}
                        </div>
                        <span className="font-extrabold text-sm text-slate-800">{p.nickName}</span>
                        {p.role === 'LIAR' && (
                          <span className="bg-red-100 text-red-600 text-[9px] px-1.5 py-0.5 rounded font-bold">라이어</span>
                        )}
                      </div>
                      <span className="font-black text-sm text-slate-600 font-mono">{votes} 표</span>
                    </div>

                    <div className="relative w-full h-8 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden shadow-inner flex items-center pr-3">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${ratio}%` }}
                        className={`h-full ${p.role === 'LIAR' ? 'bg-gradient-to-r from-red-400 to-red-500' : 'bg-gradient-to-r from-slate-300 to-indigo-400'}`}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row gap-4 items-center justify-between max-w-xl mx-auto text-slate-600 text-xs">
              <p className="leading-normal">
                <b>시민 투표 결과 판단:</b> <br />
                가장 많은 지목을 받은 플레이어가 라이어인 경우, 라이어가 '단어 추론'을 통해 역전할 기회를 부여받습니다. 만약 시민 일원이 지목당했다면 라이어의 즉시 완전 승리로 끝납니다!
              </p>

              <button
                onClick={checkVotesAndTriggerGuess}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-7 py-3.5 rounded-xl transition-all shadow-md shrink-0 cursor-pointer text-sm"
              >
                결과 선고하기 (다음)
              </button>
            </div>
          </motion.div>
        )}

        {room.phase === 'LIAR_GUESS' && (
          <motion.div
            key="liar-guess"
            className="bg-white rounded-3xl p-10 border border-slate-100 shadow-sm text-center max-w-2xl mx-auto space-y-6"
          >
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-3xl mx-auto shadow-sm animate-bounce">
              🚨
            </div>

            <div className="space-y-2">
              <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">LIAR CAUGHT</span>
              <h2 className="text-3xl font-black text-slate-800">라이어 정체 탄로!</h2>
              <p className="text-slate-500 text-sm">
                과연 라이어가 진짜 제시어를 눈치챘을까요? <br/> 현재 라이어 기기에서 시민 제시어를 골라 맞추는 <b>최후의 역전 정답 추리</b>를 작렬 중입니다.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <p className="text-xs uppercase text-slate-400 font-bold tracking-widest">CITIZEN TRUE WORD SECRETS</p>
              <p className="text-3xl font-black text-indigo-600 mt-1 select-all">{room.citizenWord}</p>
            </div>

            <p className="text-slate-400 text-xs animate-pulse">
              라이어가 기기 화면에서 정답지를 선택하여 제출할 때까지 대전이 계속됩니다...
            </p>
          </motion.div>
        )}

        {room.phase === 'RESULT' && (
          <motion.div
            key="result"
            className="space-y-6"
            id="results-pane"
          >
            {/* Crown Winner Board */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-8 md:p-10 border border-slate-800 shadow-xl overflow-hidden relative">
              <div className="absolute right-0 top-0 text-white/5 font-black text-9xl pointer-events-none uppercase">
                {room.winner === 'LIAR' ? 'LIAR' : 'CITI'}
              </div>

              <div className="text-center max-w-xl mx-auto space-y-4">
                <p className="text-xs font-extrabold text-amber-400 tracking-widest uppercase">STAGE OVER RECAP</p>
                <h1 className="text-4xl font-extrabold tracking-wide">
                  {room.winner === 'LIAR' ? '🎭 라이어 역전 대승리!' : '🛡️ 시민 정예단 방어 성공 / 승리!'}
                </h1>
                <p className="text-slate-400 text-sm font-medium">
                  시민들은 비밀 키워드를 끝까지 철통 수사했으며, 최종적으로 라이어 지목과 정답 유출 격차의 향방이 끝났습니다.
                </p>
              </div>

              {/* Reveal Words Panel */}
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto pt-8 border-t border-slate-800/80 mt-6 text-center">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-[10px] text-slate-400 font-bold">🛡️ 시민 단어</p>
                  <p className="text-2xl font-black text-white mt-1 ">{room.citizenWord}</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-[10px] text-slate-400 font-bold">🎭 라이어 단어</p>
                  <p className="text-2xl font-black text-indigo-400 mt-1">{room.liarWord || '제시어 일절 없었음'}</p>
                </div>
              </div>
            </div>

            {/* Scoreboard block of players */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Scoreboard List */}
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm" id="players-points-board">
                <h2 className="text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-600" /> 누적 공로 랭킹 보드
                </h2>

                <div className="space-y-3">
                  {[...activePlayers]
                    .sort((a, b) => b.points - a.points)
                    .map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-50 transition-all hover:bg-slate-100/50">
                        <div className="flex items-center gap-3">
                          <span className={`font-mono font-bold text-xs w-5 text-center ${idx === 0 ? 'text-amber-500 text-lg' : idx === 1 ? 'text-slate-400 text-base' : 'text-slate-400'}`}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                          </span>
                          <div
                            style={{ backgroundColor: p.avatarColor }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm shadow text-white font-extrabold"
                          >
                            {p.avatarEmoji}
                          </div>
                          <div>
                            <span className="font-extrabold text-sm text-slate-800">{p.nickName}</span>
                            {p.role === 'LIAR' && (
                              <span className="ml-1.5 text-[8px] bg-red-100 text-red-600 px-1 py-0.5 rounded font-bold uppercase">MASK</span>
                            )}
                          </div>
                        </div>

                        <span className="font-black text-sm text-indigo-600 font-mono">{p.points} 점</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Reset Controller options */}
              <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 flex flex-col justify-between" id="restart-game-setup">
                <div className="space-y-3">
                  <h2 className="text-lg font-extrabold text-indigo-950">🎉 대전을 수고하셨습니다!</h2>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    다음 대전 게임을 준비하세요. 진행자(방장)가 다음 게임 버튼을 누르면 점수를 유지한 채 대기실로 이동하여, 다시 다음 주제에 맞춰 AI 돌발 질문을 생성할 수 있습니다.
                  </p>
                </div>

                <div className="mt-8 gap-3 flex">
                  <button
                    onClick={restartToLobby}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md text-sm cursor-pointer"
                  >
                    <RotateCcw className="w-5 h-5" />
                    다음 게임 준비 (로비 이동)
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
