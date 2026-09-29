import React, { useState, useEffect, useId } from 'react';
import * as signalR from '@microsoft/signalr';
import axios from 'axios';
import { 
  Dumbbell, 
  Users, 
  UserPlus, 
  Phone, 
  CreditCard, 
  User, 
  Trash2, 
  Calendar, 
  Activity, 
  Wifi, 
  WifiOff, 
  Search, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

// URLs de producción configuradas en variables de entorno Vite
const API_URL = import.meta.env.VITE_API_URL || 'https://backendgym-3lrf.onrender.com/api/miembros';
const WS_URL = import.meta.env.VITE_WS_URL || 'https://backendgym-3lrf.onrender.com/ws/gimnasio';

export default function App() {
  // Estado principal
  const [miembros, setMiembros] = useState([]);
  const [totalInscritos, setTotalInscritos] = useState(0);
  
  // Estado del formulario
  const [formData, setFormData] = useState({
    dpi: '',
    nombreCompleto: '',
    telefono: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Búsqueda y filtrado local
  const [searchTerm, setSearchTerm] = useState('');

  // Estado de conexión SignalR
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected' | 'connecting' | 'disconnected'
  
  // Estado de mensajes de alerta/notificación
  const [toast, setToast] = useState(null); // { type: 'success' | 'error' | 'info', message: '' }
  
  // Estado de acción por fila (cargando al cancelar)
  const [cancellingId, setCancellingId] = useState(null);

  // Helper para mostrar mensajes temporales
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Cargar lista inicial de la base de datos vía HTTP REST
  const fetchMiembrosInicial = async () => {
    try {
      const response = await axios.get(API_URL);
      if (response.data) {
        if (Array.isArray(response.data)) {
          // Si devuelve directamente el array de miembros
          setMiembros(response.data);
          const activos = response.data.filter(m => m.activo ?? true).length;
          setTotalInscritos(activos);
        } else if (response.data.miembros) {
          // Si devuelve un objeto con { miembros, totalInscritos }
          setMiembros(response.data.miembros || []);
          setTotalInscritos(response.data.totalInscritos ?? (response.data.miembros?.length || 0));
        }
      }
    } catch (error) {
      console.warn('Esperando datos iniciales desde SignalR o endpoint:', error.message);
    }
  };

  // Configuración de SignalR en tiempo real
  useEffect(() => {
    // Consulta inicial vía REST
    fetchMiembrosInicial();

    // Iniciar conexión SignalR
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(WS_URL, {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Escuchar el evento "ActualizarLista" emitido por el backend
    connection.on('ActualizarLista', (datos) => {
      console.log('Evento ActualizarLista recibido:', datos);
      if (datos) {
        if (typeof datos.totalInscritos === 'number') {
          setTotalInscritos(datos.totalInscritos);
        } else if (Array.isArray(datos.miembros)) {
          const countActivos = datos.miembros.filter(m => (m.activo ?? true)).length;
          setTotalInscritos(countActivos);
        }

        if (Array.isArray(datos.miembros)) {
          setMiembros(datos.miembros);
        } else if (Array.isArray(datos)) {
          setMiembros(datos);
          setTotalInscritos(datos.filter(m => (m.activo ?? true)).length);
        }
      }
    });

    // Manejar estados de la conexión
    connection.onreconnecting(() => {
      setConnectionStatus('connecting');
    });

    connection.onreconnected(() => {
      setConnectionStatus('connected');
      fetchMiembrosInicial();
    });

    connection.onclose(() => {
      setConnectionStatus('disconnected');
    });

    // Iniciar conexión
    async function startSignalR() {
      try {
        await connection.start();
        setConnectionStatus('connected');
        console.log('Conexión con SignalR establecida exitosamente.');
      } catch (err) {
        console.error('Error al conectar con SignalR:', err);
        setConnectionStatus('disconnected');
        // Reintentar en 5 segundos si falla el arranque inicial
        setTimeout(startSignalR, 5000);
      }
    }

    startSignalR();

    return () => {
      connection.stop();
    };
  }, []);

  // Manejador del Formulario de Inscripción
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.dpi.trim() || !formData.nombreCompleto.trim() || !formData.telefono.trim()) {
      showToast('Por favor completa todos los campos requeridos.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        dpi: formData.dpi.trim(),
        nombreCompleto: formData.nombreCompleto.trim(),
        telefono: formData.telefono.trim()
      };

      await axios.post(`${API_URL}/inscribir`, payload);
      showToast(`¡Miembro "${formData.nombreCompleto}" registrado exitosamente!`, 'success');
      
      // Limpiar formulario tras éxito
      setFormData({
        dpi: '',
        nombreCompleto: '',
        telefono: ''
      });

      // Recarga de respaldo por si el socket tiene latencia
      setTimeout(fetchMiembrosInicial, 800);
    } catch (error) {
      console.error('Error al inscribir miembro:', error);
      const serverMsg = error.response?.data?.message || error.response?.data || error.message;
      showToast(`Error al inscribir: ${typeof serverMsg === 'string' ? serverMsg : 'Revisa los datos ingresados.'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejador de Cancelación de Membresía
  const handleCancelar = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de cancelar la membresía de ${nombre || 'este miembro'}?`)) {
      return;
    }

    setCancellingId(id);
    try {
      await axios.put(`${API_URL}/cancelar/${id}`);
      showToast(`Membresía cancelada correctamente.`, 'info');
      // Recarga de respaldo por si el socket tarda en propagar
      setTimeout(fetchMiembrosInicial, 800);
    } catch (error) {
      console.error('Error al cancelar miembro:', error);
      const serverMsg = error.response?.data?.message || error.response?.data || error.message;
      showToast(`Error al cancelar: ${typeof serverMsg === 'string' ? serverMsg : 'No se pudo procesar la solicitud.'}`, 'error');
    } finally {
      setCancellingId(null);
    }
  };

  // Helper para formatear fecha de forma robusta
  const formatFecha = (fechaRaw) => {
    if (!fechaRaw) return 'Reciente';
    try {
      const dateObj = new Date(fechaRaw);
      if (isValid(dateObj)) {
        return format(dateObj, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
      }
    } catch {
      // Ignora error de parseo y usa fallback
    }
    return String(fechaRaw);
  };

  // Filtrado de miembros activos y por búsqueda
  const miembrosActivos = miembros.filter(m => (m.activo ?? true));
  const miembrosFiltrados = miembrosActivos.filter(m => {
    const dpi = (m.dpi || m.Dpi || '').toLowerCase();
    const nombre = (m.nombreCompleto || m.nombre || m.NombreCompleto || '').toLowerCase();
    const tel = (m.telefono || m.Telefono || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return dpi.includes(term) || nombre.includes(term) || tel.includes(term);
  });

  return (
    <div className="min-h-screen bg-[#090a0f] text-neutral-100 flex flex-col font-sans selection:bg-green-500 selection:text-black">
      {/* Background Glow Accents */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-10 w-[450px] h-[450px] bg-emerald-600/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/20 text-black">
              <Dumbbell className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-wider text-white font-['Outfit']">
                  GYM <span className="text-green-400">PRO</span> CONTROL
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 hidden sm:inline-block">
                  Live System
                </span>
              </div>
              <p className="text-xs text-neutral-400">Gestión de membresías e inscripciones en tiempo real</p>
            </div>
          </div>

          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800">
            {connectionStatus === 'connected' ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-xs font-semibold text-green-400 hidden sm:inline">SignalR Activo</span>
              </>
            ) : connectionStatus === 'connecting' ? (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
                <Activity className="w-4 h-4 text-yellow-400 animate-spin" />
                <span className="text-xs font-medium text-yellow-400 hidden sm:inline">Conectando...</span>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-xs font-medium text-red-400 hidden sm:inline">Desconectado</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        
        {/* Toast Notification Alert */}
        {toast && (
          <div className={`p-4 rounded-xl flex items-center justify-between gap-3 border shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success' 
              ? 'bg-green-950/80 border-green-500/40 text-green-200' 
              : toast.type === 'error'
              ? 'bg-red-950/80 border-red-500/40 text-red-200'
              : 'bg-neutral-900/90 border-neutral-700 text-neutral-200'
          }`}>
            <div className="flex items-center gap-3">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              ) : (
                <Activity className="w-5 h-5 text-neutral-400 shrink-0" />
              )}
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button 
              onClick={() => setToast(null)}
              className="text-xs opacity-70 hover:opacity-100 transition-opacity uppercase font-bold"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Sección Superior: Tarjeta Destacada de Estadísticas */}
        <section>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-neutral-900/90 to-neutral-950/90 border-2 border-green-500/40 shadow-[0_0_50px_-12px_rgba(34,197,94,0.25)] p-6 sm:p-8">
            {/* Glow decorativo de fondo */}
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-green-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10 hidden md:block">
              <Users className="w-48 h-48 text-green-400" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-green-400 text-sm font-bold uppercase tracking-widest mb-1">
                  <Activity className="w-4 h-4 animate-pulse" />
                  Métricas en vivo
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white font-['Outfit']">
                  Panel de Miembros Registrados
                </h2>
                <p className="text-neutral-400 text-sm mt-1 max-w-xl">
                  Información sincronizada automáticamente con el servidor y la base de datos a través de sockets.
                </p>
              </div>

              {/* Tarjeta Destacada del Total */}
              <div className="bg-neutral-950/90 border border-green-500/60 rounded-xl px-8 py-5 flex items-center gap-6 shadow-inner shadow-green-500/10">
                <div className="w-14 h-14 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 shrink-0">
                  <Users className="w-8 h-8" />
                </div>
                <div>
                  <span className="block text-5xl sm:text-6xl font-black text-green-400 tracking-tight font-['Outfit'] drop-shadow-[0_0_20px_rgba(74,222,128,0.4)]">
                    {totalInscritos}
                  </span>
                  <span className="block text-xs sm:text-sm font-bold tracking-wider uppercase text-neutral-300 mt-0.5">
                    PERSONAS INSCRITAS
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contenido Grid: Formulario de Inscripción (Izquierda) + Tabla de Personas (Derecha) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Lado Izquierdo: Formulario de Inscripción */}
          <div className="lg:col-span-4 bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl sticky top-28">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-neutral-800">
              <div className="p-2 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-['Outfit']">Nueva Inscripción</h3>
                <p className="text-xs text-neutral-400">Registra un nuevo miembro en el gimnasio</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Campo DPI */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  DPI / Documento
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 2990123450101"
                    value={formData.dpi}
                    onChange={(e) => setFormData({ ...formData, dpi: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                  />
                </div>
              </div>

              {/* Campo Nombre Completo */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  Nombre Completo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos Martínez"
                    value={formData.nombreCompleto}
                    onChange={(e) => setFormData({ ...formData, nombreCompleto: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                  />
                </div>
              </div>

              {/* Campo Teléfono */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  Teléfono de Contacto
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. +502 5555-1234"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                  />
                </div>
              </div>

              {/* Botón de Enviar */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-green-600/30 hover:shadow-green-500/50 flex items-center justify-center gap-2 transition-all cursor-pointer font-['Outfit'] text-sm tracking-wide uppercase"
              >
                {isSubmitting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Registrar Miembro
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <span className="text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                  El backend registrará la fecha y activación automática
                </span>
              </div>
            </form>
          </div>

          {/* Lado Derecho: Tabla de Personas Inscritas */}
          <div className="lg:col-span-8 bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
            
            {/* Header de la tabla y buscador */}
            <div className="p-5 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/80">
              <div>
                <h3 className="text-lg font-bold text-white font-['Outfit'] flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-400" />
                  Miembros Activos
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                    {miembrosFiltrados.length}
                  </span>
                </h3>
                <p className="text-xs text-neutral-400">Listado actualizado en tiempo real con SignalR</p>
              </div>

              {/* Buscador Rápido */}
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por DPI o nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-green-500 transition-all"
                />
              </div>
            </div>

            {/* Contenedor responsivo de la Tabla */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-950/70 border-b border-neutral-800 text-neutral-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">DPI</th>
                    <th className="py-3.5 px-4">Nombre</th>
                    <th className="py-3.5 px-4">Teléfono</th>
                    <th className="py-3.5 px-4">Fecha Inscripción</th>
                    <th className="py-3.5 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80 text-sm">
                  {miembrosFiltrados.length > 0 ? (
                    miembrosFiltrados.map((m, index) => {
                      const id = m.id || m.Id || index;
                      const dpi = m.dpi || m.Dpi || 'N/A';
                      const nombre = m.nombreCompleto || m.nombre || m.NombreCompleto || 'Sin nombre';
                      const telefono = m.telefono || m.Telefono || 'Sin teléfono';
                      const fecha = m.fechaInscripcion || m.fecha || m.FechaInscripcion;
                      const isCancelling = cancellingId === id;

                      return (
                        <tr 
                          key={id} 
                          className="hover:bg-neutral-800/40 transition-colors group"
                        >
                          {/* DPI */}
                          <td className="py-3.5 px-4 font-mono text-xs text-neutral-300 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-200">
                              {dpi}
                            </span>
                          </td>

                          {/* Nombre */}
                          <td className="py-3.5 px-4 font-medium text-white whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-700 border border-neutral-600 flex items-center justify-center text-xs font-bold text-green-400 shrink-0">
                                {nombre.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold text-neutral-100 group-hover:text-green-400 transition-colors">
                                {nombre}
                              </span>
                            </div>
                          </td>

                          {/* Teléfono */}
                          <td className="py-3.5 px-4 text-neutral-300 whitespace-nowrap text-xs">
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-neutral-500" />
                              <span>{telefono}</span>
                            </div>
                          </td>

                          {/* Fecha Inscripción */}
                          <td className="py-3.5 px-4 text-neutral-400 whitespace-nowrap text-xs">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                              <span>{formatFecha(fecha)}</span>
                            </div>
                          </td>

                          {/* Acciones */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleCancelar(id, nombre)}
                              disabled={isCancelling}
                              title="Cancelar Membresía"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/60 transition-all text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {isCancelling ? (
                                <Activity className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span>Cancelar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="w-10 h-10 text-neutral-700" />
                          <p className="text-sm font-medium">No se encontraron miembros activos.</p>
                          <p className="text-xs text-neutral-600">
                            {searchTerm ? 'Prueba ajustando el término de búsqueda.' : 'Utiliza el formulario de la izquierda para registrar el primer miembro.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer de la Tabla */}
            <div className="p-3.5 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                Actualización instantánea
              </span>
              <span>
                Total registrados activos: <strong className="text-green-400">{miembrosActivos.length}</strong>
              </span>
            </div>

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800/80 py-6 bg-neutral-950/60 text-center text-xs text-neutral-500">
        <p>GYM PRO CONTROL &copy; {new Date().getFullYear()} — Diseñado para alto rendimiento y control en tiempo real.</p>
      </footer>
    </div>
  );
}
