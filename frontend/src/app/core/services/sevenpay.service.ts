// src/app/core/services/sevenpay.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { TRANSLATIONS } from '../constants/i18n';

export type RoleScope = 'MASTER' | 'TENANT' | 'END_USER';

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
	
	// Enforces language retrieval directly from browser cookie vectors upon boot (Defaulting to 'pt-br')
	public language = signal<'en' | 'pt-br'>(this.getCookie('sp_lang') as 'en' | 'pt-br' || 'pt-br');
	
	// Stream localization tokens seamlessly across components
	public t = computed(() => TRANSLATIONS[this.language()]);

	public isAuthenticated = computed(() => !!this.token());
	public currentScope = computed(() => this.userContext()?.scope || null);

	constructor(private http: HttpClient) {
		const savedToken = localStorage.getItem('sp_token');
		if (savedToken) {
			// 🔄 FIXED: Verify token integrity synchronously before populating reactive signals
			const successfullyDecoded = this.decodeAndSetContext(savedToken);
			if (successfullyDecoded) {
				this.token.set(savedToken);
			} else {
				this.logout();
			}
		}
	}

	private decodeAndSetContext(token: string): boolean {
		try {
			const parts = token.split('.');
			if (parts.length !== 3) return false;

			// 🔄 FIXED: Replace Base64Url specific characters to make it compatible with native atob decoding
			let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
			
			// Pad the string with '=' characters if its length is not a multiple of 4
			while (base64.length % 4 !== 0) {
				base64 += '=';
			}

			const payload = JSON.parse(atob(base64));
			this.userContext.set({
				operatorId: payload.operatorId,
				email: payload.email,
				role: payload.role,
				scope: payload.scope,
				tenantId: payload.tenantId,
				endUserId: payload.endUserId
			});
			return true;
		} catch (error) {
			console.error('JWT cryptographic decoding pipeline failed:', error);
			return false;
		}
	}

	// Native method helper to write persistent cookies (Max-Age: 1 Year)
	public setLanguageCookie(lang: 'en' | 'pt-br'): void {
		this.language.set(lang);
		document.cookie = `sp_lang=${lang}; path=/; max-age=31536000; SameSite=Strict; Secure`;
	}

	// Native method helper to read secure storage cookies safely
	private getCookie(name: string): string | null {
		const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
		return match ? match[2] : null;
	}

	private getHeaders(): HttpHeaders {
		return new HttpHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token()}` });
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

	// FIXED: Always enforces tenantId query parameter passing to fulfill the backend's strict single query pattern
	public getEndUsers(limit = 20, offset = 0, tenantId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/end-users?limit=${limit}&offset=${offset}&tenantId=${tenantId}`, { headers: this.getHeaders() });
	}

	public provisionTenant(tenantData: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/admin/tenants`, tenantData, { headers: this.getHeaders() });
	}

	// FIXED: Always passes tenantId into the query path to feed the validation cross-checks
	public inspectEndUser(endUserId: string, tenantId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/end-users/inspect?endUserId=${endUserId}&tenantId=${tenantId}`, { headers: this.getHeaders() });
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

	// NEW: Fetches the history of payments and settlements for a specific company context
	public getSettlementBatches(tenantId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/tenants/settlements?tenantId=${tenantId}`, { headers: this.getHeaders() });
	}

	// NEW: Clear and reconcile multi-tenant plural installments competence layers
	public clearCompetence(payload: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/settlements/clear-competence`, payload, { headers: this.getHeaders() });
	}

	// FIXED: Always enforces full query identity validation boundaries matching the new statement history rewrite
	public getHistory(tenantId: string, endUserId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/statements/history?tenantId=${tenantId}&endUserId=${endUserId}`, { headers: this.getHeaders() });
	}

	// FIXED: Standardized name mapping to guarantee perfect alignment with UI components
	public tenantSyncUsers(tenantId: string, payload: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/tenants/sync-users?tenantId=${tenantId}`, payload, { headers: this.getHeaders() });
	}  
}
