import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SevenPayService, UserContext } from './core/services/sevenpay.service';
import { PricingManagerComponent, PricingTierInput } from './components/pricing-manager/pricing-manager.component';
import { TRANSLATIONS } from './core/constants/i18n';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [CommonModule, FormsModule, PricingManagerComponent],
	templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
	public tenants = signal<any[]>([]);
	public endUsers = signal<any[]>([]);
	public activeProfile = signal<any | null>(null);
	public installments = signal<any[]>([]);
	public globalMetrics = signal<any>({});
	
	public selectedTenantId = signal<string | null>(null);
	public filteredEndUsers = computed(() => {
		const tenantId = this.selectedTenantId();
		if (!tenantId) return [];
		return this.endUsers().filter(user => user.tenantId === tenantId);
	});

	public activePricingMatrix = signal<PricingTierInput[]>([
		{ installmentsCount: 1, feePercentage: 3.50, maxAdvancePercentage: 30.00 }
	]);

	public credentials = { email: '', password: '' };
	public tenantForm = { cnpj: '', name: '', businessType: 'HR', globalCreditLimitCents: 0 };
	public advanceForm = { requestedAmount: null as number | null, installmentsTotal: 1 };

	constructor(public svc: SevenPayService) {}

	public ngOnInit(): void {
		if (this.svc.isAuthenticated()) {
			this.evaluateWorkspaceWorkspaceQueryRouting();
		}
	}

	public getAvailableLanguages(): ('en' | 'pt-br')[] {
		return Object.keys(TRANSLATIONS) as ('en' | 'pt-br')[];
	}

	public formatCents(centsValue: string | number): string {
		const parsed = typeof centsValue === 'string' ? parseFloat(centsValue) : centsValue;
		return (parsed / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	public evaluateWorkspaceWorkspaceQueryRouting(): void {
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
		this.svc.getTenants().subscribe({
			next: (res) => { if (res.result === 'success') this.tenants.set(res.data?.tenants || []); }
		});
		this.svc.getEndUsers(100, 0).subscribe({
			next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); }
		});
		this.svc.getGlobalMetrics().subscribe({
			next: (res) => { if (res.result === 'success') this.globalMetrics.set(res.data?.metrics || {}); }
		});
	}

	public selectTenant(tenantId: string): void {
		this.selectedTenantId.set(this.selectedTenantId() === tenantId ? null : tenantId);
	}

	public loadActiveWorkspaceUsers(): void {
		this.svc.getEndUsers(50, 0).subscribe({
			next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); }
		});
	}

	public loadConsumerSelfProfile(consumerId: string): void {
		this.svc.inspectEndUser(consumerId).subscribe({
			next: (res) => {
				if (res.result === 'success') {
					this.activeProfile.set(res.data.profile);
					this.installments.set(res.data.amortizationInstallments || []);
				}
			}
		});
	}

	public loadInspectionLayer(endUserId: string): void {
		this.svc.inspectEndUser(endUserId).subscribe({
			next: (res) => {
				if (res.result === 'success') {
					this.activeProfile.set(res.data.profile);
					this.installments.set(res.data.amortizationInstallments || []);
				}
			}
		});
	}

	public handleLogin(event: Event): void {
		event.preventDefault();
		this.svc.login(this.credentials).subscribe({
			next: () => {
				this.evaluateWorkspaceWorkspaceQueryRouting();
				this.credentials = { email: '', password: '' };
			}
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
			}
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
					alert(`Pix Approved!`);
					this.loadConsumerSelfProfile(consumerId);
					this.advanceForm = { requestedAmount: null, installmentsTotal: 1 };
				}
			}
		});
	}
}
