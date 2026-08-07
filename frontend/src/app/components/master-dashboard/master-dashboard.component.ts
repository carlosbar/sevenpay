import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MasterDashboardDashboardComponent } from './master-dashboard-dashboard.component';
import { MasterDashboardPartnersComponent } from './master-dashboard-partners.component';
import { Tenant, GlobalMetrics, PricingTierInput, TenantForm, SettlementForm, BusinessType, Tenant as ITenant } from '../../core/models';

@Component({
	selector: 'app-master-dashboard',
	standalone: true,
	imports: [CommonModule, FormsModule, MasterDashboardDashboardComponent, MasterDashboardPartnersComponent],
	templateUrl: './master-dashboard.component.html'
})
export class MasterDashboardComponent {
	/* ─── SIGNAL-BASED REACTIVE INPUT MATRICES ─── */
	public currentSegment = input.required<string>();
	public scope = input.required<string>();
	public t = input.required<Record<string, string>>(); 
	public metrics = input<GlobalMetrics>({});
	public tenants = input<ITenant[]>([]);
	public selectedTenantId = input<string | null>(null);
	public businessTypes = input<BusinessType[]>([]);
	public settlementBatches = input<any[]>([]);
	public limit = input<number>(5);
	public offset = input<number>(0);
  public activePricingMatrix = input<PricingTierInput[]>([]);
  public activePricingMatrixChange = output<PricingTierInput[]>();

	/* ─── FUZZY DEBOUNCING STATES AND DISPATCHERS ─── */
	public searchTerm = signal<string>('');
	public onFuzzySearch = output<string>();

	/* ─── TWO-WAY PROXY EMULATIONS ─── */
	public tenantForm = input<TenantForm>({ cnpj: '', name: '', businessType: 'HR', globalCreditLimit: 0, globalCreditLimitMasked: '' });
	public tenantFormChange = output<TenantForm>();
	public settlementForm = input<SettlementForm>({ tenantId: '', billingCompetence: '' });
	public settlementFormChange = output<SettlementForm>();

	/* ─── INFRASTRUCTURE EVENT EMITTERS ─── */
	public onSelectTenant = output<string>();
	public onCreateTenant = output<any>();
	public onClearCompetence = output<any>();
	public onNextPage = output<void>(); 
	public onPrevPage = output<void>(); 

	public onSearchChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.searchTerm.set(value);
		this.onFuzzySearch.emit(value);
	}

	public updateTenantPayload(): void {
		this.tenantFormChange.emit(this.tenantForm());
	}

	public updateSettlementPayload(): void {
		this.settlementFormChange.emit(this.settlementForm());
	}

	// 🛡️ REACTIVE INLINE CURRENCY MASK PIPELINE
	public formatInlineCurrency(event: Event): void {
		const input = event.target as HTMLInputElement;
		let value = input.value.replace(/\D/g, '');
		if (!value) value = '0';
		const numericValue = parseFloat(value) / 100;
		const formatted = numericValue.toLocaleString('pt-BR', {
			style: 'currency',
			currency: 'BRL'
		});
		this.tenantForm().globalCreditLimitMasked = formatted;
		this.tenantForm().globalCreditLimit = numericValue;
	}
  
}
