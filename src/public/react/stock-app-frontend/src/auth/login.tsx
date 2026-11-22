import React from "react";
import { useState } from "react";
import PropTypes from "prop-types";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import "./login.scss";
import { AxiosError } from "axios";
import { IUser } from "../shared/types";

async function loginUser(credentials: IUser) {
  return StockAppAPI.login(credentials.username, credentials.password);
}

export default function Login({
  setToken,
}: {
  setToken: (userToken: { token: string }) => void;
}) {
  const [username1, setUserName1] = useState("");
  const [password1, setPassword1] = useState("");

  const [username2, setUserName2] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      const data = await loginUser({
        username: username1,
        password: password1,
      });
      setToken(data);
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response) {
          setError(error.response.data.message);
        } else {
          setError(error.message);
        }
      } else {
        setError("An unexpected error occurred: " + error);
      }
    }
  };

  const handleRegister = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      if (username2 && password2) {
        const resp = await StockAppAPI.register({
          username: username2,
          password: password2,
        });
        if (resp.status === 200) {
          alert("User " + username2 + " created");
        }
      }
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className="login-wrapper">
      <h1>Please Log In</h1>
      <form onSubmit={handleLogin} className="login-form">
        <div className="form-group">
          <p>Username</p>
          <input
            type="text"
            onChange={(e) => setUserName1(e.target.value)}
            className="input-field"
          />
        </div>
        <div className="form-group">
          <p>Password</p>
          <input
            type="password"
            onChange={(e) => setPassword1(e.target.value)}
            className="input-field"
          />
        </div>
        <button type="submit" className="button login-button">
          Submit
        </button>
        <label className="error-message">{error}</label>
      </form>

      <br />
      <br />
      <br />

      <h2>New user? Register</h2>
      <form onSubmit={handleRegister} className="register-form">
        <div className="form-group">
          <p>Username</p>
          <input
            type="text"
            onChange={(e) => setUserName2(e.target.value)}
            className="input-field"
          />
        </div>
        <div className="form-group">
          <p>Password</p>
          <input
            type="password"
            onChange={(e) => setPassword2(e.target.value)}
            className="input-field"
          />
        </div>
        <button type="submit" className="button register-button">
          Submit
        </button>
      </form>
    </div>
  );
}

Login.propTypes = {
  setToken: PropTypes.func.isRequired,
};
