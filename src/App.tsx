import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Square, 
  MapPin, 
  Clock, 
  History, 
  Plus, 
  User, 
  ChevronRight,
  Navigation,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { format, differenceInSeconds, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Client, Activity, ActivityWithClient, ActivityType } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<ActivityWithClient[]>([]);
  const [activeActivity, setActiveActivity] = useState<ActivityWithClient | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, activitiesRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/activities')
      ]);
      const clientsData = await clientsRes.json();
      const activitiesData = await activitiesRes.json();
      
      setClients(clientsData);
      setActivities(activitiesData);
      
      const active = activitiesData.find((a: Activity) => !a.endTime);
      if (active) {
        setActiveActivity(active);
      } else {
        setActiveActivity(null);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeActivity) {
      interval = setInterval(() => {
        const seconds = differenceInSeconds(new Date(), parseISO(activeActivity.startTime));
        setElapsedTime(seconds);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [activeActivity]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const [isLocating, setIsLocating] = useState(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada por tu navegador');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Usamos Nominatim (OpenStreetMap) para reverse geocoding gratuito
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
            headers: {
              'Accept-Language': 'es'
            }
          });
          const data = await response.json();
          if (data && data.display_name) {
            setNewClientAddress(data.display_name);
          } else {
            setNewClientAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          }
        } catch (error) {
          console.error('Error in reverse geocoding:', error);
          setNewClientAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('No se pudo obtener la ubicación. Por favor, asegúrate de dar permisos.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName) return;

    const id = crypto.randomUUID();
    try {
      await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: newClientName, address: newClientAddress })
      });
      setNewClientName('');
      setNewClientAddress('');
      setIsAddingClient(false);
      fetchData();
      setSelectedClientId(id);
    } catch (error) {
      console.error('Error adding client:', error);
    }
  };

  const handleStartActivity = async (type: ActivityType) => {
    if (!selectedClientId) return;

    const id = crypto.randomUUID();
    const startTime = new Date().toISOString();
    
    try {
      await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type, clientId: selectedClientId, startTime })
      });
      fetchData();
    } catch (error) {
      console.error('Error starting activity:', error);
    }
  };

  const handleStopActivity = async () => {
    if (!activeActivity) return;

    const endTime = new Date().toISOString();
    try {
      await fetch(`/api/activities/${activeActivity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endTime })
      });
      fetchData();
    } catch (error) {
      console.error('Error stopping activity:', error);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este registro?')) return;
    
    try {
      const res = await fetch(`/api/activities/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Error al eliminar el registro');
      }
    } catch (error) {
      console.error('Error deleting activity:', error);
      alert('Error de conexión al eliminar');
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente y todos sus registros?')) return;
    
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Error al eliminar el cliente');
      }
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Error de conexión al eliminar');
    }
  };

  const [currentView, setCurrentView] = useState<'log' | 'clients' | 'map'>('log');

  const totalSecondsToday = activities
    .filter(a => a.endTime && format(parseISO(a.startTime), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
    .reduce((acc, a) => acc + differenceInSeconds(parseISO(a.endTime!), parseISO(a.startTime)), 0);

  const travelSecondsToday = activities
    .filter(a => a.type === 'travel' && a.endTime && format(parseISO(a.startTime), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
    .reduce((acc, a) => acc + differenceInSeconds(parseISO(a.endTime!), parseISO(a.startTime)), 0);

  const workSecondsToday = activities
    .filter(a => a.type === 'work' && a.endTime && format(parseISO(a.startTime), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
    .reduce((acc, a) => acc + differenceInSeconds(parseISO(a.endTime!), parseISO(a.startTime)), 0);

  const renderLogView = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Daily Summary Card */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="technical-card rounded-2xl p-4 bg-emerald-50 border-emerald-100 flex items-center justify-between"
      >
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Total Hoy</p>
          <p className="text-2xl font-mono font-bold text-emerald-900">{formatDuration(totalSecondsToday)}</p>
        </div>
        <div className="flex gap-4 text-right">
          <div className="space-y-0.5">
            <p className="text-[8px] font-bold text-amber-600 uppercase">Trayecto</p>
            <p className="text-xs font-mono font-bold text-amber-700">{formatDuration(travelSecondsToday)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[8px] font-bold text-blue-600 uppercase">Trabajo</p>
            <p className="text-xs font-mono font-bold text-blue-700">{formatDuration(workSecondsToday)}</p>
          </div>
        </div>
      </motion.div>

      {/* Active Session Card */}
      <AnimatePresence mode="wait">
        {activeActivity ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="technical-card rounded-2xl p-6 bg-slate-900 text-white overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10">
              {activeActivity.type === 'travel' ? <Navigation size={80} /> : <Briefcase size={80} />}
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                    activeActivity.type === 'travel' ? "bg-amber-500" : "bg-blue-500"
                  )}>
                    {activeActivity.type === 'travel' ? 'En Trayecto' : 'Trabajando'}
                  </span>
                  <span className="text-slate-400 text-xs font-mono">
                    Desde {format(parseISO(activeActivity.startTime), 'HH:mm')}
                  </span>
                </div>
                <button 
                  onClick={() => handleDeleteActivity(activeActivity.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-2"
                  title="Cancelar y eliminar sesión actual"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              <h2 className="text-2xl font-bold mb-1">{activeActivity.clientName}</h2>
              <div className="text-4xl font-mono font-medium mb-6 tracking-tighter">
                {formatDuration(elapsedTime)}
              </div>

              <button 
                onClick={handleStopActivity}
                className="w-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all py-4 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <Square size={20} fill="currentColor" />
                Finalizar Sesión
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="technical-card rounded-2xl p-6 bg-white space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Nueva Sesión</h3>
              <button 
                onClick={() => setIsAddingClient(!isAddingClient)}
                className="text-emerald-600 hover:text-emerald-700 p-1"
              >
                <Plus size={20} />
              </button>
            </div>

            {isAddingClient ? (
              <form onSubmit={handleAddClient} className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <input 
                  type="text" 
                  placeholder="Nombre del cliente" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  required
                />
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Dirección (opcional)" 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all pr-12"
                    value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLocating}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors",
                      isLocating ? "text-slate-300 animate-pulse" : "text-emerald-600 hover:bg-emerald-50"
                    )}
                    title="Obtener ubicación actual"
                  >
                    <MapPin size={20} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                  >
                    Guardar Cliente
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAddingClient(false)}
                    className="px-4 py-3 rounded-xl border border-slate-200 text-slate-500 font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <select 
                    className="w-full appearance-none px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all pr-10"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    <option value="">Seleccionar Cliente...</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <ChevronRight size={16} className="rotate-90" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    disabled={!selectedClientId}
                    onClick={() => handleStartActivity('travel')}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-amber-100 bg-amber-50 text-amber-700 font-bold hover:bg-amber-100 disabled:opacity-50 disabled:grayscale transition-all"
                  >
                    <Navigation size={24} />
                    <span>Trayecto</span>
                  </button>
                  <button 
                    disabled={!selectedClientId}
                    onClick={() => handleStartActivity('work')}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 disabled:opacity-50 disabled:grayscale transition-all"
                  >
                    <Briefcase size={24} />
                    <span>Trabajo</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <History size={18} />
            Actividad Reciente
          </h3>
        </div>

        <div className="space-y-3">
          {activities.filter(a => a.endTime).slice(0, 10).map((activity) => {
            const duration = differenceInSeconds(parseISO(activity.endTime!), parseISO(activity.startTime));
            const clientTotalToday = activities
              .filter(a => a.clientId === activity.clientId && a.endTime && format(parseISO(a.startTime), 'yyyy-MM-dd') === format(parseISO(activity.startTime), 'yyyy-MM-dd'))
              .reduce((acc, a) => acc + differenceInSeconds(parseISO(a.endTime!), parseISO(a.startTime)), 0);
            
            const hasBothTypes = activities.some(a => a.clientId === activity.clientId && a.type === 'travel' && format(parseISO(a.startTime), 'yyyy-MM-dd') === format(parseISO(activity.startTime), 'yyyy-MM-dd')) &&
                               activities.some(a => a.clientId === activity.clientId && a.type === 'work' && format(parseISO(a.startTime), 'yyyy-MM-dd') === format(parseISO(activity.startTime), 'yyyy-MM-dd'));

            return (
              <div key={activity.id} className="technical-card rounded-xl p-4 bg-white flex items-center gap-4 relative overflow-hidden">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                  activity.type === 'travel' ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
                )}>
                  {activity.type === 'travel' ? <Navigation size={18} /> : <Briefcase size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="font-bold text-slate-900 truncate">{activity.clientName}</h4>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-500">{formatDuration(duration)}</span>
                      <button 
                        onClick={() => handleDeleteActivity(activity.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-2"
                        title="Eliminar registro"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                      <span>{format(parseISO(activity.startTime), 'dd MMM', { locale: es })}</span>
                      <span>•</span>
                      <span>{format(parseISO(activity.startTime), 'HH:mm')} - {format(parseISO(activity.endTime!), 'HH:mm')}</span>
                    </div>
                    {hasBothTypes && (
                      <div className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                        Total Visita: {formatDuration(clientTotalToday)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {activities.length === 0 && (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <AlertCircle className="mx-auto opacity-20" size={48} />
              <p>No hay registros todavía</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const renderClientsView = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <User size={18} />
          Mis Clientes
        </h3>
        <button 
          onClick={() => {
            setIsAddingClient(true);
            setCurrentView('log');
          }}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
        >
          <Plus size={14} />
          Nuevo
        </button>
      </div>

      <div className="space-y-3">
        {clients.map(client => (
          <div key={client.id} className="technical-card rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-bold text-slate-900">{client.name}</h4>
                {client.address && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin size={12} />
                    {client.address}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setSelectedClientId(client.id);
                    setCurrentView('log');
                  }}
                  className="text-emerald-600 p-2 hover:bg-emerald-50 rounded-full transition-colors"
                >
                  <Play size={18} fill="currentColor" />
                </button>
                <button 
                  onClick={() => handleDeleteClient(client.id)}
                  className="text-slate-300 hover:text-red-500 p-2 transition-colors"
                  title="Eliminar cliente"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-50">
              <button 
                onClick={() => window.open(`http://maps.apple.com/?q=${encodeURIComponent(client.address || client.name)}`, '_blank')}
                className="flex-1 text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center gap-1"
              >
                <Navigation size={12} />
                Navegar
              </button>
              <button className="flex-1 text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors">
                Detalles
              </button>
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p>No tienes clientes registrados</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderMapView = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="px-2">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <MapPin size={18} />
          Mapa de Clientes
        </h3>
      </div>

      <div className="technical-card rounded-2xl overflow-hidden bg-slate-100 aspect-square flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center text-slate-400">
          <MapPin size={32} />
        </div>
        <div>
          <p className="font-bold text-slate-600">Vista de Mapa</p>
          <p className="text-xs text-slate-400 mt-1">Aquí se mostrarán tus clientes geolocalizados próximamente.</p>
        </div>
        <div className="w-full space-y-2">
          {clients.filter(c => c.address).slice(0, 3).map(client => (
            <div key={client.id} className="bg-white p-3 rounded-xl text-left flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{client.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{client.address}</p>
              </div>
              <button 
                onClick={() => window.open(`http://maps.apple.com/?q=${encodeURIComponent(client.address!)}`, '_blank')}
                className="text-blue-600 p-2"
              >
                <Navigation size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen max-w-md mx-auto bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">FieldTech Log</h1>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Sistema Activo
          </div>
        </div>
        <p className="text-sm text-slate-500">
          {currentView === 'log' && 'Registro de tiempos y trayectos'}
          {currentView === 'clients' && 'Gestión de cartera de clientes'}
          {currentView === 'map' && 'Ubicación de servicios'}
        </p>
      </header>

      <main className="p-4">
        {currentView === 'log' && renderLogView()}
        {currentView === 'clients' && renderClientsView()}
        {currentView === 'map' && renderMapView()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 px-8 py-3 flex justify-between items-center z-20">
        <button 
          onClick={() => setCurrentView('log')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            currentView === 'log' ? "text-emerald-600" : "text-slate-400"
          )}
        >
          <Clock size={20} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Registro</span>
        </button>
        <button 
          onClick={() => setCurrentView('clients')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            currentView === 'clients' ? "text-emerald-600" : "text-slate-400"
          )}
        >
          <User size={20} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Clientes</span>
        </button>
        <button 
          onClick={() => setCurrentView('map')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            currentView === 'map' ? "text-emerald-600" : "text-slate-400"
          )}
        >
          <MapPin size={20} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Mapa</span>
        </button>
      </nav>
    </div>
  );
}
