import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
	SevenPayService, 
	EndUser, 
	Tenant,
	AmortizationInstallment 
} from './core/services/sevenpay.service';
import { PricingManagerComponent, PricingTierInput } from './components/pricing-manager/pricing-manager.component';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [CommonModule, FormsModule, PricingManagerComponent],
	templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
	// Global reative matrices driven by state signals
	public tenants = signal<Tenant[]>([]);
	public endUsers = signal<EndUser[]>([]);
	public activeProfile = signal<any | null>(null);
	public installments = signal<AmortizationInstallment[]>([]);
	public globalMetrics = signal<any>({});
	public activePricingMatrix = signal<PricingTierInput[]>([{ installmentsCount: 1, feePercentage: 8.00, maxAdvancePercentage: 30.00 }]);
  
	// Dynamic filtering anchors for granular multi-tenant visualization
	public selectedTenantId = signal<string | null>(null);
	public filteredEndUsers = computed(() => {
		const tenantId = this.selectedTenantId();
		if (!tenantId) return [];
		return this.endUsers().filter(user => user.tenantId === tenantId);
	});

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
		
		if (scope === 'MASTER') {
			this.loadFintechControlTowerData();
		} else if (scope === 'TENANT') {
			this.loadActiveWorkspaceUsers();
		} else if (scope === 'END_USER') {
			const consumerId = this.svc.userContext()?.endUserId;
			if (consumerId) this.loadConsumerSelfProfile(consumerId);
		}
	}

	public loadFintechControlTowerData(): void {
		// Concurrent stream loading all layout layers
		this.svc.getTenants().subscribe({
			next: (res) => { if (res.result === 'success') this.tenants.set(res.data?.tenants || []); },
			error: (err) => console.error('Failed to stream tenants rows:', err)
		});

		this.svc.getEndUsers(100, 0).subscribe({
			next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); },
			error: (err) => console.error('Failed to stream global consumers:', err)
		});

		this.svc.getGlobalMetrics().subscribe({
			next: (res) => { if (res.result === 'success') this.globalMetrics.set(res.data?.metrics || {}); },
			error: (err) => console.error('Failed to parse dynamic ledger metrics:', err)
		});
	}

	public selectTenant(tenantId: string): void {
		// Toggle select filter vector instantly
		this.selectedTenantId.set(this.selectedTenantId() === tenantId ? null : tenantId);
	}

	public loadActiveWorkspaceUsers(): void {
		this.svc.getEndUsers(50, 0).subscribe({
			next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); },
			error: (err) => console.error('Failed to stream workspace rows:', err)
		});
	}

	public loadConsumerSelfProfile(consumerId: string): void {
		this.svc.inspectEndUser(consumerId).subscribe({
			next: (res) => {
				if (res.result === 'success' && res.data?.profile) {
					this.activeProfile.set(res.data.profile);
					this.installments.set(res.data.amortizationInstallments || []);
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

	public handleLogin(event: Event): void {
		event.preventDefault();
		this.svc.login(this.credentials).subscribe({
			next: () => {
				this.evaluateWorkspaceQueryRouting();
				this.credentials = { email: '', password: '' };
			},
			error: (err) => alert(err.error?.reason || 'Authentication matrix checkpoint rejection.')
		});
	}

	public handleCreateTenant(event: Event): void {
		event.preventDefault();
		const payload = {
			cnpj: this.tenantForm.cnpj,
			name: this.tenantForm.name,
			businessType: this.tenantForm.businessType,
			globalCreditLimitCents: Math.round(this.tenantForm.globalCreditLimitCents * 100),
			pricingMatrix: this.activePricingMatrix()
		};

    this.svc.provisionTenant(payload).subscribe({
			next: (res) => {
				if (res.result === 'success') {
					alert('B2B Tenant deployed and provisioned successfully.');
					this.loadFintechControlTowerData();
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
