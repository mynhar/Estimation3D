// Copiar este archivo como environment.ts (desarrollo) o environment.production.ts (producción)
// y rellenar los valores reales obtenidos en Supabase > Project Settings > API
export const environment = {
  production: false,
  supabase: {
    url: 'https://TU_PROYECTO.supabase.co',
    anonKey: 'TU_ANON_KEY',
  },
};
