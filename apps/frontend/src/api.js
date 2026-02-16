import axios from "axios";
import { API_URL } from "./config.js";

/**
 * Get a Clerk session token (set by AuthContext on the window object).
 * Returns an empty string if not signed in.
 */
async function getClerkToken() {
  if (typeof window !== "undefined" && window.__clerkGetToken) {
    try {
      return (await window.__clerkGetToken()) || "";
    } catch {
      return "";
    }
  }
  return "";
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function headers() {
  const token = await getClerkToken();
  return authHeaders(token);
}

export const api = {
  // Auth – sync profile after Clerk sign-in
  syncProfile: async ({ username, email }) => {
    const h = await headers();
    return axios.post(`${API_URL}/api/auth/sync`, { username, email }, { headers: h });
  },

  // Runs
  getRuns: async () => {
    const h = await headers();
    return axios.get(`${API_URL}/api/runs`, { headers: h });
  },

  getRun: async (id) => {
    const h = await headers();
    return axios.get(`${API_URL}/api/runs/${id}`, { headers: h });
  },

  uploadRun: async (formData) => {
    const h = await headers();
    return axios.post(`${API_URL}/api/runs/upload`, formData, {
      headers: { ...h, "Content-Type": "multipart/form-data" }
    });
  },

  deleteRun: async (id) => {
    const h = await headers();
    return axios.delete(`${API_URL}/api/runs/${id}`, { headers: h });
  },

  getRunStats: async () => {
    const h = await headers();
    return axios.get(`${API_URL}/api/runs/stats`, { headers: h });
  },

  getAthleteFitness: async () => {
    const h = await headers();
    return axios.get(`${API_URL}/api/runs/athlete-fitness`, { headers: h });
  },

  refreshPredictions: async () => {
    const h = await headers();
    return axios.post(`${API_URL}/api/runs/refresh-predictions`, {}, { headers: h });
  },

  trainModel: async (algorithm = "gradient_boosting") => {
    const h = await headers();
    return axios.post(`${API_URL}/api/runs/train`, { algorithm }, { headers: h });
  },

  // Certificates
  getCertificates: async () => {
    const h = await headers();
    return axios.get(`${API_URL}/api/certificates`, { headers: h });
  },

  addCertificate: async (formData) => {
    const h = await headers();
    return axios.post(`${API_URL}/api/certificates`, formData, {
      headers: { ...h, "Content-Type": "multipart/form-data" }
    });
  },

  getCertificateFile: async (id) => {
    const h = await headers();
    return axios.get(`${API_URL}/api/certificates/${id}/file`, {
      headers: h,
      responseType: "blob"
    });
  },

  deleteCertificate: async (id) => {
    const h = await headers();
    return axios.delete(`${API_URL}/api/certificates/${id}`, { headers: h });
  },

  // Account
  getProfile: async () => {
    const h = await headers();
    return axios.get(`${API_URL}/api/account/profile`, { headers: h });
  },

  updateProfile: async (data) => {
    const h = await headers();
    return axios.put(`${API_URL}/api/account/profile`, data, { headers: h });
  },

  uploadProfilePicture: async (formData) => {
    const h = await headers();
    return axios.post(`${API_URL}/api/account/profile-picture`, formData, {
      headers: { ...h, "Content-Type": "multipart/form-data" }
    });
  },

  getProfilePicture: async () => {
    const h = await headers();
    return axios.get(`${API_URL}/api/account/profile-picture`, {
      headers: h,
      responseType: "blob"
    });
  },

  deleteProfilePicture: async () => {
    const h = await headers();
    return axios.delete(`${API_URL}/api/account/profile-picture`, { headers: h });
  },

  changePassword: async (currentPassword, newPassword) => {
    const h = await headers();
    return axios.put(`${API_URL}/api/account/change-password`, { currentPassword, newPassword }, { headers: h });
  },

  deleteAccount: async () => {
    const h = await headers();
    return axios.delete(`${API_URL}/api/account/delete`, { headers: h });
  }
};
