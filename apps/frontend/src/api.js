import axios from "axios";
import { API_URL } from "./config.js";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function getToken() {
  return localStorage.getItem("vantage_token") || "";
}

function headers() {
  return authHeaders(getToken());
}

export const api = {
  // Auth
  login: (email, password) =>
    axios.post(`${API_URL}/api/auth/login`, { email, password }),

  register: (username, email, password) =>
    axios.post(`${API_URL}/api/auth/register`, { username, email, password }),

  googleLogin: (credential) =>
    axios.post(`${API_URL}/api/auth/google`, { credential }),

  forgotPassword: (email) =>
    axios.post(`${API_URL}/api/auth/forgot-password`, { email }),

  resetPassword: (token, newPassword) =>
    axios.post(`${API_URL}/api/auth/reset-password`, { token, newPassword }),

  // Runs
  getRuns: () =>
    axios.get(`${API_URL}/api/runs`, { headers: headers() }),

  getRun: (id) =>
    axios.get(`${API_URL}/api/runs/${id}`, { headers: headers() }),

  uploadRun: (formData) =>
    axios.post(`${API_URL}/api/runs/upload`, formData, {
      headers: { ...headers(), "Content-Type": "multipart/form-data" }
    }),

  deleteRun: (id) =>
    axios.delete(`${API_URL}/api/runs/${id}`, { headers: headers() }),

  getRunStats: () =>
    axios.get(`${API_URL}/api/runs/stats`, { headers: headers() }),

  getAthleteFitness: () =>
    axios.get(`${API_URL}/api/runs/athlete-fitness`, { headers: headers() }),

  refreshPredictions: () =>
    axios.post(`${API_URL}/api/runs/refresh-predictions`, {}, { headers: headers() }),

  trainModel: (algorithm = "gradient_boosting") =>
    axios.post(`${API_URL}/api/runs/train`, { algorithm }, { headers: headers() }),

  // Certificates
  getCertificates: () =>
    axios.get(`${API_URL}/api/certificates`, { headers: headers() }),

  addCertificate: (formData) =>
    axios.post(`${API_URL}/api/certificates`, formData, {
      headers: { ...headers(), "Content-Type": "multipart/form-data" }
    }),

  getCertificateFile: (id) =>
    axios.get(`${API_URL}/api/certificates/${id}/file`, {
      headers: headers(),
      responseType: "blob"
    }),

  deleteCertificate: (id) =>
    axios.delete(`${API_URL}/api/certificates/${id}`, { headers: headers() }),

  // Account
  getProfile: () =>
    axios.get(`${API_URL}/api/account/profile`, { headers: headers() }),

  updateProfile: (data) =>
    axios.put(`${API_URL}/api/account/profile`, data, { headers: headers() }),

  uploadProfilePicture: (formData) =>
    axios.post(`${API_URL}/api/account/profile-picture`, formData, {
      headers: { ...headers(), "Content-Type": "multipart/form-data" }
    }),

  getProfilePicture: () =>
    axios.get(`${API_URL}/api/account/profile-picture`, {
      headers: headers(),
      responseType: "blob"
    }),

  deleteProfilePicture: () =>
    axios.delete(`${API_URL}/api/account/profile-picture`, { headers: headers() }),

  changePassword: (currentPassword, newPassword) =>
    axios.put(`${API_URL}/api/account/change-password`, { currentPassword, newPassword }, { headers: headers() }),

  deleteAccount: () =>
    axios.delete(`${API_URL}/api/account/delete`, { headers: headers() })
};
