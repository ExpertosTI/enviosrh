import { ThemeToggle } from '../../components/ThemeToggle';
import {
  IconPackage,
  IconMotorbike,
  IconUser
} from '../../components/Icons';

export function FeaturesIndex() {
  const sections = [
    {
      title: "Panel del Operador",
      icon: <IconPackage size={22} color="#5b8af9" />,
      color: "border-[#5b8af9]/30 text-[#5b8af9]",
      items: [
        { name: "Creación de Envíos", desc: "Registro con dirección, referencia, número de cliente, productos y monto total." },
        { name: "Trazado de Ruta Inteligente", desc: "Cálculo en vivo de distancias, ruta y tiempos estimados OSRM en el mapa." },
        { name: "Asignación de Mensajeros", desc: "Asignación rápida de repartidores activos a los pedidos en borrador." },
        { name: "Compartir en WhatsApp", desc: "Enlaces generados dinámicamente con plantillas listas para enviar al cliente o mensajero." },
        { name: "Superadministración", desc: "Gestión completa de usuarios (operadores y mensajeros) para aprobarlos, editarlos o darlos de baja." },
        { name: "Logins Simplificados", desc: "Soporte para nombres de usuario planos para inicio de sesión seguro sin necesidad de correos." }
      ]
    },
    {
      title: "Portal del Mensajero",
      icon: <IconMotorbike size={22} color="#f59e0b" />,
      color: "border-[#f59e0b]/30 text-[#f59e0b]",
      items: [
        { name: "Módulo en Tiempo Real (Logística)", desc: "Organización de pedidos por estados: En camino, Por entregar y Entregados." },
        { name: "GPS en Segundo Plano Constante", desc: "Rastreo ininterrumpido en móviles Android (APK) con notificaciones persistentes." },
        { name: "Navegación Asistida Nativa", desc: "Accesos directos para abrir las direcciones en Google Maps o Waze." },
        { name: "Chat con el Cliente", desc: "Burbujas de mensajería directa en vivo con actualizaciones automatizadas (3s)." },
        { name: "Prueba de Entrega Digital (POD)", desc: "Validación mediante firma táctil interactiva y captura fotográfica de entrega." }
      ]
    },
    {
      title: "Portal del Cliente",
      icon: <IconUser size={22} color="#22c55e" />,
      color: "border-[#22c55e]/30 text-[#22c55e]",
      items: [
        { name: "Rastreo en Vivo", desc: "Mapa interactivo con el recorrido exacto y ETA del repartidor." },
        { name: "Alertas de Proximidad", desc: "Notificaciones visuales y pitidos de Web Audio al estar a menos de 200m." },
        { name: "Chat con el Repartidor", desc: "Canal directo para coordinar detalles de la entrega en tiempo real." },
        { name: "Confirmación y Rating", desc: "Confirmación de recepción y sistema de evaluación de estrellas del servicio." }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#0b0b14] text-[#e8e8f4] flex flex-col font-sans selection:bg-[#5b8af9]/30">
      {/* Header */}
      <header className="bg-[#13131f]/95 backdrop-blur-md border-b border-[#252540] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#5b8af9]/20 flex items-center justify-center border border-[#5b8af9]/40">
            <IconPackage size={20} color="#5b8af9" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white leading-none">EnvíosRH</h1>
            <span className="text-[10px] text-[#6b6b8a] uppercase font-bold tracking-wider">Index de Funcionalidades</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Hero Banner */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 flex flex-col gap-10">
        <div className="text-center max-w-2xl mx-auto flex flex-col gap-3">
          <div className="inline-flex self-center px-3 py-1 rounded-full bg-[#5b8af9]/10 border border-[#5b8af9]/20 text-[10px] font-extrabold text-[#5b8af9] uppercase tracking-wider">
            Versión Actualizada
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight tracking-tight">
            Gestión de Envíos & Rastreo Satelital en Tiempo Real
          </h2>
          <p className="text-xs sm:text-sm text-[#6b6b8a] leading-relaxed">
            Consola unificada que integra administración inteligente, geolocalización ininterrumpida en primer plano para APK Android y comunicación directa.
          </p>
        </div>

        {/* Grid de Secciones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sections.map((sec, idx) => (
            <div key={idx} className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 flex flex-col gap-4 shadow-xl hover:border-[#5b8af9]/30 transition-all duration-300">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#252540]">
                {sec.icon}
                <h3 className="font-bold text-sm text-white">{sec.title}</h3>
              </div>
              <ul className="flex flex-col gap-4">
                {sec.items.map((item, keyIdx) => (
                  <li key={keyIdx} className="flex flex-col gap-1 group">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5b8af9]/40 group-hover:bg-[#5b8af9] transition-colors" />
                      <h4 className="font-bold text-xs text-[#e8e8f4] group-hover:text-white transition-colors">{item.name}</h4>
                    </div>
                    <p className="text-[11px] text-[#6b6b8a] pl-3.5 leading-relaxed">{item.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-6 border-t border-[#252540] bg-[#13131f] text-center">
        <p className="text-[10px] text-[#6b6b8a] font-medium">
          © {new Date().getFullYear()} EnvíosRH. Desplegado y sincronizado en <span className="text-[#5b8af9]">renace.tech/enviosapp</span>.
        </p>
      </footer>
    </div>
  );
}
