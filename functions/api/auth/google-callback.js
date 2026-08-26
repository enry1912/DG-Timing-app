import { handleCallback } from './google.js';

export async function onRequestGet({ request, env }) {
  return handleCallback(request, env);
}
