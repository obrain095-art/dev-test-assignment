
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { masters, services, bookingRepo } from './store.ts';
import { getSlots } from './slots.ts';
import { now } from './clock.ts';
import { TZ_OFFSET } from './time.ts';
import type { Booking } from './types.ts';

const port = Number(process.env.PORT ?? 3002);
const locks = new Map<string, Promise<void>>();

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && url.pathname === '/masters') {
      return send(res, 200, masters);
    }

    if (req.method === 'GET' && url.pathname === '/services') {
      return send(res, 200, services);
    }

    // Свободные слоты мастера
    if (
      req.method === 'GET' &&
      parts[0] === 'masters' &&
      parts[2] === 'slots' &&
      parts.length === 3
    ) {
      const masterId = parts[1];
      const serviceId = url.searchParams.get('serviceId');
      const date = url.searchParams.get('date');

      if (!serviceId || !date || !isValidDate(date)) {
        return send(res, 400, { error: 'invalid_params' });
      }

      const master = masters.find((m) => m.id === masterId);
      if (!master) {
        return send(res, 404, { error: 'master_not_found' });
      }

      const service = services.find((s) => s.id === serviceId);
      if (!service) {
        return send(res, 404, { error: 'service_not_found' });
      }

      if (!service.masterIds.includes(master.id)) {
        return send(res, 400, {
          error: 'service_not_available_for_master',
        });
      }

      const bookings = await bookingRepo.listByMaster(master.id);
      return send(res, 200, getSlots(master, service, date, bookings));
    }

    // Создание бронирования
    if (req.method === 'POST' && url.pathname === '/bookings') {
      let body: unknown;

      try {
        body = await readJson(req);
      } catch {
        return send(res, 400, { error: 'invalid_json' });
      }

      if (!isObject(body)) {
        return send(res, 400, { error: 'invalid_body' });
      }

      const { masterId, serviceId, start, clientPhone } = body;

      if (
        typeof masterId !== 'string' ||
        typeof serviceId !== 'string' ||
        typeof start !== 'string' ||
        typeof clientPhone !== 'string' ||
        !hasTimezone(start) ||
        !Number.isFinite(new Date(start).getTime())
      ) {
        return send(res, 400, { error: 'invalid_params' });
      }

      const master = masters.find((m) => m.id === masterId);
      if (!master) {
        return send(res, 404, { error: 'master_not_found' });
      }

      const service = services.find((s) => s.id === serviceId);
      if (!service) {
        return send(res, 404, { error: 'service_not_found' });
      }

      if (!service.masterIds.includes(master.id)) {
        return send(res, 400, {
          error: 'service_not_available_for_master',
        });
      }

      const normalizedPhone = normalizePhone(clientPhone);
      if (!normalizedPhone) {
        return send(res, 400, { error: 'invalid_phone' });
      }

      const startDate = new Date(start);
      const localDate = getAlmatyDate(startDate);
      const localTime = getAlmatyTime(startDate);

      // Последовательно проверяем бронирования мастера за эту дату
      const lockKey = `${master.id}:${localDate}`;

      return withLock(lockKey, async () => {
        const bookings = await bookingRepo.listByMaster(master.id);
        const slots = getSlots(master, service, localDate, bookings);

        if (!slots.includes(localTime)) {
          return send(res, 409, { error: 'slot_unavailable' });
        }

        const booking: Booking = {
          id: randomUUID(),
          masterId: master.id,
          serviceId: service.id,
          start: startDate.toISOString(),
          end: new Date(
            startDate.getTime() + service.durationMin * 60_000
          ).toISOString(),
          clientPhone: normalizedPhone,
          status: 'active',
        };

        await bookingRepo.insert(booking);
        return send(res, 201, booking);
      });
    }

    // Отмена бронирования
    if (
      req.method === 'DELETE' &&
      parts[0] === 'bookings' &&
      parts.length === 2
    ) {
      const booking = await bookingRepo.get(parts[1]);

      if (!booking) {
        return send(res, 404, { error: 'booking_not_found' });
      }

      if (booking.status === 'cancelled') {
        return send(res, 200, booking);
      }

      const timeUntilStart =
        new Date(booking.start).getTime() - now().getTime();

      if (timeUntilStart < 2 * 60 * 60 * 1000) {
        return send(res, 409, { error: 'too_late' });
      }

      await bookingRepo.update(booking.id, { status: 'cancelled' });

      return send(res, 200, {
        ...booking,
        status: 'cancelled',
      });
    }

    return send(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'internal' });
  }
});

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';

  for await (const chunk of req) {
    raw += chunk;
  }

  return raw ? JSON.parse(raw) : null;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });

  res.end(JSON.stringify(body));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function normalizePhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');

  if (digits.length === 10) {
    digits = `7${digits}`;
  } else if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }

  if (
    digits.length !== 11 ||
    digits[0] !== '7' ||
    !['6', '7'].includes(digits[1])
  ) {
    return null;
  }

  return `+${digits}`;
}

// Смещение Алматы относительно UTC из TZ_OFFSET
function getAlmatyOffsetMs(): number {
  const sign = TZ_OFFSET.startsWith('-') ? -1 : 1;
  const hours = Number(TZ_OFFSET.slice(1, 3));
  const minutes = Number(TZ_OFFSET.slice(4, 6));

  return sign * (hours * 60 + minutes) * 60_000;
}

function getAlmatyDate(date: Date): string {
  return new Date(date.getTime() + getAlmatyOffsetMs())
    .toISOString()
    .slice(0, 10);
}

function getAlmatyTime(date: Date): string {
  return new Date(date.getTime() + getAlmatyOffsetMs())
    .toISOString()
    .slice(11, 16);
}

// Защита от одновременного бронирования мастера на одну дату
async function withLock<T>(
  key: string,
  callback: () => Promise<T>
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();

  let release!: () => void;

  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  locks.set(key, current);
  await previous;

  try {
    return await callback();
  } finally {
    release();

    if (locks.get(key) === current) {
      locks.delete(key);
    }
  }
}

if (import.meta.main) {
  server.listen(port, () => {
    console.log(`booking: http://localhost:${port}`);
  });
}