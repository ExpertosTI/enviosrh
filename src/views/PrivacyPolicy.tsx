import { PageHeader } from '../components/AppShell';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0b0b14] text-[#e8e8f4] flex flex-col">
      <PageHeader title="Política de Privacidad" back="/login" />
      <div className="flex-1 overflow-y-auto p-6 md:p-12 max-w-3xl mx-auto space-y-8 leading-relaxed">
        <section className="space-y-3">
          <h1 className="text-2xl font-black text-[#5b8af9]">Política de Privacidad - EnvíosRH</h1>
          <p className="text-xs text-[#6b6b8a] font-bold uppercase tracking-widest">Última actualización: 26 de junio de 2026</p>
          <p className="text-sm">
            <strong>Renace.tech</strong> ("nosotros", "nuestro" o "la Empresa") opera la aplicación móvil <strong>EnvíosRH</strong>.
            Esta página le informa sobre nuestras políticas con respecto a la recopilación, el uso y la divulgación de datos personales cuando utiliza nuestra Aplicación.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-[#e8e8f4] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5b8af9]" /> 1. Recopilación de Información y Uso
          </h2>
          <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 space-y-4 text-sm">
            <div className="space-y-1">
              <p className="font-bold text-[#5b8af9]">Ubicación en Tiempo Real (GPS):</p>
              <p className="text-[#6b6b8a]">
                Recopilamos datos de su ubicación precisa para permitir el rastreo de envíos en tiempo real por parte de los clientes y operadores.
                <span className="text-[#e8e8f4] font-medium"> Esta recopilación ocurre incluso cuando la aplicación está cerrada o en segundo plano</span> si el mensajero tiene un envío activo.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-[#5b8af9]">Cámara y Firma:</p>
              <p className="text-[#6b6b8a]">Solicitamos acceso a la cámara para fotos de entrega y recopilamos la firma digital del cliente como confirmación legal de recepción.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-[#e8e8f4] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5b8af9]" /> 2. Uso y Seguridad de los Datos
          </h2>
          <p className="text-sm text-[#6b6b8a]">
            Los datos se utilizan exclusivamente para gestionar la logística, notificar a los clientes y generar comprobantes.
            No compartimos información con terceros ajenos a la operación técnica del servicio.
          </p>
          <div className="p-4 bg-[#2a0a0a]/30 border border-[#ef4444]/20 rounded-xl">
            <p className="text-xs text-[#ef4444] font-medium">La seguridad de sus datos es nuestra prioridad. Implementamos protocolos de cifrado para toda la transmisión de información.</p>
          </div>
        </section>

        <footer className="pt-8 border-t border-[#252540] text-center">
          <p className="text-xs text-[#6b6b8a]">© 2026 Renace.tech · República Dominicana</p>
        </footer>
      </div>
    </div>
  );
}
