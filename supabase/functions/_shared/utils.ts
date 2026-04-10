export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;
  
  // Remove all non-numeric characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Handle South African local format (084...)
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+27' + cleaned.substring(1);
  }
  
  // Handle international without + (2784...)
  if (cleaned.startsWith('27') && cleaned.length === 11 && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  // Ensure it starts with + if it's clearly an international number
  if (!cleaned.startsWith('+') && cleaned.length >= 9) {
    // If it's a 9-digit SA mobile number without leading 0
    if (cleaned.length === 9 && /^[1-9]/.test(cleaned)) {
      cleaned = '+27' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}
