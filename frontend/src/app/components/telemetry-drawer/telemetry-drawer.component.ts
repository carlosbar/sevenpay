import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuSegment } from '../../app.component';

@Component({
	selector: 'app-telemetry-drawer',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './telemetry-drawer.component.html'
})
export class TelemetryDrawerComponent {
	/* ─── TIME-SERIES AND AMORTIZATION DATA STREAMS ─── */
	@Input() currentSegment!: string;
	@Input() scope!: string;
	@Input() activeProfile: any | null = null;
	@Input() transactions: any[] = [];
	@Input() installments: any[] = [];
	
	/* ─── FORMS ACCELERATOR PASSED DOWN INTERNALLY ─── */
	@Input() advanceForm: any;

  public t = input.required<any>();

	/* ─── STRICT TYPE-SAFE ROUTING MUTATION UTILITIES ─── */
	@Output() onClose = new EventEmitter<void>();
	@Output() onRequestAdvance = new EventEmitter<any>();
	@Output() onQueryLedger = new EventEmitter<{ tenantId: string, userId: string }>();
	@Output() onSwitchSegment = new EventEmitter<MenuSegment>(); // Strict Type Alignment
}
