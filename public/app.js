// app.js - 천리안 '신의손' 클라이언트 애플리케이션

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM 요소 캐싱
  const terminalScreen = document.getElementById('terminalScreen');
  const terminalInput = document.getElementById('terminalInput');
  const promptLabel = document.getElementById('promptLabel');
  const crtOverlay = document.getElementById('crtOverlay');
  
  // 상태바 요소
  const statusConnect = document.getElementById('statusConnect');
  const statusTimer = document.getElementById('statusTimer');
  const statusLocation = document.getElementById('statusLocation');
  const statusUsers = document.getElementById('statusUsers');
  const statusUserLevel = document.getElementById('statusUserLevel');

  // 툴바 버튼
  const btnConnect = document.getElementById('btnConnect');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const btnSoundToggle = document.getElementById('btnSoundToggle');
  const soundIcon = document.getElementById('soundIcon');
  const soundLabel = document.getElementById('soundLabel');
  const btnCrtToggle = document.getElementById('btnCrtToggle');
  const crtLabel = document.getElementById('crtLabel');
  const btnChangeNick = document.getElementById('btnChangeNick');
  const btnHelp = document.getElementById('btnHelp');
  const btnStartGame = document.getElementById('btnStartGame');
  const btnAddBot = document.getElementById('btnAddBot');

  // 모달 요소
  const nickModal = document.getElementById('nickModal');
  const nickInput = document.getElementById('nickInput');
  const btnSaveNick = document.getElementById('btnSaveNick');
  const btnCancelNick = document.getElementById('btnCancelNick');
  const btnCloseModal = document.getElementById('btnCloseModal');

  // 클라이언트 내부 상태
  let myUser = {
    id: '',
    nickname: localStorage.getItem('hog_nickname') || '',
    exp: parseInt(localStorage.getItem('hog_exp') || '0', 10),
    level: 1,
    title: '흙손 (초심자)'
  };
  let currentRoom = null;
  let connectionSeconds = 0;
  let timerInterval = null;
  let activeQuestion = null;

  // 1. 통신 시간 카운터 시작
  function startConnectTimer() {
    connectionSeconds = 0;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      connectionSeconds++;
      const hrs = String(Math.floor(connectionSeconds / 3600)).padStart(2, '0');
      const mins = String(Math.floor((connectionSeconds % 3600) / 60)).padStart(2, '0');
      const secs = String(connectionSeconds % 60).padStart(2, '0');
      statusTimer.textContent = `통신시간: ${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  // 2. 터미널 텍스트 출력 함수
  function print(text, className = '', isRaw = false) {
    const line = document.createElement('div');
    if (className) line.className = className;
    if (isRaw) {
      line.innerHTML = text;
    } else {
      line.textContent = text;
    }
    terminalScreen.appendChild(line);
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
  }

  // 구분선 출력
  function printDivider() {
    print("--------------------------------------------------------------------------------", "ansi-dim");
  }

  // 3. 새롬데이타맨프로 모뎀 부팅 화면 연출
  function printWelcomeBanner() {
    terminalScreen.innerHTML = '';
    print("새롬 데이타맨 프로 98 Ver 3.0  (C) 1993-1998 Saerom Technology, Inc.", "ansi-white ansi-bold");
    print("모뎀 초기화 중... ATZ -> OK", "ansi-dim");
    print("전화 접속 중... ATDT 01410 (천리안 데이타 네트워크)", "ansi-yellow");
    print("CONNECT 33600 / V.34 / LAPM / COMPRESSION: V.42bis", "ansi-green ansi-bold");
    print("");
    
    // 천리안 신의손 대형 아스키 아트 배너
    const asciiBanner = 
`  ______  __  __  ____   _      _        _____             
 / ____/ / / / / / __ \\ / /     | |      |_   _|    /\\     
| |     / /_/ / / / / // /      | |        | |     /  \\    
| |    / __  / / /_/ // /       | |___    _| |_   / /\\ \\   
| |___/_/ /_/  \\____//_/____    |_____|  |_____| /_/  \\_\\  
 \\____/                     \\___/                          
  [ 천 리 안 ]  90년대 레트로 온라인 타자 대결 ★ 신 의 손 ★`;

    print(asciiBanner, "ansi-cyan ansi-bold");
    print("");
    print("■ 천리안 타자 동호회 '신의손' 대화방에 입장하셨습니다.", "ansi-yellow");
    print("■ 회원가입 없이 누구나 참여하는 실시간 10인 타자 배틀!", "ansi-white");
    print("■ 명령어 안내는 [/도움말] 또는 상단 [도움말] 버튼을 누르세요.", "ansi-green");
    printDivider();
    print("· 대기실 명령어: /방만들기 [방제목], /입장 [방번호], /방목록, /접속자", "ansi-cyan");
    print("· 방 내부 명령어: /문제 (게임시작), /나가기, /봇추가 [인원], /정보", "ansi-cyan");
    printDivider();
  }

  // 4. 소켓 연결 핸들러
  socket.on('connect', () => {
    statusConnect.textContent = '● 온라인';
    statusConnect.className = 'status-cell status-online';
    startConnectTimer();

    // 닉네임이 없으면 모달로 묻기, 있으면 자동 등록
    if (!myUser.nickname) {
      showNickModal();
    } else {
      socket.emit('init_user', {
        nickname: myUser.nickname,
        exp: myUser.exp
      });
    }

    printWelcomeBanner();
    if (window.soundEngine) {
      window.soundEngine.playModemConnect();
    }
  });

  socket.on('disconnect', () => {
    statusConnect.textContent = '○ 연결 끊김';
    statusConnect.className = 'status-cell ansi-red';
    if (timerInterval) clearInterval(timerInterval);
    print("\n[알림] 천리안 호스트와의 연결이 끊어졌습니다.", "ansi-red ansi-bold");
  });

  // 5. 서버 데이터 수신 핸들러
  socket.on('user_info', (data) => {
    myUser.id = data.id;
    myUser.nickname = data.nickname;
    myUser.exp = data.exp;
    myUser.level = data.level;
    myUser.title = data.title;

    localStorage.setItem('hog_nickname', myUser.nickname);
    localStorage.setItem('hog_exp', myUser.exp);

    statusUserLevel.textContent = `${myUser.title} (Lv.${myUser.level})`;
  });

  socket.on('lobby_update', (data) => {
    statusUsers.textContent = `접속자: ${data.totalOnline}명`;
    if (!currentRoom) {
      statusLocation.textContent = '위치: 천리안 로비 (대기실)';
      promptLabel.textContent = `천리안:대기실 >`;
    }
  });

  socket.on('room_joined', (room) => {
    currentRoom = room;
    statusLocation.textContent = `위치: [${room.id}번방] ${room.title}`;
    promptLabel.textContent = `천리안:${room.title} >`;
    
    printDivider();
    print(`★ [${room.id}번방: ${room.title}] 에 입장하셨습니다. (최대 10명)`, "ansi-yellow ansi-bold");
    print(`· 게임 시작: '/문제' 를 입력하거나 상단 [게임시작] 버튼을 누르세요.`, "ansi-cyan");
    print(`· 1인 테스트: '/봇추가 3' 으로 가상 참가자를 소환할 수 있습니다.`, "ansi-cyan");
    print(`· 대기실 복귀: '/나가기' 를 입력하세요.`, "ansi-cyan");
    printDivider();
  });

  socket.on('room_left', () => {
    currentRoom = null;
    statusLocation.textContent = '위치: 천리안 로비 (대기실)';
    promptLabel.textContent = `천리안:대기실 >`;
    print("\n[알림] 방에서 퇴장하여 대기실로 돌아왔습니다.", "ansi-dim");
  });

  socket.on('room_update', (room) => {
    if (currentRoom && currentRoom.id === room.id) {
      currentRoom = room;
      statusLocation.textContent = `위치: [${room.id}번방] ${room.title} (${room.count}/${room.max}명)`;
    }
  });

  socket.on('chat_message', (msg) => {
    let colorClass = 'ansi-white';
    if (msg.isSystem) {
      if (msg.sender === '[신의손]') colorClass = 'ansi-yellow ansi-bold';
      else if (msg.sender === '[도착]') colorClass = 'ansi-green ansi-bold';
      else if (msg.sender === '[축하]') colorClass = 'ansi-magenta ansi-bold';
      else colorClass = 'ansi-cyan';
    }

    print(`${msg.sender} ${msg.text}`, colorClass);

    // 사운드 재생
    if (window.soundEngine) {
      if (msg.sound === 'countdown') window.soundEngine.playBeep(880, 0.1, 'square');
      else if (msg.sound === 'question') window.soundEngine.playQuestion();
      else if (msg.sound === 'result') window.soundEngine.playResult();
    }
  });

  socket.on('system_message', (text) => {
    print(`[안내] ${text}`, "ansi-cyan");
  });

  // 카운트다운 이벤트
  socket.on('game_countdown', (data) => {
    if (window.soundEngine) {
      window.soundEngine.playBeep(600 + (5 - data.seconds) * 100, 0.08, 'square');
    }
  });

  // 문제 출제 이벤트
  socket.on('game_question', (data) => {
    activeQuestion = data.question;
    terminalInput.value = '';
    terminalInput.focus();
    terminalInput.placeholder = "제시된 문장을 오타 없이 똑같이 치고 Enter!";
  });

  // 정답 제출 피드백
  socket.on('submission_alert', (data) => {
    if (window.soundEngine) {
      window.soundEngine.playArrival();
    }
  });

  // 라운드 결과
  socket.on('game_result', (data) => {
    activeQuestion = null;
    terminalInput.placeholder = "명령어나 대화를 입력하고 Enter를 누르세요 (/도움말)";
  });

  // 경험치 획득 및 레벨업
  socket.on('exp_gained', (data) => {
    myUser.exp = data.totalExp;
    myUser.level = data.level;
    myUser.title = data.title;
    localStorage.setItem('hog_exp', myUser.exp);
    statusUserLevel.textContent = `${myUser.title} (Lv.${myUser.level})`;

    if (data.leveledUp) {
      print(`\n★★★★★ 축하합니다! 레벨업!! [${myUser.title}] (Lv.${myUser.level}) 등극! ★★★★★\n`, "ansi-magenta ansi-bold");
      if (window.soundEngine) window.soundEngine.playResult();
    }
  });

  // 6. 서버 트리거 중계 이벤트
  socket.on('trigger_start_game', () => socket.emit('start_game'));
  socket.on('trigger_create_room', (arg) => socket.emit('create_room', arg));
  socket.on('trigger_join_room', (arg) => socket.emit('join_room', arg));
  socket.on('trigger_change_nickname', (arg) => socket.emit('change_nickname', arg));
  socket.on('trigger_add_bots', (arg) => socket.emit('add_bots', arg));
  socket.on('trigger_remove_bots', () => socket.emit('remove_bots'));
  socket.on('trigger_submit_answer', (arg) => socket.emit('submit_answer', arg));

  // 7. 터미널 입력 처리
  terminalInput.addEventListener('keydown', (e) => {
    // 키 타건음
    if (window.soundEngine && e.key.length === 1) {
      window.soundEngine.playKeyPress();
    }

    if (e.key === 'Enter') {
      const text = terminalInput.value;
      if (!text || !text.trim()) return;

      // 엔터 전송
      socket.emit('send_chat', text);
      terminalInput.value = '';
    }
  });

  // 터미널 화면 클릭 시 항상 입력창 포커스
  terminalScreen.addEventListener('click', () => {
    terminalInput.focus();
  });

  // 8. 닉네임 설정 모달 처리
  function showNickModal() {
    nickInput.value = myUser.nickname || '';
    nickModal.classList.add('active');
    setTimeout(() => nickInput.focus(), 100);
  }

  function hideNickModal() {
    nickModal.classList.remove('active');
    terminalInput.focus();
  }

  function saveNickname() {
    const val = nickInput.value.trim();
    if (!val) {
      alert("닉네임을 입력해주세요!");
      return;
    }
    myUser.nickname = val.substring(0, 10);
    localStorage.setItem('hog_nickname', myUser.nickname);
    socket.emit('change_nickname', myUser.nickname);
    hideNickModal();
  }

  btnSaveNick.addEventListener('click', saveNickname);
  nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNickname();
    if (e.key === 'Escape') hideNickModal();
  });
  btnCancelNick.addEventListener('click', hideNickModal);
  btnCloseModal.addEventListener('click', hideNickModal);

  // 9. 툴바 버튼 이벤트
  btnSoundToggle.addEventListener('click', () => {
    if (window.soundEngine) {
      const isMuted = window.soundEngine.toggleMute();
      if (isMuted) {
        soundIcon.textContent = '🔇';
        soundLabel.textContent = '소리 [OFF]';
        btnSoundToggle.classList.add('active');
      } else {
        soundIcon.textContent = '🔊';
        soundLabel.textContent = '소리 [ON]';
        btnSoundToggle.classList.remove('active');
        window.soundEngine.playBeep(880, 0.1);
      }
    }
  });

  btnCrtToggle.addEventListener('click', () => {
    if (crtOverlay.style.display === 'none') {
      crtOverlay.style.display = 'block';
      crtLabel.textContent = 'CRT [ON]';
      btnCrtToggle.classList.remove('active');
    } else {
      crtOverlay.style.display = 'none';
      crtLabel.textContent = 'CRT [OFF]';
      btnCrtToggle.classList.add('active');
    }
  });

  btnChangeNick.addEventListener('click', showNickModal);

  btnHelp.addEventListener('click', () => {
    socket.emit('send_chat', '/도움말');
  });

  btnStartGame.addEventListener('click', () => {
    if (!currentRoom) {
      print("[알림] 먼저 방에 입장하거나 /방만들기 로 방을 만드세요.", "ansi-red");
    } else {
      socket.emit('start_game');
    }
  });

  btnAddBot.addEventListener('click', () => {
    if (!currentRoom) {
      print("[알림] 봇은 방 안에서만 추가할 수 있습니다. 먼저 방을 만드세요.", "ansi-red");
    } else {
      socket.emit('add_bots', 3);
    }
  });

  btnConnect.addEventListener('click', () => {
    if (!socket.connected) {
      socket.connect();
    } else {
      print("[알림] 이미 천리안 호스트에 연결되어 있습니다.", "ansi-cyan");
    }
  });

  btnDisconnect.addEventListener('click', () => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  // 초기 포커스
  terminalInput.focus();
});
