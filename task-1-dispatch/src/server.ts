import { pathToFileURL } from 'node:url';
import { createServer, type ServerResponse } from 'node:http';
import { branches, orders, assignments } from './store.ts';
import { assignBranch } from './router.ts';
import type { Assignment } from './types.ts';

const port = Number(process.env.PORT ?? 3001);

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // Список филиалов
    if (req.method === 'GET' && url.pathname === '/branches') {
      return send(res, 200, branches);
    }

    // Получение заказа
    if (
      req.method === 'GET' &&
      parts[0] === 'orders' &&
      parts.length === 2
    ) {
      const order = orders.find((o) => o.id === parts[1]);

      if (!order) {
        return send(res, 404, { error: 'order_not_found' });
      }

      return send(res, 200, order);
    }

    // Назначение заказа филиалу
    if (
      req.method === 'POST' &&
      parts[0] === 'orders' &&
      parts[2] === 'assign' &&
      parts.length === 3
    ) {
      const orderId = parts[1];
      const order = orders.find((o) => o.id === orderId);

      if (!order) {
        return send(res, 404, { error: 'order_not_found' });
      }

      let assignment = assignments.get(orderId);

      if (!assignment) {
        assignment = assignBranch(order, branches, orders, assignments);
        assignments.set(orderId, assignment);
      }

      return send(res, 200, assignment);
    }

    // Загрузка филиала за день
    if (
      req.method === 'GET' &&
      parts[0] === 'branches' &&
      parts[2] === 'load' &&
      parts.length === 3
    ) {
      const branchId = parts[1];
      const branch = branches.find((b) => b.id === branchId);

      if (!branch) {
        return send(res, 404, { error: 'branch_not_found' });
      }

      const date = url.searchParams.get('date');

      if (!date || !isValidDate(date)) {
        return send(res, 400, { error: 'invalid_date' });
      }

      const assigned = [...assignments.values()].filter((assignment) => {
        if (assignment.branchId !== branchId) return false;

        const order = orders.find((o) => o.id === assignment.orderId);

        return order && getAlmatyDate(order.createdAt) === date;
      }).length;

      return send(res, 200, {
        branchId,
        date,
        assigned,
        limit: branch.dailyLimit,
      });
    }

    return send(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'internal' });
  }
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });

  res.end(JSON.stringify(body));
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

function getAlmatyDate(createdAt: string): string | null {
  const timestamp = new Date(createdAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp + 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

if (import.meta.main) {
  server.listen(port, () => {
    console.log(`booking: http://localhost:${port}`);
  });
}