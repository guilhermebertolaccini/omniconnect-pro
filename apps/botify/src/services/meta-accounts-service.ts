export interface WebhookConfig {
  callbackUrl: string;
  verifyToken: string;
  isConfigured: boolean;
  lastVerified?: string;
  subscribedEvents: string[];
}

export interface MetaAccount {
  id: string;
  name: string;
  businessManagerId: string;
  accessToken: string;
  createdAt: string;
  lastUsed?: string;
  isActive: boolean;
  webhookConfig?: WebhookConfig;
  phoneNumberIds?: string[]; // Store associated phone IDs for webhook log matching
}

const STORAGE_KEY = 'meta_accounts';

class MetaAccountsService {
  private accounts: MetaAccount[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.accounts = JSON.parse(saved);
      }
      
      // Migrate from old storage format if exists
      const oldToken = localStorage.getItem('meta_access_token');
      const oldBmId = localStorage.getItem('meta_business_manager_id');
      const oldBmName = localStorage.getItem('meta_business_manager_name');
      
      if (oldToken && oldBmId && this.accounts.length === 0) {
        this.addAccount({
          name: oldBmName || 'Conta Principal',
          businessManagerId: oldBmId,
          accessToken: oldToken,
        });
        
        // Clean up old storage
        localStorage.removeItem('meta_access_token');
        localStorage.removeItem('meta_business_manager_id');
        localStorage.removeItem('meta_business_manager_name');
      }
    } catch (error) {
      console.error('Error loading Meta accounts:', error);
      this.accounts = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.accounts));
    } catch (error) {
      console.error('Error saving Meta accounts:', error);
    }
  }

  getAccounts(): MetaAccount[] {
    return [...this.accounts];
  }

  getActiveAccount(): MetaAccount | null {
    return this.accounts.find(a => a.isActive) || this.accounts[0] || null;
  }

  getAccountById(id: string): MetaAccount | undefined {
    return this.accounts.find(a => a.id === id);
  }

  addAccount(data: { name: string; businessManagerId: string; accessToken: string }): MetaAccount {
    // Deactivate all other accounts
    this.accounts.forEach(a => a.isActive = false);

    const newAccount: MetaAccount = {
      id: `account_${Date.now()}`,
      name: data.name,
      businessManagerId: data.businessManagerId,
      accessToken: data.accessToken,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      isActive: true,
    };

    this.accounts.push(newAccount);
    this.saveToStorage();
    return newAccount;
  }

  updateAccount(id: string, data: Partial<Omit<MetaAccount, 'id' | 'createdAt'>>): MetaAccount | null {
    const index = this.accounts.findIndex(a => a.id === id);
    if (index === -1) return null;

    this.accounts[index] = { ...this.accounts[index], ...data };
    this.saveToStorage();
    return this.accounts[index];
  }

  deleteAccount(id: string): boolean {
    const index = this.accounts.findIndex(a => a.id === id);
    if (index === -1) return false;

    const wasActive = this.accounts[index].isActive;
    this.accounts.splice(index, 1);

    // If deleted account was active, activate the first remaining one
    if (wasActive && this.accounts.length > 0) {
      this.accounts[0].isActive = true;
    }

    this.saveToStorage();
    return true;
  }

  setActiveAccount(id: string): MetaAccount | null {
    const account = this.accounts.find(a => a.id === id);
    if (!account) return null;

    this.accounts.forEach(a => a.isActive = false);
    account.isActive = true;
    account.lastUsed = new Date().toISOString();
    
    this.saveToStorage();
    return account;
  }

  hasAccounts(): boolean {
    return this.accounts.length > 0;
  }
}

export const metaAccountsService = new MetaAccountsService();
