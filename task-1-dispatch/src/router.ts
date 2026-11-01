
import type { Assignment, Branch, Order } from './types.ts';
import { distanceKm } from './geo.ts';

const MAX_DISTANCE_KM = 42;

export function assignBranch(
  order: Order,
  branches: Branch[],
  orders: Order[] = [],
  assignments: Map<string, Assignment> = new Map()
): Assignment {
  const own = branches.filter(
    (b) => b.storeId === order.storeId && b.active
  );

  const result = (branchId: string | null, rule: Assignment['rule']): Assignment => ({
    orderId: order.id,
    branchId,
    rule,
  });

  function assignWithLimit(
    selected: Branch,
    rule: 'single' | 'pickup_point' | 'city' | 'geo'
  ): Assignment {
    const date = getAlmatyDate(order.createdAt);
    if (!date) return result(null, 'unassigned');

    const load = getBranchLoad(selected.id, date, orders, assignments);
    if (load < selected.dailyLimit) return result(selected.id, rule);

    const available = own.filter(
      (b) => getBranchLoad(b.id, date, orders, assignments) < b.dailyLimit
    );

    const nearest = findNearest(order, available);

    if (!nearest) return result(null, 'unassigned');
    if (nearest.distance > MAX_DISTANCE_KM) return result(null, 'too_far');

    return result(nearest.branch.id, 'geo');
  }

  if (order.manualBranchId) {
    const manual = own.find((b) => b.id === order.manualBranchId);
    if (manual) return result(manual.id, 'manual');
  }

  if (own.length === 1) return assignWithLimit(own[0], 'single');

  if (order.pickupPointId) {
    const pickup = own.find((b) => b.pickupPointIds.includes(order.pickupPointId!));
    if (pickup) return assignWithLimit(pickup, 'pickup_point');
  }

  const cityBranches = own.filter((b) => b.city === order.city);
  if (cityBranches.length === 1) return assignWithLimit(cityBranches[0], 'city');

  const nearest = findNearest(
    order,
    cityBranches.length > 1 ? cityBranches : own
  );

  if (!nearest) return result(null, 'unassigned');
  if (nearest.distance > MAX_DISTANCE_KM) return result(null, 'too_far');

  return assignWithLimit(nearest.branch, 'geo');
}

function findNearest(
  order: Order,
  branches: Branch[]
): { branch: Branch; distance: number } | null {
  if (order.lat === null || order.lon === null) return null;

  let best: { branch: Branch; distance: number } | null = null;

  for (const branch of branches) {
    const distance = distanceKm(order.lat, order.lon, branch.lat, branch.lon);
    if (!best || distance < best.distance) best = { branch, distance };
  }

  return best;
}

function getAlmatyDate(createdAt: string): string | null {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return null;

  return new Date(timestamp + 5 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
}

function getBranchLoad(
  branchId: string,
  date: string,
  orders: Order[],
  assignments: Map<string, Assignment>
): number {
  return [...assignments.values()].filter((a) => {
    if (a.branchId !== branchId) return false;
    const order = orders.find((o) => o.id === a.orderId);
    return !!order && getAlmatyDate(order.createdAt) === date;
  }).length;
}
