// hangul.js - 한글 자모 분해 및 정밀 타수(Strokes), 정확도(Accuracy), 핸디캡 계산기

// 기본 자모 테이블
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNGSUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONGSUNG = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// 복합 모음/자음 음소 단위 분해 맵
const DECOMPOSE_MAP = {
  'ㅘ': ['ㅗ', 'ㅏ'],
  'ㅙ': ['ㅗ', 'ㅐ'],
  'ㅚ': ['ㅗ', 'ㅣ'],
  'ㅝ': ['ㅜ', 'ㅓ'],
  'ㅞ': ['ㅜ', 'ㅔ'],
  'ㅟ': ['ㅜ', 'ㅣ'],
  'ㅢ': ['ㅡ', 'ㅣ'],
  'ㄳ': ['ㄱ', 'ㅅ'],
  'ㄵ': ['ㄴ', 'ㅈ'],
  'ㄶ': ['ㄴ', 'ㅎ'],
  'ㄺ': ['ㄹ', 'ㄱ'],
  'ㄻ': ['ㄹ', 'ㅁ'],
  'ㄼ': ['ㄹ', 'ㅂ'],
  'ㄽ': ['ㄹ', 'ㅅ'],
  'ㄾ': ['ㄹ', 'ㅌ'],
  'ㄿ': ['ㄹ', 'ㅍ'],
  'ㅀ': ['ㄹ', 'ㅎ'],
  'ㅄ': ['ㅂ', 'ㅅ']
};

// 중성(모음) 타수 가중치 (두벌식 키보드 기준)
const VOWEL_STROKES = [
  1, 1, 1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1
];

// 종성(받침) 타수 가중치
const JONG_STROKES = [
  0, 1, 1, 2, 1, 2, 2, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 1, 1,
  2, 1, 1, 1, 1, 1, 1, 1, 1, 1
];

/**
 * 텍스트를 기초 음소(자모) 배열로 완전 분해
 * @param {string} text 
 * @returns {string[]} 음소 배열
 */
function decomposeToJamo(text) {
  const result = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const sIndex = code - 0xAC00;
      const cIdx = Math.floor(sIndex / 588);
      const vIdx = Math.floor((sIndex % 588) / 28);
      const jIdx = sIndex % 28;

      result.push(CHOSUNG[cIdx]);

      const jung = JUNGSUNG[vIdx];
      if (DECOMPOSE_MAP[jung]) {
        result.push(...DECOMPOSE_MAP[jung]);
      } else {
        result.push(jung);
      }

      if (jIdx > 0) {
        const jong = JONGSUNG[jIdx];
        if (DECOMPOSE_MAP[jong]) {
          result.push(...DECOMPOSE_MAP[jong]);
        } else {
          result.push(jong);
        }
      }
    } else {
      result.push(text[i]);
    }
  }
  return result;
}

/**
 * 주어진 텍스트의 총 타수(자판 입력 횟수)를 계산
 * @param {string} text 
 * @returns {number} 총 타수
 */
function calculateStrokes(text) {
  let strokes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const sIndex = code - 0xAC00;
      const vIndex = Math.floor((sIndex % 588) / 28);
      const tIndex = sIndex % 28;
      strokes += 1 + VOWEL_STROKES[vIndex] + JONG_STROKES[tIndex];
    } else {
      strokes += 1;
    }
  }
  return strokes;
}

/**
 * 분당 타수(CPM) 계산
 * @param {string} text 입력 문장
 * @param {number} timeInSeconds 소요 시간 (초)
 * @returns {number} 분당 타수 (소수점 반올림 정수)
 */
function calculateCPM(text, timeInSeconds) {
  if (timeInSeconds <= 0) return 0;
  const strokes = calculateStrokes(text);
  const cpm = (strokes / timeInSeconds) * 60;
  return Math.round(cpm);
}

/**
 * 두 음소 배열 간의 Levenshtein 편집 거리 계산 (오타 자모 수 산출)
 */
function levenshteinDistance(arr1, arr2) {
  const m = arr1.length;
  const n = arr2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],    // 삭제
          dp[i][j - 1],    // 삽입
          dp[i - 1][j - 1] // 치환
        );
      }
    }
  }
  return dp[m][n];
}

/**
 * 정확도 및 오타 개수 분석
 * @param {string} target 정답 문장
 * @param {string} input 사용자 입력 문장
 * @returns {{ accuracy: number, errors: number, targetStrokes: number, inputStrokes: number }}
 */
function evaluateAccuracy(target, input) {
  const targetJamo = decomposeToJamo(target);
  const inputJamo = decomposeToJamo(input);

  const errors = levenshteinDistance(targetJamo, inputJamo);
  const totalLen = targetJamo.length;

  let accuracy = 0;
  if (totalLen > 0) {
    const correctCount = Math.max(0, totalLen - errors);
    accuracy = (correctCount / totalLen) * 100;
  }
  accuracy = Math.round(accuracy * 10) / 10; // 소수점 첫째자리

  return {
    accuracy,
    errors,
    targetJamoLen: totalLen,
    targetStrokes: calculateStrokes(target),
    inputStrokes: calculateStrokes(input)
  };
}

/**
 * 오타 핸디캡을 반영한 최종 순위 산정용 조정 타속(Net CPM) 계산
 * 
 * 공식:
 * - 오타 0개(100% 일치): rawCPM 그대로 인정
 * - 오타 발생 시: rawCPM * (정확도 / 100) - (오타수 * 30)
 * - 정확도 50% 미만: 0점 (실격 수준)
 * 
 * @param {number} rawCPM 순수 타속
 * @param {number} accuracy 정확도 (%)
 * @param {number} errors 오타 수
 * @returns {number} 핸디캡 반영 조정 타속
 */
function calculateNetCPM(rawCPM, accuracy, errors) {
  if (accuracy < 50) return 0;
  if (errors === 0) return rawCPM;
  
  // 정확도 감점 + 오타 1개당 30타 핸디캡 감점
  const penalized = (rawCPM * (accuracy / 100)) - (errors * 30);
  return Math.max(0, Math.round(penalized));
}

module.exports = {
  decomposeToJamo,
  calculateStrokes,
  calculateCPM,
  evaluateAccuracy,
  calculateNetCPM
};
