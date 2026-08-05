import { Component, input, output, Input } from '@angular/core'; /* FIXED: Explicitly imported classic Input decorator */
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
	@Input() selectedTenantId: string | null = null; /* Restored to decorator fallback for rigid binding symmetry */
	public settlementBatches = input<any[]>([]);
	
	/* ─── FIXED HOOK: STRATIFIED CLASSIC DECORATORS TO BYPASS COMPILER CACHE GLITCHES ─── */
	@Input() limit: number = 5;
	@Input() offset: number = 0;
	
	/* ─── TWO-WAY PROXY EMULATIONS USING INBOUND REFERENCE ARRAYS ─── */
	public tenantForm = input<any>({});
	public tenantFormChange = output<any>();

	public settlementForm = input<any>({});
	public settlementFormChange = output<any>();

	/* ─── DELEGATED INFRASTRUCTURE MUTATION EVENT EMITTERS ─── */
	public onSelectTenant = output<string>();
	public onCreateTenant = output<any>();
	public onClearCompetence = output<any>();

	/* ─── PAGINATION MATRIX PIPELINE SIGNATURES ─── */
	public onNextPage = output<void>(); 
	public onPrevPage = output<void>(); 

	/* ─── PROPAGATION INTERCEPTORS TO TRIGGER PARENT ALIGNMENTS ─── */
	public updateTenantPayload(): void {
		this.tenantFormChange.emit(this.tenantForm());
	}

	public updateSettlementPayload(): void {
		this.settlementFormChange.emit(this.settlementForm());
	}
}
