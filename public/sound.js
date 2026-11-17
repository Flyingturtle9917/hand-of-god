// sound.js - Web Audio API 기반 레트로 신시사이저 사운드 엔진
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // 1. 단일 비프음 (카운트다운 등)
  playBeep(freq = 880, duration = 0.1, type = 'square') {
    if (this.isMuted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  // 2. 키보드 타건음 (기계식 키캡 틱- 틱-)
  playKeyPress() {
    if (this.isMuted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      // 무작위 피치 변동으로 자연스러운 타건음
      const freq = 450 + Math.random() * 150;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) {}
  }

  // 3. 문제 출제 팡파레
  playQuestion() {
    if (this.isMuted) return;
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playBeep(freq, 0.12, 'square');
      }, idx * 70);
    });
  }

  // 4. 도착/정답 제출 띵동음
  playArrival() {
    if (this.isMuted) return;
    this.init();
    this.playBeep(880, 0.08, 'sine');
    setTimeout(() => {
      this.playBeep(1320, 0.15, 'sine');
    }, 90);
  }

  // 5. 결과 발표 멜로디
  playResult() {
    if (this.isMuted) return;
    this.init();
    const melody = [
      { f: 659.25, d: 0.15 },
      { f: 783.99, d: 0.15 },
      { f: 987.77, d: 0.2 },
      { f: 1046.5, d: 0.35 }
    ];
    let curTime = 0;
    melody.forEach(m => {
      setTimeout(() => {
        this.playBeep(m.f, m.d, 'square');
      }, curTime * 1000);
      curTime += m.d + 0.03;
    });
  }

  // 6. 전설의 33600 모뎀 핸드셰이크 사운드 시뮬레이션
  playModemConnect() {
    if (this.isMuted) return;
    this.init();
    const t = this.ctx.currentTime;

    // 1단계: 전화 다이얼 톤 (DTMF 느낌)
    const dtmfFreqs = [697, 770, 852, 941];
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        if (this.isMuted) return;
        const f = dtmfFreqs[i % dtmfFreqs.length];
        this.playBeep(f, 0.07, 'sine');
      }, i * 90);
    }

    // 2단계: 신호음 (리모트 링잉 삐이- 삐이-)
    setTimeout(() => {
      if (this.isMuted) return;
      this.playBeep(440, 0.8, 'sine');
    }, 750);

    // 3단계: 모뎀 캐리어 치지직~ 핸드셰이크 노이즈
    setTimeout(() => {
      if (this.isMuted) return;
      try {
        const bufferSize = this.ctx.sampleRate * 1.5; // 1.5초 노이즈
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.15;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // 밴드패스 필터로 모뎀 주파수 흉내
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2100, this.ctx.currentTime);
        filter.Q.setValueAtTime(3, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
      } catch (e) {}
    }, 1800);

    // 4단계: 연결 완료 삐비빅!
    setTimeout(() => {
      if (this.isMuted) return;
      this.playBeep(1200, 0.1, 'square');
      setTimeout(() => this.playBeep(1800, 0.2, 'square'), 120);
    }, 3400);
  }
}

window.soundEngine = new SoundEngine();
