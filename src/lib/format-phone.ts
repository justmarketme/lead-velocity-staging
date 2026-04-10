export const formatPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) return "No phone provided";
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");
  
  // Handle South African numbers starting with 0 or 27
  if (cleaned.startsWith("27") && cleaned.length === 11) {
    return `+27 ${cleaned.substring(2, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
  }
  
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return `+27 ${cleaned.substring(1, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
  }
  
  // Generic fallback for other lengths/formats
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }
  
  return phone;
};
