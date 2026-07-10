import { useState, useEffect, useSyncExternalStore } from 'react';

// Simple global tab store that survives HMR
let _currentTab = 'dashboard';
let _listeners = new Set();

function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function getSnapshot() {
  return _currentTab;
}

export function navigate(path) {
  _currentTab = path;
  _listeners.forEach(fn => fn());
}

export function useTabRouting(defaultTab = 'dashboard') {
  // Set the initial default only on first mount
  useEffect(() => {
    if (_currentTab === 'dashboard' && defaultTab !== 'dashboard') {
      _currentTab = defaultTab;
      _listeners.forEach(fn => fn());
    }
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}
