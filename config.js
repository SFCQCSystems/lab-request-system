// CONFIGURATION MANAGER
// Handles switching between local localStorage database and Supabase database.

(function () {
  const STORAGE_KEY = 'lrms_db_config';

  const defaultConfig = {
    dbMode: 'supabase', // Force supabase
    supabaseUrl: 'https://vldpwwqnskpkgqdpsecu.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsZHB3d3Fuc2twa2dxZHBzZWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MTYyNTIsImV4cCI6MjA5NjI5MjI1Mn0.JrUe8TSFt4qJzqNCGv4xtyXJrpGE_PhcYIrZA1aPEw0'
  };

  window.AppConfig = {
    load() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          return { ...defaultConfig, ...parsed, dbMode: 'supabase' };
        }
      } catch (e) {
        console.error('Error loading configuration:', e);
      }
      return { ...defaultConfig, dbMode: 'supabase' };
    },

    save(config) {
      try {
        // Enforce supabase dbMode in saved configuration
        const supabaseConfig = { ...config, dbMode: 'supabase' };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(supabaseConfig));
        return true;
      } catch (e) {
        console.error('Error saving configuration:', e);
        return false;
      }
    },

    isSupabaseConfigured(config) {
      const c = config || this.load();
      return !!(c.supabaseUrl && c.supabaseAnonKey);
    }
  };
})();
