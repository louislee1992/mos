import { apiGet, apiPut } from './client';

export function loadTransfers() {
  return apiGet<Record<string, unknown>[]>('/api/transfers');
}

export function saveTransfers(transfers: Record<string, unknown>[]) {
  return apiPut('/api/transfers', transfers);
}
