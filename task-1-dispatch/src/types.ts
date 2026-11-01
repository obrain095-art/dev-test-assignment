
export type Branch = {
  id: string;
  storeId: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  active: boolean;
  pickupPointIds: string[];
  dailyLimit: number;
};

export type Order = {
  id: string;
  storeId: string;
  city: string;
  lat: number | null;
  lon: number | null;
  pickupPointId: string | null;
  manualBranchId: string | null;
  // ISO, UTC
  createdAt: string;
};

export type Rule =
  | 'manual'
  | 'single'
  | 'pickup_point'
  | 'city'
  | 'geo'
  | 'too_far'
  | 'unassigned';

export type Assignment = {
  orderId: string;
  branchId: string | null;
  rule: Rule;
};
