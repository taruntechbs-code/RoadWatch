import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
});

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/complaints/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function analyzeImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/complaints/analyze-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function submitComplaint(data) {
  const response = await api.post('/complaints', data);
  return response.data;
}

export async function classifyComplaint(data) {
  const response = await api.post('/complaints/classify', data);
  return response.data;
}

export async function getComplaint(id) {
  const response = await api.get(`/complaints/${id}`);
  return response.data;
}
