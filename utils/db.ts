
import { Project, User, VoiceOption } from '../types';

const DB_NAME = 'NeonVoiceDB';
const DB_VERSION = 2; // Incremented version to add voice store
const STORE_USERS = 'users';
const STORE_PROJECTS = 'projects';
const STORE_VOICES = 'custom_voices';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        db.createObjectStore(STORE_USERS, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        projectStore.createIndex('userId', 'userId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_VOICES)) {
        db.createObjectStore(STORE_VOICES, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

// --- User Operations ---

export const createUser = async (username: string): Promise<User> => {
  const db = await openDB();
  const tx = db.transaction(STORE_USERS, 'readwrite');
  const store = tx.objectStore(STORE_USERS);
  
  const newUser: User = {
    id: crypto.randomUUID(),
    username,
    avatar: 'bg-gradient-to-r from-cyan-500 to-blue-500',
    createdAt: Date.now()
  };

  store.put(newUser);
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(newUser);
  });
};

export const getUser = async (username: string): Promise<User | null> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_USERS, 'readonly');
    const store = tx.objectStore(STORE_USERS);
    const request = store.openCursor();
    
    request.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result;
      if (cursor) {
        if (cursor.value.username === username) {
          resolve(cursor.value);
        } else {
          cursor.continue();
        }
      } else {
        resolve(null);
      }
    };
  });
};

// --- Project Operations ---

export const saveProject = async (project: Project): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_PROJECTS, 'readwrite');
  const store = tx.objectStore(STORE_PROJECTS);
  const updatedProject = { ...project, updatedAt: Date.now() };
  store.put(updatedProject);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getProjectsByUser = async (userId: string): Promise<Project[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const index = store.index('userId');
    const request = index.getAll(userId);
    
    request.onsuccess = () => {
      const projects = request.result as Project[];
      resolve(projects.sort((a, b) => b.updatedAt - a.updatedAt));
    };
  });
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_PROJECTS, 'readwrite');
  const store = tx.objectStore(STORE_PROJECTS);
  store.delete(projectId);
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
};

// --- Custom Voice Operations ---

export const saveCustomVoice = async (voice: VoiceOption): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_VOICES, 'readwrite');
  const store = tx.objectStore(STORE_VOICES);
  store.put({ ...voice, isCustom: true });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getCustomVoices = async (): Promise<VoiceOption[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_VOICES, 'readonly');
    const store = tx.objectStore(STORE_VOICES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
  });
};

export const deleteCustomVoice = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_VOICES, 'readwrite');
  const store = tx.objectStore(STORE_VOICES);
  store.delete(id);
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
};
