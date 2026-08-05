import { Component, OnInit, signal, computed } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SevenPayService } from './core/services/sevenpay.service';
import { PricingTierInput } from './components/pricing-manager/pricing-manager.component';
import { TRANSLATIONS } from './core/constants/i18n';

import { MasterDashboardComponent } from './components/master-dashboard/master-dashboard.component';
import { TenantManagerComponent } from './components/tenant-manager/tenant-manager.component';
import { TelemetryDrawerComponent } from './components/telemetry-drawer/telemetry-drawer.component';

export type MenuSegment = 'DASHBOARD' | 'PARTNERS' | 'CONSUMERS' | 'STATEMENT' | 'BATCH_SYNC' | 'SETTLEMENT';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [
		CommonModule, 
		FormsModule, 
		MasterDashboardComponent, 
		TenantManagerComponent,    
		TelemetryDrawerComponent   
	],
	templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {

	private searchSubject = new Subject<string>();
	private searchSubscription!: Subscription;
	public currentSearchQuery = signal<string>('');

	public isSidebarOpen = signal<boolean>(false);
	public currentMenuSegment = signal<MenuSegment>('DASHBOARD');

	public tenants = signal<any[]>([]);
	public endUsers = signal<any[]>([]);
	public transactions = signal<any[]>([]);
	public settlementBatches = signal<any[]>([]);
	public activeProfile = signal<any | null>(null);
	public installments = signal<any[]>([]);
	public globalMetrics = signal<any>({});
	public selectedTenantId = signal<string | null>(null);

	/* ─── PAGINATION MATRIX TRACKING SIGNALS ─── */
	public tenantsLimit = signal<number>(5);
	public tenantsOffset = signal<number>(0);

	public filteredEndUsers = computed(() => {
		const tenantId = this.selectedTenantId();
		if (!tenantId) return [];
		return this.endUsers().filter(user => user.tenantId === tenantId);
	});

	public credentials = { email: '', password: '' };
	public tenantForm = { cnpj: '', name: '', businessType: 'HR', globalCreditLimitCents: 0 };
	public advanceForm = { requestedAmount: null as number | null, installmentsTotal: 1 };
	public settlementForm = { tenantId: '', billingCompetence: '' };
	public syncRawText = signal<string>('');
	public activePricingMatrix = signal<PricingTierInput[]>([
		{ installmentsCount: 1, feePercentage: 3.50, maxAdvancePercentage: 30.00 }
	]);

	constructor(public svc: SevenPayService) {}

	public ngOnInit(): void {
		/* 🛡️ SECURITY DEBOUNCE BAR: Holds request pipeline for 2 seconds to avoid spamming the Core Engine */
		this.searchSubscription = this.searchSubject.pipe(
			debounceTime(2000), 
			distinctUntilChanged()
		).subscribe(query => {
			this.currentSearchQuery.set(query);
			this.tenantsOffset.set(0); /* Reset pagination index upon changing terms */
			this.loadFintechControlTowerData();
		});

		/* ─── YOUR EXACT ORIGINAL SECURITY HANDSHAKE LOGIC PRESERVED UNTOUCHED ─── */
		const localToken = localStorage.getItem('sp_token');
		if (localToken && this.svc.isAuthenticated()) {
			setTimeout(() => {
				if (this.svc.isAuthenticated()) {
					this.evaluateWorkspaceQueryRouting();
				}
			}, 0);
		} else {
			this.svc.logout();
		}
	}

	/* ─── DESTRUCTION SHIELD: Clean up subscription to prevent memory leaks ─── */
	public ngOnDestroy(): void {
		if (this.searchSubscription) {
			this.searchSubscription.unsubscribe();
		}
	}

	public handleFuzzySearchTrigger(query: string): void {
		this.searchSubject.next(query);
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
		this.isSidebarOpen.set(false);
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

	/* ─── UPDATED LOOKUP: CONSUMING LIMIT AND OFFSET SIGNALS FOR PAGINATION ─── */
	public loadFintechControlTowerData(): void {
		this.svc.getTenants(this.tenantsLimit(), this.tenantsOffset(), this.currentSearchQuery()).subscribe({
			next: (res) => { if (res.result === 'success') this.tenants.set(res.data?.tenants || []); }
		});
		this.svc.getGlobalMetrics().subscribe({
			next: (res) => { if (res.result === 'success') this.globalMetrics.set(res.data?.metrics || {}); }
		});
	}

	/* ─── CURSOR NAVIGATION TRIGGERS PROTECTED AGAINST OVERFLOWS ─── */
	public nextTenantsPage(): void {
		/* 🛡️ SECURITY SHIELD: Block execution if the current payload array length indicates end of database */
		if (this.tenants().length < this.tenantsLimit()) return;
		
		this.tenantsOffset.update(current => current + this.tenantsLimit());
		this.loadFintechControlTowerData();
	}

	public prevTenantsPage(): void {
		if (this.tenantsOffset() === 0) return;
		this.tenantsOffset.update(current => Math.max(0, current - this.tenantsLimit()));
		this.loadFintechControlTowerData();
	}
	public selectTenant(tenantId: string): void {
		this.selectedTenantId.set(this.selectedTenantId() === tenantId ? null : tenantId);
		if (this.selectedTenantId()) {
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

	public handleLogin(event: Event): void { event.preventDefault(); }
	public handleCreateTenant(event: any): void { event.preventDefault(); }
	public handleClearCompetence(event: any): void { event.preventDefault(); }
	public handleBulkSync(event: any): void { event.preventDefault(); }
	public handleRequestAdvance(event: any): void { event.preventDefault(); }
}
