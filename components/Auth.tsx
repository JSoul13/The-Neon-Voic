import React, { useState } from 'react';
import { createUser, getUser } from '../utils/db';
import { User } from '../types';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError('');

    try {
      let user = await getUser(username);
      if (!user) {
        // Auto signup if user doesn't exist for this demo
        user = await createUser(username);
      }
      onLogin(user);
    } catch (err) {
      console.error(err);
      setError('Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="relative w-full max-w-md">
        {/* Holographic Border Effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl blur opacity-30 animate-pulse"></div>
        
        <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-8">
             <h1 className="text-4xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mb-2">
               NEON VOICE
             </h1>
             <p className="text-slate-400 text-sm tracking-widest uppercase">Identity Verification</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
             <div>
               <label className="block text-xs font-mono text-cyan-500 mb-2 uppercase">Username / ID</label>
               <input 
                 type="text" 
                 value={username}
                 onChange={(e) => setUsername(e.target.value)}
                 className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-white font-mono focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all text-center tracking-wider"
                 placeholder="ENTER_CODENAME"
               />
             </div>

             {error && <p className="text-red-400 text-xs text-center">{error}</p>}

             <button 
               type="submit"
               disabled={loading}
               className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all flex items-center justify-center gap-2"
             >
               {loading ? (
                 <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               ) : (
                 <>
                   ACCESS DASHBOARD
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                 </>
               )}
             </button>
          </form>
          
          <div className="mt-6 text-center">
             <p className="text-[10px] text-slate-600 font-mono">
               SECURE CONNECTION • ENCRYPTED STORAGE
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};