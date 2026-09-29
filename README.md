# GYM PRO CONTROL - Frontend

Frontend moderno y de alto rendimiento para el sistema de gestión de gimnasio en tiempo real.

## 🚀 Tecnologías

- **React 19** con **Vite**
- **Tailwind CSS** (Tema Pro Fitness: Fondo oscuro con acentos verde neón)
- **@microsoft/signalr** (WebSockets en tiempo real para sincronización instantánea)
- **Axios** (Peticiones HTTP REST para inscripción y cancelación)
- **Lucide React** (Iconografía deportiva e interactiva)
- **Date-fns** (Formateo de fechas localizado)

## ⚙️ Configuración de Variables de Entorno

Crear un archivo `.env` en la raíz con las siguientes variables:

```env
VITE_API_URL=https://backendgym-3lrf.onrender.com/api/miembros
VITE_WS_URL=https://backendgym-3lrf.onrender.com/ws/gimnasio
```

## 🛠️ Scripts Disponibles

- `npm run dev`: Inicia el servidor de desarrollo local.
- `npm run build`: Compila los archivos optimizados para producción en la carpeta `dist`.
- `npm run preview`: Previsualiza el build de producción localmente.

## 📦 Despliegue en Vercel

El proyecto incluye `vercel.json` con reescritura de rutas para SPA (Single Page Application). Compatible directamente con Vercel vinculando este repositorio.
