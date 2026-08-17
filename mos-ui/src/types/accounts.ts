export interface AccountEntry {
  id: string;
  name: string;
  accessKey: string;
  secretKey: string;
  isAdmin: boolean;
  createdAt: number;
  lastUsedAt: number;
}

export interface AccountsData {
  accounts: AccountEntry[];
}
