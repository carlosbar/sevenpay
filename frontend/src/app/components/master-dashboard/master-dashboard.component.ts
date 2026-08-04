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
	
	/* ─── CORRECTION VECTOR: DECLARED FORMS PASSED FROM THE PARENT TEMPLATE ─── */
	@Input() tenantForm: any;
	@Input() settlementForm: any;
	@Input() settlementBatches: any[] = [];

	/* ─── DELEGATED STRUCTURAL MUTATION EVENT EMITTERS ─── */
	@Output() onSelectTenant = new EventEmitter<string>();
	@Output() onCreateTenant = new EventEmitter<any>();
	@Output() onClearCompetence = new EventEmitter<any>();
}
