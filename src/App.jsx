import React, { useState, useEffect } from 'react';
import * as signalR from '@microsoft/signalr';
import axios from 'axios';
import { 
  Car,
  PlusCircle, 
  Search, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Calendar,
  LogOut,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

// URLs de producción configuradas en variables de entorno Vite
const API_URL = import.meta.env.VITE_API_URL || 'https://backendgym-3lrf.onrender.com/api/vehiculos';
const WS_URL = import.meta.env.VITE_WS_URL || 'https://backendgym-3lrf.onrender.com/ws/parqueo';

export default function App() {
  // Estado principal
  const [vehiculos, setVehiculos] = useState([]);
  const [totalVehiculos, setTotalVehiculos] = useState(0);
  
  // Estado del formulario
  const [placa, setPlaca] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Búsqueda y filtrado local
  const [searchTerm, setSearchTerm] = useState('');

  // Estado de conexión SignalR
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected' | 'connecting' | 'disconnected'
  
  // Estado de mensajes de alerta/notificación
  const [toast, setToast] = useState(null); // { type: 'success' | 'error' | 'info', message: '' }
  
  // Estado de acción por fila (cargando al salir)
  const [cancellingId, setCancellingId] = useState(null);

  // Helper para mostrar mensajes temporales
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Cargar lista inicial de la base de datos vía HTTP REST
  const fetchVehiculosInicial = async () => {
    try {
      const response = await axios.get(API_URL);
      if (response.data) {
        if (Array.isArray(response.data)) {
          setVehiculos(response.data);
          const activos = response.data.filter(v => v.activo ?? true).length;
          setTotalVehiculos(activos);
        } else if (response.data.vehiculos) {
          setVehiculos(response.data.vehiculos || []);
          setTotalVehiculos(response.data.totalVehiculos ?? (response.data.vehiculos?.length || 0));
        }
      }
    } catch (error) {
      console.warn('Esperando datos iniciales desde SignalR o endpoint:', error.message);
    }
  };

  // Configuración de SignalR en tiempo real
  useEffect(() => {
    fetchVehiculosInicial();

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(WS_URL, {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Escuchar el evento "ActualizarParqueo" emitido por el backend
    connection.on('ActualizarParqueo', (datos) => {
      console.log('Evento ActualizarParqueo recibido:', datos);
      if (datos) {
        if (typeof datos.totalVehiculos === 'number') {
          setTotalVehiculos(datos.totalVehiculos);
        } else if (Array.isArray(datos.vehiculos)) {
          const countActivos = datos.vehiculos.filter(v => (v.activo ?? true)).length;
          setTotalVehiculos(countActivos);
        }

        if (Array.isArray(datos.vehiculos)) {
          setVehiculos(datos.vehiculos);
        } else if (Array.isArray(datos)) {
          setVehiculos(datos);
          setTotalVehiculos(datos.filter(v => (v.activo ?? true)).length);
        }
      }
    });

    connection.onreconnecting(() => {
      setConnectionStatus('connecting');
    });

    connection.onreconnected(() => {
      setConnectionStatus('connected');
      fetchVehiculosInicial();
    });

    connection.onclose(() => {
      setConnectionStatus('disconnected');
    });

    async function startSignalR() {
      try {
        await connection.start();
        setConnectionStatus('connected');
        console.log('Conexión con SignalR establecida exitosamente.');
      } catch (err) {
        console.error('Error al conectar con SignalR:', err);
        setConnectionStatus('disconnected');
        setTimeout(startSignalR, 5000);
      }
    }

    startSignalR();

    return () => {
      connection.stop();
    };
  }, []);

  // Manejador del Formulario de Entrada
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!placa.trim()) {
      showToast('Por favor ingresa la placa del vehículo.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        placa: placa.trim()
      };

      await axios.post(`${API_URL}/entrada`, payload);
      showToast(`¡Vehículo "${placa.trim()}" registrado exitosamente!`, 'success');
      
      setPlaca('');

      setTimeout(fetchVehiculosInicial, 800);
    } catch (error) {
      console.error('Error al registrar entrada:', error);
      const serverMsg = error.response?.data?.message || error.response?.data || error.message;
      showToast(`Error al registrar: ${typeof serverMsg === 'string' ? serverMsg : 'Revisa los datos ingresados.'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejador de Salida de Vehículo
  const handleSalida = async (id, placaVehiculo) => {
    if (!window.confirm(`¿Estás seguro de registrar la salida del vehículo con placa ${placaVehiculo || 'desconocida'}?`)) {
      return;
    }

    setCancellingId(id);
    try {
      await axios.put(`${API_URL}/salida/${id}`);
      showToast(`Salida registrada correctamente.`, 'info');
      setTimeout(fetchVehiculosInicial, 800);
    } catch (error) {
      console.error('Error al registrar salida:', error);
      const serverMsg = error.response?.data?.message || error.response?.data || error.message;
      showToast(`Error al registrar salida: ${typeof serverMsg === 'string' ? serverMsg : 'No se pudo procesar la solicitud.'}`, 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const formatFecha = (fechaRaw) => {
    if (!fechaRaw) return 'Reciente';
    try {
      const dateObj = new Date(fechaRaw);
      if (isValid(dateObj)) {
        return format(dateObj, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
      }
    } catch {
      // Ignora error
    }
    return String(fechaRaw);
  };

  const vehiculosActivos = vehiculos.filter(v => (v.activo ?? true));
  const vehiculosFiltrados = vehiculosActivos.filter(v => {
    const p = (v.placa || v.Placa || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return p.includes(term);
  });

  return (
    <div className="min-h-screen bg-[#090a0f] text-neutral-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Background Glow Accents */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-10 w-[450px] h-[450px] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              <Car className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-wider text-white font-['Outfit']">
                  PARQUEO <span className="text-blue-400">PRO</span> CONTROL
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 hidden sm:inline-block">
                  Live System
                </span>
              </div>
              <p className="text-xs text-neutral-400">Gestión de parqueo en tiempo real</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800">
            {connectionStatus === 'connected' ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </span>
                <Wifi className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-blue-400 hidden sm:inline">SignalR Activo</span>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        
        {toast && (
          <div className={`p-4 rounded-xl flex items-center justify-between gap-3 border shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success' 
              ? 'bg-blue-950/80 border-blue-500/40 text-blue-200' 
              : toast.type === 'error'
              ? 'bg-red-950/80 border-red-500/40 text-red-200'
              : 'bg-neutral-900/90 border-neutral-700 text-neutral-200'
          }`}>
            <div className="flex items-center gap-3">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
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

        <section>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-neutral-900/90 to-neutral-950/90 border-2 border-blue-500/40 shadow-[0_0_50px_-12px_rgba(59,130,246,0.25)] p-6 sm:p-8">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10 hidden md:block">
              <Car className="w-48 h-48 text-blue-400" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-blue-400 text-sm font-bold uppercase tracking-widest mb-1">
                  <Activity className="w-4 h-4 animate-pulse" />
                  Métricas en vivo
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white font-['Outfit']">
                  VEHÍCULOS DENTRO DEL PARQUEO
                </h2>
                <p className="text-neutral-400 text-sm mt-1 max-w-xl">
                  Información sincronizada automáticamente con el servidor y la base de datos a través de sockets.
                </p>
              </div>

              <div className="bg-neutral-950/90 border border-blue-500/60 rounded-xl px-8 py-5 flex items-center gap-6 shadow-inner shadow-blue-500/10">
                <div className="w-14 h-14 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Car className="w-8 h-8" />
                </div>
                <div>
                  <span className="block text-5xl sm:text-6xl font-black text-blue-400 tracking-tight font-['Outfit'] drop-shadow-[0_0_20px_rgba(96,165,250,0.4)]">
                    {totalVehiculos}
                  </span>
                  <span className="block text-xs sm:text-sm font-bold tracking-wider uppercase text-neutral-300 mt-0.5">
                    VEHÍCULOS ACTIVOS
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          <div className="lg:col-span-4 bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl sticky top-28">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-neutral-800">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-['Outfit']">Nueva Entrada</h3>
                <p className="text-xs text-neutral-400">Registra el ingreso de un vehículo</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  Placa del Vehículo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <Car className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ej. P123ABC"
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all uppercase"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-500/50 flex items-center justify-center gap-2 transition-all cursor-pointer font-['Outfit'] text-sm tracking-wide uppercase"
              >
                {isSubmitting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    Registrar Entrada
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <span className="text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                  El sistema registrará la hora de entrada automáticamente
                </span>
              </div>
            </form>
          </div>

          <div className="lg:col-span-8 bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
            
            <div className="p-5 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/80">
              <div>
                <h3 className="text-lg font-bold text-white font-['Outfit'] flex items-center gap-2">
                  <Car className="w-5 h-5 text-blue-400" />
                  Vehículos Activos
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                    {vehiculosFiltrados.length}
                  </span>
                </h3>
                <p className="text-xs text-neutral-400">Listado actualizado en tiempo real con SignalR</p>
              </div>

              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por placa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-950/70 border-b border-neutral-800 text-neutral-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Placa</th>
                    <th className="py-3.5 px-4">Hora de Entrada</th>
                    <th className="py-3.5 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80 text-sm">
                  {vehiculosFiltrados.length > 0 ? (
                    vehiculosFiltrados.map((v, index) => {
                      const id = v.id || v.Id || index;
                      const placa = v.placa || v.Placa || 'N/A';
                      const fecha = v.horaEntrada || v.fechaEntrada || v.HoraEntrada || v.FechaEntrada || v.fecha || v.Fecha;
                      const isCancelling = cancellingId === id;

                      return (
                        <tr 
                          key={id} 
                          className="hover:bg-neutral-800/40 transition-colors group"
                        >
                          <td className="py-3.5 px-4 font-mono text-sm font-bold text-white whitespace-nowrap">
                            <span className="px-3 py-1 rounded bg-neutral-950 border border-neutral-700 text-blue-100 tracking-wider">
                              {placa}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-neutral-400 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-neutral-500" />
                              <span>{formatFecha(fecha)}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleSalida(id, placa)}
                              disabled={isCancelling}
                              title="Registrar Salida"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:border-orange-500/60 transition-all text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {isCancelling ? (
                                <Activity className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <LogOut className="w-3.5 h-3.5" />
                              )}
                              <span>Registrar Salida</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-neutral-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Car className="w-10 h-10 text-neutral-700" />
                          <p className="text-sm font-medium">No se encontraron vehículos activos.</p>
                          <p className="text-xs text-neutral-600">
                            {searchTerm ? 'Prueba ajustando el término de búsqueda.' : 'Utiliza el formulario de la izquierda para registrar la primera entrada.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3.5 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                Actualización instantánea
              </span>
              <span>
                Total vehículos dentro: <strong className="text-blue-400">{vehiculosActivos.length}</strong>
              </span>
            </div>

          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-neutral-800/80 py-6 bg-neutral-950/60 text-center text-xs text-neutral-500">
        <p>PARQUEO PRO CONTROL &copy; {new Date().getFullYear()} — Diseñado para alto rendimiento y control en tiempo real.</p>
      </footer>
    </div>
  );
}
