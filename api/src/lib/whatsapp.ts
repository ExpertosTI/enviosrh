/** Genera los mensajes de WhatsApp listos para copiar/enviar */

const appUrl = () => process.env.APP_URL ?? 'https://enviosrh.renace.tech';
const company = () => process.env.COMPANY_NAME ?? 'Empresa';

export function messengerMessage(opts: {
  messengerName: string;
  customerName: string;
  address: string;
  locationLink: string | null;
  deliveryFee: number;
  messengerToken: string;
}) {
  const feeLabel = opts.deliveryFee > 0
    ? `RD$ ${opts.deliveryFee.toFixed(2)}`
    : 'Sin cargo';

  const nav = opts.locationLink ?? `${appUrl()}/p/m/${opts.messengerToken}`;

  return (
    `🛵 Hola ${opts.messengerName}, tienes un nuevo envío.\n` +
    `👤 Cliente: ${opts.customerName}\n` +
    `📍 Dirección: ${opts.address ?? 'Ver link'}\n` +
    `💰 Cargo envío: ${feeLabel}\n` +
    `✅ Confirmar entrega: ${appUrl()}/p/m/${opts.messengerToken}\n` +
    (opts.locationLink ? `🗺 Navegación: ${opts.locationLink}` : '')
  ).trim();
}

export function customerMessage(opts: {
  customerName: string;
  customerToken: string;
}) {
  return (
    `Hola ${opts.customerName}, tu pedido de ${company()} está en camino. ` +
    `Sigue el estado aquí: ${appUrl()}/p/c/${opts.customerToken}`
  );
}

export function waLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '');
  const normalized = clean.length === 10 ? `1${clean}` : clean;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
