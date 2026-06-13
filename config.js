// CONFIGURATION MANAGER
// Handles switching between local localStorage database and Supabase database.

(function () {
  const STORAGE_KEY = 'lrms_db_config';

  const defaultConfig = {
    dbMode: 'supabase', // Force supabase
    supabaseUrl: '',
    supabaseAnonKey: ''
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
