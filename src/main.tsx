import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import 'leaflet/dist/leaflet.css';
import { GpsProvider } from './lib/GpsContext';
import { I18nProvider } from './lib/i18n';
import { syncOfflineQueue } from './lib/offline';
import { api } from './lib/api';
import { requestNotificationPermission } from './lib/push';
import { initObservability } from './lib/observability';
import { SkipToMain } from './components/SkipToMain';

initObservability();

// Aplicar tema guardado antes de que React monte (evita flash)
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
} else if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkipToMain />
    <BrowserRouter>
      <I18nProvider>
        <GpsProvider>
          <App />
        </GpsProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

function bootExtras() {
  requestNotificationPermission();
  window.addEventListener('online', () => {
    syncOfflineQueue(async (method, path, body) => {
      if (method === 'POST') await api.post(path, body);
      else await api.patch(path, body);
    });
  });
}
bootExtras();

