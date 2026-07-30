import { apiGet, apiPut } from './client';

export function loadTransfers() {
  return apiGet('/api/transfers');
}

export function saveTransfers(transfers: unknown) {
  return apiPut('/api/transfers', transfers);
}
