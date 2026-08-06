import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'app-master-dashboard',
	standalone: true,
	imports: [CommonModule, FormsModule],
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
		// 1. Extract purely numeric digits from the input field string
		let value = input.value.replace(/\D/g, '');
		
		// 2. Prevent NaN errors by fallback assignment
		if (!value) value = '0';
		
		// 3. Translate raw digits layout into localized decimal float values
		const numericValue = parseFloat(value) / 100;
		
		// 4. Update the visual template mask with clean dots and commas
		const formatted = numericValue.toLocaleString('pt-BR', {
			style: 'currency',
			currency: 'BRL'
		});
		
		// 5. Update BOTH visual value and data-model states simultaneously
		this.tenantForm().globalCreditLimitMasked = formatted;
		this.tenantForm().globalCreditLimit = numericValue; // Safe decimal value sent directly to the core API
	}
  
}
