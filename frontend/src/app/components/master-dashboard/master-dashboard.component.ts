import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'app-master-dashboard',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './master-dashboard.component.html'
})
export class MasterDashboardComponent {
	/* ─── RECONCILIATION AND SEGMENT SELECTION VECTORS ─── */
	@Input() currentSegment!: string;
	@Input() scope!: string;
	@Input() metrics: any;
	@Input() tenants: any[] = [];
	@Input() selectedTenantId: string | null = null;
	@Input() settlementBatches: any[] = [];
	
	/* ─── TWO-WAY BINDING PROPERTIES SYSTEM ─── */
	@Input() tenantForm: any;
	@Output() tenantFormChange = new EventEmitter<any>();

	@Input() settlementForm: any;
	@Output() settlementFormChange = new EventEmitter<any>();

	/* ─── DELEGATED STRUCTURAL MUTATION EVENT EMITTERS ─── */
	@Output() onSelectTenant = new EventEmitter<string>();
	@Output() onCreateTenant = new EventEmitter<any>();
	@Output() onClearCompetence = new EventEmitter<any>();

	/* ─── PROPAGATION INTERCEPTORS TO TRIGGER PARENT REFLECTS ─── */
	public updateTenantPayload(): void {
		this.tenantFormChange.emit(this.tenantForm);
	}

	public updateSettlementPayload(): void {
		this.settlementFormChange.emit(this.settlementForm);
	}
}
