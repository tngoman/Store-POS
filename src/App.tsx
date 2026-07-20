import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import PosPage from './pages/PosPage';

export default function App() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <div className="login-wrap">
        <div className="panel login-card">
          <h1>Store POS</h1>
          <p>Starting…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <PosPage />;
}
