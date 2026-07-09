import axios from 'axios';
import { getAuthTokenFromStorage, supabase } from './supabase';
import { resolveApiBaseUrl } from './native-runtime';

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
});

apiClient.interceptors.request.use(async (config) => {
  config.headers = config.headers ?? {};

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || getAuthTokenFromStorage();

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  return config;
});
