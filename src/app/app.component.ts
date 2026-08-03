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
