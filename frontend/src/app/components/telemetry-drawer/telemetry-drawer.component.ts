import { Component, input, output } from '@angular/core';
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
	/* ─── SIGNAL-BASED REACTIVE TIME-SERIES INPUT STREAMS ─── */
	public currentSegment = input.required<string>();
	public scope = input.required<string>();
	public t = input.required<any>();
	public activeProfile = input<any | null>(null);
	public transactions = input<any[]>([]);
	public installments = input<any[]>([]);
	
	/* ─── INTERNAL CREDIT DISPATCH DATA MODELS ─── */
	public advanceForm = input<any>({});

	/* ─── DETERMINISTIC ROUTING SEGMENT EMITTERS ─── */
	public onClose = output<void>();
	public onRequestAdvance = output<any>();
	public onQueryLedger = output<{ tenantId: string, userId: string }>();
	public onSwitchSegment = output<MenuSegment>();
}
