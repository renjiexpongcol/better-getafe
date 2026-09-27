function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function contactAcknowledgementTemplate({ recipientName, referenceNumber, category, subject, submittedAt, portalName, logoUrl }) {
  const safeName = escapeHtml(recipientName);
  const safeReference = escapeHtml(referenceNumber);
  const safeCategory = escapeHtml(category);
  const safeSubject = escapeHtml(subject);
  const safeDate = escapeHtml(submittedAt);
  const safePortalName = escapeHtml(portalName);
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safePortalName} seal or logo" width="64" style="display:block;width:64px;height:64px;object-fit:contain;margin:0 auto 14px">`
    : '';

  const text = `${portalName}\n\nWe received your message\n\nDear ${recipientName},\n\nThank you for contacting the Municipality of Getafe. Your message has been successfully received. Our team will review your inquiry and respond through the contact information you provided when appropriate.\n\nReference number: ${referenceNumber}\nCategory: ${category}\nSubject: ${subject}\nSubmitted: ${submittedAt}\n\nPlease keep your reference number for future inquiries regarding this message.\n\nThis is an automated acknowledgement confirming that your message was received. Please do not reply to this email unless replies are supported by the configured mailbox.\n\n${portalName}\nOfficial Portal`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f7fb;color:#18334e;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7fb;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #dce6ef;border-radius:14px;overflow:hidden"><tr><td style="background:#123c67;padding:28px 24px;text-align:center;color:#fff">${logo}<div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.85">${safePortalName}</div><h1 style="margin:10px 0 0;font-size:25px;line-height:1.2">We received your message</h1></td></tr><tr><td style="padding:30px 26px"><p style="margin:0 0 16px;font-size:16px">Dear ${safeName},</p><p style="margin:0 0 22px;color:#58718a;line-height:1.6">Thank you for contacting the Municipality of Getafe. Your message has been successfully received. Our team will review your inquiry and respond through the contact information you provided when appropriate.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7fbff;border:1px solid #dce8f2;border-radius:10px"><tr><td style="padding:18px"><p style="margin:0 0 12px;font-size:12px;color:#6c849a;text-transform:uppercase;letter-spacing:.8px;font-weight:bold">Submission details</p><p style="margin:8px 0"><strong>Reference number:</strong><br><span style="font-family:monospace;color:#123c67">${safeReference}</span></p><p style="margin:8px 0"><strong>Category:</strong><br>${safeCategory}</p><p style="margin:8px 0"><strong>Subject:</strong><br>${safeSubject}</p><p style="margin:8px 0 0"><strong>Submitted:</strong><br>${safeDate}</p></td></tr></table><p style="margin:24px 0 0;color:#58718a;line-height:1.6">Please keep your reference number for future inquiries regarding this message.</p></td></tr><tr><td style="border-top:1px solid #e5edf4;padding:18px 26px;color:#667e94;font-size:12px;line-height:1.6">This is an automated acknowledgement from the ${safePortalName} Official Portal. Please do not reply unless replies are supported by the configured mailbox.</td></tr></table><p style="margin:16px 0 0;color:#8194a5;font-size:11px">${safePortalName} · Official Portal</p></td></tr></table></body></html>`;
  return { text, html };
}
