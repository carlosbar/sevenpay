import { Component, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface PricingTierInput {
	installmentsCount: number;
	feePercentage: number;
	maxAdvancePercentage: number;
}

@Component({
	selector: 'app-pricing-manager',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './pricing-manager.component.html'
})
export class PricingManagerComponent {
	// Signal holding the dynamic installments and fees rows matrix
	public pricingRows = signal<PricingTierInput[]>([
		{ installmentsCount: 1, feePercentage: 8.00, maxAdvancePercentage: 30.00 }
	]);

	@Output() onMatrixChanged = new EventEmitter<PricingTierInput[]>();

	public addRow(event: Event): void {
		event.preventDefault();
		const currentRows = this.pricingRows();
		
		// Propose the next sequential installment sequence automatically
		const nextInstallmentNumber = currentRows.length > 0 
			? Math.max(...currentRows.map(r => r.installmentsCount)) + 1 
			: 1;

		this.pricingRows.set([
			...currentRows,
			{ installmentsCount: nextInstallmentNumber, feePercentage: 5.00, maxAdvancePercentage: 32.00 }
		]);
		this.emitMatrixState();
	}

	public removeRow(index: number, event: Event): void {
		event.preventDefault();
		const currentRows = this.pricingRows();
		if (currentRows.length <= 1) return; // Enforce at least one baseline pricing row
		
		this.pricingRows.set(currentRows.filter((_, i) => i !== index));
		this.emitMatrixState();
	}

	public emitMatrixState(): void {
		this.onMatrixChanged.emit(this.pricingRows());
	}
}
