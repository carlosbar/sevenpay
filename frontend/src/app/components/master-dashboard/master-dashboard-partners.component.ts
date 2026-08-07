import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Tenant, PricingTierInput, TenantForm } from '../../core/models';

@Component({
	selector: 'app-master-dashboard-partners',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './master-dashboard-partners.component.html'
})
export class MasterDashboardPartnersComponent {
	public t = input.required<Record<string, string>>();
	public tenants = input<Tenant[]>([]);
	public searchTerm = input<string>('');
	public tenantForm = input<TenantForm>({ cnpj: '', name: '', businessType: 'HR', globalCreditLimit: 0, globalCreditLimitMasked: '' });
	public tenantFormChange = output<TenantForm>();
	public activePricingMatrix = input<PricingTierInput[]>([]);
	public activePricingMatrixChange = output<PricingTierInput[]>();

	public onFuzzySearch = output<string>();
	public onSelectTenant = output<string>();
	public onCreateTenant = output<any>();
	public onNextPage = output<void>();
	public onPrevPage = output<void>();

	public onSearchChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.onFuzzySearch.emit(value);
	}

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

	public addPricingRow(): void {
		const currentRows = this.activePricingMatrix();
		const nextInstallmentNumber = currentRows.length > 0
			? Math.max(...currentRows.map(r => r.installmentsCount)) + 1
			: 1;

		this.activePricingMatrixChange.emit([
			...currentRows,
			{ installmentsCount: nextInstallmentNumber, feePercentage: 5.00, maxAdvancePercentage: 32.00 }
		]);
	}

	public removePricingRow(index: number): void {
		const currentRows = this.activePricingMatrix();
		if (currentRows.length <= 1) return;

		this.activePricingMatrixChange.emit(currentRows.filter((_, i) => i !== index));
	}
}
