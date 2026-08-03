import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

// Enums and strict typing matching backend definitions
export type RoleScope = 'MASTER' | 'TENANT' | 'END_USER';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'OVERDUE';

export interface UserContext {
	operatorId: string;
	email: string;
	role: string;
	scope: RoleScope;
	tenantId: string | null;
	endUserId: string | null;
}

export interface Tenant {
	id: string;
	cnpj: string;
	name: string;
	businessType: 'HR' | 'REAL_ESTATE';
	globalCreditLimitCents: string;
}

export interface EndUser {
	id: string;
	tenantId?: string;
	externalId: string;
	name: string;
	monthlyContractValueCents: string;
	marginAvailableCents: string; // Calculated dynamically by the backend in real-time
	status: 'ACTIVE' | 'INACTIVE';
}

export interface AdvanceRequest {
	id?: string;
	endUserId: string;
	requestedAmountCents: number;
	installmentsTotal: number;
	feePercentage?: number;
	feeAmountCents?: string;
	netPayoutCents?: string;
	status?: RequestStatus;
	createdAt?: string;
}

export interface AmortizationInstallment {
	id: string;
	advanceRequestId: string;
	installmentNumber: number;
	grossAmountCents: string;
	billingCompetence: string;
	status: RequestStatus;
}

@Injectable({
	providedIn: 'root'
})
export class SevenPayService {
	private readonly BASE_URL = 'http://localhost:3000/api/v1';
	
	// Angular Signals for solid reactive state management
	public token = signal<string | null>(localStorage.getItem('sp_token'));
	public userContext = signal<UserContext | null>(null);
	
	// Computed state matrix guards
	public isAuthenticated = computed(() => !!this.token());
	public currentScope = computed(() => this.userContext()?.scope || null);

	constructor(private http: HttpClient) {
		if (this.token()) {
			this.decodeAndSetContext(this.token()!);
		}
	}

	private getHeaders(): HttpHeaders {
		return new HttpHeaders({
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.token()}`
		});
	}

	private decodeAndSetContext(token: string): void {
		try {
			const payload = JSON.parse(atob(token.split('.')[1]));
			this.userContext.set({
				operatorId: payload.operatorId,
				email: payload.email,
				role: payload.role,
				scope: payload.scope,
				tenantId: payload.tenantId,
				endUserId: payload.endUserId
			});
		} catch {
			this.logout();
		}
	}

	public login(credentials: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/auth/login`, credentials).pipe(
			tap(res => {
				if (res.result === 'success' && res.data?.token) {
					localStorage.setItem('sp_token', res.data.token);
					this.token.set(res.data.token);
					this.decodeAndSetContext(res.data.token);
				}
			})
		);
	}

	public logout(): void {
		localStorage.removeItem('sp_token');
		this.token.set(null);
		this.userContext.set(null);
	}

	// MASTER & TENANT Scope: List credit consumers
	public getEndUsers(limit = 20, offset = 0): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/end-users?limit=${limit}&offset=${offset}`, { headers: this.getHeaders() });
	}

	// MASTER Scope: List or create corporate portfolios
	public provisionTenant(tenantData: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/admin/tenants`, tenantData, { headers: this.getHeaders() });
	}

	// ALL Scopes: Deep inspect a consumer 360 profile logic
	public inspectEndUser(endUserId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/end-users/inspect?endUserId=${endUserId}`, { headers: this.getHeaders() });
	}

	// END_USER Scope: Dispatch a new real-time capital advance request execution
	public createAdvanceRequest(payload: AdvanceRequest): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/advances/request`, payload, { headers: this.getHeaders() });
	}

	// MASTER Scope: Stream all active B2B enterprise portfolios
	public getTenants(): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/tenants`, { headers: this.getHeaders() });
	}

	// MASTER Scope: Compute aggregated liquidity matrix telemetry
	public getGlobalMetrics(): Observable<any> {
		// Points directly to the immutable financial transactions ledger endpoint
		return this.http.get<any>(`${this.BASE_URL}/admin/dashboard/metrics`, { headers: this.getHeaders() });
	}
}
