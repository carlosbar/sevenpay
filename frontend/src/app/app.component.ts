import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SevenPayService } from './core/services/sevenpay.service';
import { PricingManagerComponent, PricingTierInput } from './components/pricing-manager/pricing-manager.component';
import { TRANSLATIONS } from './core/constants/i18n';

export type MenuSegment = 'DASHBOARD' | 'PARTNERS' | 'CONSUMERS' | 'STATEMENT' | 'BATCH_SYNC' | 'SETTLEMENT';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [CommonModule, FormsModule, PricingManagerComponent],
	templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
	// Navigation State Anchors
	public isSidebarOpen = signal<boolean>(false);
	public currentMenuSegment = signal<MenuSegment>('DASHBOARD');

	// Real-Time Data Streams
	public tenants = signal<any[]>([]);
	public endUsers = signal<any[]>([]);
	public transactions = signal<any[]>([]);
	public settlementBatches = signal<any[]>([]);
	public activeProfile = signal<any | null>(null);
	public installments = signal<any[]>([]);
	public globalMetrics = signal<any>({});
	public selectedTenantId = signal<string | null>(null);

	// Contextual Filtering
	public filteredEndUsers = computed(() => {
		const tenantId = this.selectedTenantId();
		if (!tenantId) return [];
		return this.endUsers().filter(user => user.tenantId === tenantId);
	});

	// Bound Reactive Forms Data Models
	public credentials = { email: '', password: '' };
	public tenantForm = { cnpj: '', name: '', businessType: 'HR', globalCreditLimitCents: 0 };
	public advanceForm = { requestedAmount: null as number | null, installmentsTotal: 1 };
	public settlementForm = { tenantId: '', billingCompetence: '' };
	public syncRawText = signal<string>(''); // Holds JSON text vector for bulk onboarding
	public activePricingMatrix = signal<PricingTierInput[]>([
		{ installmentsCount: 1, feePercentage: 3.50, maxAdvancePercentage: 30.00 }
	]);

	constructor(public svc: SevenPayService) {}

	public ngOnInit(): void {
		// 🛡️ REACTIVE TIMING LOCK: Validates session state straight from the storage layer to prevent racing early network calls
		const localToken = localStorage.getItem('sp_token');
		
		if (localToken && this.svc.isAuthenticated()) {
			// Delays background queries slightly to let Angular Zoneless change detection resolve computed signals
			setTimeout(() => {
				if (this.svc.isAuthenticated()) {
					this.evaluateWorkspaceQueryRouting();
				}
			}, 0);
		} else {
			this.svc.logout();
		}
	}

	public getAvailableLanguages(): ('en' | 'pt-br')[] {
		return Object.keys(TRANSLATIONS) as ('en' | 'pt-br')[];
	}

	public formatCents(centsValue: string | number): string {
		const parsed = typeof centsValue === 'string' ? parseFloat(centsValue) : centsValue;
		return (parsed / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	public switchSegment(target: MenuSegment): void {
		this.currentMenuSegment.set(target);
		this.isSidebarOpen.set(false); // Auto-close drawer on mobile viewports
		this.syncSegmentContextData(target);
	}

	private syncSegmentContextData(segment: MenuSegment): void {
		const tenantId = this.selectedTenantId() || this.svc.userContext()?.tenantId;
		const endUserId = this.svc.userContext()?.endUserId;

		if (segment === 'STATEMENT' && tenantId && endUserId) {
			this.loadLedgerStatementHistory(tenantId, endUserId);
		}
		if (segment === 'SETTLEMENT' && tenantId) {
			this.loadTenantSettlementBatches(tenantId);
		}
	}

	public evaluateWorkspaceQueryRouting(): void {
		const scope = this.svc.currentScope();
		if (scope === 'MASTER') {
			this.loadFintechControlTowerData();
			this.switchSegment('DASHBOARD');
		} else if (scope === 'TENANT') {
			this.loadActiveWorkspaceUsers();
			this.switchSegment('CONSUMERS');
		} else if (scope === 'END_USER') {
			const consumerId = this.svc.userContext()?.endUserId;
			if (consumerId) this.loadConsumerSelfProfile(consumerId);
			this.switchSegment('STATEMENT');
		}
	}

	public loadFintechControlTowerData(): void {
		this.svc.getTenants().subscribe({
			next: (res) => { if (res.result === 'success') this.tenants.set(res.data?.tenants || []); }
		});
		this.svc.getGlobalMetrics().subscribe({
			next: (res) => { if (res.result === 'success') this.globalMetrics.set(res.data?.metrics || {}); }
		});
	}

	public selectTenant(tenantId: string): void {
		this.selectedTenantId.set(this.selectedTenantId() === tenantId ? null : tenantId);
		if (this.selectedTenantId()) {
			// Trigger direct network lookup stream using explicit single parameter filtering strategy
			this.svc.getEndUsers(100, 0, this.selectedTenantId()!).subscribe({
				next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); }
			});
		}
	}

	public loadActiveWorkspaceUsers(): void {
		const tenantId = this.svc.userContext()?.tenantId;
		if (tenantId) {
			this.svc.getEndUsers(50, 0, tenantId).subscribe({
				next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); }
			});
		}
	}

	public loadLedgerStatementHistory(tenantId: string, endUserId: string): void {
		// Consumes the un-branched single layout deterministic endpoint matching our backend fix
		this.svc.getHistory(tenantId, endUserId).subscribe({
			next: (res) => { if (res.result === 'success') this.transactions.set(res.data?.transactions || []); }
		});
	}

	public loadTenantSettlementBatches(tenantId: string): void {
		this.svc.getSettlementBatches(tenantId).subscribe({
			next: (res) => { if (res.result === 'success') this.settlementBatches.set(res.data?.batches || []); }
		});
	}

	public loadConsumerSelfProfile(consumerId: string): void {
		this.svc.inspectEndUser(consumerId, this.svc.userContext()?.tenantId || '').subscribe({
			next: (res) => {
				if (res.result === 'success') {
					this.activeProfile.set(res.data.profile);
					this.installments.set(res.data.amortizationInstallments || []);
				}
			}
		});
	}

	public loadInspectionLayer(endUserId: string): void {
		const tenantId = this.selectedTenantId() || this.svc.userContext()?.tenantId || '';
		this.svc.inspectEndUser(endUserId, tenantId).subscribe({
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
				// 🔄 FIXED: Check synchronous state initialization before routing background aggregates
				if (this.svc.isAuthenticated() && this.svc.userContext()) {
					this.evaluateWorkspaceQueryRouting();
					this.credentials = { email: '', password: '' };
				} else {
					alert('Security handshake deferred. Please re-enter credentials.');
					this.svc.logout();
				}
			},
			error: (err: any) => {
				const token = err.error?.errorToken || 'AUTH_CREDENTIALS_INVALID';
				alert(this.svc.t()[token]);
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
					alert('B2B Partner deployed successfully.');
					this.loadFintechControlTowerData();
					this.tenantForm = { cnpj: '', name: '', businessType: 'HR', globalCreditLimitCents: 0 };
				}
			}
		});
	}

	public handleBulkSync(event: Event): void {
		event.preventDefault();
		const tenantId = this.selectedTenantId() || this.svc.userContext()?.tenantId;
		if (!tenantId) return;

		try {
			const parsedUsers = JSON.parse(this.syncRawText());
			// 🔄 ALIGNED: Calling the corrected service signature with explicitly typed response parameter
			this.svc.tenantSyncUsers(tenantId, { users: parsedUsers }).subscribe({
				next: (res: any) => {
					if (res.result === 'success') {
						alert(`${res.data.synchronizedRecordsCount} consumer records synchronized.`);
						this.syncRawText.set('');
						if (this.svc.currentScope() === 'TENANT') this.loadActiveWorkspaceUsers();
					}
				}
			});
		} catch { alert('Invalid JSON structure input layout matrix.'); }
	}

	public handleClearCompetence(event: Event): void {
		event.preventDefault();
		this.svc.clearCompetence(this.settlementForm).subscribe({
			next: (res) => {
				if (res.result === 'success') {
					alert(`Batch cleared! Total: ${this.formatCents(res.data.totalLiquidatedCents)}`);
					this.loadTenantSettlementBatches(this.settlementForm.tenantId);
					this.settlementForm = { tenantId: '', billingCompetence: '' };
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
					alert(`Pix Dispatched!`);
					this.loadConsumerSelfProfile(consumerId);
					this.advanceForm = { requestedAmount: null, installmentsTotal: 1 };
				}
			}
		});
	}
}
