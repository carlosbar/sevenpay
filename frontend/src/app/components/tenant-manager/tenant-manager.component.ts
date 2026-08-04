import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'app-tenant-manager',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './tenant-manager.component.html'
})
export class TenantManagerComponent {
	/* ─── SIGNAL-BASED REACTIVE INPUT MATRICES ─── */
	public currentSegment = input.required<string>();
	public scope = input.required<string>();
	public t = input.required<any>(); // Added to dynamically inject i18n dictionaries
	public selectedTenantId = input<string | null>(null);
	public tenants = input<any[]>([]);
	public endUsers = input<any[]>([]);
	public syncRawText = input<string>('');

	/* ─── OUTPUT EMITTERS FOR STATE PROPAGATION ─── */
	public onSelectTenant = output<string>();
	public onInspectUser = output<string>();
	public onBulkSync = output<any>();

	/* ─── INTERCEPTOR TO DISPATCH SELECTOR MUTATIONS ─── */
	public onTenantDropdownChange(event: Event): void {
		const selectElement = event.target as HTMLSelectElement;
		this.onSelectTenant.emit(selectElement.value);
	}
}
