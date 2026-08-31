import { computeDefaultPlanningContext } from '../default-planning-context';

describe('computeDefaultPlanningContext', () => {
  it('defaults to NEXT/Dhuhr during the Sunrise-to-Dhuhr gap', () => {
    expect(computeDefaultPlanningContext({ name: 'Dhuhr', hasStarted: false })).toBe('next');
  });

  it('defaults to NOW once Dhuhr has actually started', () => {
    expect(computeDefaultPlanningContext({ name: 'Dhuhr', hasStarted: true })).toBe('now');
  });

  it('defaults to NEXT/Fajr during Isha, since Isha has no known deadline', () => {
    expect(computeDefaultPlanningContext({ name: 'Isha', hasStarted: true })).toBe('next');
  });

  it('defaults to NOW for Fajr, Asr, and Maghrib (all have real, known deadlines)', () => {
    expect(computeDefaultPlanningContext({ name: 'Fajr', hasStarted: true })).toBe('now');
    expect(computeDefaultPlanningContext({ name: 'Asr', hasStarted: true })).toBe('now');
    expect(computeDefaultPlanningContext({ name: 'Maghrib', hasStarted: true })).toBe('now');
  });
});
