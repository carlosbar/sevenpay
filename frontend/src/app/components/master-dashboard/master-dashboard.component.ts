import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MasterDashboardDashboardComponent } from './master-dashboard-dashboard.component';
import { MasterDashboardPartnersComponent } from './master-dashboard-partners.component';

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
	public t = input.required<any>(); 
	public metrics = input<any>({});
	public tenants = input<any[]>([]);
	public selectedTenantId = input<string | null>(null);
	public settlementBatches = input<any[]>([]);
	public limit = input<number>(5);
	public offset = input<number>(0);
  public activePricingMatrix = input<any[]>([]);
	
	/* ─── FUZZY DEBOUNCING STATES AND DISPATCHERS ─── */
	public searchTerm = signal<string>('');
	public onFuzzySearch = output<string>();

	/* ─── TWO-WAY PROXY EMULATIONS ─── */
	public tenantForm = input<any>({});
	public tenantFormChange = output<any>();
	public settlementForm = input<any>({});
	public settlementFormChange = output<any>();

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
