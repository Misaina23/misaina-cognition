import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((cfg) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const refresh = localStorage.getItem("refreshToken");
      if (refresh) {
        try {
          const { data } = await axios.post("/api/auth/refresh", { refreshToken: refresh });
          localStorage.setItem("token", data.token);
          localStorage.setItem("refreshToken", data.refreshToken);
          error.config.headers.Authorization = `Bearer ${data.token}`;
          return api.request(error.config);
        } catch {
          localStorage.clear();
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email: string, password: string) => api.post("/auth/login", { email, password }),
  register: (data: any) => api.post("/auth/register", data),
  forgot: (email: string) => api.post("/auth/forgot-password", { email }),
  reset: (token: string, password: string) => api.post("/auth/reset-password", { token, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
};

export default api;
