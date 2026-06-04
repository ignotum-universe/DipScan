export async function secureFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);

  if (res.status === 401) {
    // Dispatch a custom event that your UI components can listen to
    window.dispatchEvent(new CustomEvent('unauthorized'));
    return null; // Or throw an error
  }

  return res;
}