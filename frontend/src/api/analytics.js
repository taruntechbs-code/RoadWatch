import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
});

export async function getBudgetOverview() {
  const response = await api.get('/analytics/budget-overview');
  return response.data;
}

export async function getComplaintHeatmap() {
  const response = await api.get('/analytics/complaint-heatmap');
  return response.data;
}

export async function getContractorScores() {
  const response = await api.get('/analytics/contractor-scores');
  return response.data;
}

export async function getAnomalies() {
  const response = await api.get('/analytics/anomalies');
  return response.data;
}
