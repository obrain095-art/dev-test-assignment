
import type { Booking, Master, Service } from './types.ts';
import { fromMinutes, toMinutes, weekday, TZ_OFFSET } from './time.ts';
import { now } from './clock.ts';

export const SLOT_STEP_MIN = 15;
const CLEANUP_MIN = 7;

// Свободные слоты мастера на дату, 'HH:mm' по Алматы
export function getSlots(
  master: Master,
  service: Service,
  date: string,
  bookings: Booking[]
): string[] {
  const day = master.schedule[weekday(date)];
  if (!day) return [];

  const result: string[] = [];
  const end = toMinutes(day.to);
  const currentTime = now().getTime();

  for (
    let t = toMinutes(day.from);
    t + service.durationMin <= end;
    t += SLOT_STEP_MIN
  ) {
    const slot = fromMinutes(t);
    const slotStart = new Date(`${date}T${slot}:00${TZ_OFFSET}`).getTime();
    const slotEnd = slotStart + service.durationMin * 60_000;

    // Не показываем прошедшее время
    if (slotStart <= currentTime) continue;

    // Проверяем перерывы
    const hasBreak = day.breaks.some((breakTime) => {
      const breakStart = new Date(
        `${date}T${breakTime.from}:00${TZ_OFFSET}`
      ).getTime();
      const breakEnd = new Date(
        `${date}T${breakTime.to}:00${TZ_OFFSET}`
      ).getTime();

      return slotStart < breakEnd && breakStart < slotEnd;
    });

    if (hasBreak) continue;

    // Проверяем существующие записи и 7 минут на уборку
    const isBooked = bookings.some((booking) => {
      if (booking.status !== 'active') return false;

      const bookingStart = new Date(booking.start).getTime();
      const bookingEnd =
        new Date(booking.end).getTime() + CLEANUP_MIN * 60_000;

      if (!Number.isFinite(bookingStart) || !Number.isFinite(bookingEnd)) {
        return false;
      }

      return slotStart < bookingEnd && bookingStart < slotEnd;
    });

    if (!isBooked) result.push(slot);
  }

  return result;
}
