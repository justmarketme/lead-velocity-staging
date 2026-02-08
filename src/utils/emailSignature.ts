/**
 * Lead Velocity Email Signature Utility
 * Generates a professional email signature for all outgoing emails
 */

export interface SignatureDetails {
    senderName?: string;
    senderTitle?: string;
}

/**
 * Generates the Lead Velocity email signature in a professional format.
 * 
 * Format:
 * ─────────────────────────────────────
 * 
 * [Lead Velocity Logo]     │ Sender Name
 *                          │ Title | Lead Velocity
 *                          │ T. +27 10 976 5618
 *                          │ 210 Amarand Avenue, Pegasus Building 1
 *                          │ Menlyn Maine, Pretoria, 0184
 *                          │ E. howzit@leadvelocity.co.za | leadvelocity.co.za
 *                          │ f. LeadVelocitySA  l. Lead Velocity
 * 
 */
export const getEmailSignature = (details?: SignatureDetails): string => {
    const senderName = details?.senderName || "The Lead Velocity Team";
    const senderTitle = details?.senderTitle || "Business Development";

    // Plain text version for mailto: links (most email clients don't support HTML in mailto)
    const signature = `

─────────────────────────────────────

${senderName}
${senderTitle} | Lead Velocity

T. +27 10 976 5618
210 Amarand Avenue, Pegasus Building 1
Menlyn Maine, Pretoria, 0184

E. howzit@leadvelocity.co.za | leadvelocity.co.za
f. LeadVelocitySA  x. @LeadVelocitySA  li. lead-velocity

─────────────────────────────────────
`;

    return signature;
};

/**
 * Generates an HTML email signature for use in rich email content
 * (e.g., when sending emails via an API that supports HTML)
 */
export const getHtmlEmailSignature = (details?: SignatureDetails): string => {
    const senderName = details?.senderName || "The Lead Velocity Team";
    const senderTitle = details?.senderTitle || "Business Development";
    const logoUrl = "https://leadvelocity.co.za/logo.png"; // Replace with actual hosted logo URL

    return `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 12px; color: #333333; margin-top: 20px;">
  <tr>
    <td style="padding-right: 15px; border-right: 2px solid #D946EF; vertical-align: top;">
      <img src="${logoUrl}" alt="Lead Velocity" width="120" style="display: block;" />
    </td>
    <td style="padding-left: 15px; vertical-align: top;">
      <p style="margin: 0 0 2px 0; font-size: 14px; font-weight: bold; color: #D946EF;">${senderName}</p>
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #666666;">${senderTitle} | Lead Velocity</p>
      <p style="margin: 0 0 2px 0; font-size: 12px; color: #333333;">
        <strong>T.</strong> <a href="tel:+27109765618" style="color: #D946EF; text-decoration: none;">+27 10 976 5618</a>
      </p>
      <p style="margin: 0 0 2px 0; font-size: 11px; color: #666666;">
        210 Amarand Avenue, Pegasus Building 1<br/>
        Menlyn Maine, Pretoria, 0184
      </p>
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #333333;">
        <strong>E.</strong> <a href="mailto:howzit@leadvelocity.co.za" style="color: #D946EF; text-decoration: none;">howzit@leadvelocity.co.za</a> | 
        <a href="https://leadvelocity.co.za" style="color: #D946EF; text-decoration: none;">leadvelocity.co.za</a>
      </p>
      <p style="margin: 0; font-size: 11px; color: #999999;">
        <strong>f.</strong> <a href="https://facebook.com/LeadVelocitySA" style="color: #999999; text-decoration: none;">LeadVelocitySA</a> 
        <strong>x.</strong> <a href="https://x.com/LeadVelocitySA" style="color: #999999; text-decoration: none;">@LeadVelocitySA</a> 
        <strong>li.</strong> <a href="https://linkedin.com/company/lead-velocity" style="color: #999999; text-decoration: none;">lead-velocity</a>
      </p>
    </td>
  </tr>
</table>
  `;
};

/**
 * Contract-specific signature - more formal
 */
export const getContractEmailSignature = (): string => {
    return getEmailSignature({
        senderName: "Lead Velocity Team",
        senderTitle: "Client Services"
    });
};

/**
 * Invoice-specific signature - accounts focused
 */
export const getInvoiceEmailSignature = (): string => {
    return getEmailSignature({
        senderName: "Lead Velocity Accounts",
        senderTitle: "Finance Department"
    });
};

/**
 * Proposal-specific signature - sales focused  
 */
export const getProposalEmailSignature = (): string => {
    return getEmailSignature({
        senderName: "Lead Velocity Team",
        senderTitle: "Business Development"
    });
};

export default getEmailSignature;
