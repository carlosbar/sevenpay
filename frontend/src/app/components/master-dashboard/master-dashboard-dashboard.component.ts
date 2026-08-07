import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'app-master-dashboard-dashboard',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './master-dashboard-dashboard.component.html'
})
export class MasterDashboardDashboardComponent {
	public t = input.required<any>();
	public metrics = input<any>({});
	public tenants = input<any[]>([]);
	public searchTerm = input<string>('');
	public tenantForm = input<any>({});
	public tenantFormChange = output<any>();
	public activePricingMatrix = input<any[]>([]);

	public onFuzzySearch = output<string>();
	public onSelectTenant = output<string>();
	public onCreateTenant = output<any>();
	public onNextPage = output<void>();
	public onPrevPage = output<void>();

	public onSearchChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.onFuzzySearch.emit(value);
	}
}
