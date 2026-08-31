import { getArrivalOutcome } from '../time';

describe('getArrivalOutcome', () => {
  it('computes remaining time for a same-day window', () => {
    const outcome = getArrivalOutcome({ startTime: '12:32', endTime: '15:45' }, '15:16');
    expect(outcome.status).toBe('known');
    if (outcome.status !== 'known') return;
    expect(outcome.overflow).toBe(false);
    expect(outcome.remaining).toBe(29);
  });

  it('flags overflow when arrival is after a same-day window ends', () => {
    const outcome = getArrivalOutcome({ startTime: '12:32', endTime: '15:45' }, '15:57');
    expect(outcome.status).toBe('known');
    if (outcome.status !== 'known') return;
    expect(outcome.overflow).toBe(true);
    expect(outcome.remaining).toBe(-12);
  });

  it('does not produce a negative window length for a window that crosses midnight', () => {
    // A window that starts in the evening and ends after midnight (e.g. a
    // hypothetical known-deadline overnight window).
    const outcome = getArrivalOutcome({ startTime: '19:35', endTime: '04:46' }, '20:00');
    expect(outcome.status).toBe('known');
    if (outcome.status !== 'known') return;
    // 04:46 the next day is (24h + 4h46m) past the window's own start-of-day.
    const wrappedEndMinutes = 24 * 60 + 4 * 60 + 46;
    const arrivalMinutes = 20 * 60;
    expect(outcome.remaining).toBe(wrappedEndMinutes - arrivalMinutes);
    expect(outcome.overflow).toBe(false);
  });

  it('treats a late pre-midnight arrival as still within a midnight-crossing window', () => {
    const outcome = getArrivalOutcome({ startTime: '19:35', endTime: '04:46' }, '23:59');
    expect(outcome.status).toBe('known');
    if (outcome.status !== 'known') return;
    expect(outcome.overflow).toBe(false);
  });

  it('returns unknown when the window has no known end time (e.g. Isha)', () => {
    const outcome = getArrivalOutcome({ startTime: '19:35', endTime: null }, '20:00');
    expect(outcome).toEqual({ status: 'unknown' });
  });

  // NOTE: an arrival time given as a bare "HH:MM" in the early-morning hours
  // (e.g. "05:00") is inherently ambiguous for a window that crosses
  // midnight — nothing in the string says whether it means "today, before
  // the window starts" or "the following morning, after the window ends".
  // This function does not attempt to guess; resolving that would need a
  // full date+time input, not just a bare HH:MM string.
});
