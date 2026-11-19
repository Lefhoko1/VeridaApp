import { monthCells } from './calendarDays';

describe('calendar month layout', () => {
  it('starts weeks on Monday and fills whole weeks', () => {
    // November 2026 starts on a Sunday.
    const weeks = monthCells(2026, 10);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks[weeks.length - 1]?.[0]).toBe('2026-11-30');
  });

  it('knows leap years', () => {
    expect(monthCells(2028, 1).flat()).toContain('2028-02-29');
    expect(monthCells(2026, 1).flat()).not.toContain('2026-02-29');
  });
});
