import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
	SevenPayService, 
	EndUser, 
	AmortizationInstallment 
} from './core/services/sevenpay.service';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
	// Reactive Signals matrix managing the frontend view state
	public endUsers = signal<EndUser[]>([]);
	public activeProfile = signal<any | null>(null);
	public installments = signal<AmortizationInstallment[]>([]);

	// Form mappings matching user input targets
	public credentials = { email: '', password: '' };
	
	public tenantForm = {
		cnpj: '',
		name: '',
		businessType: 'HR',
		globalCreditLimitCents: 0
	};

	public advanceForm = {
		requestedAmount: null as number | null,
		installmentsTotal: 1
	};

	constructor(public svc: SevenPayService) {}

	public ngOnInit(): void {
		// Auto-fetch dashboard portfolio metadata if a token already exists on browser reload
		if (this.svc.isAuthenticated()) {
			this.evaluateWorkspaceQueryRouting();
		}
	}

	public formatCents(centsValue: string | number): string {
		const parsed = typeof centsValue === 'string' ? parseFloat(centsValue) : centsValue;
		return (parsed / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	public evaluateWorkspaceQueryRouting(): void {
		const scope = this.svc.currentScope();
		
		// Direct pipeline routing based on active authority contexts
		if (scope === 'MASTER' || scope === 'TENANT') {
			this.loadActiveWorkspaceUsers();
		} else if (scope === 'END_USER') {
			const consumerId = this.svc.userContext()?.endUserId;
			if (consumerId) this.loadConsumerSelfProfile(consumerId);
		}
	}

	public handleLogin(event: Event): void {
		event.preventDefault();
		this.svc.login(this.credentials).subscribe({
			next: () => {
				this.evaluateWorkspaceQueryRouting();
				// Flush security fields upon operational confirmation
				this.credentials = { email: '', password: '' };
			},
			error: (err) => alert(err.error?.reason || 'Authentication matrix checkpoint rejection.')
		});
	}
	public loadActiveWorkspaceUsers(): void {
		this.svc.getEndUsers(50, 0).subscribe({
			next: (res) => {
				if (res.result === 'success' && res.data?.endUsers) {
					this.endUsers.set(res.data.endUsers);
				}
			},
			error: (err) => console.error('Failed to stream workspace rows:', err)
		});
	}

	public loadConsumerSelfProfile(consumerId: string): void {
		this.svc.inspectEndUser(consumerId).subscribe({
			next: (res) => {
				if (res.result === 'success' && res.data?.profile) {
					this.activeProfile.set(res.data.profile);
					if (res.data.amortizationInstallments) {
						this.installments.set(res.data.amortizationInstallments);
					}
				}
			},
			error: (err) => console.error('Profile sync inspection failure:', err)
		});
	}

	public loadInspectionLayer(endUserId: string): void {
		this.svc.inspectEndUser(endUserId).subscribe({
			next: (res) => {
				if (res.result === 'success') {
					this.activeProfile.set(res.data.profile);
					this.installments.set(res.data.amortizationInstallments || []);
				}
			},
			error: (err) => alert(err.error?.reason || 'Deep inspection operational failure.')
		});
	}

	public handleCreateTenant(event: Event): void {
		event.preventDefault();
		const payload = {
			cnpj: this.tenantForm.cnpj,
			name: this.tenantForm.name,
			businessType: this.tenantForm.businessType,
			globalCreditLimitCents: Math.round(this.tenantForm.globalCreditLimitCents * 100)
		};

		this.svc.provisionTenant(payload).subscribe({
			next: (res) => {
				if (res.result === 'success') {
					alert('B2B Tenant deployed and provisioned successfully into core matrices.');
					this.loadActiveWorkspaceUsers();
					this.tenantForm = { cnpj: '', name: '', businessType: 'HR', globalCreditLimitCents: 0 };
				}
			},
			error: (err) => alert(err.error?.reason || 'B2B Provisioning policy rejection.')
		});
	}

	public handleRequestAdvance(event: Event): void {
		event.preventDefault();
		const consumerId = this.svc.userContext()?.endUserId;
		if (!consumerId || !this.advanceForm.requestedAmount) return;

		const payload = {
			endUserId: consumerId,
			requestedAmountCents: Math.round(this.advanceForm.requestedAmount * 100),
			installmentsTotal: this.advanceForm.installmentsTotal
		};

		this.svc.createAdvanceRequest(payload).subscribe({
			next: (res) => {
				if (res.result === 'success') {
					alert(`Pix withdrawal approved! Net payout of ${this.formatCents(res.data.netPayoutCents)} routed.`);
					this.loadConsumerSelfProfile(consumerId);
					this.advanceForm = { requestedAmount: null, installmentsTotal: 1 };
				}
			},
			error: (err) => alert(err.error?.reason || 'Credit engine validation checkpoint rejection.')
		});
	}
}
