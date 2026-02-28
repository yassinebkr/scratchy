// OSS stub — single-user mode (no auth)
export function init() {}
export function getUser() { return { id: 'default', username: 'default', displayName: 'User', role: 'admin', plan: 'free', passwordHash: '', apiKey: null, capabilities: '{}', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
export function getUserByUsername() { return null; }
export function createUser() { return getUser(); }
export function updateUser() { return getUser(); }
export function listUsers() { return [getUser()]; }
export function deleteUser() {}
