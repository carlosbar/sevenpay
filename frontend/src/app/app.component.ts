import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
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
export class AppComponent implements OnInit, OnDestroy {

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

	/* ─── CREDENTIALS & EXPANDED B2B DATA STRUCTURES ─── */
	public credentials = { email: '', password: '' };
	public tenantForm = { cnpj: '', name: '', businessType: 'HR', globalCreditLimit: 0, globalCreditLimitMasked: '' };
	public advanceForm = { requestedAmount: null as number | null, installmentsTotal: 1 };
	public settlementForm = { tenantId: '', billingCompetence: '' };
	public syncRawText = signal<string>('');
	public activePricingMatrix = signal<PricingTierInput[]>([
		{ installmentsCount: 1, feePercentage: 3.50, maxAdvancePercentage: 30.00 }
	]);

	constructor(public svc: SevenPayService) {}
	public ngOnInit(): void {
		console.log('[SevenPay-Core] Entering ngOnInit lifecycle stage.');
		
		/* 🛡️ SECURITY DEBOUNCE BAR: Only handles request pipeline if the user is physically authenticated */
		this.searchSubscription = this.searchSubject.pipe(
			debounceTime(2000), 
			distinctUntilChanged()
		).subscribe(query => {
			console.log(`[SevenPay-Core] Search Subject triggered. Query term: "${query}"`);
			if (this.svc.isAuthenticated() && localStorage.getItem('sp_token')) {
				console.log('[SevenPay-Core] Debouncer verified active session. Dispatching lookup.');
				this.currentSearchQuery.set(query);
				this.tenantsOffset.set(0);
				this.loadFintechControlTowerData();
			} else {
				console.warn('[SevenPay-Core] Debouncer blocked: Operator is currently unauthenticated.');
			}
		});

		/* ─── HANDSHAKE INITIALIZATION PROTECTED AGAINST CONCURRENT PIPELINES ─── */
		const localToken = localStorage.getItem('sp_token');
		const serviceAuth = this.svc.isAuthenticated();
		console.log(`[SevenPay-Core] Token Matrix Inspection - Local Storage Token: ${localToken ? 'PRESENT' : 'ABSENT'}, Service Signal Authenticated: ${serviceAuth}`);
		
		if (localToken && serviceAuth) {
			console.log('[SevenPay-Core] Security handshake cleared. Evaluating workspace layout routing.');
			this.evaluateWorkspaceQueryRouting();
		} else {
			console.warn('[SevenPay-Core] Incomplete handshake credentials detected. Wiping local memory targets.');
			localStorage.removeItem('sp_token');
			if (this.svc.isAuthenticated()) {
				console.log('[SevenPay-Core] Service signal was stateful. Resetting via logout activation.');
				this.svc.logout();
			}
		}
	}

	/* ─── DESTRUCTION SHIELD: Clean up subscription to prevent memory leaks ─── */
	public ngOnDestroy(): void {
		console.log('[SevenPay-Core] Executing ngOnDestroy component termination pipeline.');
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
		console.log(`[SevenPay-Core] Navigation command intercepted. Target segment: ${target}`);
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
		console.log(`[SevenPay-Core] Operational routing initialized. Current security scope: ${scope}`);
		
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

	/* ─── INTEGRATED LOOKUP BLINDED AGAINST ANONYMOUS REQUESTS ─── */
	public loadFintechControlTowerData(): void {
		const localToken = localStorage.getItem('sp_token');
		const serviceAuth = this.svc.isAuthenticated();
		
		if (!serviceAuth || !localToken) {
			return;
		}

		this.svc.getTenants(this.tenantsLimit(), this.tenantsOffset(), this.currentSearchQuery()).subscribe({
			next: (res) => { if (res.result === 'success') this.tenants.set(res.data?.tenants || []); },
			error: (err) => { this.handleHttpAuthErrors(err, 'getTenants'); }
		});
		
		this.svc.getGlobalMetrics().subscribe({
			next: (res) => { if (res.result === 'success') this.globalMetrics.set(res.data?.metrics || {}); },
			error: (err) => { this.handleHttpAuthErrors(err, 'getGlobalMetrics'); }
		});
	}

	/* ─── CURSOR NAVIGATION TRIGGERS PROTECTED AGAINST OVERFLOWS ─── */
	public nextTenantsPage(): void {
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
  		const targetId = this.selectedTenantId()!;
  
  		/* 1. Sync Linked EndUsers data vector for the active workspace */
  		this.svc.getEndUsers(100, 0, targetId).subscribe({
  			next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); },
  			error: (err) => { this.handleHttpAuthErrors(err, 'selectTenant'); }
  		});
  
  		/* 2. 🛡️ FIX: busca o tenant completo via /inspect, que é o único endpoint
  		      que retorna a pricingMatrix de verdade (a listagem não retorna) */
  		this.svc.inspectTenant(targetId).subscribe({
  			next: (res) => {
  				if (res.result !== 'success') return;
  
  				const tenant = res.data.tenant;
  				const rawMatrix = res.data.pricingMatrix || [];
  
  				const rawCents = tenant.globalCreditLimitCents ? Number(tenant.globalCreditLimitCents) : 0;
  				const decimalValue = rawCents / 100;
  				const formattedMask = decimalValue.toLocaleString('pt-BR', {
  					style: 'currency',
  					currency: 'BRL'
  				});
  
  				this.tenantForm = {
  					cnpj: tenant.cnpj || '',
  					name: tenant.name || '',
  					businessType: tenant.businessType || 'HR',
  					globalCreditLimit: decimalValue,
  					globalCreditLimitMasked: formattedMask
  				};
  
  				// 🛡️ Agora reflete o estado REAL do tenant — inclusive quando é [] (vazio de verdade)
  				const remappedMatrix: PricingTierInput[] = rawMatrix.map((row: any) => ({
  					installmentsCount: Number(row.installmentsCount ?? 1),
  					feePercentage: Number(row.feePercentage ?? 0),
  					maxAdvancePercentage: Number(row.maxAdvancePercentage ?? 0)
  				}));
  				this.activePricingMatrix.set(remappedMatrix);
  			},
  			error: (err) => { this.handleHttpAuthErrors(err, 'inspectTenant'); }
  		});
  	} else {
  		/* Reset limpo ao desselecionar (voltar ao modo "novo parceiro") */
  		this.tenantForm = {
  			cnpj: '',
  			name: '',
  			businessType: 'HR',
  			globalCreditLimit: 0,
  			globalCreditLimitMasked: ''
  		};
  		this.activePricingMatrix.set([{ installmentsCount: 1, feePercentage: 3.50, maxAdvancePercentage: 30.00 }]);
  	}
  }
  
	public loadActiveWorkspaceUsers(): void {
		const tenantId = this.svc.userContext()?.tenantId;
		if (tenantId) {
			this.svc.getEndUsers(50, 0, tenantId).subscribe({
				next: (res) => { if (res.result === 'success') this.endUsers.set(res.data?.endUsers || []); },
				error: (err) => { this.handleHttpAuthErrors(err, 'loadActiveWorkspaceUsers'); }
			});
		}
	}

	public loadLedgerStatementHistory(tenantId: string, endUserId: string): void {
		this.svc.getHistory(tenantId, endUserId).subscribe({
			next: (res) => { if (res.result === 'success') this.transactions.set(res.data?.transactions || []); },
			error: (err) => { this.handleHttpAuthErrors(err, 'loadLedgerStatementHistory'); }
		});
	}

	public loadTenantSettlementBatches(tenantId: string): void {
		this.svc.getSettlementBatches(tenantId).subscribe({
			next: (res) => { if (res.result === 'success') this.settlementBatches.set(res.data?.batches || []); },
			error: (err) => { this.handleHttpAuthErrors(err, 'loadTenantSettlementBatches'); }
		});
	}
	public loadConsumerSelfProfile(consumerId: string): void {
		this.svc.inspectEndUser(consumerId, this.svc.userContext()?.tenantId || '').subscribe({
			next: (res) => {
				if (res.result === 'success') {
					this.activeProfile.set(res.data.profile);
					this.installments.set(res.data.amortizationInstallments || []);
				}
			},
			error: (err) => { this.handleHttpAuthErrors(err, 'loadConsumerSelfProfile'); }
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
			},
			error: (err) => { this.handleHttpAuthErrors(err, 'loadInspectionLayer'); }
		});
	}

	public handleLogin(event: Event): void {
		event.preventDefault();
		if (!this.credentials.email || !this.credentials.password) return;

		this.svc.login(this.credentials).subscribe({
			next: (res: any) => {
				if (res && (res.result === 'success' || res.token)) {
					const token = res.token || res.data?.token;
					if (token) {
						localStorage.setItem('sp_token', token);
						const serviceProxy = this.svc as any;
						if (typeof serviceProxy.setToken === 'function') {
							serviceProxy.setToken(token);
						}
					}
					setTimeout(() => {
						this.evaluateWorkspaceQueryRouting();
						this.credentials = { email: '', password: '' };
					}, 100);
				} else {
					alert('Authentication failed. Please verify credentials.');
				}
			},
			error: (err) => {
				alert('Network error or invalid operator credentials.');
			}
		});
	}

	/* ─── ATOMIC INGESTION HANDLER MATRICES: B2B EXPANDED PARTNER PROVISIONING ─── */
  public handleCreateTenant(event: Event): void {
  	if (event) event.preventDefault();
  
  	if (!this.tenantForm.cnpj || !this.tenantForm.name || this.tenantForm.globalCreditLimit === null || this.tenantForm.globalCreditLimit === undefined) {
  		alert('Please fulfill all mandatory corporate partner attributes.');
  		return;
  	}
  
  	const readyToDeployPayload = {
  		cnpj: this.tenantForm.cnpj,
  		name: this.tenantForm.name,
  		businessType: this.tenantForm.businessType,
  		globalCreditLimitCents: Math.round(this.tenantForm.globalCreditLimit * 100),
  		pricingMatrix: this.activePricingMatrix()
  	};
  
  	// 🛡️ FIX: se há um tenant selecionado, é edição (PUT); senão, criação (POST)
  	const isEditing = !!this.selectedTenantId();
  	const request$ = isEditing
  		? this.svc.updateTenant(readyToDeployPayload)
  		: this.svc.provisionTenant(readyToDeployPayload);
  
  	request$.subscribe({
  		next: (res) => {
  			if (res.result === 'success') {
  				alert(isEditing ? 'B2B Corporate Partner successfully updated.' : 'B2B Corporate Partner successfully deployed to Core Network.');
  				this.loadFintechControlTowerData();
  				this.switchSegment('DASHBOARD');
  				this.selectedTenantId.set(null);
  
  				this.tenantForm = {
  					cnpj: '',
  					name: '',
  					businessType: 'HR',
  					globalCreditLimit: 0,
  					globalCreditLimitMasked: ''
  				};
  				this.activePricingMatrix.set([{ installmentsCount: 1, feePercentage: 3.50, maxAdvancePercentage: 30.00 }]);
  			} else {
  				alert(`Deployment rejected: ${res.reason || 'Database verification fault.'}`);
  			}
  		},
  		error: (err) => {
  			this.handleHttpAuthErrors(err, isEditing ? 'updateTenant' : 'provisionTenant');
  			alert('Network error encountered while deploying partner vector.');
  		}
  	});
  }
  
	private handleHttpAuthErrors(err: any, originEndpoint: string): void {
		console.error(`[SevenPay-Core] HTTP Exception from: "${originEndpoint}". Status: ${err.status}`);
		if (err.status === 401) {
			localStorage.removeItem('sp_token');
			this.svc.logout();
		}
	}

	public handleClearCompetence(event: any): void { event.preventDefault(); }
	public handleBulkSync(event: any): void { event.preventDefault(); }
	public handleRequestAdvance(event: any): void { event.preventDefault(); }
}
