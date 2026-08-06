// src/app/core/services/sevenpay.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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
	public language = signal<'en' | 'pt-br'>((document.cookie.match(new RegExp('(?:^|; )sp_lang=([^;]*)'))?.[1] as 'en' | 'pt-br') || 'pt-br');
	public t = computed(() => TRANSLATIONS[this.language()]);
	public isAuthenticated = computed(() => this.token() !== null && this.userContext() !== null);
	public currentScope = computed(() => this.userContext()?.scope || null);

	constructor(private http: HttpClient) {
		const savedToken = localStorage.getItem('sp_token');
		if (savedToken) {
			const success = this.decodeAndSetContext(savedToken);
			if (success) {
				this.token.set(savedToken);
			} else {
				this.logout();
			}
		}
	}

	public setLanguageCookie(lang: 'en' | 'pt-br'): void {
		this.language.set(lang);
		document.cookie = `sp_lang=${lang}; path=/; max-age=31536000; SameSite=Strict; Secure`;
	}

	private getHeaders(): HttpHeaders {
		const currentToken = this.token();
		return new HttpHeaders({
			'Content-Type': 'application/json',
			'Authorization': currentToken ? `Bearer ${currentToken}` : ''
		});
	}

	private decodeAndSetContext(token: string): boolean {
		try {
			const parts = token.split('.');
			if (parts.length !== 3) return false;

			let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
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
		} catch {
			return false;
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
  
	public getEndUsers(limit = 20, offset = 0, tenantId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/end-users?limit=${limit}&offset=${offset}&tenantId=${tenantId}`, {
			headers: this.getHeaders()
		});
	}

	public provisionTenant(tenantData: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/admin/tenants`, tenantData, {
			headers: this.getHeaders()
		});
	}

	public inspectEndUser(endUserId: string, tenantId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/end-users/inspect?endUserId=${endUserId}&tenantId=${tenantId}`, {
			headers: this.getHeaders()
		});
	}

	public createAdvanceRequest(payload: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/advances/request`, payload, {
			headers: this.getHeaders()
		});
	}

	public getTenants(limit?: number, offset?: number, search?: string): Observable<any> {
		let params = new HttpParams();
		
		if (limit !== undefined) params = params.set('limit', limit.toString());
		if (offset !== undefined) params = params.set('offset', offset.toString());
		if (search !== undefined && search.length > 0) params = params.set('search', search);

		return this.http.get<any>(`${this.BASE_URL}/admin/tenants`, { 
			headers: this.getHeaders(), 
			params 
		});
	}

	public getGlobalMetrics(): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/admin/dashboard/metrics`, {
			headers: this.getHeaders()
		});
	}

	public getSettlementBatches(tenantId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/tenants/settlements?tenantId=${tenantId}`, {
			headers: this.getHeaders()
		});
	}

	public clearCompetence(payload: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/settlements/clear-competence`, payload, {
			headers: this.getHeaders()
		});
	}

	public getHistory(tenantId: string, endUserId: string): Observable<any> {
		return this.http.get<any>(`${this.BASE_URL}/statements/history?tenantId=${tenantId}&endUserId=${endUserId}`, {
			headers: this.getHeaders()
		});
	}

	public tenantSyncUsers(tenantId: string, payload: any): Observable<any> {
		return this.http.post<any>(`${this.BASE_URL}/tenants/sync-users?tenantId=${tenantId}`, payload, {
			headers: this.getHeaders()
		});
	}
}
