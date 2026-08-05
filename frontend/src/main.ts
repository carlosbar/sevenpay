import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideHttpClient } from '@angular/common/http';

/* ─── REGISTRATION MATRICES FOR PT-BR LOCALIZATION AND CURRENCY PIPES ─── */
import { LOCALE_ID } from '@angular/core';
import registerLocalePt from '@angular/common/locales/pt';
import { registerLocaleData } from '@angular/common';

// Register the Portuguese data array into Angular core runtime engine
registerLocaleData(registerLocalePt);

bootstrapApplication(AppComponent, {
	providers: [
		provideHttpClient(),
		/* ─── SHIELD: ENFORCES PT-BR LOCALE DISPATCH ACROSS ALL NATIVE PIPES ─── */
		{ provide: LOCALE_ID, useValue: 'pt-BR' }
	]
}).catch(err => console.error(err));
