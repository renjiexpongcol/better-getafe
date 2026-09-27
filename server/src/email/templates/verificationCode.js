function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const purposeContent = {
  login: { title: 'Your verification code', subject: 'Your Municipality of Getafe verification code', intro: 'Use the following code to continue signing in to your Municipality of Getafe Citizen Portal account.' },
  'google-onboarding': { title: 'Verify your email address', subject: 'Verify your Municipality of Getafe email address', intro: 'Use the following code to verify your email address for your Municipality of Getafe Citizen Portal account.' },
  'password-reset': { title: 'Reset your password', subject: 'Your Municipality of Getafe password reset code', intro: 'Use the following code to continue resetting the password for your Municipality of Getafe Citizen Portal account.' },
  'mfa-disable': { title: 'Confirm security change', subject: 'Confirm your Municipality of Getafe security change', intro: 'Use the following code to confirm your request to disable email sign-in verification for your Municipality of Getafe Citizen Portal account.' },
};

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch { return false; }
}

export function verificationCodeEmail({ code, expiresInMinutes = 10, purpose = 'login', portalName = 'Municipality of Getafe', siteUrl, logoUrl }) {
  const content = purposeContent[purpose] || purposeContent.login;
  const safeCode = escapeHtml(code);
  const safePortalName = escapeHtml(portalName);
  const safeExpires = escapeHtml(expiresInMinutes);
  const displayCode = String(code).length === 6
    ? `${escapeHtml(String(code).slice(0, 3))}<span style="display:inline-block;margin-left:10px">${escapeHtml(String(code).slice(3))}</span>`
    : escapeHtml(code);
  const safeSite = isPublicHttpsUrl(siteUrl) ? escapeHtml(siteUrl) : '';
  const safeLogo = isPublicHttpsUrl(logoUrl) ? escapeHtml(logoUrl) : '';
  const logo = safeLogo ? `<img src="${safeLogo}" width="48" height="48" alt="Municipality of Getafe logo" style="display:block;width:48px;height:48px;object-fit:contain;margin:0 auto 12px">` : '';
  const year = new Date().getFullYear();
  const text = `${portalName}\nCitizen Portal\n\n${content.title}\n\n${content.intro}\n\nYour verification code is: ${code}\n\nThis verification code expires in ${expiresInMinutes} minutes.\n\nFor your security, never share this code with anyone. Municipality of Getafe staff will never ask you for your verification code.\n\nIf you did not request this code, you can safely ignore this message.\n\nMunicipality of Getafe\nProvince of Bohol, Philippines\n\nGetafe Citizen Portal\n\nThis is an automated security message. Please do not reply to this email.\n\n© ${year} Municipality of Getafe`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f3f6f8;color:#243746;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f6f8"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe3e8;border-radius:10px;overflow:hidden"><tr><td align="center" style="padding:26px 24px;background:#123c67;color:#ffffff">${logo}<div style="font-size:18px;line-height:1.35;font-weight:bold">Municipality of Getafe</div><div style="font-size:14px;line-height:1.5;color:#e5edf5">Citizen Portal</div></td></tr><tr><td style="padding:32px 30px 28px"><h1 style="margin:0 0 18px;color:#18334e;font-size:24px;line-height:1.3;text-align:center">${escapeHtml(content.title)}</h1><p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#344b5e">${escapeHtml(content.intro)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background:#f7f9fb;border:1px solid #dce5eb;border-radius:8px"><tr><td align="center" style="padding:20px 12px"><div aria-label="Verification code ${safeCode}" style="font-size:34px;line-height:1.3;font-weight:bold;letter-spacing:7px;color:#123c67;font-family:Arial,Helvetica,sans-serif">${displayCode}</div></td></tr></table><p style="margin:0 0 20px;text-align:center;font-size:15px;line-height:1.5;color:#344b5e">This verification code expires in ${safeExpires} minutes.</p><p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#344b5e"><strong>For your security, never share this code with anyone.</strong> Municipality of Getafe staff will never ask you for your verification code.</p><p style="margin:0;font-size:14px;line-height:1.65;color:#526779">If you did not request this code, you can safely ignore this email.</p></td></tr><tr><td style="padding:20px 30px;border-top:1px solid #e1e7eb;color:#526779;text-align:center;font-size:13px;line-height:1.7"><strong style="color:#243746">Municipality of Getafe</strong><br>Province of Bohol, Philippines<br><span style="color:#123c67">Getafe Citizen Portal</span><br><br>This is an automated security message.<br>Please do not reply to this email.<br><br>© ${year} Municipality of Getafe${safeSite ? `<br><a href="${safeSite}" style="color:#526779;text-decoration:underline">Visit the Citizen Portal</a>` : ''}</td></tr></table></td></tr></table></body></html>`;
  return { subject: content.subject, text, html };
}
