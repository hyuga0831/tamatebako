import { describe, expect, it } from 'vitest';
import { type CalcKey, display, initCalc, press } from '../src/lib/calc';

const run = (keys: string): string => {
  let s = initCalc;
  for (const k of keys.split(' ')) s = press(s, k as CalcKey);
  return s.cur;
};

describe('電卓', () => {
  it('四則演算と、続けての計算', () => {
    expect(run('1 2 + 7 =')).toBe('19');
    expect(run('1 2 × 3 − 4 =')).toBe('32');
    expect(run('9 ÷ 0 . 1 5 =')).toBe('60');
    expect(run('5 − 8 =')).toBe('-3');
  });

  it('小数の誤差を出さない', () => {
    expect(run('0 . 1 + 0 . 2 =')).toBe('0.3');
    expect(run('1 . 4 × 3 =')).toBe('4.2');
  });

  it('％キー', () => {
    expect(run('3 5 0 × 1 8 % =')).toBe('63');
    expect(run('2 0 0 + 1 0 % =')).toBe('220');
    expect(run('1 9 6 ÷ 5 6 % =')).toBe('350');
  });

  it('演算キーを押し直すと、演算だけ入れ替わる', () => {
    expect(run('8 + × 3 =')).toBe('24');
  });

  it('= のあと、そのまま次の計算に使える', () => {
    expect(run('6 × 7 = ÷ 2 =')).toBe('21');
    // = のあとに数字を押すと、新しい計算になる
    expect(run('6 × 7 = 5 + 1 =')).toBe('6');
  });

  it('0 で割るとエラーになり、AC で戻る', () => {
    expect(run('5 ÷ 0 =')).toBe('エラー');
    expect(run('5 ÷ 0 = 7')).toBe('エラー');
    expect(run('5 ÷ 0 = AC 7')).toBe('7');
  });

  it('C は入力中の数だけ消し、⌫ は 1 文字消す', () => {
    expect(run('5 + 9 9 C 2 =')).toBe('7');
    expect(run('1 2 3 BS BS')).toBe('1');
    expect(run('1 BS')).toBe('0');
  });

  it('メモリー', () => {
    // 12×3 と 4×5 の合計
    expect(run('1 2 × 3 = M+ 4 × 5 = M+ MR')).toBe('56');
    expect(run('9 M+ 2 M- MR')).toBe('7');
    expect(run('9 M+ MC MR')).toBe('0');
  });

  it('00 と小数点', () => {
    expect(run('5 00')).toBe('500');
    expect(run('00')).toBe('0');
    expect(run('. 5')).toBe('0.5');
    expect(run('1 . 2 . 3')).toBe('1.23');
  });

  it('表示には 3 桁区切りを入れる', () => {
    expect(display('1234567.891')).toBe('1,234,567.891');
    expect(display('-1200')).toBe('−1,200');
    expect(display('0.')).toBe('0.');
    expect(display('エラー')).toBe('エラー');
  });
});
