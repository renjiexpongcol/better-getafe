function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch { return false; }
}

export function newsletterWelcomeEmail({ unsubscribeUrl, portalName = 'Municipality of Getafe', logoUrl }) {
  const safePortalName = escapeHtml(portalName);
  const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);
  const safeLogoUrl = isPublicHttpsUrl(logoUrl) ? escapeHtml(logoUrl) : '';
  const logo = safeLogoUrl
    ? `<img src="${safeLogoUrl}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:contain;margin:0 auto 12px">`
    : '';
  const subject = 'You’re subscribed to Getafe updates';
  const text = `${portalName}\nGetafe Citizen Portal\n\nYou’re subscribed to Getafe updates\n\nThanks for subscribing. You’ll receive local news, community events, and municipal service updates from Getafe.\n\nUnsubscribe from Getafe updates: ${unsubscribeUrl}\n\n${portalName} · Province of Bohol, Philippines`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f1f5f9;color:#172b45;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">You’re subscribed to Getafe updates.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fff;border:1px solid #dce5ee;border-radius:16px;overflow:hidden"><tr><td align="center" style="padding:26px 24px 24px;background:#12375d;color:#fff">${logo}<div style="font-size:12px;line-height:1.5;letter-spacing:1.2px;text-transform:uppercase;color:#d5e5f4">Official Citizen Portal</div><div style="margin-top:5px;font-size:20px;line-height:1.35;font-weight:700">${safePortalName}</div></td></tr><tr><td style="padding:34px"><div style="width:48px;height:4px;margin:0 auto 20px;border-radius:4px;background:#1c8065"></div><h1 style="margin:0 0 16px;text-align:center;color:#172b45;font-size:25px;line-height:1.25">You’re subscribed to Getafe updates</h1><p style="margin:0;color:#53677d;font-size:15px;line-height:1.7">Thanks for subscribing. We’ll send you local news, community events, and municipal service updates from Getafe.</p></td></tr><tr><td align="center" style="padding:19px 24px;border-top:1px solid #e6edf3;color:#718198;font-size:12px;line-height:1.7">${safePortalName} · Province of Bohol, Philippines<br>To stop receiving these messages, <a href="${safeUnsubscribeUrl}" style="color:#185b91;text-decoration:underline">unsubscribe from Getafe updates</a>.<br><span style="color:#8a99a9">This is an automated message. Please do not reply.</span></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
