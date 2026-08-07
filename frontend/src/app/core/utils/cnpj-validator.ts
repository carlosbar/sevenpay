// Validates a Brazilian CNPJ (Cadastro Nacional da Pessoa Jurídica) using the
// official modulo-11 check-digit algorithm. Expects either a raw 14-digit
// string or one formatted as "00.000.000/0000-00" - non-digit characters are
// stripped before validation.

const FIRST_CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_CHECK_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function calculateCheckDigit(base: string, weights: number[]): number {
	const sum = base
		.split('')
		.reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
	const remainder = sum % 11;
	return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(cnpj: string): boolean {
	const digits = String(cnpj).replace(/\D/g, '');

	if (digits.length !== 14) return false;
	// Rejects sequences like "00000000000000" or "11111111111111",
	// which pass the checksum but are not valid registered CNPJs.
	if (/^(\d)\1{13}$/.test(digits)) return false;

	const firstCheckDigit = calculateCheckDigit(digits.substring(0, 12), FIRST_CHECK_DIGIT_WEIGHTS);
	if (firstCheckDigit !== Number(digits[12])) return false;

	const secondCheckDigit = calculateCheckDigit(digits.substring(0, 13), SECOND_CHECK_DIGIT_WEIGHTS);
	if (secondCheckDigit !== Number(digits[13])) return false;

	return true;
}
