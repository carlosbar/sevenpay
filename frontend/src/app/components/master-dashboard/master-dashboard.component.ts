import { Component, input, output } from '@angular/core';
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
	public t = input.required<any>(); /* Dynamic internationalization dictionary handshake */
	public metrics = input<any>({});
	public tenants = input<any[]>([]);
	public selectedTenantId = input<string | null>(null);
	public settlementBatches = input<any[]>([]);
	
	/* ─── TWO-WAY PROXY EMULATIONS USING INBOUND TARGET REFERENCE REFLECTS ─── */
	public tenantForm = input<any>({});
	public tenantFormChange = output<any>();

	public settlementForm = input<any>({});
	public settlementFormChange = output<any>();

	/* ─── DELEGATED INFRASTRUCTURE MUTATION EVENT EMITTERS ─── */
	public onSelectTenant = output<string>();
	public onCreateTenant = output<any>();
	public onClearCompetence = output<any>();

	/* ─── PROPAGATION INTERCEPTORS TO TRIGGER PARENT ALIGNMENTS ─── */
	public updateTenantPayload(): void {
		this.tenantFormChange.emit(this.tenantForm());
	}

	public updateSettlementPayload(): void {
		this.settlementFormChange.emit(this.settlementForm());
	}
}
