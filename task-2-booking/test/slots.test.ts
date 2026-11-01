
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlots } from '../src/slots.ts';
import { overlaps, toMinutes } from '../src/time.ts';
import type { Booking, Master, Service } from '../src/types.ts';

const day = { from: '10:00', to: '13:00', breaks: [] };

const master: Master = {
  id: 'm-1',
  name: 'Тест',
  schedule: {
    mon: day,
    tue: day,
    wed: day,
    thu: day,
    fri: day,
    sat: null,
    sun: null,
  },
};

const cut: Service = {
  id: 's-cut',
  name: 'Стрижка',
  durationMin: 60,
  masterIds: ['m-1'],
};

const range = (from: string, to: string) => ({
  start: toMinutes(from),
  end: toMinutes(to),
});

// Временно задаём NOW для теста и восстанавливаем исходное значение
function withNow<T>(value: string, callback: () => T): T {
  const previous = process.env.NOW;
  process.env.NOW = value;

  try {
    return callback();
  } finally {
    if (previous === undefined) {
      delete process.env.NOW;
    } else {
      process.env.NOW = previous;
    }
  }
}

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  masterId: 'm-1',
  serviceId: 's-cut',
  start: '2030-11-18T10:00:00+05:00',
  end: '2030-11-18T11:00:00+05:00',
  clientPhone: '+77001234567',
  status: 'active',
  ...over,
});

test('overlaps: пересекающиеся интервалы', () => {
  assert.equal(
    overlaps(range('10:00', '11:00'), range('10:30', '11:30')),
    true
  );
});

test('overlaps: запись сразу после другой не пересекается', () => {
  assert.equal(
    overlaps(range('10:00', '11:00'), range('11:00', '12:00')),
    false
  );
});

test('getSlots: свободный день', () => {
  const slots = withNow('2030-11-17T09:00:00+05:00', () =>
    getSlots(master, cut, '2030-11-18', [])
  );

  assert.deepEqual(slots, [
    '10:00', '10:15', '10:30', '10:45', '11:00',
    '11:15', '11:30', '11:45', '12:00',
  ]);
});

test('getSlots: выходной', () => {
  const slots = withNow('2030-11-22T09:00:00+05:00', () =>
    getSlots(master, cut, '2030-11-23', [])
  );

  assert.deepEqual(slots, []);
});

test('getSlots: слот не пересекает перерыв', () => {
  const masterWithBreak: Master = {
    ...master,
    schedule: {
      ...master.schedule,
      mon: {
        from: '10:00',
        to: '13:00',
        breaks: [{ from: '11:00', to: '11:30' }],
      },
    },
  };

  const slots = withNow('2030-11-17T09:00:00+05:00', () =>
    getSlots(masterWithBreak, cut, '2030-11-18', [])
  );

  assert.deepEqual(slots, ['10:00', '11:30', '11:45', '12:00']);
});

test('getSlots: занятое время не выдаётся, отменённые записи не мешают', () => {
  const bookings: Booking[] = [
    booking(),
    booking({
      id: 'booking-2',
      start: '2030-11-18T11:30:00+05:00',
      end: '2030-11-18T12:30:00+05:00',
      status: 'cancelled',
    }),
  ];

  const slots = withNow('2030-11-17T09:00:00+05:00', () =>
    getSlots(master, cut, '2030-11-18', bookings)
  );

  assert.deepEqual(slots, ['11:15', '11:30', '11:45', '12:00']);
});

test('getSlots: прошедшее время не выдаётся', () => {
  const slots = withNow('2030-11-18T10:30:00+05:00', () =>
    getSlots(master, cut, '2030-11-18', [])
  );

  assert.deepEqual(slots, [
    '10:45', '11:00', '11:15', '11:30',
    '11:45', '12:00',
  ]);
});
