import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { TRANSLATIONS } from '../constants/i18n'; // Enforces clean separate dictionary import

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

@Injectable({ providedIn: 'root' })
export class SevenPayService {
	private readonly BASE_URL = 'http://localhost:3000/api/v1';
	
	public token = signal<string | null>(localStorage.getItem('sp_token'));
	public userContext = signal<UserContext | null>(null);
	
	// Active Language State Anchor (Defaults to Portuguese 'pt')
	public language = signal<'en' | 'pt'>('pt');
	
	// Computed dictionary streaming translation tokens reactively to components
	public t = computed(() => TRANSLATIONS[this.language()]);

	public isAuthenticated = computed(() => !!this.token());
	public currentScope = computed(() => this.userContext()?.scope || null);

	constructor(private http: HttpClient) {
		if (this.token()) this.decodeAndSetContext(this.token()!);
	}

	private getHeaders(): HttpHeaders {
		return new HttpHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token()}` });
	}

	private decodeAndSetContext(token: string): void {
		try {
			const payload = JSON.parse(atob(token.split('.')[1]));
			this.userContext.set({
				operatorId: payload.operatorId, email: payload.email, role: payload.role,
				scope: payload.scope, tenantId: payload.tenantId, endUserId: payload.endUserId
			});
		} catch { this.logout(); }
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

	public getEndUsers(limit = 20, offset = 0): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/end-users?limit=${limit}&offset=${offset}`, { headers: this.getHeaders() });
	}

	public provisionTenant(tenantData: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/admin/tenants`, tenantData, { headers: this.getHeaders() });
	}

	public inspectEndUser(endUserId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/end-users/inspect?endUserId=${endUserId}`, { headers: this.getHeaders() });
	}

	public createAdvanceRequest(payload: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/advances/request`, payload, { headers: this.getHeaders() });
	}

	public getTenants(): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/tenants`, { headers: this.getHeaders() });
	}

	public getGlobalMetrics(): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/dashboard/metrics`, { headers: this.getHeaders() });
	}
}
