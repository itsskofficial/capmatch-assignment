import { useState, useEffect, useCallback } from 'react';

const CACHE_KEY = 'addressCache';

/**
 * Custom hook to manage a client-side cache of addresses in localStorage.
 */
export function useAddressCache() {
  const [cachedAddresses, setCachedAddresses] = useState<string[]>([]);

  // Load addresses from localStorage on initial render
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(CACHE_KEY);
      setCachedAddresses(item ? JSON.parse(item) : []);
    } catch (error) {
      console.error("Failed to read from localStorage", error);
      setCachedAddresses([]);
    }
  }, []);

  /**
   * Adds a new address to the cache.
   * It prevents duplicates and adds the new address to the top of the list.
   */
  const addAddressToCache = useCallback((address: string) => {
    setCachedAddresses(prev => {
      const trimmedAddress = address.trim();
      // Use a Set to easily handle duplicates and maintain insertion order for uniqueness
      const newSet = new Set([trimmedAddress, ...prev]);
      const newAddresses = Array.from(newSet);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(newAddresses));
      } catch (error) {
        console.error("Failed to write to localStorage", error);
      }
      return newAddresses;
    });
  }, []);

  /**
   * Removes an address from both the client-side (localStorage) and server-side cache.
   */
  const removeAddressFromCache = useCallback(async (address: string) => {
    const trimmedAddress = address.trim();
    
    // Optimistically update the UI by removing from the local state and localStorage first
    setCachedAddresses(prev => {
      const newAddresses = prev.filter(a => a !== trimmedAddress);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(newAddresses));
      } catch (error) {
        console.error("Failed to write to localStorage", error);
      }
      return newAddresses;
    });

    // Send a request to the backend to clear the server-side cache
    try {
      const response = await fetch('/api/v1/market-data/cache', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmedAddress }),
      });
      if (!response.ok) {
        // If the backend fails, we could potentially roll back the local storage change,
        // but for now, we'll just log an error to avoid a jarring UI update.
        console.error('Failed to delete address from server cache.', { status: response.status });
      }
    } catch (error) {
      console.error('Error deleting address from server cache:', error);
    }
  }, []);

  return { cachedAddresses, addAddressToCache, removeAddressFromCache };
}