import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: {
    user: process.env.SMTP_USER ?? 'info@renace.tech',
    pass: process.env.SMTP_PASS ?? 'JustWork2027@',
  },
});

const appUrl = () => process.env.APP_URL ?? 'https://enviosrh.renace.tech';
const companyName = () => process.env.COMPANY_NAME ?? 'EnvíosRH';

/**
 * Envía un correo al cliente con su enlace de seguimiento
 */
export async function sendCustomerTrackingEmail(
  to: string,
  customerName: string,
  customerToken: string,
  details: { address: string }
) {
  const trackingLink = `${appUrl()}/tracking/${customerToken}`;
  const mailOptions = {
    from: `"${process.env.COMPANY_NAME ?? 'EnvíosRH'}" <${process.env.SMTP_USER ?? 'info@renace.tech'}>`,
    to,
    subject: `Tu pedido de ${companyName()} está listo / en camino`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #252540; border-radius: 12px; background-color: #13131f; color: #e8e8f4;">
        <h2 style="color: #5b8af9; border-bottom: 1px solid #252540; padding-bottom: 10px;">¡Hola, ${customerName}!</h2>
        <p>Tu envío en <strong>${companyName()}</strong> ya está registrado y listo para entrega.</p>
        <div style="background-color: #0b0b14; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #252540;">
          <p style="margin: 0; font-size: 14px;"><strong>Dirección de Entrega:</strong></p>
          <p style="margin: 5px 0 0 0; color: #6b6b8a; font-size: 13px;">${details.address}</p>
        </div>
        <p>Puedes seguir el estado de tu mensajero y ver su ubicación en tiempo real en nuestro portal de seguimiento:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingLink}" style="background-color: #5b8af9; color: #0b0b14; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block;">Seguir Envío en Vivo</a>
        </div>
        <p style="color: #6b6b8a; font-size: 11px; margin-top: 30px; border-top: 1px solid #252540; padding-top: 10px;">
          Este correo es automático. Por favor no respondas a este mensaje.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Correo de seguimiento enviado a cliente: ${to}`);
  } catch (error) {
    console.error(`[Email] Error enviando correo a cliente ${to}:`, error);
  }
}

/**
 * Envía un correo al mensajero con los detalles de la entrega asignada
 */
export async function sendMessengerAssignmentEmail(
  to: string,
  messengerName: string,
  messengerToken: string,
  details: { customerName: string; address: string; fee: number }
) {
  const portalLink = `${appUrl()}/m-portal/${messengerToken}`;
  const mailOptions = {
    from: `"${process.env.COMPANY_NAME ?? 'EnvíosRH'}" <${process.env.SMTP_USER ?? 'info@renace.tech'}>`,
    to,
    subject: `🛵 Nuevo envío asignado - ${details.customerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #252540; border-radius: 12px; background-color: #13131f; color: #e8e8f4;">
        <h2 style="color: #f59e0b; border-bottom: 1px solid #252540; padding-bottom: 10px;">¡Hola, ${messengerName}!</h2>
        <p>Se te ha asignado un nuevo envío para realizar.</p>
        <div style="background-color: #0b0b14; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #252540; font-size: 13px;">
          <p style="margin: 0 0 8px 0;"><strong>Cliente:</strong> ${details.customerName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Dirección:</strong> ${details.address}</p>
          <p style="margin: 0;"><strong>Cargo por envío:</strong> ${details.fee > 0 ? `RD$ ${details.fee.toFixed(2)}` : 'Sin cargo'}</p>
        </div>
        <p>Por favor abre el portal del mensajero en tu móvil para navegar hacia el destino, reportar tu ubicación GPS y marcar la entrega:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${portalLink}" style="background-color: #f59e0b; color: #0b0b14; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block;">Abrir Portal de Entrega</a>
        </div>
        <p style="color: #6b6b8a; font-size: 11px; margin-top: 30px; border-top: 1px solid #252540; padding-top: 10px;">
          Este correo es automático. Por favor no respondas a este mensaje.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Correo de asignación enviado a mensajero: ${to}`);
  } catch (error) {
    console.error(`[Email] Error enviando correo a mensajero ${to}:`, error);
  }
}

/**
 * Envía alertas operativas al correo de administración (info@renace.tech)
 */
export async function sendOperatorAlertEmail(subject: string, text: string) {
  const mailOptions = {
    from: `"Alertas ${process.env.COMPANY_NAME ?? 'EnvíosRH'}" <${process.env.SMTP_USER ?? 'info@renace.tech'}>`,
    to: process.env.SMTP_ALERT_TO ?? process.env.SMTP_USER ?? 'info@renace.tech',
    subject: `[Alerta] ${subject}`,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Alerta administrativa enviada a info@renace.tech`);
  } catch (error) {
    console.error(`[Email] Error enviando alerta administrativa:`, error);
  }
}
