import React, { useState, useEffect, useMemo } from 'react';
import { GameRoom, Player } from '../types.js';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, Eye, Shield, Skull, CheckCircle, Send, Users, AlertCircle, Award } from 'lucide-react';

interface PlayerViewProps {
  room: GameRoom;
  playerId: string;
  sendAction: (type: string, payload: any) => void;
}

export default function PlayerView({ room, playerId, sendAction }: PlayerViewProps) {
  const [hasRevealedRole, setHasRevealedRole] = useState(false);
  const [answerInput, setAnswerInput] = useState('');
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [guessedWord, setGuessedWord] = useState<string | null>(null);

  const self = useMemo(() => room.players.find(p => p.id === playerId), [room.players, playerId]);

  // Reset local state if phase changes
  useEffect(() => {
    if (room.phase === 'LOBBY' || room.phase === 'ROLE_RESET') {
      setHasRevealedRole(false);
      setAnswerInput('');
      setSelectedVoteId(null);
      setGuessedWord(null);
    }
  }, [room.phase]);

  if (!self) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl border border-slate-100 shadow-sm max-w-sm mx-auto text-center" id="player-not-found">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4 animate-pulse" />
        <h3 className="text-lg font-black text-slate-800">로비 연결 끊김</h3>
        <p className="text-slate-500 text-xs mt-1">
          현재 방에서 세션을 찾을 수 없습니다. 다시 초기 시작화면에서 참여 정보를 입력해 주세요.
        </p>
      </div>
    );
  }

  // Shuffle multiple choice list for caught liar
  const guessChoices = useMemo(() => {
    if (room.phase !== 'LIAR_GUESS') return [];
    
    const baseChoices = [room.citizenWord];
    if (room.liarWord && room.liarWord.indexOf('당신은') === -1) {
      baseChoices.push(room.liarWord);
    }
    if (room.decoys && room.decoys.length > 0) {
      baseChoices.push(...room.decoys);
    }
    
    // De-duplicate just in case
    const unique = Array.from(new Set(baseChoices)).filter(Boolean);
    
    // Sort pseudo-randomly to shuffle choices securely
    return unique.sort(() => 0.5 - Math.random());
  }, [room.phase, room.citizenWord, room.liarWord, room.decoys]);

  const handleConfirmRole = () => {
    setHasRevealedRole(true);
  };

  const handleSubmitAnswer = () => {
    if (answerInput.trim().length === 0) return;
    sendAction('SUBMIT_ANSWER', {
      roomCode: room.roomCode,
      playerId: self.id,
      answer: answerInput.trim()
    });
  };

  const handleVotePlayer = () => {
    if (!selectedVoteId) return;
    sendAction('VOTE_PLAYER', {
      roomCode: room.roomCode,
      voterId: self.id,
      targetId: selectedVoteId
    });
  };

  const handleSubmitLiarGuess = (choice: string) => {
    setGuessedWord(choice);
    sendAction('SUBMIT_LIAR_GUESS', {
      roomCode: room.roomCode,
      guess: choice
    });
  };

  // List candidates for voting (excluding oneself & host)
  const voteCandidates = room.players.filter(p => !p.isHost && p.id !== self.id);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4" id="player-controller">
      {/* HUD Header */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4 select-none">
        <div className="flex items-center gap-2">
          <div
            style={{ backgroundColor: self.avatarColor }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm text-white font-bold"
          >
            {self.avatarEmoji}
          </div>
          <div>
            <p className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
              {self.nickName}
            </p>
            <p className="text-[10px] text-slate-400 font-mono">CODE: {room.roomCode}</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
            {self.points} PTS
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {room.phase === 'LOBBY' && (
          <motion.div
            key="p-lobby"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-3xl p-8 border border-slate-100 shadow-xl text-center space-y-6"
          >
            <div className="relative inline-block w-20 h-20 bg-indigo-50/50 rounded-full flex items-center justify-center text-4xl shadow-inner border border-slate-100">
              👑
              <div className="absolute top-0 right-0 w-4 h-4 bg-emerald-400 border-2 border-white rounded-full animate-ping" />
              <div className="absolute top-0 right-0 w-4 h-4 bg-emerald-400 border-2 border-white rounded-full" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-indigo-950">방 입장 완료!</h3>
              <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                방장 화면에서 카테고리를 고르고 게임을 조각하기를 기다리고 있습니다. 다른 플레이어가 모이면 게임이 전개됩니다.
              </p>
            </div>

            {/* List of other connected players in a compact way */}
            <div className="border-t border-slate-100 pt-5">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-3">
                접속된 참여자 ({room.players.filter(p => !p.isHost).length}/30명)
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 max-h-[120px] overflow-y-auto">
                {room.players.map(p => (
                  <span
                    key={p.id}
                    title={p.nickName}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-50 border border-slate-100"
                  >
                    <span>{p.avatarEmoji}</span>
                    <span className="text-slate-600 max-w-[80px] truncate">{p.nickName}</span>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {room.phase === 'ROLE_RESET' && (
          <motion.div
            key="p-reset"
            className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-xl flex flex-col items-center justify-center min-h-[300px]"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-100 border-t-indigo-600 mb-6" />
            <h3 className="text-lg font-black text-indigo-950 mb-1">AI 큐레이터 작업 중...</h3>
            <p className="text-xs text-slate-400 leading-normal max-w-[240px]">
              Gemini가 카테고리에 맞는 기상천외한 주제, 시민/라이어 제시어 및 독특한 설명 질문지를 공정히 작성하고 있습니다.
            </p>
          </motion.div>
        )}

        {room.phase === 'ROLE_REVEAL' && (
          <motion.div
            key="p-reveal"
            className="space-y-4"
          >
            {!hasRevealedRole ? (
              <motion.button
                type="button"
                onClick={handleConfirmRole}
                className="w-full bg-gradient-to-br from-indigo-900 to-indigo-950 text-white rounded-3xl p-8 shadow-xl text-center flex flex-col items-center justify-center gap-4 border border-indigo-900 transition-transform active:scale-95 cursor-pointer min-h-[280px]"
              >
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl">
                  🎁
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-wide">카드 까보기</h3>
                  <p className="text-slate-400 text-xs mt-1">탭하여 내 역할과 제시어를 극비리에 확인합시오!</p>
                </div>
              </motion.button>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-slate-100 shadow-xl rounded-3xl overflow-hidden"
              >
                {/* Role Header Banner */}
                <div className={`p-6 text-center text-white ${self.role === 'LIAR' ? 'bg-gradient-to-br from-rose-500 to-red-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto text-xl mb-2 shadow">
                    {self.role === 'LIAR' ? <Skull className="w-6 h-6 fill-current" /> : <Shield className="w-6 h-6" />}
                  </div>
                  <h3 className="text-lg font-bold tracking-widest">
                    {self.role === 'LIAR' ? '🔴 당신은 라이어입니다!' : '🟢 당신은 시민입니다!'}
                  </h3>
                </div>

                {/* Secret Word Block */}
                <div className="p-6 text-center border-b border-slate-50 space-y-2">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">SECRET KEYWORD</p>
                  
                  {self.role === 'LIAR' && room.liarMode === 'NO_WORD' ? (
                    <div className="py-2 inline-block">
                      <p className="text-lg md:text-xl font-bold text-rose-500">제시어가 없습니다!</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-[250px] leading-relaxed mx-auto">
                        다른 시민들의 힌트를 신중히 듣고 진짜 단어를 유추해 정체를 숨기세요!
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-50 py-3.5 px-6 rounded-2xl inline-block border border-slate-100">
                      <p className="text-2xl font-black text-slate-800 tracking-wider">
                        {self.word}
                      </p>
                    </div>
                  )}
                </div>

                {/* Prompt Question Details */}
                <div className="p-6 bg-slate-50/30 text-center">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">AI PROMPT MISSION</p>
                  <p className="text-sm font-extrabold text-indigo-950 leading-relaxed max-w-xs mx-auto">
                    "{room.aiPrompt}"
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                  <p className="text-slate-400 text-[11px]">
                    방장이 답변 작성을 시작하면 화면이 즉시 이동합니다.
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {room.phase === 'SUBMISSION' && (
          <motion.div
            key="p-submission"
            className="bg-white border border-slate-100 shadow-xl rounded-3xl p-6 space-y-5"
          >
            <div>
              <span className="text-[10px] bg-indigo-50 text-indigo-600 font-black px-2.5 py-1 rounded-full">{room.category}</span>
              <p className="text-xs uppercase text-slate-400 font-bold tracking-widest mt-2">ROUND CHALLENGE</p>
              <h3 className="text-base font-extrabold text-slate-800 mt-1 leading-normal">
                "{room.aiPrompt}"
              </h3>
            </div>

            {/* Answer check text details */}
            {self.submission.trim().length > 0 ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500 text-2xl">
                  ✓
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">작성 답변 제출 완료!</h4>
                  <p className="text-xs text-slate-400 mt-1">다른 참여자들이 모두 제출할 때까지 <br/> 호스트 전광판 화면을 확인해 주세요.</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 inline-block max-w-xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase truncate">내가 써서 제출한 답변 내용</p>
                  <p className="text-xs font-bold text-slate-600 mt-1 break-words">"{self.submission}"</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block tracking-wide uppercase">이 단어 설명하기 ({self.word})</label>
                  <textarea
                    rows={3}
                    maxLength={100}
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    placeholder="과도한 구체화는 지양하되 시민들에겐 통하도록 절묘하게 한줄 설명하세요..."
                    className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white border border-slate-100 focus:border-indigo-500 rounded-2xl py-3 px-4 text-sm font-medium outline-none resize-none transition-all"
                  />
                  <div className="flex justify-end pr-1.5 text-[10px] font-semibold text-slate-400 font-mono">
                    {answerInput.length} / 100 자
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitAnswer}
                  disabled={answerInput.trim().length === 0}
                  className={`w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md ${
                    answerInput.trim().length > 0
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/10'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-100'
                  }`}
                >
                  <Send className="w-4 h-4 fill-current" />
                  설명서 제출하기
                </button>
              </div>
            )}
          </motion.div>
        )}

        {room.phase === 'REVEAL' && (
          <motion.div
            key="p-revealing"
            className="bg-white border border-slate-100 shadow-xl rounded-3xl p-8 text-center space-y-6"
          >
            <div className="w-14 h-14 bg-indigo-50/50 rounded-full flex items-center justify-center text-2xl mx-auto shadow-inner animate-pulse">
              💬
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-indigo-950">제출된 답변 토론 탐핵!</h3>
              <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                방장 화면에서 모두가 제출한 기상천외한 답변을 확인하고 토론하세요. 과연 어느 한 설명이 수상한지 눈을 부릅뜨고 라이어를 색출해내야 합니다!
              </p>
            </div>

            <p className="text-slate-400 text-[10px] select-none">
              방장님이 '투표'를 시작할 때까지 잠시 대기하며 의견을 나누세요.
            </p>
          </motion.div>
        )}

        {room.phase === 'VOTING' && (
          <motion.div
            key="p-voting"
            className="bg-white border border-slate-100 shadow-xl rounded-3xl p-6 space-y-5"
          >
            <div>
              <span className="text-[10px] bg-rose-50 text-rose-600 font-black px-2.5 py-1 rounded-full uppercase tracking-wider">DETECTIVE BALLOT</span>
              <h3 className="text-base font-black text-slate-800 mt-1.5">라이어 용의자 지목 투표</h3>
              <p className="text-slate-500 text-xs mt-0.5">이 중에서 가장 가짜 같은 답변을 작렬한 용의자를 선택하세요.</p>
            </div>

            {self.votedFor ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold animate-bounce">
                  🎯
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">소중한 투표 제출 완료!</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    개표를 승인하기 위해 기다리고 있습니다. <br/> 호스트 화면에서 실시간 결과를 확인해 보십시오.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {voteCandidates.map((p) => {
                    const isSelected = selectedVoteId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedVoteId(p.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 shadow-sm font-bold'
                            : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            style={{ backgroundColor: p.avatarColor }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white"
                          >
                            {p.avatarEmoji}
                          </div>
                          <span className="text-xs font-semibold">{p.nickName}</span>
                        </div>

                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleVotePlayer}
                  disabled={!selectedVoteId}
                  className={`w-full py-3.5 rounded-2xl font-bold transition-all shadow-md cursor-pointer ${
                    selectedVoteId
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border'
                  }`}
                >
                  투표지 제하기
                </button>
              </div>
            )}
          </motion.div>
        )}

        {room.phase === 'VOTE_REVEAL' && (
          <motion.div
            key="p-vote-reveal"
            className="bg-white border border-slate-100 shadow-xl rounded-3xl p-8 text-center space-y-6"
          >
            <div className="w-14 h-14 bg-indigo-50/50 rounded-full flex items-center justify-center text-2xl mx-auto shadow-inner animate-pulse">
              📊
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-indigo-950">투표 결과 집계 중!</h3>
              <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                방장 전광판에서 마침내 개표 집계 그래프가 전개 주도되고 있습니다. 과연 시민들이 수사망을 좁혀 라이어를 잡았을지 주목하세요!
              </p>
            </div>
          </motion.div>
        )}

        {room.phase === 'LIAR_GUESS' && (
          <motion.div
            key="p-liar-guess"
            className="bg-white border border-slate-100 shadow-xl rounded-3xl p-6 space-y-5"
          >
            {self.role === 'LIAR' ? (
              <div className="space-y-5">
                <div className="text-center space-y-1">
                  <span className="text-[10px] bg-red-100 text-red-700 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-widest">LAST GASP CHANCE</span>
                  <h3 className="text-lg font-black text-red-600 mt-1.5">검거 완료! 최후의 반전 도박</h3>
                  <p className="text-slate-500 text-xs">시민들에게 정체를 간파당했지만, <b>시민들의 진짜 단어</b>를 뒤늦게 맞추면 역전 우승합니다!!</p>
                </div>

                {guessedWord ? (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-slate-400 text-xs">선택한 유추 정답 제출 완료!</p>
                    <div className="bg-slate-50 border p-4 rounded-xl inline-block">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">내가 선택한 진짜 단어 추론</p>
                      <p className="text-lg font-black text-rose-500 mt-0.5">"{guessedWord}"</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">방장 화면을 주목하셔서 승리/패배 선언을 받으세요.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-center font-bold text-slate-400 uppercase tracking-widest">진짜 단어 선택하기</p>
                    <div className="grid grid-cols-2 gap-3" id="liar-choices-grid">
                      {guessChoices.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => handleSubmitLiarGuess(choice)}
                          className="w-full py-4 px-3 bg-slate-50 border border-slate-100 hover:border-red-500 rounded-2xl text-sm font-extrabold text-slate-700 active:bg-slate-100 hover:text-red-600 active:scale-95 cursor-pointer transition-all text-center break-words"
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 space-y-4">
                <div className="w-14 h-14 bg-rose-50 border text-rose-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold animate-ping">
                  🕵️‍♂️
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm">라이어 검거 후 최후 판결 대기...</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    라이어가 시민 진짜 제시어가 무엇이었는지 사격하고 있습니다. <br/> 정답을 맞추면 라이어가 역전하므로 부디 틀리기를 방장창에 주목해 보세요!
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {room.phase === 'RESULT' && (
          <motion.div
            key="p-result"
            className="bg-white border border-slate-100 shadow-xl rounded-3xl p-6 space-y-6"
          >
            {/* Crown Medal status */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-3xl mx-auto shadow shadow-inner">
                {room.winner === 'LIAR' 
                  ? (self.role === 'LIAR' ? '🏆' : '💀') 
                  : (self.role === 'CITIZEN' ? '🏆' : '💀')}
              </div>
              
              <h3 className="text-2xl font-black text-slate-800">
                {room.winner === 'LIAR'
                  ? (self.role === 'LIAR' ? '당신이 이겼습니다!!' : '라이어에게 밀려 패배했습니다')
                  : (self.role === 'CITIZEN' ? '치밀한 수사로 이겼습니다!' : '아쉽게 체포되어 패배했습니다')}
              </h3>
              
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold leading-none ${
                (room.winner === 'LIAR' && self.role === 'LIAR') || (room.winner === 'CITIZENS' && self.role === 'CITIZEN')
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-red-50 text-red-500'
              }`}>
                {((room.winner === 'LIAR' && self.role === 'LIAR') || (room.winner === 'CITIZENS' && self.role === 'CITIZEN')) ? '🎉 VICTORY' : '🔥 DEFEAT'}
              </span>
            </div>

            {/* Answer specs */}
            <div className="bg-slate-50 border rounded-2xl p-4 text-center divide-y divide-slate-100 space-y-3">
              <div className="pb-3">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">🛡️ 시민 진짜 단어</p>
                <p className="text-xl font-bold text-indigo-700 mt-0.5">{room.citizenWord}</p>
              </div>

              <div className="pt-3">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">🎭 라이어 유인 단어</p>
                <p className="text-xl font-bold text-slate-600 mt-0.5">{room.liarWord || '일체 제시되지 않음'}</p>
              </div>
            </div>

            {/* Score Details */}
            <div className="border-t border-slate-100 pt-5 text-center">
              <p className="text-xs font-medium text-slate-500">
                내 현재 누적 점수: <b className="text-indigo-600 text-sm font-mono">{self.points}점</b>
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] mx-auto">
                방장님이 '다음 라운드' 버튼을 누를 때까지 편안히 한숨 돌리며 대기해 주세요.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
