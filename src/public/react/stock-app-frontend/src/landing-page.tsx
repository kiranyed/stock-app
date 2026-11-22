import React from "react"; // Add this line
import "primereact/resources/themes/lara-light-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import { NavLink, Route, HashRouter, Routes } from "react-router-dom";
import BackTestPage from "./back-test/run-back-tests";
import ShowCharts from "./trading-dashboard/show-charts";
import "./home/home-page.scss";
import "./shared/nav-bar.scss";
import AnalysisPage from "./analysis/analysis";
import VariableCheckPage from "./analysis/variable-check";
import Login from "./auth/login";
import useToken from "./auth/use-token";
import RunStrategiesPage from "./real-time-trading/strategy-runs/run-strategies";
import StockGroupsPage from "./real-time-trading/stock-groups";
import EditStrategiesPageNew from "./real-time-trading/edit-strategies/edit-strategies";
import TradingPage from "./trading-dashboard/trading-page";
import Home from "./home/home-page";
import BackTestHistoryPage from "./back-test/back-test-history";

function Landing() {
  const { token, setToken } = useToken();
  if (!token) {
    return <Login setToken={setToken} />;
  }

  const handleLogout = async () => {
    setToken({ token: "" });
  };

  const obj = localStorage.getItem("token");
  const user = obj && JSON.parse(obj).user;
  return (
    <HashRouter>
      <header className="site-header">
        <div className="navbar">
          <div className="brand">
            <NavLink to="/" className="brand-link">
              Stock App
            </NavLink>
          </div>

          <nav className="nav-links">
            <NavLink to="/" end className="nav-item">
              Home
            </NavLink>
            <NavLink to="/back-test" className="nav-item">
              Back test
            </NavLink>
            <NavLink to="/back-test-history" className="nav-item">
              Back tests by group
            </NavLink>
            <NavLink to="/realtime-trading/analysis" className="nav-item">
              Analysis
            </NavLink>
            <NavLink to="/realtime-trading/variable-check" className="nav-item">
              Variable Check
            </NavLink>
            <NavLink to="/show-charts" className="nav-item">
              Charts
            </NavLink>
            <NavLink to="/run-strategies" className="nav-item">
              Run strategies
            </NavLink>
            <NavLink to="/edit-strategies" className="nav-item">
              Edit strategies
            </NavLink>
            <NavLink to="/stock-groups" className="nav-item">
              Stock groups
            </NavLink>
            <NavLink to="/trading-page" className="nav-item">
              Trading
            </NavLink>
          </nav>

          <div className="nav-user">
            {user && <span className="user-name">Welcome, {user}</span>}
            <button className="logout-btn" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {user && (
          <Routes>
            <Route path="/back-test" element={<BackTestPage />} />
            <Route
              path="/back-test-history"
              element={<BackTestHistoryPage />}
            />
            <Route
              path="/realtime-trading/analysis"
              element={<AnalysisPage />}
            />
            <Route
              path="/realtime-trading/variable-check"
              element={<VariableCheckPage />}
            />
            <Route path="/show-charts" element={<ShowCharts />} />
            <Route path="/run-strategies" element={<RunStrategiesPage />} />
            <Route
              path="/edit-strategies"
              element={<EditStrategiesPageNew />}
            />
            <Route path="/stock-groups" element={<StockGroupsPage />} />
            <Route path="/trading-page" element={<TradingPage />} />
            <Route path="/" element={<Home user={user} />} />
          </Routes>
        )}
      </main>
    </HashRouter>
  );
}

export default Landing;
