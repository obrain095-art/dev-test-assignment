import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../src/server.ts';

test('Booking API: создание, параллельная запись и отмена', async () => {
  const previousNow = process.env.NOW;
  process.env.NOW = '2030-11-17T09:00:00+05:00';

  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const url = `http://localhost:${address.port}`;

    const slotsResponse = await fetch(
      `${url}/masters/m-1/slots?serviceId=s-cut&date=2030-11-18`
    );

    const slots = await slotsResponse.json() as string[];

    assert.ok(slots.length > 0, 'Должен быть хотя бы один свободный слот');

    const body = {
      masterId: 'm-1',
      serviceId: 's-cut',
      start: `2030-11-18T${slots[0]}:00+05:00`,
      clientPhone: '+77001234567',
    };

    const create = () => fetch(`${url}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const [first, second] = await Promise.all([create(), create()]);

    assert.equal(first.status, 201);
    assert.equal(second.status, 409);

    const booking = await first.json() as { id: string };

    const cancel = await fetch(`${url}/bookings/${booking.id}`, {
      method: 'DELETE',
    });

    assert.equal(cancel.status, 200);

    const repeatedCancel = await fetch(`${url}/bookings/${booking.id}`, {
      method: 'DELETE',
    });

    assert.equal(repeatedCancel.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    if (previousNow === undefined) delete process.env.NOW;
    else process.env.NOW = previousNow;
  }
});