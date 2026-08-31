import { formatLiveCountdown } from '../prayer-panel';

describe('formatLiveCountdown', () => {
  it('always includes seconds under an hour, so it visibly ticks every second', () => {
    expect(formatLiveCountdown(65)).toBe('1:05');
    expect(formatLiveCountdown(64)).toBe('1:04'); // one real second later, visibly different
    expect(formatLiveCountdown(5)).toBe('0:05');
    expect(formatLiveCountdown(0)).toBe('0:00');
  });

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatLiveCountdown(60)).toBe('1:00');
    expect(formatLiveCountdown(61)).toBe('1:01');
    expect(formatLiveCountdown(69)).toBe('1:09');
  });

  it('still includes live seconds at an hour or more (not just hours/minutes)', () => {
    expect(formatLiveCountdown(3600)).toBe('1:00:00');
    expect(formatLiveCountdown(3661)).toBe('1:01:01');
    expect(formatLiveCountdown(3659)).toBe('1:00:59'); // one second later flips to 1:01:00
    expect(formatLiveCountdown(3660)).toBe('1:01:00');
  });

  it('crosses the 59:59 -> 1:00:00 hour boundary correctly', () => {
    expect(formatLiveCountdown(3599)).toBe('59:59');
    expect(formatLiveCountdown(3600)).toBe('1:00:00');
  });

  it('handles many-hour durations (e.g. Isha -> next Fajr overnight)', () => {
    expect(formatLiveCountdown(9 * 3600 + 5 * 60 + 3)).toBe('9:05:03');
  });

  it('never shows a negative number for a fleeting boundary-crossing value', () => {
    expect(formatLiveCountdown(-1)).toBe('0:00');
    expect(formatLiveCountdown(-100)).toBe('0:00');
  });

  it('floors fractional seconds rather than rounding up past the real elapsed time', () => {
    expect(formatLiveCountdown(65.9)).toBe('1:05');
  });
});
