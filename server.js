const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const hangul = require('./hangul');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 문제 데이터 로드
let questions = [];
try {
  const data = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf-8');
  questions = JSON.parse(data);
} catch (e) {
  questions = [
    "가는 말이 고와야 오는 말이 곱다.",
    "천리안 대화방에 오신 여러분을 환영합니다.",
    "새롬데이타맨프로 98로 접속하신 것을 환영합니다.",
    "신의손의 영광을 위하여 키보드를 두드려라!"
  ];
}

// 칭호 계산 함수
function getTitle(level) {
  if (level >= 10) return "신의손 (전설)";
  if (level >= 5) return "다이아손 (초고수)";
  if (level >= 4) return "금손 (달인)";
  if (level >= 3) return "은손 (숙련자)";
  if (level >= 2) return "동손 (초보자)";
  return "흙손 (초심자)";
}

function getLevelFromExp(exp) {
  if (exp >= 5000) return 10;
  if (exp >= 1500) return 5;
  if (exp >= 700) return 4;
  if (exp >= 300) return 3;
  if (exp >= 100) return 2;
  return 1;
}

// 봇 닉네임 풀
const BOT_NICKNAMES = [
  "하이텔나그네", "천리안타자왕", "빛의손가락", "초록불빛",
  "방구석키보더", "모뎀전사336", "나우누리독수리", "유니텔고수",
  "타자의달인", "청춘스케치", "새롬마스터", "밤샘채팅러"
];

// 상태 관리
let nextRoomId = 1;
const rooms = new Map(); // roomId -> RoomObject
const users = new Map(); // socket.id -> UserObject

class Room {
  constructor(id, title, creator) {
    this.id = id;
    this.title = title;
    this.creator = creator;
    this.members = new Map(); // id -> { id, nickname, isBot, botCpm, level, title }
    this.maxMembers = 10;
    
    // 게임 상태
    this.gameState = 'IDLE'; // IDLE, COUNTDOWN, PLAYING, RESULT
    this.currentQuestion = '';
    this.startTime = 0;
    this.countdownTimer = null;
    this.roundTimeout = null;
    this.botTimers = [];
    this.submissions = []; // [{ id, nickname, elapsed, cpm, isBot }]
  }

  getMemberCount() {
    return this.members.size;
  }

  isFull() {
    return this.members.size >= this.maxMembers;
  }

  addMember(user) {
    if (this.isFull()) return false;
    this.members.set(user.id, user);
    return true;
  }

  removeMember(userId) {
    this.members.delete(userId);
    // 방에 사람이 없으면 타이머 정리
    if (this.members.size === 0) {
      this.clearAllTimers();
    }
  }

  clearAllTimers() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    this.botTimers.forEach(t => clearTimeout(t));
    this.botTimers = [];
    this.countdownTimer = null;
    this.roundTimeout = null;
    this.gameState = 'IDLE';
  }

  toSummary() {
    return {
      id: this.id,
      title: this.title,
      count: this.members.size,
      max: this.maxMembers,
      gameState: this.gameState
    };
  }
}

// 로비 정보 브로드캐스트
function broadcastLobbyState() {
  const roomList = Array.from(rooms.values()).map(r => r.toSummary());
  const lobbyUsers = Array.from(users.values())
    .filter(u => u.roomId === null)
    .map(u => ({ id: u.id, nickname: u.nickname, level: u.level, title: u.title }));

  io.to('lobby').emit('lobby_update', {
    rooms: roomList,
    users: lobbyUsers,
    totalOnline: users.size
  });
}

// 방 상태 브로드캐스트
function broadcastRoomState(room) {
  const members = Array.from(room.members.values());
  io.to(`room_${room.id}`).emit('room_update', {
    id: room.id,
    title: room.title,
    count: room.members.size,
    max: room.maxMembers,
    members: members,
    gameState: room.gameState
  });
}

io.on('connection', (socket) => {
  // 기본 유저 상태
  const user = {
    id: socket.id,
    nickname: `손님_${socket.id.substring(0, 4)}`,
    exp: 0,
    level: 1,
    title: "흙손 (초심자)",
    roomId: null
  };
  users.set(socket.id, user);

  // 로비 조인
  socket.join('lobby');
  broadcastLobbyState();

  // 1. 유저 초기화 / 로컬 저장 정보 동기화
  socket.on('init_user', (data) => {
    if (data.nickname && data.nickname.trim().length > 0) {
      user.nickname = data.nickname.trim().substring(0, 12);
    }
    if (typeof data.exp === 'number' && data.exp >= 0) {
      user.exp = data.exp;
      user.level = getLevelFromExp(user.exp);
      user.title = getTitle(user.level);
    }
    socket.emit('user_info', {
      id: user.id,
      nickname: user.nickname,
      exp: user.exp,
      level: user.level,
      title: user.title
    });
    broadcastLobbyState();
  });

  // 2. 닉네임 변경
  socket.on('change_nickname', (newNick) => {
    if (!newNick || !newNick.trim()) return;
    const oldNick = user.nickname;
    user.nickname = newNick.trim().substring(0, 12);
    socket.emit('system_message', `닉네임이 [${oldNick}]에서 [${user.nickname}](으)로 변경되었습니다.`);
    socket.emit('user_info', {
      id: user.id,
      nickname: user.nickname,
      exp: user.exp,
      level: user.level,
      title: user.title
    });

    if (user.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.members.set(user.id, user);
        broadcastRoomState(room);
        io.to(`room_${room.id}`).emit('chat_message', {
          sender: '[시스템]',
          text: `[${oldNick}]님이 닉네임을 [${user.nickname}](으)로 변경하였습니다.`,
          isSystem: true
        });
      }
    } else {
      broadcastLobbyState();
    }
  });

  // 3. 방 만들기
  socket.on('create_room', (title) => {
    if (user.roomId) {
      socket.emit('system_message', '이미 방에 입장해 있습니다. 먼저 /나가기 를 하세요.');
      return;
    }
    const roomTitle = (title && title.trim()) ? title.trim().substring(0, 20) : `${user.nickname}님의 타자방`;
    const roomId = nextRoomId++;
    const room = new Room(roomId, roomTitle, user.nickname);

    user.roomId = roomId;
    room.addMember(user);
    rooms.set(roomId, room);

    socket.leave('lobby');
    socket.join(`room_${roomId}`);

    socket.emit('room_joined', room.toSummary());
    broadcastRoomState(room);
    broadcastLobbyState();

    io.to(`room_${roomId}`).emit('chat_message', {
      sender: '[시스템]',
      text: `방 [${room.title}]이(가) 개설되었습니다. (/문제 명령어로 게임을 시작할 수 있습니다)`,
      isSystem: true
    });
  });

  // 4. 방 입장
  socket.on('join_room', (roomIdInput) => {
    if (user.roomId) {
      socket.emit('system_message', '이미 방에 입장해 있습니다. 먼저 /나가기 를 하세요.');
      return;
    }
    const roomId = parseInt(roomIdInput, 10);
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('system_message', `해당 번호(${roomIdInput})의 방이 존재하지 않습니다.`);
      return;
    }
    if (room.isFull()) {
      socket.emit('system_message', `해당 방은 정원(10명)이 가득 찼습니다.`);
      return;
    }

    user.roomId = roomId;
    room.addMember(user);

    socket.leave('lobby');
    socket.join(`room_${roomId}`);

    socket.emit('room_joined', room.toSummary());
    broadcastRoomState(room);
    broadcastLobbyState();

    io.to(`room_${roomId}`).emit('chat_message', {
      sender: '[시스템]',
      text: `[${user.nickname}]님이 방에 입장하셨습니다. (현재 ${room.members.size}/10명)`,
      isSystem: true
    });
  });

  // 5. 방 나가기
  function leaveCurrentRoom() {
    if (!user.roomId) return;
    const roomId = user.roomId;
    const room = rooms.get(roomId);

    if (room) {
      room.removeMember(user.id);
      socket.leave(`room_${roomId}`);
      io.to(`room_${roomId}`).emit('chat_message', {
        sender: '[시스템]',
        text: `[${user.nickname}]님이 퇴장하셨습니다. (현재 ${room.members.size}/10명)`,
        isSystem: true
      });

      // 방에 아무도 없으면 (봇만 남아있거나 0명이면) 방 삭제
      const realUsers = Array.from(room.members.values()).filter(m => !m.isBot);
      if (realUsers.length === 0) {
        room.clearAllTimers();
        rooms.delete(roomId);
      } else {
        broadcastRoomState(room);
      }
    }

    user.roomId = null;
    socket.join('lobby');
    socket.emit('room_left');
    broadcastLobbyState();
  }

  socket.on('leave_room', () => {
    leaveCurrentRoom();
  });

  // 6. 봇 추가 (/봇추가 [인원])
  socket.on('add_bots', (countInput) => {
    if (!user.roomId) {
      socket.emit('system_message', '방 안에서만 봇을 추가할 수 있습니다.');
      return;
    }
    const room = rooms.get(user.roomId);
    if (!room) return;

    let count = parseInt(countInput, 10);
    if (isNaN(count) || count < 1) count = 1;
    
    let added = 0;
    for (let i = 0; i < count; i++) {
      if (room.isFull()) break;
      const botNick = BOT_NICKNAMES[Math.floor(Math.random() * BOT_NICKNAMES.length)] + `_${Math.floor(Math.random() * 90 + 10)}`;
      const botCpm = Math.floor(Math.random() * 450 + 250); // 250 ~ 700타 사이
      const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const botLevel = Math.min(10, Math.floor(botCpm / 80));
      const botUser = {
        id: botId,
        nickname: botNick,
        isBot: true,
        botCpm: botCpm,
        exp: botLevel * 300,
        level: botLevel,
        title: getTitle(botLevel)
      };
      room.addMember(botUser);
      added++;
    }

    if (added > 0) {
      broadcastRoomState(room);
      broadcastLobbyState();
      io.to(`room_${room.id}`).emit('chat_message', {
        sender: '[시스템]',
        text: `가상 참가자(봇) ${added}명이 방에 소환되었습니다. (현재 ${room.members.size}/10명)`,
        isSystem: true
      });
    } else {
      socket.emit('system_message', '방이 가득 찼거나 더 이상 봇을 추가할 수 없습니다.');
    }
  });

  // 봇 퇴장 (/봇퇴장)
  socket.on('remove_bots', () => {
    if (!user.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room) return;

    let removed = 0;
    for (const [id, m] of Array.from(room.members.entries())) {
      if (m.isBot) {
        room.removeMember(id);
        removed++;
      }
    }
    broadcastRoomState(room);
    broadcastLobbyState();
    io.to(`room_${room.id}`).emit('chat_message', {
      sender: '[시스템]',
      text: `가상 참가자(봇) ${removed}명이 퇴장하였습니다.`,
      isSystem: true
    });
  });

  // 7. '/문제' - 타자 대결 시작
  socket.on('start_game', () => {
    if (!user.roomId) {
      socket.emit('system_message', '방에 입장한 상태에서만 게임을 시작할 수 있습니다.');
      return;
    }
    const room = rooms.get(user.roomId);
    if (!room) return;

    if (room.gameState !== 'IDLE') {
      socket.emit('system_message', '이미 게임이 진행 중이거나 카운트다운 중입니다.');
      return;
    }

    room.clearAllTimers();
    room.gameState = 'COUNTDOWN';
    room.submissions = [];
    broadcastRoomState(room);

    // 5초 카운트다운
    let secondsLeft = 5;
    io.to(`room_${room.id}`).emit('game_countdown', { seconds: secondsLeft });
    io.to(`room_${room.id}`).emit('chat_message', {
      sender: '[신의손]',
      text: `★ 5초 후 문제가 출제됩니다! 키보드에 손을 올리세요! (${secondsLeft})`,
      isSystem: true,
      sound: 'countdown'
    });

    room.countdownTimer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        io.to(`room_${room.id}`).emit('game_countdown', { seconds: secondsLeft });
        io.to(`room_${room.id}`).emit('chat_message', {
          sender: '[신의손]',
          text: `... ${secondsLeft}초 전!`,
          isSystem: true,
          sound: 'countdown'
        });
      } else {
        clearInterval(room.countdownTimer);
        room.countdownTimer = null;
        
        // 문제 출제
        const qIndex = Math.floor(Math.random() * questions.length);
        room.currentQuestion = questions[qIndex];
        room.startTime = Date.now();
        room.gameState = 'PLAYING';
        room.submissions = [];

        broadcastRoomState(room);

        io.to(`room_${room.id}`).emit('game_question', {
          question: room.currentQuestion,
          startTime: room.startTime,
          limitSeconds: 13
        });

        io.to(`room_${room.id}`).emit('chat_message', {
          sender: '[신의손]',
          text: `┌──────────────────────────────────────────────┐\n│ [문제] ${room.currentQuestion}\n└──────────────────────────────────────────────┘\n(제한시간 13초! 정확하게 치고 엔터를 누르세요!)`,
          isSystem: true,
          sound: 'question'
        });

        // 가상 봇 타이핑 시뮬레이션
        simulateBotAnswers(room);

        // 13초 후 결과 계산 및 마감
        room.roundTimeout = setTimeout(() => {
          finishRound(room);
        }, 13000);
      }
    }, 1000);
  });

  // 봇 타이핑 시뮬레이션 함수
  function simulateBotAnswers(room) {
    const questionText = room.currentQuestion;
    const strokes = hangul.calculateStrokes(questionText);

    room.members.forEach((m) => {
      if (!m.isBot) return;
      
      // 봇의 타속(botCpm)과 약간의 랜덤 변동(-30 ~ +30)
      const actualCpm = Math.max(150, m.botCpm + Math.floor(Math.random() * 60 - 30));
      // 소요 시간(초) = (총타수 / actualCpm) * 60 + 인지 딜레이(0.3~0.7초)
      const reactionDelay = 0.3 + Math.random() * 0.4;
      const typingTime = (strokes / actualCpm) * 60;
      const totalTimeSec = typingTime + reactionDelay;
      const totalTimeMs = Math.round(totalTimeSec * 1000);

      // 13초 이내에 완료할 수 있으면 스케줄링
      if (totalTimeMs < 12800) {
        const timer = setTimeout(() => {
          if (room.gameState !== 'PLAYING') return;

          // 봇 정답 제출 처리 (25% 확률로 1글자 오타 발생 시뮬레이션)
          let botText = questionText;
          if (Math.random() < 0.25 && questionText.length > 3) {
            const typoIndex = Math.floor(Math.random() * (questionText.length - 1));
            const typos = ['!', '?', '.', 'ㅋ', ' '];
            botText = questionText.substring(0, typoIndex) + typos[Math.floor(Math.random() * typos.length)] + questionText.substring(typoIndex + 1);
          }

          const evalResult = hangul.evaluateAccuracy(questionText, botText);
          const elapsed = (Date.now() - room.startTime) / 1000;
          const rawCPM = hangul.calculateCPM(botText, elapsed);
          const netCPM = hangul.calculateNetCPM(rawCPM, evalResult.accuracy, evalResult.errors);
          
          room.submissions.push({
            id: m.id,
            nickname: m.nickname,
            elapsed: parseFloat(elapsed.toFixed(2)),
            rawCPM: rawCPM,
            netCPM: netCPM,
            accuracy: evalResult.accuracy,
            errors: evalResult.errors,
            isBot: true
          });

          const rank = room.submissions.length;
          io.to(`room_${room.id}`).emit('submission_alert', {
            rank,
            nickname: m.nickname,
            netCPM,
            rawCPM,
            accuracy: evalResult.accuracy,
            errors: evalResult.errors,
            elapsed: parseFloat(elapsed.toFixed(2)),
            isBot: true
          });

          let botArrivalMsg = `[${rank}등 도착] ${m.nickname} (정확도: ${evalResult.accuracy}%, 타속: ${netCPM}타/분 [원시: ${rawCPM}타], 소요시간: ${elapsed.toFixed(2)}초)`;
          if (evalResult.errors > 0) {
            botArrivalMsg += ` ⚠️ 오타 ${evalResult.errors}개 핸디캡 반영!`;
          }

          io.to(`room_${room.id}`).emit('chat_message', {
            sender: '[도착]',
            text: botArrivalMsg,
            isSystem: true
          });
        }, totalTimeMs);

        room.botTimers.push(timer);
      }
    });
  }

  // 라운드 종료 및 순위/경험치 집계
  function finishRound(room) {
    if (room.gameState !== 'PLAYING') return;
    room.gameState = 'RESULT';
    broadcastRoomState(room);

    // 핸디캡을 반영한 조정 타속(netCPM) 내림차순 정렬 (동률 시 소요시간 빠른 순)
    const submissions = [...room.submissions].sort((a, b) => {
      if (b.netCPM !== a.netCPM) {
        return b.netCPM - a.netCPM;
      }
      return a.elapsed - b.elapsed;
    });
    
    // 결과 리포트 생성
    let resultText = `\n================ [ 타자 대결 최종 순위표 (오타 핸디캡 반영) ] ================\n`;
    if (submissions.length === 0) {
      resultText += `아무도 13초 이내에 제출하지 못했습니다! (전원 탈락)\n`;
    } else {
      submissions.forEach((sub, idx) => {
        const rank = idx + 1;
        let medal = rank === 1 ? '🥇 1위' : (rank === 2 ? '🥈 2위' : (rank === 3 ? '🥉 3위' : `   ${rank}위`));
        let expAward = 0;
        if (rank === 1) expAward = 100;
        else if (rank === 2) expAward = 60;
        else if (rank === 3) expAward = 30;
        else expAward = 10;

        sub.expAward = expAward;
        sub.rank = rank;

        const errNotice = sub.errors > 0 ? ` [오타 ${sub.errors}개 감점]` : ` [무결점 100%]`;
        resultText += `${medal}: [${sub.nickname}] - 최종: ${sub.netCPM}타/분 (정확도: ${sub.accuracy}%${errNotice}, 원시: ${sub.rawCPM}타, ${sub.elapsed}초) (+${expAward} EXP)\n`;

        // 실제 유저인 경우 경험치 지급 및 레벨업 체크
        if (!sub.isBot) {
          const userObj = users.get(sub.id);
          if (userObj) {
            const oldLevel = userObj.level;
            userObj.exp += expAward;
            userObj.level = getLevelFromExp(userObj.exp);
            userObj.title = getTitle(userObj.level);

            io.to(sub.id).emit('exp_gained', {
              addedExp: expAward,
              totalExp: userObj.exp,
              level: userObj.level,
              title: userObj.title,
              leveledUp: userObj.level > oldLevel
            });

            if (userObj.level > oldLevel) {
              io.to(`room_${room.id}`).emit('chat_message', {
                sender: '[축하]',
                text: `🎉 축하합니다! [${userObj.nickname}]님이 Lv.${userObj.level} [${userObj.title}](으)로 승급하셨습니다!`,
                isSystem: true
              });
            }
          }
        }
      });
    }
    resultText += `=========================================================================\n(다음 대결은 다시 '/문제' 명령어를 입력하세요)`;

    io.to(`room_${room.id}`).emit('game_result', {
      submissions: submissions,
      resultText: resultText
    });

    io.to(`room_${room.id}`).emit('chat_message', {
      sender: '[신의손]',
      text: resultText,
      isSystem: true,
      sound: 'result'
    });

    // 3초 후 IDLE로 복귀하여 다음 게임 가능하도록 설정
    setTimeout(() => {
      room.gameState = 'IDLE';
      broadcastRoomState(room);
    }, 3000);
  }

  // 8. 참가자 답안 제출 (`submit_answer`)
  socket.on('submit_answer', (answerText) => {
    if (!user.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || room.gameState !== 'PLAYING') return;

    // 이미 제출했는지 확인
    const alreadySubmitted = room.submissions.some(s => s.id === user.id);
    if (alreadySubmitted) {
      socket.emit('system_message', '이미 이번 라운드 정답을 제출하셨습니다.');
      return;
    }

    const trimmedAnswer = (answerText || '').trim();
    const targetText = room.currentQuestion.trim();

    // 정확도 및 오타 분석
    const evalResult = hangul.evaluateAccuracy(targetText, trimmedAnswer);

    // 최소 정확도(50%) 검증
    if (evalResult.accuracy < 50) {
      socket.emit('system_message', `❌ 정확도가 너무 낮습니다 (${evalResult.accuracy}%). 50% 이상 일치해야 제출이 인정됩니다! 다시 입력하세요.`);
      return;
    }

    // 소요 시간 및 원시 타수(Raw CPM), 오타 핸디캡 반영 조정 타수(Net CPM) 계산
    const elapsed = (Date.now() - room.startTime) / 1000;
    const rawCPM = hangul.calculateCPM(trimmedAnswer, elapsed);
    const netCPM = hangul.calculateNetCPM(rawCPM, evalResult.accuracy, evalResult.errors);

    room.submissions.push({
      id: user.id,
      nickname: user.nickname,
      elapsed: parseFloat(elapsed.toFixed(2)),
      rawCPM: rawCPM,
      netCPM: netCPM,
      accuracy: evalResult.accuracy,
      errors: evalResult.errors,
      isBot: false
    });

    const rank = room.submissions.length;

    // 즉시 실시간 피드백 방송
    io.to(`room_${room.id}`).emit('submission_alert', {
      rank,
      nickname: user.nickname,
      netCPM,
      rawCPM,
      accuracy: evalResult.accuracy,
      errors: evalResult.errors,
      elapsed: parseFloat(elapsed.toFixed(2)),
      isBot: false
    });

    let arrivalMsg = `[${rank}등 도착] ${user.nickname} (정확도: ${evalResult.accuracy}%, 타속: ${netCPM}타/분 [원시: ${rawCPM}타], 소요시간: ${elapsed.toFixed(2)}초)`;
    if (evalResult.errors > 0) {
      arrivalMsg += ` ⚠️ 오타 ${evalResult.errors}개 핸디캡 감점 반영!`;
    }

    io.to(`room_${room.id}`).emit('chat_message', {
      sender: '[도착]',
      text: arrivalMsg,
      isSystem: true
    });
  });

  // 9. 일반 채팅 및 명령어 파싱
  socket.on('send_chat', (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const text = rawText.trim();

    // 명령어 처리
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      switch (cmd) {
        case '/도움말':
        case '/help':
        case '/?':
          socket.emit('chat_message', {
            sender: '[안내]',
            text: `[명령어 안내]\n` +
                  `· /문제: 타자 대결 시작 (5초 카운트 후 출제)\n` +
                  `· /방만들기 [방제목]: 새로운 방 개설 (최대 10명)\n` +
                  `· /입장 [방번호]: 해당 번호의 방에 입장\n` +
                  `· /나가기: 대기실로 퇴장\n` +
                  `· /방목록: 현재 개설된 방 리스트 확인\n` +
                  `· /접속자: 현재 온라인 사용자 목록\n` +
                  `· /닉네임 [이름]: 닉네임 변경\n` +
                  `· /봇추가 [인원]: 테스트용 가상 참가자 소환 (방 전용)\n` +
                  `· /봇퇴장: 가상 참가자 일괄 퇴장 (방 전용)\n` +
                  `· /정보: 내 전적, 레벨, 경험치 조회`,
            isSystem: true
          });
          break;

        case '/문제':
          socket.emit('trigger_start_game');
          break;

        case '/방만들기':
        case '/create':
          if (!arg) {
            socket.emit('system_message', '방 제목을 입력해주세요. 예: /방만들기 신의손초보방');
          } else {
            socket.emit('trigger_create_room', arg);
          }
          break;

        case '/입장':
        case '/join':
          if (!arg) {
            socket.emit('system_message', '입장할 방 번호를 입력해주세요. 예: /입장 1');
          } else {
            socket.emit('trigger_join_room', arg);
          }
          break;

        case '/나가기':
        case '/leave':
        case '/exit':
          leaveCurrentRoom();
          break;

        case '/방목록':
        case '/list':
          const roomList = Array.from(rooms.values());
          if (roomList.length === 0) {
            socket.emit('system_message', '현재 개설된 방이 없습니다. /방만들기 로 방을 개설해보세요!');
          } else {
            let msg = `[현재 개설된 방 목록]\n`;
            roomList.forEach(r => {
              msg += `· [${r.id}번방] ${r.title} (${r.members.size}/10명) - 상태: ${r.gameState}\n`;
            });
            socket.emit('system_message', msg);
          }
          break;

        case '/접속자':
        case '/who':
          let uListMsg = `[현재 접속자 목록 (총 ${users.size}명)]\n`;
          users.forEach(u => {
            const loc = u.roomId ? `${u.roomId}번 방` : '대기실';
            uListMsg += `· [${u.title}] ${u.nickname} (${loc})\n`;
          });
          socket.emit('system_message', uListMsg);
          break;

        case '/닉네임':
          if (!arg) {
            socket.emit('system_message', '변경할 닉네임을 입력하세요. 예: /닉네임 타자고수');
          } else {
            socket.emit('trigger_change_nickname', arg);
          }
          break;

        case '/봇추가':
          socket.emit('trigger_add_bots', arg);
          break;

        case '/봇퇴장':
          socket.emit('trigger_remove_bots');
          break;

        case '/정보':
          socket.emit('system_message', 
            `[내 정보]\n` +
            `· 닉네임: ${user.nickname}\n` +
            `· 계급/칭호: ${user.title}\n` +
            `· 레벨: Lv.${user.level}\n` +
            `· 누적 경험치: ${user.exp} EXP\n` +
            `· 현재 위치: ${user.roomId ? `${user.roomId}번 방` : '대기실'}`
          );
          break;

        default:
          socket.emit('system_message', `알 수 없는 명령어입니다: ${cmd} (도움말은 /도움말)`);
          break;
      }
      return;
    }

    // 일반 채팅
    if (user.roomId) {
      const room = rooms.get(user.roomId);
      // 만약 게임 진행 중(PLAYING) 상태라면, 유저의 입력이 문제 정답 시도인지 판별!
      if (room && room.gameState === 'PLAYING') {
        // 정답 시도로 처리
        socket.emit('trigger_submit_answer', text);
      } else {
        // 일반 채팅 전송
        io.to(`room_${user.roomId}`).emit('chat_message', {
          sender: `[${user.title}] ${user.nickname}`,
          text: text,
          isSystem: false
        });
      }
    } else {
      // 대기실 채팅
      io.to('lobby').emit('chat_message', {
        sender: `[대기실] ${user.nickname}`,
        text: text,
        isSystem: false
      });
    }
  });

  // 10. 접속 해제
  socket.on('disconnect', () => {
    leaveCurrentRoom();
    users.delete(socket.id);
    broadcastLobbyState();
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 천리안 '신의손' 온라인 타자 서버 가동 완료!`);
  console.log(` 포트: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
