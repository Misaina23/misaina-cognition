import axios from "axios";
import { useAuthStore } from "./auth";

export const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (email: string, password?: string) =>
    api.post("/auth/login", { email, password }),
  register: (data: {
    fullName: string;
    email: string;
    password?: string;
    department?: string;
    role?: string;
  }) => api.post("/auth/register", data),
  forgot: (email: string) => api.post("/auth/forgot-password", { email }),
  reset: (token: string, password: string) =>
    api.post("/auth/reset-password", { token, password }),
  me: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout"),
};
