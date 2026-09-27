const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const statusLabel = value => String(value || 'Updated').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export function notificationTemplate({ type, data = {}, portalName = 'Municipality of Getafe', portalUrl = '' }) {
  const name = String(data.name || 'there').trim();
  const service = String(data.serviceName || data.service || 'Municipal service').trim();
  const reference = String(data.reference || '').trim();
  const status = statusLabel(data.status);
  const subject = type.startsWith('announcement.')
    ? `Important municipal notice · ${service}`
    : type.startsWith('event.')
      ? `Municipal event update · ${service}`
      : type.startsWith('account.')
        ? `Account update · ${service}`
        : type.startsWith('appointment.')
    ? `Appointment update · ${service}`
    : type.startsWith('document.')
      ? `Document update · ${service}`
      : type.startsWith('payment.')
        ? `Payment update · ${service}`
        : `Request update · ${service}`;
  const heading = type === 'request.created' ? 'Request received' : type.startsWith('announcement.') ? 'Important municipal notice' : type.startsWith('event.') ? 'Municipal event update' : type.startsWith('account.') ? 'Account update' : type.startsWith('appointment.') ? 'Appointment update' : type.startsWith('document.') ? 'Document update' : type.startsWith('payment.') ? 'Payment update' : 'Request update';
  const message = type === 'request.created'
    ? `Your ${service} request was submitted successfully.`
    : type === 'document.ready'
      ? `Your document for ${service} is ready to view securely in the portal.`
    : type.startsWith('announcement.')
      ? `There is an important municipal notice for you.`
      : type.startsWith('event.')
        ? `There is an update to a municipal event or public meeting.`
        : type.startsWith('account.')
          ? `There is an update to your Municipality of Getafe account.`
          : type.startsWith('appointment.')
      ? `There is an update to your ${service} appointment.`
        : type.startsWith('payment.')
          ? `There is an update to your ${service} payment.`
          : `There is an update to your ${service} request.`;
  const path = data.applicationId ? `/app/requests/${encodeURIComponent(data.applicationId)}` : data.appointmentId ? `/app/appointments` : data.documentId ? `/app/documents?document=${encodeURIComponent(data.documentId)}` : '/app/notifications';
  const link = portalUrl ? `${portalUrl.replace(/\/+$/, '')}${path}` : '';
  const details = [
    ['Service', service],
    reference ? ['Reference', reference] : null,
    data.status ? ['Status', status] : null,
    data.appointmentAt ? ['Date and time', data.appointmentAt] : null,
    data.location ? ['Location', data.location] : null,
    data.amount ? ['Amount', data.amount] : null,
  ].filter(Boolean);
  const text = [
    portalName,
    'Official Portal',
    '',
    heading,
    '',
    `Hello ${name},`,
    '',
    message,
    '',
    ...details.flatMap(([label, value]) => [label, String(value), '']),
    link ? `View this update: ${link}` : 'Sign in to your Municipality of Getafe account to view this update.',
    '',
    'This is an automated notification from the Municipality of Getafe Official Portal.',
  ].join('\n');
  const detailHtml = details.map(([label, value]) => `<tr><td style="padding:7px 0;color:#5f7185;font-weight:700">${escapeHtml(label)}</td><td style="padding:7px 0;color:#17324d">${escapeHtml(value)}</td></tr>`).join('');
  const action = link ? `<p style="margin:25px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 17px;border-radius:7px;background:#1769ad;color:#fff;text-decoration:none;font-weight:700">View update</a></p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f8fb;font-family:Arial,sans-serif;color:#17324d"><div style="max-width:600px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #dce7f2;border-radius:12px;padding:28px"><p style="margin:0 0 4px;color:#1769ad;font-weight:700">${escapeHtml(portalName)}</p><p style="margin:0 0 24px;color:#617894;font-size:13px">Official Portal</p><h1 style="font-size:22px;margin:0 0 18px">${escapeHtml(heading)}</h1><p>Hello ${escapeHtml(name)},</p><p style="line-height:1.6">${escapeHtml(message)}</p><table style="width:100%;border-collapse:collapse;margin-top:18px">${detailHtml}</table>${action}</div><p style="padding:0 8px;color:#617894;font-size:12px;line-height:1.5">Municipality of Getafe · Getafe, Bohol<br>This is an automated notification from the Municipality of Getafe Official Portal.</p></div></body></html>`;
  return { subject, text, html };
}
