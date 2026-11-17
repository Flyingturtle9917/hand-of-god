const { io } = require('socket.io-client');

const socket1 = io('http://localhost:3000');
const socket2 = io('http://localhost:3000');

console.log('--- 정확도 & 오타 핸디캡 검증 테스트 시작 ---');

socket1.on('connect', () => {
  socket1.emit('init_user', { nickname: '스피드오타러', exp: 0 });
});

socket2.on('connect', () => {
  socket2.emit('init_user', { nickname: '정확도장인', exp: 0 });
});

let currentQuestion = '';

socket1.on('user_info', (info) => {
  setTimeout(() => {
    socket1.emit('create_room', '정확도테스트방');
  }, 300);
});

socket1.on('room_joined', (room) => {
  setTimeout(() => {
    socket2.emit('join_room', room.id);
  }, 300);
});

socket2.on('room_joined', (room) => {
  setTimeout(() => {
    socket1.emit('add_bots', 2);
  }, 300);
});

socket1.on('room_update', (room) => {
  if (room.count === 4 && room.gameState === 'IDLE') {
    setTimeout(() => {
      console.log('>>> [게임 시작] /문제 실행!');
      socket1.emit('start_game');
    }, 500);
  }
});

socket1.on('game_countdown', (data) => {
  console.log(`[카운트다운] ${data.seconds}초`);
});

socket1.on('game_question', (data) => {
  currentQuestion = data.question;
  console.log(`>>> [문제 출제] "${currentQuestion}"`);
  
  // 클라이언트 1 (스피드오타러): 엄청 빠르지만(1.3초) 글자 1~2개 오타 내며 제출!
  const typoAnswer = currentQuestion.length > 5 
    ? currentQuestion.substring(0, currentQuestion.length - 2) + "다." 
    : currentQuestion + "!";

  setTimeout(() => {
    console.log(`[클라이언트1 (스피드오타러)] 1.3초 초고속 제출 (오타 포함): "${typoAnswer}"`);
    socket1.emit('submit_answer', typoAnswer);
  }, 1300);

  // 클라이언트 2 (정확도장인): 2.4초 걸리지만 100% 무결점 정답 제출!
  setTimeout(() => {
    console.log(`[클라이언트2 (정확도장인)] 2.4초 침착하게 100% 정답 제출: "${currentQuestion}"`);
    socket2.emit('submit_answer', currentQuestion);
  }, 2400);
});

socket1.on('submission_alert', (alert) => {
  console.log(`[실시간 알림] ${alert.rank}등 도착: [${alert.nickname}] 정확도: ${alert.accuracy}%, 오타: ${alert.errors}개, 원시: ${alert.rawCPM}타 -> 조정: ${alert.netCPM}타 (${alert.elapsed}초)`);
});

socket1.on('game_result', (result) => {
  console.log('\n================== [최종 결과 수신] ==================');
  console.log(result.resultText);
  console.log('======================================================');
  
  setTimeout(() => {
    console.log('>>> 정확도 및 오타 핸디캡 순위 조정 검증 완료!');
    socket1.disconnect();
    socket2.disconnect();
    process.exit(0);
  }, 1000);
});
