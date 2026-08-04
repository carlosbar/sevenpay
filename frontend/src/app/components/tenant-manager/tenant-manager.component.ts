import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'app-tenant-manager',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './tenant-manager.component.html'
})
export class TenantManagerComponent {
	/* ─── DATA LAYERS CONNECTED TO TARGET COMPANY ARRAYS ─── */
	@Input() currentSegment!: string;
	@Input() scope!: string;
	@Input() selectedTenantId: string | null = null;
	@Input() endUsers: any[] = [];
	
	/* ─── CORRECTION VECTOR: BINDING TO INPUT PAYLOAD TEXTAREA SIGNAL VECTOR ─── */
	@Input() syncRawText!: string;

	/* ─── PRIVILEGE ESCALATION SHIELDING EMITTERS ─── */
	@Output() onInspectUser = new EventEmitter<string>();
	@Output() onBulkSync = new EventEmitter<any>();
}
