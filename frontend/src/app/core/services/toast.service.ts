import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
	id: number;
	type: ToastType;
	message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
	private nextId = 0;
	public toasts = signal<ToastMessage[]>([]);

	public success(message: string): void {
		this.push('success', message);
	}

	public error(message: string): void {
		this.push('error', message);
	}

	public dismiss(id: number): void {
		this.toasts.update(list => list.filter(t => t.id !== id));
	}

	private push(type: ToastType, message: string): void {
		const id = this.nextId++;
		this.toasts.update(list => [...list, { id, type, message }]);
		setTimeout(() => this.dismiss(id), 5000);
	}
}
