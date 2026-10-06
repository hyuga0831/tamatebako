import { useEffect, useState } from 'react';
import { parseRoute } from './lib/nav';
import { Home } from './screens/Home';
import { FormatPage } from './screens/FormatPage';
import { Quiz } from './screens/Quiz';
import { Result } from './screens/Result';
import { SettingsPage } from './screens/Settings';

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  switch (route.name) {
    case 'format':
      return <FormatPage key={route.f} f={route.f} />;
    case 'quiz':
      return <Quiz key={route.key} format={route.f} mode={route.mode} />;
    case 'result':
      return <Result />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <Home />;
  }
}
