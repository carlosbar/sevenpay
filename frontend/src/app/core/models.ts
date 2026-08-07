export interface PricingTierInput {
  installmentsCount: number;
  feePercentage: number;
  maxAdvancePercentage: number;
}

export interface Tenant {
  id: string;
  cnpj?: string;
  name?: string;
  businessType?: string;
  globalCreditLimitCents?: number;
  totalMonthDisbursedCents?: number;
  availableCreditMarginCents?: number;
  hasOverdueInstallments?: boolean;
  overdueAmountCents?: number;
  pricingMatrix?: PricingTierInput[];
  feeMatrix?: PricingTierInput[];
}

export interface GlobalMetrics {
  totalVolumeAdvancedCents?: number;
  totalFeesCollectedCents?: number;
  totalReceivablesCents?: number;
  totalOverdueCents?: number;
}

export interface TenantForm {
  cnpj: string;
  name: string;
  businessType: string;
  globalCreditLimit: number;
  globalCreditLimitMasked: string;
}

export interface SettlementForm {
  tenantId: string;
  billingCompetence: string;
}

export interface AdvanceForm {
  requestedAmount: number | null;
  installmentsTotal: number;
}

export interface EndUser {
  id: string;
  tenantId?: string;
  name?: string;
}

export interface Transaction {
  id: string;
  amountCents?: number;
  date?: string;
}

export interface SettlementBatch {
  id: string;
  tenantId?: string;
}

export interface ActiveProfile {
  id: string;
  name?: string;
}

export interface Installment {
  id?: string;
  amountCents?: number;
  dueDate?: string;
}
